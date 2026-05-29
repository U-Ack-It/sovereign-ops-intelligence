import { timingSafeEqual } from "node:crypto";
import { IncomingMessage } from "node:http";

export type AdminAuthResult =
  | { ok: true }
  | {
      ok: false;
      statusCode: 401 | 403 | 503;
      error: {
        code: "ADMIN_AUTH_REQUIRED" | "ADMIN_AUTH_INVALID" | "ADMIN_AUTH_NOT_CONFIGURED";
        message: string;
        details?: Record<string, unknown>;
      };
    };

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value.find((item) => item.trim())?.trim();
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminRequest(request: IncomingMessage): AdminAuthResult {
  const configuredKey = process.env.SOVEREIGN_ADMIN_API_KEY;

  if (!configuredKey) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        statusCode: 503,
        error: {
          code: "ADMIN_AUTH_NOT_CONFIGURED",
          message: "Admin API key is not configured.",
        },
      };
    }

    return { ok: true };
  }

  const suppliedKey = headerValue(request, "x-admin-api-key");

  if (!suppliedKey) {
    return {
      ok: false,
      statusCode: 401,
      error: {
        code: "ADMIN_AUTH_REQUIRED",
        message: "Admin API key is required.",
      },
    };
  }

  if (!safeCompare(suppliedKey, configuredKey)) {
    return {
      ok: false,
      statusCode: 403,
      error: {
        code: "ADMIN_AUTH_INVALID",
        message: "Admin API key is invalid.",
      },
    };
  }

  return { ok: true };
}
