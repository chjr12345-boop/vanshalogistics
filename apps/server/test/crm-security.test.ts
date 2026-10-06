import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db.js";

function setup() {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
}

async function identity(app: any, crm: boolean) {
  const c = await pool.query("INSERT INTO companies(name,status) VALUES($1,'active') RETURNING id", ["CRM Test " + randomUUID()]);
  const companyId = String(c.rows[0].id);
  const r = await pool.query("INSERT INTO roles(company_id,name) VALUES($1,$2) RETURNING id", [companyId, "CRM Test Role " + randomUUID()]);
  const roleId = String(r.rows[0].id);
  if (crm) await pool.query("INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM permissions WHERE code='crm.customers.manage'", [roleId]);
  const u = await pool.query("INSERT INTO users(company_id,email,password_hash,status) VALUES($1,$2,'test','active') RETURNING id,email", [companyId, "crm-" + randomUUID() + "@example.com"]);
  const userId = String(u.rows[0].id);
  await pool.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)", [userId, roleId]);
  const s = await pool.query("INSERT INTO auth_sessions(user_id,expires_at) VALUES($1,NOW()+INTERVAL '1 hour') RETURNING id", [userId]);
  const sid = String(s.rows[0].id);
  const token = await app.jwt.sign({ sub: userId, companyId, email: String(u.rows[0].email), sid }, { expiresIn: "1h" });
  return { companyId, userId, sid, token };
}

test("CRM rejects users without a CRM permission", async () => {
  setup();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  let x: Awaited<ReturnType<typeof identity>> | undefined;
  try {
    x = await identity(app, false);
    const res = await app.inject({ method: "GET", url: "/api/v1/crm/summary", headers: { authorization: "Bearer " + x.token } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, "FORBIDDEN");
  } finally {
    if (x) {
      await pool.query("DELETE FROM auth_sessions WHERE id=$1", [x.sid]);
      await pool.query("DELETE FROM user_roles WHERE user_id=$1", [x.userId]);
      await pool.query("DELETE FROM users WHERE id=$1", [x.userId]);
      await pool.query("DELETE FROM companies WHERE id=$1", [x.companyId]);
    }
    await app.close();
  }
});

test("CRM blocks a cross-tenant customer reference", async () => {
  setup();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  let x: Awaited<ReturnType<typeof identity>> | undefined;
  let otherCompanyId: string | undefined;
  try {
    x = await identity(app, true);
    const c = await pool.query("INSERT INTO companies(name,status) VALUES($1,'active') RETURNING id", ["Other CRM Test " + randomUUID()]);
    otherCompanyId = String(c.rows[0].id);
    const customer = await pool.query("INSERT INTO crm_customers(company_id,code,legal_name) VALUES($1,$2,$3) RETURNING id", [otherCompanyId, "CROSS-" + randomUUID().slice(0,8), "Other Tenant Customer"]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/crm/contacts",
      headers: { authorization: "Bearer " + x.token },
      payload: { customerId: String(customer.rows[0].id), name: "Cross Tenant Contact", email: "cross@example.com", isPrimary: false }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.message, "Referenced record not found in this company");
  } finally {
    if (x) {
      await pool.query("DELETE FROM auth_sessions WHERE id=$1", [x.sid]);
      await pool.query("DELETE FROM user_roles WHERE user_id=$1", [x.userId]);
      await pool.query("DELETE FROM users WHERE id=$1", [x.userId]);
      await pool.query("DELETE FROM companies WHERE id=$1", [x.companyId]);
    }
    if (otherCompanyId) await pool.query("DELETE FROM companies WHERE id=$1", [otherCompanyId]);
    await app.close();
  }
});
