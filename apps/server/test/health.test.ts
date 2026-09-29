import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";

test("GET /api/v1/health returns healthy API metadata", async () => {
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
