import assert from "node:assert/strict";
import test from "node:test";
import { generateTotpCode, generateTotpSecret, verifyTotpCode } from "../src/security/totp.js";

test("TOTP codes validate and reject invalid codes", async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/vansha_test";
  process.env.JWT_ISSUER ??= "vansha-logistic-hub-test";
  process.env.JWT_AUDIENCE ??= "vansha-logistic-hub-test";
  process.env.JWT_SECRET ??= "test-only-secret-with-at-least-32-characters";
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const code = generateTotpCode(secret, now);
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code, now), true);
  assert.equal(verifyTotpCode(secret, "999999", now), code === "999999");
  assert.equal(verifyTotpCode(secret, code, now + 5 * 60_000), false);
});
