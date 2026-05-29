import { pathToFileURL } from "node:url";

const UNSAFE_ADMIN_KEYS = new Set([
  "changeme",
  "change-me",
  "dev",
  "test",
  "password",
]);

const MIN_ADMIN_KEY_LENGTH = 24;

export function validateProductionConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";

  if (nodeEnv !== "production") {
    return {
      ok: true,
      skipped: true,
      message: "Production config check skipped because NODE_ENV is not production.",
    };
  }

  const adminKey = env.SOVEREIGN_ADMIN_API_KEY?.trim() ?? "";

  if (!adminKey) {
    return {
      ok: false,
      skipped: false,
      message: "SOVEREIGN_ADMIN_API_KEY is required when NODE_ENV=production.",
    };
  }

  if (UNSAFE_ADMIN_KEYS.has(adminKey.toLowerCase())) {
    return {
      ok: false,
      skipped: false,
      message: "SOVEREIGN_ADMIN_API_KEY is too obvious for production.",
    };
  }

  if (adminKey.length < MIN_ADMIN_KEY_LENGTH) {
    return {
      ok: false,
      skipped: false,
      message: `SOVEREIGN_ADMIN_API_KEY must be at least ${MIN_ADMIN_KEY_LENGTH} characters in production.`,
    };
  }

  return {
    ok: true,
    skipped: false,
    message: "Production config check passed.",
  };
}

function main() {
  const result = validateProductionConfig();

  if (result.ok) {
    console.log(result.message);
    return;
  }

  console.error(result.message);
  process.exitCode = 1;
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  main();
}
