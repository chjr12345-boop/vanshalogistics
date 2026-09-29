import assert from "node:assert/strict";
import test from "node:test";

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
