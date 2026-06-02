export type RateLimitBucket = "agent_action" | "admin_visibility";

export type RateLimitDecision =
  | {
      allowed: true;
      bucket: RateLimitBucket;
      limit: number;
      remaining: number;
      resetAt: number;
    }
  | {
      allowed: false;
      bucket: RateLimitBucket;
      limit: number;
      remaining: 0;
      resetAt: number;
      retryAfterSeconds: number;
      reason: string;
    };

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_AGENT_ACTION_LIMIT = 120;
const DEFAULT_ADMIN_VISIBILITY_LIMIT = 240;

const records = new Map<string, RateLimitRecord>();

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

export function resetRateLimitState(): void {
  records.clear();
}

export function getRateLimitSnapshot(): Array<{ key: string; count: number; resetAt: number }> {
  return Array.from(records.entries())
    .map(([key, value]) => ({ key, count: value.count, resetAt: value.resetAt }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function rateLimitBucketForRequest(method: string | undefined, path: string): RateLimitBucket | null {
  if (method === "POST" && ["/agents/route", "/agents/execute", "/agents/skills/execute"].includes(path)) {
    return "agent_action";
  }

  if (path === "/agents/approvals/expire" && method === "POST") {
    return "admin_visibility";
  }

  if (path.startsWith("/agents/approvals/") && method === "POST") {
    return "admin_visibility";
  }

  if (
    method === "GET" &&
    (path === "/agents/audit" ||
      path === "/agents/dashboard" ||
      path === "/agents/metrics" ||
      path === "/agents/snapshot" ||
      path === "/agents/approvals" ||
      path === "/agents/approvals/summary" ||
      path.startsWith("/agents/approvals/"))
  ) {
    return "admin_visibility";
  }

  return null;
}

function limitForBucket(bucket: RateLimitBucket): number {
  if (bucket === "admin_visibility") {
    return parsePositiveInteger(process.env.SOVEREIGN_RATE_LIMIT_ADMIN_VISIBILITY, DEFAULT_ADMIN_VISIBILITY_LIMIT);
  }

  return parsePositiveInteger(process.env.SOVEREIGN_RATE_LIMIT_AGENT_ACTIONS, DEFAULT_AGENT_ACTION_LIMIT);
}

function windowMs(): number {
  return parsePositiveInteger(process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
}

export function evaluateRateLimit(input: {
  bucket: RateLimitBucket;
  clientId: string;
  now?: number;
}): RateLimitDecision {
  const now = input.now ?? Date.now();
  const limit = limitForBucket(input.bucket);
  const resetWindowMs = windowMs();
  const key = `${input.bucket}:${input.clientId}`;
  const existing = records.get(key);
  const record = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + resetWindowMs } : existing;

  if (record.count >= limit) {
    records.set(key, record);
    return {
      allowed: false,
      bucket: input.bucket,
      limit,
      remaining: 0,
      resetAt: record.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
      reason: "Rate limit exceeded for this client and route class.",
    };
  }

  record.count += 1;
  records.set(key, record);

  return {
    allowed: true,
    bucket: input.bucket,
    limit,
    remaining: Math.max(0, limit - record.count),
    resetAt: record.resetAt,
  };
}
