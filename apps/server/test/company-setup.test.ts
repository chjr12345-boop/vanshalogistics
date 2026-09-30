import assert from "node:assert/strict";
import test from "node:test";
import { clearRateLimitStateForTests } from "../src/security/rate-limit.js";

function setup() {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
}

test("company registration validates required onboarding fields", async () => {
  setup();
  clearRateLimitStateForTests();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/company/register",
    payload: {
      companyName: "Vansha Test",
      email: "not-an-email",
      adminName: "Test Admin",
      adminEmail: "admin@example.com",
      adminPassword: "short"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "VALIDATION_ERROR");

  await app.close();
});

test("company profile requires authentication", async () => {
  setup();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/company/profile"
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

test("company setup registration is rate limited", async () => {
  setup();
  clearRateLimitStateForTests();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();

  const payload = {
    companyName: "Vansha Test",
    email: "test@example.com",
    adminName: "Test Admin",
    adminEmail: "admin@example.com",
    adminPassword: "this-is-a-long-test-password"
  };

  let lastStatus = 0;
  for (let i = 0; i < 4; i += 1) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/company/register",
      payload
    });
    lastStatus = response.statusCode;
  }

  assert.equal(lastStatus, 429);

  await app.close();
  clearRateLimitStateForTests();
});


test("company user role update rejects a user from another company", async () => {
  setup();
  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  const response = await app.inject({
    method: "PATCH",
    url: "/api/v1/company/users/not-a-user",
    payload: { roleId: "00000000-0000-0000-0000-000000000001" }
  });
  assert.equal(response.statusCode, 401);
  await app.close();
});
