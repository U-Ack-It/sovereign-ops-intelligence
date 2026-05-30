const suspiciousDescriptorTerms = [
  "ignore previous instructions",
  "system prompt",
  "developer message",
  "exfiltrate",
  "secret",
  "token",
  "password",
  "private key",
  "bypass",
  "override policy",
];

const forbiddenToolSurfaceTerms = [
  "/agents/audit",
  "/agents/dashboard",
  "/agents/metrics",
  "x-admin-api-key",
  "SOVEREIGN_ADMIN_API_KEY",
  "OTEL_EXPORTER_OTLP_HEADERS",
];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function addFailure(failures, message) {
  failures.push(message);
}

function validateToolSchema(tool, failures) {
  const label = tool?.name ?? "(unnamed tool)";
  const schema = tool?.inputSchema;

  if (!schema || typeof schema !== "object") {
    addFailure(failures, `${label}: missing input schema`);
    return;
  }

  if (schema.type !== "object") {
    addFailure(failures, `${label}: input schema must have type object`);
  }

  if (!schema.properties || typeof schema.properties !== "object") {
    addFailure(failures, `${label}: object schema must declare properties`);
  }

  if (schema.additionalProperties !== false) {
    addFailure(failures, `${label}: object schema must reject unknown fields`);
  }

  if (!Array.isArray(schema.required)) {
    addFailure(failures, `${label}: required fields must be an array`);
    return;
  }

  for (const requiredField of schema.required) {
    if (!schema.properties || !hasOwn(schema.properties, requiredField)) {
      addFailure(failures, `${label}: required field ${requiredField} is not declared in properties`);
    }
  }

  for (const [fieldName, fieldSchema] of Object.entries(schema.properties ?? {})) {
    if (!fieldSchema || typeof fieldSchema !== "object") {
      addFailure(failures, `${label}: field ${fieldName} schema must be an object`);
      continue;
    }

    if (fieldSchema.type !== "string") {
      addFailure(failures, `${label}: field ${fieldName} must be typed as string`);
    }

    const descriptorText = `${fieldName} ${fieldSchema.description ?? ""}`;
    assertSafeDescriptorText(`${label}.${fieldName}`, descriptorText, failures);
  }
}

function assertSafeDescriptorText(label, value, failures) {
  const text = normalizeText(value);

  for (const term of suspiciousDescriptorTerms) {
    if (text.includes(term)) {
      addFailure(failures, `${label}: suspicious descriptor language detected`);
      return;
    }
  }
}

export function createDeterministicManifestSnapshot(manifest) {
  const tools = [...(manifest.tools ?? [])]
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      purpose: tool.purpose,
      inputSchema: tool.inputSchema,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const resources = [...(manifest.resources ?? [])]
    .map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      title: resource.title,
      description: resource.description,
      mimeType: resource.mimeType,
    }))
    .sort((left, right) => left.uri.localeCompare(right.uri));

  const prompts = [...(manifest.prompts ?? [])]
    .map((prompt) => ({
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    tools,
    resources,
    prompts,
  };
}

export function validateMcpManifestIntegrity(manifest) {
  const failures = [];
  const toolNames = new Set();
  const snapshot = createDeterministicManifestSnapshot(manifest);

  if (snapshot.tools.length === 0) {
    addFailure(failures, "manifest must expose at least one MCP tool");
  }

  for (const tool of snapshot.tools) {
    if (!tool.name || typeof tool.name !== "string") {
      addFailure(failures, "every MCP tool must have a stable name");
      continue;
    }

    if (toolNames.has(tool.name)) {
      addFailure(failures, `${tool.name}: duplicate MCP tool name`);
    }
    toolNames.add(tool.name);

    if (!tool.title || typeof tool.title !== "string") {
      addFailure(failures, `${tool.name}: missing human-readable title`);
    }

    if (!tool.purpose || typeof tool.purpose !== "string") {
      addFailure(failures, `${tool.name}: missing non-empty human-readable description`);
    }

    assertSafeDescriptorText(`${tool.name}.title`, tool.title, failures);
    assertSafeDescriptorText(`${tool.name}.purpose`, tool.purpose, failures);

    const toolText = normalizeText(JSON.stringify(tool));
    for (const term of forbiddenToolSurfaceTerms) {
      if (toolText.includes(term.toLowerCase())) {
        addFailure(failures, `${tool.name}: forbidden internal/admin surface exposed`);
      }
    }

    validateToolSchema(tool, failures);
  }

  return {
    passed: failures.length === 0,
    failures,
    snapshot,
  };
}

export function validateMcpManifestSnapshot(currentSnapshot, expectedSnapshot) {
  const current = `${JSON.stringify(currentSnapshot, null, 2)}\n`;
  const expected = `${JSON.stringify(expectedSnapshot, null, 2)}\n`;

  if (current === expected) {
    return {
      passed: true,
      message: "MCP manifest snapshot matches.",
    };
  }

  return {
    passed: false,
    message:
      "MCP manifest snapshot drift detected. Review the descriptor change and update apps/api/src/mcp/manifest.snapshot.json only when the new tool contract is intentional.",
  };
}

async function main() {
  const manifest = await import("../dist/mcp/manifest.js");
  const result = validateMcpManifestIntegrity({
    tools: manifest.SOVEREIGN_MCP_TOOLS,
    resources: manifest.SOVEREIGN_MCP_RESOURCES,
    prompts: manifest.SOVEREIGN_MCP_PROMPTS,
  });
  const expectedSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const snapshotResult = validateMcpManifestSnapshot(result.snapshot, expectedSnapshot);

  if (!result.passed || !snapshotResult.passed) {
    console.error("MCP manifest integrity check failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    if (!snapshotResult.passed) {
      console.error(`- ${snapshotResult.message}`);
    }
    process.exit(1);
  }

  console.log("MCP manifest integrity check passed.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("MCP manifest integrity check crashed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const snapshotPath = path.join(apiDir, "src/mcp/manifest.snapshot.json");
