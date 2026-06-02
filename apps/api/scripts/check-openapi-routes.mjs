import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiDir, "../..");

const dynamicApprovalRoutes = [
  { path: "/agents/approvals/{approvalId}", methods: ["GET"] },
  { path: "/agents/approvals/{approvalId}/approve", methods: ["POST"] },
  { path: "/agents/approvals/{approvalId}/reject", methods: ["POST"] },
  { path: "/agents/approvals/{approvalId}/execute", methods: ["POST"] },
];

const adminProtectedPrefixes = [
  "/agents/audit",
  "/agents/dashboard",
  "/agents/metrics",
  "/agents/snapshot",
  "/agents/approvals",
];

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export function collectServerRoutes(serverSource) {
  const routes = [];
  const routePattern = /\["(\/[^"\]]+)",\s*\[([^\]]+)\]\]/g;
  let match;

  while ((match = routePattern.exec(serverSource)) !== null) {
    const routePath = match[1];
    const methods = Array.from(match[2].matchAll(/"([A-Z]+)"/g), (methodMatch) => methodMatch[1]);

    if (methods.length > 0) {
      routes.push({ path: routePath, methods });
    }
  }

  if (serverSource.includes('path.startsWith("/agents/approvals/")')) {
    routes.push(...dynamicApprovalRoutes);
  }

  return routes.sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }

    return left.methods.join(",").localeCompare(right.methods.join(","));
  });
}

export function getOpenApiPathBlock(openApiSource, routePath) {
  const lines = openApiSource.split(/\r?\n/);
  const pathLine = `  ${routePath}:`;
  const start = lines.findIndex((line) => line === pathLine);

  if (start === -1) {
    return null;
  }

  const block = [];

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];

    if (index > start && /^  \/.+:$/.test(line)) {
      break;
    }

    block.push(line);
  }

  return block.join("\n");
}

function isAdminProtectedPath(routePath) {
  return adminProtectedPrefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`));
}

export function validateOpenApiRoutes({ serverSource, openApiSource }) {
  const failures = [];
  const routes = collectServerRoutes(serverSource);

  for (const route of routes) {
    const block = getOpenApiPathBlock(openApiSource, route.path);

    if (!block) {
      failures.push(`OpenAPI missing path: ${route.path}`);
      continue;
    }

    for (const method of route.methods) {
      const openApiMethod = method.toLowerCase();

      if (!block.includes(`    ${openApiMethod}:`)) {
        failures.push(`OpenAPI path ${route.path} missing method: ${method}`);
      }
    }

    if (isAdminProtectedPath(route.path) && !block.includes("ApiKeyAuth")) {
      failures.push(`OpenAPI admin path ${route.path} missing ApiKeyAuth security`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    routes,
  };
}

export function runOpenApiRouteCheck() {
  return validateOpenApiRoutes({
    serverSource: readRepoFile("apps/api/src/server.ts"),
    openApiSource: readRepoFile("apps/api/openapi.yaml"),
  });
}

const isMainModule = process.argv[1] ? import.meta.url === new URL(process.argv[1], "file:").href : false;

if (isMainModule) {
  const result = runOpenApiRouteCheck();

  if (!result.ok) {
    console.error("OpenAPI route drift check failed:");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`OpenAPI route drift check passed for ${result.routes.length} route entries.`);
}
