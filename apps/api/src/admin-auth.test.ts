import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { verifyAdminRequest } from "./admin-auth.js";

function requestWithHeaders(headers: Record<string, string | string[] | undefined>): IncomingMessage {
  return { headers } as IncomingMessage;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test("admin auth allows local mode when no admin key is configured", () => {
  const originalAdminKey = process.env.SOVEREIGN_ADMIN_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  delete process.env.SOVEREIGN_ADMIN_API_KEY;
  process.env.NODE_ENV = "test";

  try {
    const result = verifyAdminRequest(requestWithHeaders({}));

    assert.equal(result.ok, true);
  } finally {
    restoreEnv("SOVEREIGN_ADMIN_API_KEY", originalAdminKey);
    restoreEnv("NODE_ENV", originalNodeEnv);
  }
});

test("admin auth fails closed in production when no admin key is configured", () => {
  const originalAdminKey = process.env.SOVEREIGN_ADMIN_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  delete process.env.SOVEREIGN_ADMIN_API_KEY;
  process.env.NODE_ENV = "production";

  try {
    const result = verifyAdminRequest(requestWithHeaders({}));

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.statusCode, 503);
      assert.equal(result.error.code, "ADMIN_AUTH_NOT_CONFIGURED");
    }
  } finally {
    restoreEnv("SOVEREIGN_ADMIN_API_KEY", originalAdminKey);
    restoreEnv("NODE_ENV", originalNodeEnv);
  }
});

test("admin auth requires, rejects, and accepts configured admin keys", () => {
  const originalAdminKey = process.env.SOVEREIGN_ADMIN_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  process.env.SOVEREIGN_ADMIN_API_KEY = "correct-admin-key-for-test";
  process.env.NODE_ENV = "test";

  try {
    const missing = verifyAdminRequest(requestWithHeaders({}));
    const wrongDifferentLength = verifyAdminRequest(requestWithHeaders({ "x-admin-api-key": "wrong" }));
    const wrongSameLength = verifyAdminRequest(requestWithHeaders({ "x-admin-api-key": "incorrect-admin-key-test" }));
    const correct = verifyAdminRequest(requestWithHeaders({ "x-admin-api-key": "correct-admin-key-for-test" }));

    assert.equal(missing.ok, false);
    assert.equal(wrongDifferentLength.ok, false);
    assert.equal(wrongSameLength.ok, false);
    assert.equal(correct.ok, true);

    if (!missing.ok) {
      assert.equal(missing.statusCode, 401);
      assert.equal(missing.error.code, "ADMIN_AUTH_REQUIRED");
    }

    for (const result of [wrongDifferentLength, wrongSameLength]) {
      assert.equal(result.ok, false);

      if (!result.ok) {
        assert.equal(result.statusCode, 403);
        assert.equal(result.error.code, "ADMIN_AUTH_INVALID");
        assert.doesNotMatch(result.error.message, /correct-admin-key-for-test|wrong|incorrect-admin-key-test/);
      }
    }
  } finally {
    restoreEnv("SOVEREIGN_ADMIN_API_KEY", originalAdminKey);
    restoreEnv("NODE_ENV", originalNodeEnv);
  }
});

test("admin auth uses the first non-empty admin key header value", () => {
  const originalAdminKey = process.env.SOVEREIGN_ADMIN_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  process.env.SOVEREIGN_ADMIN_API_KEY = "array-header-admin-key";
  process.env.NODE_ENV = "test";

  try {
    const result = verifyAdminRequest(
      requestWithHeaders({ "x-admin-api-key": ["", "  array-header-admin-key  "] }),
    );

    assert.equal(result.ok, true);
  } finally {
    restoreEnv("SOVEREIGN_ADMIN_API_KEY", originalAdminKey);
    restoreEnv("NODE_ENV", originalNodeEnv);
  }
});
