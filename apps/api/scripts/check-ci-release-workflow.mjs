import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiDir, "../..");

const workflowPath = ".github/workflows/api-stability.yml";
const packagePath = "apps/api/package.json";

const requiredWorkflowTokens = [
  "permissions:",
  "contents: read",
  "concurrency:",
  "cancel-in-progress: true",
  "actions/setup-node@v4",
  "cache-dependency-path: apps/api/package-lock.json",
  "npm ci",
  "SOVEREIGN_ADMIN_API_KEY:",
  "npm run verify:release",
];

const requiredReleaseScriptTokens = [
  "npm run ci:check",
  "npm run docs:check",
  "npm run openapi:check",
  "npm run verify:mcp",
  "SOVEREIGN_ADMIN_API_KEY= npm run verify",
  "npm run verify:production",
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function missingTokens(content, tokens) {
  return tokens.filter((token) => !content.includes(token));
}

export function validateCiReleaseWorkflow({ workflowSource, packageJsonSource }) {
  const failures = [];

  for (const token of missingTokens(workflowSource, requiredWorkflowTokens)) {
    failures.push(`CI workflow missing token: ${token}`);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(packageJsonSource);
  } catch {
    failures.push("apps/api/package.json is not valid JSON");
    return { ok: false, failures };
  }

  const scripts = packageJson.scripts ?? {};
  const releaseScript = scripts["verify:release"];

  if (typeof scripts["ci:check"] !== "string" || !scripts["ci:check"].includes("check-ci-release-workflow.mjs")) {
    failures.push("package.json missing ci:check script for check-ci-release-workflow.mjs");
  }

  if (typeof releaseScript !== "string") {
    failures.push("package.json missing verify:release script");
  } else {
    for (const token of missingTokens(releaseScript, requiredReleaseScriptTokens)) {
      failures.push(`verify:release missing token: ${token}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function runCiReleaseWorkflowCheck() {
  const failures = [];

  for (const requiredPath of [workflowPath, packagePath]) {
    if (!existsSync(path.join(repoRoot, requiredPath))) {
      failures.push(`Missing required file: ${requiredPath}`);
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  return validateCiReleaseWorkflow({
    workflowSource: readRepoFile(workflowPath),
    packageJsonSource: readRepoFile(packagePath),
  });
}

const isMainModule = process.argv[1] ? import.meta.url === new URL(process.argv[1], "file:").href : false;

if (isMainModule) {
  const result = runCiReleaseWorkflowCheck();

  if (!result.ok) {
    console.error("CI release workflow check failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("CI release workflow check passed.");
}
