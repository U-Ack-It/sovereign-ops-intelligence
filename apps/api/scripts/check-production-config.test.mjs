import test from "node:test";
import assert from "node:assert/strict";

import { validateProductionConfig } from "./check-production-config.mjs";

test("production config check skips non-production mode", () => {
  const result = validateProductionConfig({ NODE_ENV: "test" });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test("production config check requires an admin key in production", () => {
  const result = validateProductionConfig({ NODE_ENV: "production" });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.message, /SOVEREIGN_ADMIN_API_KEY is required/);
});

test("production config check rejects obvious admin keys", () => {
  for (const key of ["changeme", "change-me", "dev", "test", "password"]) {
    const result = validateProductionConfig({
      NODE_ENV: "production",
      SOVEREIGN_ADMIN_API_KEY: key,
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /too obvious/);
  }
});

test("production config check rejects short admin keys", () => {
  const result = validateProductionConfig({
    NODE_ENV: "production",
    SOVEREIGN_ADMIN_API_KEY: "short-safe-looking-key",
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /at least 24 characters/);
});

test("production config check accepts a long admin key", () => {
  const result = validateProductionConfig({
    NODE_ENV: "production",
    SOVEREIGN_ADMIN_API_KEY: "a-long-safe-fake-admin-key-12345",
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
});
