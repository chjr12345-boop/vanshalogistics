import assert from "node:assert/strict";
import test from "node:test";

test("GET /api/v1/health returns healthy API metadata", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";

  const { buildApp } = await import("../src/app.js");
  const app = await buildApp();
  const response = await app.inject({ method: "GET", url: "/api/v1/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "vansha-logistic-hub-api",
    version: "v1"
  });
  await app.close();
});
