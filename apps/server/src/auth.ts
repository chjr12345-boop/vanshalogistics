import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "./db.js";
import { config } from "./config.js";
import { hashPassword, verifyPassword } from "./security/password.js";
import { buildOtpAuthUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, verifyTotpCode } from "./security/totp.js";
import { sensitiveRateLimit } from "./security/rate-limit.js";

const credentials = z.object({ companyId: z.string().uuid(), email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(8).max(128) });
const mfaLogin = z.object({ challengeToken: z.string().min(1), code: z.string().regex(/^\d{6}$/) });
const forgot = z.object({ companyId: z.string().uuid(), email: z.string().email().transform(v => v.toLowerCase()) });
const reset = z.object({ token: z.string().min(32), password: z.string().min(8).max(128) });
const mfaCode = z.object({ code: z.string().regex(/^\d{6}$/) });

async function roles(userId: string): Promise<string[]> {
  const r = await pool.query("SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 ORDER BY r.name", [userId]);
  return r.rows.map(x => String(x.name));
}

async function issueSession(app: FastifyInstance, user: {id:string; companyId:string; email:string}, request: FastifyRequest) {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const inserted = await pool.query(
    "INSERT INTO auth_sessions (user_id,device_name,user_agent,ip_address,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [user.id, request.headers["x-device-name"]?.toString().slice(0,120) ?? null, request.headers["user-agent"]?.slice(0,500) ?? null, request.ip, expiresAt]
  );
  const sid = String(inserted.rows[0].id);
  const userRoles = await roles(user.id);
  const accessToken = await app.jwt.sign({ sub:user.id, companyId:user.companyId, email:user.email, roles:userRoles, sid }, { expiresIn:"8h" });
  return { accessToken, expiresAt: expiresAt.toISOString(), user:{...user, roles:userRoles} };
}

async function requireAuth(app: FastifyInstance, request: FastifyRequest) {
  const cookieToken = readCookie(request);
  if (cookieToken) {
    request.user = await app.jwt.verify(cookieToken);
  } else {
    await request.jwtVerify();
  }
  const p = request.user as {sub?:string; companyId?:string; email?:string; sid?:string};
  if (!p.sub || !p.companyId || !p.email || !p.sid) throw Object.assign(new Error("Authentication required"), {statusCode:401});
  const r = await pool.query("SELECT u.id,u.company_id,u.email,u.mfa_enabled FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.company_id=$2 AND s.id=$3 AND u.status='active' AND s.revoked_at IS NULL AND s.expires_at>NOW()", [p.sub,p.companyId,p.sid]);
  if (r.rowCount !== 1) throw Object.assign(new Error("Session is invalid or expired"), {statusCode:401});
  await pool.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE id=$1",[p.sid]);
  const u=r.rows[0];
  return {id:String(u.id),companyId:String(u.company_id),email:String(u.email),mfaEnabled:Boolean(u.mfa_enabled),sessionId:p.sid};
}

