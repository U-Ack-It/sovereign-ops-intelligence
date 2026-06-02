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
    assert.match(result.message, /Every SOVEREIGN_ADMIN_API_KEY entry/);
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

test("production config check accepts rotated admin keys", () => {
  const result = validateProductionConfig({
    NODE_ENV: "production",
    SOVEREIGN_ADMIN_API_KEY: "first-long-safe-admin-key-12345, second-long-safe-admin-key-12345",
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
});

test("production config check rejects any unsafe rotated admin key entry", () => {
  const obvious = validateProductionConfig({
    NODE_ENV: "production",
    SOVEREIGN_ADMIN_API_KEY: "first-long-safe-admin-key-12345, password",
  });
  const short = validateProductionConfig({
    NODE_ENV: "production",
    SOVEREIGN_ADMIN_API_KEY: "first-long-safe-admin-key-12345, short",
  });

  assert.equal(obvious.ok, false);
  assert.match(obvious.message, /Every SOVEREIGN_ADMIN_API_KEY entry/);
  assert.doesNotMatch(obvious.message, /password|first-long-safe-admin-key/);

  assert.equal(short.ok, false);
  assert.match(short.message, /at least 24 characters/);
  assert.doesNotMatch(short.message, /short|first-long-safe-admin-key/);
});
