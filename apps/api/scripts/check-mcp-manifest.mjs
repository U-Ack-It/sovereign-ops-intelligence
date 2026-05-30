import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateMcpManifestIntegrity,
  validateMcpManifestSnapshot,
} from "./check-mcp-manifest-integrity.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const manifestPath = path.join(apiDir, "src/mcp/manifest.ts");
const compiledManifestPath = path.join(apiDir, "dist/mcp/manifest.js");
const snapshotPath = path.join(apiDir, "src/mcp/manifest.snapshot.json");

const expectedTools = [
  "sovereign_advisor_route",
  "sovereign_advisor_execute",
  "sovereign_skill_execute",
];

const expectedResources = [
  "sovereign://openapi",
  "sovereign://docs/architecture",
  "sovereign://docs/api",
];

const expectedPrompts = [
  "sovereign-operations-triage",
  "sovereign-security-review",
  "sovereign-compliance-review",
];

const forbiddenTerms = [
  "audit",
  "dashboard",
  "metrics",
  "admin",
  "secret",
  "password",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "SOVEREIGN_ADMIN_API_KEY",
];

const failures = [];

if (!existsSync(manifestPath)) {
  failures.push("Missing MCP manifest: apps/api/src/mcp/manifest.ts");
} else {
  const manifest = readFileSync(manifestPath, "utf8");
  const lowerManifest = manifest.toLowerCase();

  for (const tool of expectedTools) {
    if (!manifest.includes(tool)) {
      failures.push(`Missing MCP tool: ${tool}`);
    }
  }

  for (const resource of expectedResources) {
    if (!manifest.includes(resource)) {
      failures.push(`Missing MCP resource: ${resource}`);
    }
  }

  for (const prompt of expectedPrompts) {
    if (!manifest.includes(prompt)) {
      failures.push(`Missing MCP prompt: ${prompt}`);
    }
  }

  for (const term of forbiddenTerms) {
    if (lowerManifest.includes(term.toLowerCase())) {
      failures.push(`Forbidden MCP manifest term found: ${term}`);
    }
  }
}

if (existsSync(compiledManifestPath) && existsSync(snapshotPath)) {
  const compiledManifest = await import(`file://${compiledManifestPath}?t=${Date.now()}`);
  const integrityResult = validateMcpManifestIntegrity({
    tools: compiledManifest.SOVEREIGN_MCP_TOOLS,
    resources: compiledManifest.SOVEREIGN_MCP_RESOURCES,
    prompts: compiledManifest.SOVEREIGN_MCP_PROMPTS,
  });
  const expectedSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const snapshotResult = validateMcpManifestSnapshot(integrityResult.snapshot, expectedSnapshot);

  failures.push(...integrityResult.failures);

  if (!snapshotResult.passed) {
    failures.push(snapshotResult.message);
  }
}

if (failures.length > 0) {
  console.error("MCP manifest check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("MCP manifest check passed.");
