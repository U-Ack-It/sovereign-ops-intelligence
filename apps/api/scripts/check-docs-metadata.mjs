import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiDir, "../..");

const requiredFiles = [
  "catalog-info.yaml",
  "mkdocs.yml",
  "docs/index.md",
  "docs/architecture.md",
  "docs/api.md",
  "docs/operations.md",
  "apps/api/openapi.yaml",
];

const requiredCatalogTokens = [
  "kind: System",
  "kind: Component",
  "kind: API",
  "sovereign-ops-intelligence",
  "sovereign-ops-api",
  "sovereign-ops-advisor-api",
  "backstage.io/techdocs-ref",
];

const requiredMkdocsTokens = ["techdocs-core"];

const requiredOpenApiTokens = [
  "openapi:",
  "ApiKeyAuth:",
  "ErrorResponse:",
  "/health",
  "/ready",
  "/version",
  "/agents/route",
  "/agents/execute",
  "/agents/skills/execute",
  "/agents/audit",
  "/agents/dashboard",
  "/agents/metrics",
  "/agents/snapshot",
  "/agents/approvals",
  "/agents/approvals/summary",
  "/agents/approvals/expire",
  "/agents/approvals/{approvalId}",
  "/agents/approvals/{approvalId}/approve",
  "/agents/approvals/{approvalId}/reject",
  "/agents/approvals/{approvalId}/execute",
  "x-request-id",
  "x-admin-api-key",
];

const requiredApiDocsTokens = [
  "/agents/snapshot",
  "/agents/approvals/summary",
  "/agents/approvals/:id/execute",
  "x-request-id",
  "x-admin-api-key",
];

const requiredOperationsDocsTokens = [
  "verify:release",
  "verify:production",
  "SOVEREIGN_ADMIN_API_KEY",
  "smoke:production",
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function collectMissingTokens(filePath, tokens) {
  const content = readRepoFile(filePath);
  return tokens.filter((token) => !content.includes(token));
}

const failures = [];

for (const filePath of requiredFiles) {
  if (!existsSync(path.join(repoRoot, filePath))) {
    failures.push(`Missing required file: ${filePath}`);
  }
}

if (failures.length === 0) {
  for (const token of collectMissingTokens("catalog-info.yaml", requiredCatalogTokens)) {
    failures.push(`catalog-info.yaml missing token: ${token}`);
  }

  for (const token of collectMissingTokens("mkdocs.yml", requiredMkdocsTokens)) {
    failures.push(`mkdocs.yml missing token: ${token}`);
  }

  for (const token of collectMissingTokens("apps/api/openapi.yaml", requiredOpenApiTokens)) {
    failures.push(`apps/api/openapi.yaml missing token: ${token}`);
  }

  for (const token of collectMissingTokens("docs/api.md", requiredApiDocsTokens)) {
    failures.push(`docs/api.md missing token: ${token}`);
  }

  for (const token of collectMissingTokens("docs/operations.md", requiredOperationsDocsTokens)) {
    failures.push(`docs/operations.md missing token: ${token}`);
  }
}

if (failures.length > 0) {
  console.error("Docs metadata check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Docs metadata check passed.");
