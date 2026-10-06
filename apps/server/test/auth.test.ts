import assert from "node:assert/strict";
import test from "node:test";
import { clearRateLimitStateForTests } from "../src/security/rate-limit.js";

test("authentication routes validate login input", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      companyId: "00000000-0000-0000-0000-000000000000",
      email: "not-an-email",
      password: "bad"
    }
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});


test("authentication endpoints rate limit repeated login attempts", async () => {
  clearRateLimitStateForTests();
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  const payload = {
    companyId: "00000000-0000-0000-0000-000000000000",
    email: "nobody@example.com",
    password: "wrong-password"
  };
  let lastStatus = 0;
  for (let i = 0; i < 11; i += 1) {
    const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload });
    lastStatus = response.statusCode;
  }
  assert.equal(lastStatus, 429);
  await app.close();
  clearRateLimitStateForTests();
});


test("dashboard summary requires authentication", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  const response = await app.inject({ method: "GET", url: "/api/v1/dashboard/summary" });
  assert.equal(response.statusCode, 401);
  await app.close();
});


test("CRM summary requires authentication", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  const response = await app.inject({ method: "GET", url: "/api/v1/crm/summary" });
  assert.equal(response.statusCode, 401);
  await app.close();
});