const hashToken = (v:string) => createHash("sha256").update(v).digest("hex");

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/login", { preHandler: sensitiveRateLimit("login", 10, 15 * 60 * 1000) }, async (request, reply) => {
    const input=credentials.parse(request.body);
    const r=await pool.query("SELECT id,company_id,email,password_hash,status,mfa_enabled FROM users WHERE company_id=$1 AND email=$2 LIMIT 1",[input.companyId,input.email]);
    const u=r.rows[0];
    if (!u || u.status!=="active" || !(await verifyPassword(String(u.password_hash),input.password))) return reply.code(401).send({error:{code:"INVALID_CREDENTIALS",message:"Invalid credentials"}});
    if (u.mfa_enabled) return {mfaRequired:true,challengeToken:await app.jwt.sign({sub:String(u.id),companyId:String(u.company_id),purpose:"mfa"},{expiresIn:"5m"})};
    return {mfaRequired:false,...await issueSession(app,{id:String(u.id),companyId:String(u.company_id),email:String(u.email)},request)};
  });

  app.post("/api/v1/auth/mfa/login", { preHandler: sensitiveRateLimit("mfa-login", 10, 15 * 60 * 1000) }, async (request, reply) => {
    const input=mfaLogin.parse(request.body);
    let p:{sub?:string;companyId?:string;purpose?:string};
    try { p=await app.jwt.verify(input.challengeToken); } catch { return reply.code(401).send({error:{code:"INVALID_MFA_CHALLENGE",message:"Invalid or expired MFA challenge"}}); }
    if(p.purpose!=="mfa"||!p.sub||!p.companyId) return reply.code(401).send({error:{code:"INVALID_MFA_CHALLENGE",message:"Invalid or expired MFA challenge"}});
    const r=await pool.query("SELECT id,company_id,email,mfa_enabled,mfa_secret_encrypted FROM users WHERE id=$1 AND company_id=$2 AND status='active'",[p.sub,p.companyId]);
    const u=r.rows[0];
    if(!u?.mfa_enabled||!u.mfa_secret_encrypted) return reply.code(401).send({error:{code:"MFA_NOT_CONFIGURED",message:"MFA is not configured"}});
    let valid=false; try { valid=verifyTotpCode(decryptTotpSecret(String(u.mfa_secret_encrypted)),input.code); } catch {}
    if(!valid) return reply.code(401).send({error:{code:"INVALID_MFA_CODE",message:"Invalid MFA code"}});
    return issueSession(app,{id:String(u.id),companyId:String(u.company_id),email:String(u.email)},request);
  });

  app.get("/api/v1/auth/me", async (request,reply) => { try { const u=await requireAuth(app, request); return {user:{id:u.id,companyId:u.companyId,email:u.email,mfaEnabled:u.mfaEnabled,roles:await roles(u.id)}}; } catch { return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}}); }});
  app.post("/api/v1/auth/logout", async (request,reply) => { try { const u=await requireAuth(app, request); await pool.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2",[u.sessionId,u.id]); return {success:true}; } catch { return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}}); }});
  app.get("/api/v1/auth/sessions", async (request,reply) => { try { const u=await requireAuth(app, request); const r=await pool.query("SELECT id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY last_seen_at DESC",[u.id]); return {sessions:r.rows}; } catch { return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}}); }});
  app.delete("/api/v1/auth/sessions/:sessionId", async (request,reply) => { try { const u=await requireAuth(app, request); const p=z.object({sessionId:z.string().uuid()}).parse(request.params); const r=await pool.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",[p.sessionId,u.id]); if(r.rowCount!==1)return reply.code(404).send({error:{code:"SESSION_NOT_FOUND",message:"Session not found"}}); return {success:true}; } catch { return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}}); }});

  app.post("/api/v1/auth/password/forgot", { preHandler: sensitiveRateLimit("password-forgot", 5, 15 * 60 * 1000) }, async request => {
    const input=forgot.parse(request.body);
    const r=await pool.query("SELECT id FROM users WHERE company_id=$1 AND email=$2 AND status='active' LIMIT 1",[input.companyId,input.email]);
    let resetToken:string|undefined;
    if(r.rowCount===1){ resetToken=randomBytes(32).toString("base64url"); await pool.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[r.rows[0].id,hashToken(resetToken)]); }
    const response:{success:true;resetToken?:string}={success:true};
    if(config.NODE_ENV!=="production"&&resetToken) response.resetToken=resetToken;
    return response;
  });

  app.post("/api/v1/auth/password/reset", { preHandler: sensitiveRateLimit("password-reset", 10, 15 * 60 * 1000) }, async (request,reply) => {
    const input=reset.parse(request.body); const client=await pool.connect();
    try { await client.query("BEGIN"); const r=await client.query("SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE",[hashToken(input.token)]); if(r.rowCount!==1){await client.query("ROLLBACK");return reply.code(400).send({error:{code:"INVALID_RESET_TOKEN",message:"Invalid or expired reset token"}});} const h=await hashPassword(input.password); await client.query("UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2",[h,r.rows[0].user_id]); await client.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1",[r.rows[0].id]); await client.query("UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL",[r.rows[0].user_id]); await client.query("COMMIT"); return {success:true}; } catch(e){await client.query("ROLLBACK");throw e;} finally{client.release();}
  });

  app.post("/api/v1/auth/mfa/setup", async (request,reply) => { try { const u=await requireAuth(app, request); const r=await pool.query("SELECT email,mfa_enabled FROM users WHERE id=$1",[u.id]); if(r.rows[0]?.mfa_enabled)return reply.code(409).send({error:{code:"MFA_ALREADY_ENABLED",message:"MFA is already enabled"}}); const secret=generateTotpSecret(); await pool.query("UPDATE users SET mfa_secret_encrypted=$1 WHERE id=$2",[encryptTotpSecret(secret),u.id]); return {secret,otpauthUri:buildOtpAuthUri(String(r.rows[0].email),secret)}; } catch{return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}});} });
  app.post("/api/v1/auth/mfa/enable", async (request,reply) => { try { const u=await requireAuth(app, request); const input=mfaCode.parse(request.body); const r=await pool.query("SELECT mfa_secret_encrypted FROM users WHERE id=$1",[u.id]); if(!r.rows[0]?.mfa_secret_encrypted)return reply.code(400).send({error:{code:"MFA_SETUP_REQUIRED",message:"Start MFA setup first"}}); if(!verifyTotpCode(decryptTotpSecret(String(r.rows[0].mfa_secret_encrypted)),input.code))return reply.code(400).send({error:{code:"INVALID_MFA_CODE",message:"Invalid MFA code"}}); await pool.query("UPDATE users SET mfa_enabled=TRUE,updated_at=NOW() WHERE id=$1",[u.id]); return {success:true}; } catch{return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}});} });
  app.post("/api/v1/auth/mfa/disable", async (request,reply) => { try { const u=await requireAuth(app, request); const input=z.object({password:z.string().min(8).max(128)}).parse(request.body); const r=await pool.query("SELECT password_hash FROM users WHERE id=$1",[u.id]); if(!(await verifyPassword(String(r.rows[0]?.password_hash),input.password)))return reply.code(401).send({error:{code:"INVALID_CREDENTIALS",message:"Invalid credentials"}}); await pool.query("UPDATE users SET mfa_enabled=FALSE,mfa_secret_encrypted=NULL,updated_at=NOW() WHERE id=$1",[u.id]); return {success:true}; } catch{return reply.code(401).send({error:{code:"UNAUTHENTICATED",message:"Authentication required"}});} });
}
