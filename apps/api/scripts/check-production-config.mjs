import { pathToFileURL } from "node:url";

const UNSAFE_ADMIN_KEYS = new Set([
  "changeme",
  "change-me",
  "dev",
  "test",
  "password",
]);

const MIN_ADMIN_KEY_LENGTH = 24;

function parseConfiguredAdminKeys(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function validateProductionConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";

  if (nodeEnv !== "production") {
    return {
      ok: true,
      skipped: true,
      message: "Production config check skipped because NODE_ENV is not production.",
    };
  }

  const adminKeys = parseConfiguredAdminKeys(env.SOVEREIGN_ADMIN_API_KEY);

  if (adminKeys.length === 0) {
    return {
      ok: false,
      skipped: false,
      message: "SOVEREIGN_ADMIN_API_KEY is required when NODE_ENV=production.",
    };
  }

  for (const adminKey of adminKeys) {
    if (UNSAFE_ADMIN_KEYS.has(adminKey.toLowerCase())) {
      return {
        ok: false,
        skipped: false,
        message: "Every SOVEREIGN_ADMIN_API_KEY entry must be safe for production.",
      };
    }

    if (adminKey.length < MIN_ADMIN_KEY_LENGTH) {
      return {
        ok: false,
        skipped: false,
        message: `Every SOVEREIGN_ADMIN_API_KEY entry must be at least ${MIN_ADMIN_KEY_LENGTH} characters in production.`,
      };
    }
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
