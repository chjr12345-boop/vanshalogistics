import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "./db.js";
import { config } from "./config.js";
import { hashPassword } from "./security/password.js";
import { sensitiveRateLimit } from "./security/rate-limit.js";

const ACCESS_COOKIE =
  config.NODE_ENV === "production"
    ? "__Host-vansha_access_token"
    : "vansha_access_token";

type AuthContext = {
  id: string;
  companyId: string;
  email: string;
  sessionId: string;
  roles: string[];
};

function readCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === ACCESS_COOKIE) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

async function requireAuth(
  app: FastifyInstance,
  request: FastifyRequest
): Promise<AuthContext> {
  const cookieToken = readCookie(request);

  if (cookieToken) {
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
    throw Object.assign(new Error("Authentication required"), {
      statusCode: 401
    });
  }

  const r = await pool.query(
    "SELECT u.id,u.company_id,u.email,s.id AS session_id FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.company_id=$2 AND s.id=$3 AND u.status='active' AND s.revoked_at IS NULL AND s.expires_at>NOW()",
    [p.sub, p.companyId, p.sid]
  );

  if (r.rowCount !== 1) {
    throw Object.assign(new Error("Session is invalid or expired"), {
      statusCode: 401
    });
  }

  const rr = await pool.query(
    "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1 ORDER BY r.name",
    [p.sub]
  );

  await pool.query(
    "UPDATE auth_sessions SET last_seen_at=NOW() WHERE id=$1",
    [p.sid]
  );

  return {
    id: String(r.rows[0].id),
    companyId: String(r.rows[0].company_id),
    email: String(r.rows[0].email),
    sessionId: String(r.rows[0].session_id),
    roles: rr.rows.map((x) => String(x.name))
  };
}

function requireCompanyAdmin(user: AuthContext) {
  if (!user.roles.includes("Company Admin") && !user.roles.includes("Super Admin")) {
    throw Object.assign(new Error("Company administrator access required"), {
      statusCode: 403
    });
  }
}

async function audit(
  user: AuthContext,
  request: FastifyRequest,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown> = {}
) {
  await pool.query(
    "INSERT INTO audit_logs(company_id,user_id,action,resource_type,resource_id,ip_address,user_agent,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      user.companyId,
      user.id,
      action,
      resourceType,
      resourceId,
      request.ip,
      request.headers["user-agent"]?.slice(0, 500) ?? null,
      details
    ]
  );
}

const registration = z.object({
  companyName: z.string().trim().min(2).max(200),
  legalName: z.string().trim().max(200).optional(),
  tradeName: z.string().trim().max(200).optional(),
  email: z.string().email().transform((v) => v.toLowerCase()),
  phone: z.string().trim().min(7).max(30).optional(),
  gstin: z.string().trim().max(20).optional(),
  pan: z.string().trim().max(20).optional(),
  branchName: z.string().trim().min(2).max(120).default("Head Office"),
  branchCode: z.string().trim().min(2).max(30).default("HO"),
  adminName: z.string().trim().min(2).max(150),
  adminEmail: z.string().email().transform((v) => v.toLowerCase()),
  adminPassword: z.string().min(12).max(128)
});

const companyPatch = z.object({
  legalName: z.string().trim().max(200).nullable().optional(),
  tradeName: z.string().trim().max(200).nullable().optional(),
  gstin: z.string().trim().max(20).nullable().optional(),
  pan: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().transform((v) => v.toLowerCase()).nullable().optional(),
  website: z.string().url().max(300).nullable().optional(),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  pincode: z.string().trim().max(20).nullable().optional()
});

const branchInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/),
  isHeadOffice: z.boolean().default(false),
  addressLine1: z.string().trim().max(200).nullable().optional(),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  pincode: z.string().trim().max(20).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().nullable().optional()
});

const userCreate = z.object({
  displayName: z.string().trim().min(2).max(150),
  email: z.string().email().transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(30).nullable().optional(),
  password: z.string().min(12).max(128),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional()
});

const userPatch = z.object({
  displayName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  roleId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional()
});

const roleCreate = z.object({
  name: z.string().trim().min(2).max(100),
  permissionIds: z.array(z.string().uuid()).max(100).default([])
});

const rolePatch = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  permissionIds: z.array(z.string().uuid()).max(100).optional()
});

