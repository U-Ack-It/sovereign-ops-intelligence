import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicManifestSnapshot } from "./check-mcp-manifest-integrity.mjs";
import {
  SOVEREIGN_MCP_PROMPTS,
  SOVEREIGN_MCP_RESOURCES,
  SOVEREIGN_MCP_TOOLS,
} from "../dist/mcp/manifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const snapshotPath = path.join(apiDir, "src/mcp/manifest.snapshot.json");

const snapshot = createDeterministicManifestSnapshot({
  tools: SOVEREIGN_MCP_TOOLS,
  resources: SOVEREIGN_MCP_RESOURCES,
  prompts: SOVEREIGN_MCP_PROMPTS,
});

writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log("MCP manifest snapshot updated.");
