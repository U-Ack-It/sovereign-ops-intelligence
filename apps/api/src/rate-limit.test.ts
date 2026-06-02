import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRateLimit,
  getRateLimitSnapshot,
  rateLimitBucketForRequest,
  resetRateLimitState,
} from "./rate-limit.js";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test("rate limit route classification protects agent actions and admin visibility only", () => {
  assert.equal(rateLimitBucketForRequest("POST", "/agents/route"), "agent_action");
  assert.equal(rateLimitBucketForRequest("POST", "/agents/execute"), "agent_action");
  assert.equal(rateLimitBucketForRequest("POST", "/agents/skills/execute"), "agent_action");
  assert.equal(rateLimitBucketForRequest("GET", "/agents/audit"), "admin_visibility");
  assert.equal(rateLimitBucketForRequest("GET", "/agents/approvals/approval_1"), "admin_visibility");
  assert.equal(rateLimitBucketForRequest("POST", "/agents/approvals/approval_1/approve"), "admin_visibility");
  assert.equal(rateLimitBucketForRequest("GET", "/health"), null);
  assert.equal(rateLimitBucketForRequest("POST", "/health"), null);
});

test("rate limit allows requests within the configured window and denies overflow", () => {
  const originalLimit = process.env.SOVEREIGN_RATE_LIMIT_AGENT_ACTIONS;
  const originalWindow = process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS;

  process.env.SOVEREIGN_RATE_LIMIT_AGENT_ACTIONS = "2";
  process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS = "1000";
  resetRateLimitState();

  try {
    const first = evaluateRateLimit({ bucket: "agent_action", clientId: "client-a", now: 1000 });
    const second = evaluateRateLimit({ bucket: "agent_action", clientId: "client-a", now: 1100 });
    const third = evaluateRateLimit({ bucket: "agent_action", clientId: "client-a", now: 1200 });

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);

    if (!third.allowed) {
      assert.equal(third.limit, 2);
      assert.equal(third.remaining, 0);
      assert.equal(third.retryAfterSeconds, 1);
      assert.match(third.reason, /Rate limit exceeded/);
    }
  } finally {
    restoreEnv("SOVEREIGN_RATE_LIMIT_AGENT_ACTIONS", originalLimit);
    restoreEnv("SOVEREIGN_RATE_LIMIT_WINDOW_MS", originalWindow);
    resetRateLimitState();
  }
});

test("rate limit windows reset and state snapshots are deterministic", () => {
  const originalLimit = process.env.SOVEREIGN_RATE_LIMIT_ADMIN_VISIBILITY;
  const originalWindow = process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS;

  process.env.SOVEREIGN_RATE_LIMIT_ADMIN_VISIBILITY = "1";
  process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS = "1000";
  resetRateLimitState();

  try {
    assert.equal(evaluateRateLimit({ bucket: "admin_visibility", clientId: "client-b", now: 1000 }).allowed, true);
    assert.equal(evaluateRateLimit({ bucket: "admin_visibility", clientId: "client-b", now: 1100 }).allowed, false);
    assert.equal(evaluateRateLimit({ bucket: "admin_visibility", clientId: "client-b", now: 2100 }).allowed, true);

    assert.deepEqual(getRateLimitSnapshot(), [
      {
        key: "admin_visibility:client-b",
        count: 1,
        resetAt: 3100,
      },
    ]);
  } finally {
    restoreEnv("SOVEREIGN_RATE_LIMIT_ADMIN_VISIBILITY", originalLimit);
    restoreEnv("SOVEREIGN_RATE_LIMIT_WINDOW_MS", originalWindow);
    resetRateLimitState();
  }
});
