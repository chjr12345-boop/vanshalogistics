import type { FastifyInstance, FastifyRequest } from "fastify";
import { pool } from "./db.js";
import { config } from "./config.js";

const ACCESS_COOKIE =
  config.NODE_ENV === "production"
    ? "__Host-vansha_access_token"
    : "vansha_access_token";

function readCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === ACCESS_COOKIE) return decodeURIComponent(valueParts.join("="));
  }

  return null;
}

function assertSameOrigin(request: FastifyRequest) {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const origin = request.headers.origin;

  if (unsafe && origin && origin !== config.CORS_ORIGIN) {
    throw Object.assign(new Error("Cross-site request blocked"), {
      statusCode: 403,
      code: "CSRF_ORIGIN_REJECTED"
    });
  }
}

async function requireAuth(app: FastifyInstance, request: FastifyRequest) {
  const cookieToken = readCookie(request);

  if (cookieToken) {
    assertSameOrigin(request);
    request.user = await app.jwt.verify(cookieToken);
  } else {
    await request.jwtVerify();
  }

  const p = request.user as {
    sub?: string;
    companyId?: string;
    email?: string;
    sid?: string;
  };

  if (!p.sub || !p.companyId || !p.email || !p.sid) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }

  const r = await pool.query(
    `SELECT u.id,u.company_id,u.email,u.mfa_enabled,c.name,c.trade_name,c.legal_name
     FROM users u
     JOIN auth_sessions s ON s.user_id=u.id
     JOIN companies c ON c.id=u.company_id
     WHERE u.id=$1 AND u.company_id=$2 AND s.id=$3
       AND u.status='active' AND c.status='active'
       AND s.revoked_at IS NULL AND s.expires_at>NOW()`,
    [p.sub, p.companyId, p.sid]
  );

  if (r.rowCount !== 1) {
    throw Object.assign(new Error("Session is invalid or expired"), { statusCode: 401 });
  }

  await pool.query("UPDATE auth_sessions SET last_seen_at=NOW() WHERE id=$1", [p.sid]);

  return {
    id: String(r.rows[0].id),
    companyId: String(r.rows[0].company_id),
    email: String(r.rows[0].email),
    mfaEnabled: Boolean(r.rows[0].mfa_enabled),
    sessionId: p.sid,
    company: {
      name: String(r.rows[0].name),
      tradeName: r.rows[0].trade_name ? String(r.rows[0].trade_name) : null,
      legalName: r.rows[0].legal_name ? String(r.rows[0].legal_name) : null
    }
  };
}

async function count(clientQuery: string, values: unknown[]) {
  const result = await pool.query(clientQuery, values);
  return Number(result.rows[0]?.count ?? 0);
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/dashboard/summary", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);

      const [
        users,
        activeUsers,
        branches,
        activeSessions,
        auditEvents24h,
        company
      ] = await Promise.all([
        count("SELECT COUNT(*) FROM users WHERE company_id=$1", [user.companyId]),
        count(
          "SELECT COUNT(*) FROM users WHERE company_id=$1 AND status='active'",
          [user.companyId]
        ),
        count("SELECT COUNT(*) FROM branches WHERE company_id=$1", [user.companyId]),
        count(
          `SELECT COUNT(*) FROM auth_sessions s
           JOIN users u ON u.id=s.user_id
           WHERE u.company_id=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,
          [user.companyId]
        ),
        count(
          "SELECT COUNT(*) FROM audit_logs WHERE company_id=$1 AND created_at>=NOW()-INTERVAL '24 hours'",
          [user.companyId]
        ),
        Promise.resolve(user.company)
      ]);

      return {
        generatedAt: new Date().toISOString(),
        company,
        user: {
          id: user.id,
          email: user.email,
          mfaEnabled: user.mfaEnabled
        },
        kpis: {
          users: { value: users, source: "users", available: true },
          activeUsers: { value: activeUsers, source: "users", available: true },
          branches: { value: branches, source: "branches", available: true },
          activeSessions: { value: activeSessions, source: "auth_sessions", available: true },
          auditEvents24h: { value: auditEvents24h, source: "audit_logs", available: true }
        },
        operationalKpis: {
          operations: { value: null, available: false, reason: "Orders and trip modules are not implemented yet." },
          fleet: { value: null, available: false, reason: "Fleet module is not implemented yet." },
          drivers: { value: null, available: false, reason: "Driver module is not implemented yet." },
          sales: { value: null, available: false, reason: "CRM module is not implemented yet." },
          finance: { value: null, available: false, reason: "Finance modules are not implemented yet." },
          alerts: { value: null, available: false, reason: "Operational alert sources are not implemented yet." }
        }
      };
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : 401;

      return reply.code(statusCode).send({
        error: {
          code: statusCode === 401 ? "UNAUTHENTICATED" : "DASHBOARD_ERROR",
          message: statusCode === 401 ? "Authentication required" : "Unable to load dashboard"
        }
      });
    }
  });
}
