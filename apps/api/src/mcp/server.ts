import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { executeSkill as buildDryRunSkillPlan } from "../agents/executor.js";
import { orchestrateAgentRequest } from "../agents/orchestrator.js";
import { executeFirstSkillForRoute } from "../agents/executor.js";
import { executeSkill as executeRegisteredSkill } from "../agents/skill-executor.js";
import {
  SOVEREIGN_MCP_PROMPTS,
  SOVEREIGN_MCP_RESOURCES,
  SOVEREIGN_MCP_TOOLS,
} from "./manifest.js";
import {
  McpPolicyError,
  assertAllowedPrompt,
  assertAllowedResource,
  assertAllowedTool,
  assertInputBudget,
  assertPromptBudget,
  assertResourceReadBudget,
  assertSafeText,
  assertSkillIdBudget,
  recordToolInvocation,
} from "./policy.js";

type ToolArguments = Record<string, unknown> | undefined;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createRequestId(): string {
  return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveRepoRoot(): string {
  const cwd = process.cwd();

  if (existsSync(path.join(cwd, "apps/api/package.json"))) {
    return cwd;
  }

  if (existsSync(path.join(cwd, "package.json")) && existsSync(path.join(cwd, "src"))) {
    return path.resolve(cwd, "../..");
  }

  return path.resolve(__dirname, "../../../..");
}

function readResourceText(uri: string): { mimeType: string; text: string } | null {
  const repoRoot = resolveRepoRoot();
  const resourcePathByUri: Record<string, { filePath: string; mimeType: string }> = {
    "sovereign://openapi": {
      filePath: path.join(repoRoot, "apps/api/openapi.yaml"),
      mimeType: "application/yaml",
    },
    "sovereign://docs/architecture": {
      filePath: path.join(repoRoot, "docs/architecture.md"),
      mimeType: "text/plain",
    },
    "sovereign://docs/api": {
      filePath: path.join(repoRoot, "docs/api.md"),
      mimeType: "text/plain",
    },
  };

  const resourcePath = resourcePathByUri[uri];

  if (!resourcePath) {
    return null;
  }

  return {
    mimeType: resourcePath.mimeType,
    text: readFileSync(resourcePath.filePath, "utf8"),
  };
}

function readRequiredString(args: ToolArguments, key: string): string {
  const value = args?.[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required string input: ${key}`);
  }

  return value.trim();
}

function textResult(payload: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    isError,
  };
}

function toolError(message: string) {
  return textResult(
    {
      error: {
        code: "MCP_INVALID_TOOL_INPUT",
        message,
      },
    },
    true,
  );
}

function policyError(error: unknown) {
  if (error instanceof McpPolicyError) {
    return textResult({ error: error.toJSON() }, true);
  }

  return toolError(error instanceof Error ? error.message : "Invalid MCP tool input.");
}

function routeInput(input: string) {
  return orchestrateAgentRequest({
    prompt: input,
    tenantId: "local-mcp",
    actorUserId: "mcp-client",
    actorRole: "OPERATOR",
  });
}

function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: SOVEREIGN_MCP_TOOLS.map((tool) => ({
      ...(() => {
        assertAllowedTool(tool.name);
        return {};
      })(),
      name: tool.name,
      title: tool.title,
      description: tool.purpose,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const args = request.params.arguments;

    try {
      assertAllowedTool(request.params.name);
      recordToolInvocation(request.params.name);

      if (request.params.name === "sovereign_advisor_route") {
        const input = readRequiredString(args, "input");
        assertInputBudget(request.params.name, input);
        assertSafeText("tool:sovereign_advisor_route.input", input);
        const requestId = createRequestId();

        return textResult({
          requestId,
          ...routeInput(input),
        });
      }

      if (request.params.name === "sovereign_advisor_execute") {
        const input = readRequiredString(args, "input");
        assertInputBudget(request.params.name, input);
        assertSafeText("tool:sovereign_advisor_execute.input", input);
        const requestId = createRequestId();
        const route = routeInput(input);

        return textResult({
          requestId,
          route,
          execution: executeFirstSkillForRoute(route, { message: input }),
          dryRunPlan: buildDryRunSkillPlan(route.skills[0]?.id ?? "request_clarifier", {
            message: input,
          }),
        });
      }

      if (request.params.name === "sovereign_skill_execute") {
        const skillId = readRequiredString(args, "skillId");
        const input = readRequiredString(args, "input");
        assertSkillIdBudget(skillId);
        assertInputBudget(request.params.name, input);
        assertSafeText("tool:sovereign_skill_execute.skillId", skillId);
        assertSafeText("tool:sovereign_skill_execute.input", input);

        return textResult({
          requestId: createRequestId(),
          ...executeRegisteredSkill(skillId, { message: input }),
        });
      }

      return toolError(`Unknown MCP tool: ${request.params.name}`);
    } catch (error) {
      return policyError(error);
    }
  });
}

function registerResourceHandlers(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: SOVEREIGN_MCP_RESOURCES.map((resource) => ({
      ...(() => {
        assertAllowedResource(resource.uri);
        return {};
      })(),
      uri: resource.uri,
      name: resource.name,
      title: resource.title,
      description: resource.description,
      mimeType: resource.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    try {
      assertAllowedResource(request.params.uri);
      const resource = readResourceText(request.params.uri);

      if (!resource) {
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: "text/plain",
              text: JSON.stringify({
                error: {
                  code: "MCP_RESOURCE_NOT_ALLOWED",
                  message: "MCP resource is not available.",
                  policyArea: "resource",
                },
              }),
            },
          ],
        };
      }

      assertResourceReadBudget(request.params.uri, resource.text);

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: resource.mimeType,
            text: resource.text,
          },
        ],
      };
    } catch (error) {
      const policyDetails =
        error instanceof McpPolicyError
          ? error.toJSON()
          : {
              code: "MCP_RESOURCE_NOT_ALLOWED",
              message: "MCP resource request failed policy validation.",
              policyArea: "resource",
            };

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "text/plain",
            text: JSON.stringify({ error: policyDetails }, null, 2),
          },
        ],
      };
    }
  });
}

function registerPromptHandlers(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: SOVEREIGN_MCP_PROMPTS.map((prompt) => ({
      ...(() => {
        assertAllowedPrompt(prompt.name);
        assertPromptBudget(prompt.name, prompt.text);
        return {};
      })(),
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    try {
      assertAllowedPrompt(request.params.name);
      const prompt = SOVEREIGN_MCP_PROMPTS.find((item) => item.name === request.params.name);

      if (!prompt) {
        return {
          description: "Prompt not found.",
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: "The requested Sovereign Ops prompt was not found.",
              },
            },
          ],
        };
      }

      assertPromptBudget(prompt.name, prompt.text);

      return {
        description: prompt.description,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: prompt.text,
            },
          },
        ],
      };
    } catch (error) {
      const policyDetails =
        error instanceof McpPolicyError
          ? error.toJSON()
          : {
              code: "MCP_PROMPT_NOT_ALLOWED",
              message: "MCP prompt request failed policy validation.",
              policyArea: "prompt",
            };

      return {
        description: "Prompt blocked by MCP policy.",
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: JSON.stringify({ error: policyDetails }, null, 2),
            },
          },
        ],
      };
    }
  });
}

export function createSovereignMcpServer(): Server {
  const server = new Server(
    {
      name: "sovereign-ops-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions:
        "Use Sovereign Ops tools for local dry-run advisor routing and planning. No protected visibility endpoints or environment values are exposed.",
    },
  );

  registerToolHandlers(server);
  registerResourceHandlers(server);
  registerPromptHandlers(server);

  return server;
}

export async function startSovereignMcpStdioServer(): Promise<void> {
  const server = createSovereignMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startSovereignMcpStdioServer().catch((error) => {
    process.stderr.write(
      `Sovereign Ops MCP server failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