const settingsPatch = z.object({
  settings: z.record(z.unknown())
});

export async function registerCompanySetupRoutes(app: FastifyInstance) {
  // Public onboarding: creates the first company, branch and Company Admin.
  app.post(
    "/api/v1/company/register",
    {
      preHandler: sensitiveRateLimit(
        "company-register",
        3,
        60 * 60 * 1000
      )
    },
    async (request, reply) => {
      const input = registration.parse(request.body);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const existing = await client.query(
          "SELECT 1 FROM users WHERE email=$1 LIMIT 1",
          [input.adminEmail]
        );

        if (existing.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(409).send({
            error: {
              code: "ADMIN_EMAIL_EXISTS",
              message: "Administrator email is already registered"
            }
          });
        }

        const company = await client.query(
          "INSERT INTO companies(name,legal_name,trade_name,email,phone,gstin,pan) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
          [
            input.companyName,
            input.legalName ?? null,
            input.tradeName ?? null,
            input.email,
            input.phone ?? null,
            input.gstin ?? null,
            input.pan ?? null
          ]
        );

        const companyId = String(company.rows[0].id);

        const branch = await client.query(
          "INSERT INTO branches(company_id,name,code,is_head_office,email,phone) VALUES($1,$2,$3,TRUE,$4,$5) RETURNING id",
          [
            companyId,
            input.branchName,
            input.branchCode.toUpperCase(),
            input.email,
            input.phone ?? null
          ]
        );

        const branchId = String(branch.rows[0].id);

        const adminRole = await client.query(
          "INSERT INTO roles(company_id,name,is_system) VALUES($1,'Company Admin',TRUE) ON CONFLICT(company_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
          [companyId]
        );

        const permissionRows = await client.query(
          "SELECT id FROM permissions WHERE code LIKE 'company.%'"
        );

        for (const permission of permissionRows.rows) {
          await client.query(
            "INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [adminRole.rows[0].id, permission.id]
          );
        }

        const passwordHash = await hashPassword(input.adminPassword);

        const user = await client.query(
          "INSERT INTO users(company_id,branch_id,email,password_hash,display_name,status) VALUES($1,$2,$3,$4,$5,'active') RETURNING id,email",
          [
            companyId,
            branchId,
            input.adminEmail,
            passwordHash,
            input.adminName
          ]
        );

        await client.query(
          "INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)",
          [user.rows[0].id, adminRole.rows[0].id]
        );

        await client.query(
          "INSERT INTO company_settings(company_id,category,settings,updated_by) VALUES($1,'business', $2, $3),($1,'tax', '{}'::jsonb, $3),($1,'documents', '{}'::jsonb, $3),($1,'notifications', '{}'::jsonb, $3)",
          [
            companyId,
            JSON.stringify({ timezone: "Asia/Kolkata", currency: "INR" }),
            user.rows[0].id
          ]
        );

        await client.query("COMMIT");

        return reply.code(201).send({
          company: {
            id: companyId,
            name: input.companyName
          },
          branch: {
            id: branchId,
            name: input.branchName,
            code: input.branchCode.toUpperCase()
          },
          admin: {
            id: String(user.rows[0].id),
            email: String(user.rows[0].email)
          }
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  );

  app.get("/api/v1/company/profile", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);

      const r = await pool.query(
        "SELECT id,name,status,legal_name,trade_name,gstin,pan,phone,email,website,address_line1,address_line2,city,state,pincode,country,created_at,updated_at FROM companies WHERE id=$1",
        [user.companyId]
      );

      return { company: r.rows[0] };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 401).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "UNAUTHENTICATED",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Authentication required"
        }
      });
    }
  });

  app.patch("/api/v1/company/profile", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const input = companyPatch.parse(request.body);

      const allowed = [
        ["legalName", "legal_name"],
        ["tradeName", "trade_name"],
        ["gstin", "gstin"],
        ["pan", "pan"],
        ["phone", "phone"],
        ["email", "email"],
        ["website", "website"],
        ["addressLine1", "address_line1"],
        ["addressLine2", "address_line2"],
        ["city", "city"],
        ["state", "state"],
        ["pincode", "pincode"]
      ] as const;

      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of allowed) {
        if (input[key] !== undefined) {
          values.push(input[key]);
          sets.push(column + "=$" + values.length);
        }
      }

      if (!sets.length) {
        return reply.code(400).send({
          error: {
            code: "NO_CHANGES",
            message: "No company fields were supplied"
          }
        });
      }

      values.push(user.companyId);

      const r = await pool.query(
        "UPDATE companies SET " +
          sets.join(",") +
          ",updated_at=NOW() WHERE id=$" +
          values.length +
          " RETURNING id,name,status,legal_name,trade_name,gstin,pan,phone,email,website,address_line1,address_line2,city,state,pincode,country,updated_at",
        values
      );

      await audit(user, request, "company.profile.updated", "company", user.companyId);

      return { company: r.rows[0] };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Company profile update failed"
        }
      });
    }
  });

  app.get("/api/v1/company/branches", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);

      const r = await pool.query(
        "SELECT id,name,code,is_head_office,status,address_line1,address_line2,city,state,pincode,country,phone,email,created_at,updated_at FROM branches WHERE company_id=$1 ORDER BY is_head_office DESC,name",
        [user.companyId]
      );

      return { branches: r.rows };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 401).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "UNAUTHENTICATED",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Authentication required"
        }
      });
    }
  });

  app.post("/api/v1/company/branches", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const input = branchInput.parse(request.body);

      const r = await pool.query(
        "INSERT INTO branches(company_id,name,code,is_head_office,address_line1,address_line2,city,state,pincode,phone,email,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
        [
          user.companyId,
          input.name,
          input.code.toUpperCase(),
          input.isHeadOffice,
          input.addressLine1 ?? null,
          input.addressLine2 ?? null,
          input.city ?? null,
          input.state ?? null,
          input.pincode ?? null,
          input.phone ?? null,
          input.email ?? null,
          user.id,
          user.id
        ]
      );

      await audit(user, request, "company.branch.created", "branch", r.rows[0].id);

      return reply.code(201).send({ branch: r.rows[0] });
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Branch creation failed"
        }
      });
    }
  });

  app.patch("/api/v1/company/branches/:id", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const id = z.string().uuid().parse((request.params as any).id);
      const input = branchInput.partial().parse(request.body);

      const fields: Record<string, unknown> = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.code !== undefined) fields.code = input.code.toUpperCase();
      if (input.isHeadOffice !== undefined) fields.is_head_office = input.isHeadOffice;
      if (input.addressLine1 !== undefined) fields.address_line1 = input.addressLine1;
      if (input.addressLine2 !== undefined) fields.address_line2 = input.addressLine2;
      if (input.city !== undefined) fields.city = input.city;
      if (input.state !== undefined) fields.state = input.state;
      if (input.pincode !== undefined) fields.pincode = input.pincode;
      if (input.phone !== undefined) fields.phone = input.phone;
      if (input.email !== undefined) fields.email = input.email;

      const keys = Object.keys(fields);
      if (!keys.length) {
        return reply.code(400).send({
          error: {
            code: "NO_CHANGES",
            message: "No branch fields were supplied"
          }
        });
      }

      const values = keys.map((key) => fields[key]);
      values.push(id, user.companyId);

      const r = await pool.query(
        "UPDATE branches SET " +
          keys.map((key, i) => key + "=$" + (i + 1)).join(",") +
          ",updated_at=NOW(),updated_by=$" +
          (values.length + 1) +
          " WHERE id=$" +
          (values.length - 1) +
          " AND company_id=$" +
          values.length +
          " RETURNING *",
        [...values, user.id]
      );

      if (r.rowCount !== 1) {
        return reply.code(404).send({
          error: {
            code: "BRANCH_NOT_FOUND",
            message: "Branch not found"
          }
        });
      }

      await audit(user, request, "company.branch.updated", "branch", id);

      return { branch: r.rows[0] };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Branch update failed"
        }
      });
    }
  });

  app.get("/api/v1/company/users", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);

      const r = await pool.query(
        "SELECT u.id,u.email,u.display_name,u.phone,u.status,u.branch_id,u.created_at,u.updated_at,COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL),'{}') AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.company_id=$1 GROUP BY u.id ORDER BY u.created_at DESC",
        [user.companyId]
      );

      return { users: r.rows };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 401).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "UNAUTHENTICATED",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Authentication required"
        }
      });
    }
  });

  app.post("/api/v1/company/users", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const input = userCreate.parse(request.body);

      const role = await pool.query(
        "SELECT id FROM roles WHERE id=$1 AND company_id=$2",
        [input.roleId, user.companyId]
      );

      if (role.rowCount !== 1) {
        return reply.code(400).send({
          error: {
            code: "INVALID_ROLE",
            message: "Role does not belong to this company"
          }
        });
      }

      if (input.branchId) {
        const branch = await pool.query(
          "SELECT 1 FROM branches WHERE id=$1 AND company_id=$2",
          [input.branchId, user.companyId]
        );

        if (branch.rowCount !== 1) {
          return reply.code(400).send({
            error: {
              code: "INVALID_BRANCH",
              message: "Branch does not belong to this company"
            }
          });
        }
      }

      const passwordHash = await hashPassword(input.password);

      const r = await pool.query(
        "INSERT INTO users(company_id,branch_id,email,password_hash,display_name,phone,status) VALUES($1,$2,$3,$4,$5,$6,'active') RETURNING id,email,display_name,phone,status,branch_id,created_at",
        [
          user.companyId,
          input.branchId ?? null,
          input.email,
          passwordHash,
          input.displayName,
          input.phone ?? null
        ]
      );

      await pool.query(
        "INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)",
        [r.rows[0].id, role.rows[0].id]
      );

      await audit(user, request, "company.user.created", "user", r.rows[0].id);

      return reply.code(201).send({ user: r.rows[0] });
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "User creation failed"
        }
      });
    }
  });

  app.patch("/api/v1/company/users/:id", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const id = z.string().uuid().parse((request.params as any).id);
      const input = userPatch.parse(request.body);

      if (id === user.id && input.status === "inactive") {
        return reply.code(400).send({
          error: {
            code: "SELF_DISABLE_NOT_ALLOWED",
            message: "You cannot deactivate your own account"
          }
        });
      }

      if (input.roleId) {
        const role = await pool.query(
          "SELECT 1 FROM roles WHERE id=$1 AND company_id=$2",
          [input.roleId, user.companyId]
        );
        if (role.rowCount !== 1) {
          return reply.code(400).send({
            error: {
              code: "INVALID_ROLE",
              message: "Role does not belong to this company"
            }
          });
        }
      }

      if (input.branchId) {
        const branch = await pool.query(
          "SELECT 1 FROM branches WHERE id=$1 AND company_id=$2",
          [input.branchId, user.companyId]
        );
        if (branch.rowCount !== 1) {
          return reply.code(400).send({
            error: {
              code: "INVALID_BRANCH",
              message: "Branch does not belong to this company"
            }
          });
        }
      }

      const sets: string[] = [];
      const values: unknown[] = [];

      if (input.displayName !== undefined) {
        values.push(input.displayName);
        sets.push("display_name=$" + values.length);
      }
      if (input.phone !== undefined) {
        values.push(input.phone);
        sets.push("phone=$" + values.length);
      }
      if (input.status !== undefined) {
        values.push(input.status);
        sets.push("status=$" + values.length);
      }
      if (input.roleId !== undefined) {
        values.push(input.roleId);
        sets.push("(SELECT $"+values.length+"::uuid)");
      }
      if (input.branchId !== undefined) {
        values.push(input.branchId);
        sets.push("branch_id=$" + values.length);
      }

      if (input.roleId !== undefined) {
        const roleIndex = values.length - (input.branchId !== undefined ? 1 : 0);
        await pool.query("DELETE FROM user_roles WHERE user_id=$1", [id]);
        await pool.query(
          "INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)",
          [id, values[roleIndex - 1]]
        );
        sets.splice(sets.findIndex((x) => x.startsWith("(SELECT")), 1);
      }

      if (!sets.length) {
        return reply.code(400).send({
          error: {
            code: "NO_CHANGES",
            message: "No user fields were supplied"
          }
        });
      }

      values.push(id, user.companyId);

      const r = await pool.query(
        "UPDATE users SET " +
          sets.join(",") +
          ",updated_at=NOW() WHERE id=$" +
          (values.length - 1) +
          " AND company_id=$" +
          values.length +
          " RETURNING id,email,display_name,phone,status,branch_id,updated_at",
        values
      );

      if (r.rowCount !== 1) {
        return reply.code(404).send({
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found"
          }
        });
      }

      await audit(user, request, "company.user.updated", "user", id);

      return { user: r.rows[0] };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "User update failed"
        }
      });
    }
  });

  app.get("/api/v1/company/roles", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);

      const r = await pool.query(
        "SELECT r.id,r.name,r.is_system,COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.id IS NOT NULL),'{}') AS permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id WHERE r.company_id=$1 GROUP BY r.id ORDER BY r.is_system DESC,r.name",
        [user.companyId]
      );

      return { roles: r.rows };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 401).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "UNAUTHENTICATED",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Authentication required"
        }
      });
    }
  });

  app.get("/api/v1/company/permissions", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);

      const r = await pool.query(
        "SELECT id,code,description FROM permissions ORDER BY code"
      );

      return { permissions: r.rows };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 401).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "UNAUTHENTICATED",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Authentication required"
        }
      });
    }
  });

  app.post("/api/v1/company/roles", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const input = roleCreate.parse(request.body);

      const r = await pool.query(
        "INSERT INTO roles(company_id,name,is_system) VALUES($1,$2,FALSE) RETURNING id,name,is_system",
        [user.companyId, input.name]
      );

      for (const permissionId of input.permissionIds) {
        await pool.query(
          "INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE id=$2 ON CONFLICT DO NOTHING",
          [r.rows[0].id, permissionId]
        );
      }

      await audit(user, request, "company.role.created", "role", r.rows[0].id);

      return reply.code(201).send({ role: r.rows[0] });
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Role creation failed"
        }
      });
    }
  });

  app.patch("/api/v1/company/roles/:id", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const id = z.string().uuid().parse((request.params as any).id);
      const input = rolePatch.parse(request.body);

      const role = await pool.query(
        "SELECT id,name,is_system FROM roles WHERE id=$1 AND company_id=$2",
        [id, user.companyId]
      );

      if (role.rowCount !== 1) {
        return reply.code(404).send({
          error: {
            code: "ROLE_NOT_FOUND",
            message: "Role not found"
          }
        });
      }

      if (role.rows[0].is_system) {
        return reply.code(400).send({
          error: {
            code: "SYSTEM_ROLE_PROTECTED",
            message: "System roles cannot be modified"
          }
        });
      }

      if (input.name !== undefined) {
        await pool.query(
          "UPDATE roles SET name=$1,updated_at=NOW() WHERE id=$2",
          [input.name, id]
        );
      }

      if (input.permissionIds !== undefined) {
        await pool.query(
          "DELETE FROM role_permissions WHERE role_id=$1",
          [id]
        );

        for (const permissionId of input.permissionIds) {
          await pool.query(
            "INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE id=$2 ON CONFLICT DO NOTHING",
            [id, permissionId]
          );
        }
      }

      await audit(user, request, "company.role.updated", "role", id);

      return { success: true };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Role update failed"
        }
      });
    }
  });

  app.get("/api/v1/company/settings/:category", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const category = z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/).parse(
        (request.params as any).category
      );

      const r = await pool.query(
        "SELECT category,settings,updated_at FROM company_settings WHERE company_id=$1 AND category=$2",
        [user.companyId, category]
      );

      return {
        category,
        settings: r.rows[0]?.settings ?? {}
      };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Settings request failed"
        }
      });
    }
  });

  app.put("/api/v1/company/settings/:category", async (request, reply) => {
    try {
      const user = await requireAuth(app, request);
      requireCompanyAdmin(user);
      const category = z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/).parse(
        (request.params as any).category
      );
      const input = settingsPatch.parse(request.body);

      const r = await pool.query(
        "INSERT INTO company_settings(company_id,category,settings,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,category) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING category,settings,updated_at",
        [
          user.companyId,
          category,
          JSON.stringify(input.settings),
          user.id
        ]
      );

      await audit(
        user,
        request,
        "company.settings.updated",
        "company_settings",
        null,
        { category }
      );

      return { setting: r.rows[0] };
    } catch (error) {
      return reply.code((error as any)?.statusCode ?? 400).send({
        error: {
          code: (error as any)?.statusCode === 403 ? "FORBIDDEN" : "REQUEST_ERROR",
          message:
            (error as any)?.statusCode === 403
              ? "Company administrator access required"
              : "Settings update failed"
        }
      });
    }
  });
}
