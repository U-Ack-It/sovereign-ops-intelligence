import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicManifestSnapshot } from "./check-mcp-manifest-integrity.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const snapshotPath = path.join(apiDir, "src/mcp/manifest.snapshot.json");

export function buildMcpManifestSnapshot(manifest) {
  return createDeterministicManifestSnapshot({
    tools: manifest.SOVEREIGN_MCP_TOOLS,
    resources: manifest.SOVEREIGN_MCP_RESOURCES,
    prompts: manifest.SOVEREIGN_MCP_PROMPTS,
  });
}

export function writeMcpManifestSnapshot(snapshot, destinationPath = snapshotPath) {
  writeFileSync(destinationPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function main() {
  const manifest = await import("../dist/mcp/manifest.js");
  const snapshot = buildMcpManifestSnapshot(manifest);

  writeMcpManifestSnapshot(snapshot);
  console.log("MCP manifest snapshot updated.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("MCP manifest snapshot update failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
