# Sovereign Ops API

Local-first TypeScript API for advisor routing, dry-run skill execution, audit visibility, and dashboard summaries.

## Routes

- `GET /health` - service health, version, and timestamp.
- `GET /ready` - readiness status.
- `GET /version` - package name, version, and Node environment.
- `POST /agents/route` - route a message to an advisor with skills and plans.
- `POST /agents/execute` - route a message and execute the first selected skill in dry-run mode.
- `POST /agents/skills/execute` - execute a selected skill in dry-run mode.
- `GET /agents/audit` - in-memory advisor/API audit events.
- `GET /agents/dashboard` - advisor summary cards and in-memory audit stats.
- `GET /agents/metrics` - in-memory operational metrics for HTTP, process, and audit activity.
- `GET /agents/snapshot` - admin-safe operational support snapshot built from existing safe metadata.
- `GET /agents/approvals` - in-memory approval records for actions waiting on or completed by human decision. Pending records expire after 24 hours.
- `GET /agents/approvals/summary` - safe in-memory approval counts by status.
- `GET /agents/approvals/:id` - inspect one approval record.
- `POST /agents/approvals/expire` - explicitly expire stale pending approval records.
- `POST /agents/approvals/:id/approve` - record approval without automatically executing the deferred action.
- `POST /agents/approvals/:id/reject` - record rejection without executing the deferred action.
- `POST /agents/approvals/:id/execute` - replay an approved record once in dry-run mode without external side effects.

## Local Commands

```sh
npm run build
npm test
npm run smoke:route
npm run sentinel
```

## Production Commands

```sh
npm run check:production
npm run verify:production
npm run smoke:production
npm start
```

Build before starting the API:

```sh
npm run build
npm start
```

## Environment

- `PORT` - HTTP port for `npm start`. Defaults to `3000`.
- `NODE_ENV` - set to `production` for production runtime behavior.
- `SOVEREIGN_ADMIN_API_KEY` - admin key for internal visibility routes.
- `SOVEREIGN_OTEL_ENABLED` - set to `true` to enable optional OTLP trace export.
- `OTEL_SERVICE_NAME` - service name for external telemetry. Defaults to `sovereign-ops-api`.
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP HTTP trace endpoint.
- `OTEL_EXPORTER_OTLP_HEADERS` - OTLP HTTP headers, usually for backend authentication.

When `SOVEREIGN_ADMIN_API_KEY` is configured, requests to `GET /agents/audit`, `GET /agents/dashboard`, `GET /agents/metrics`, `GET /agents/snapshot`, and `GET/POST /agents/approvals...` must include:

```text
x-admin-api-key: <configured key>
```

In production, `SOVEREIGN_ADMIN_API_KEY` must be configured and must not be an obvious placeholder. Run `npm run check:production` before deployment.

## Response Security

All JSON API responses include baseline hardening headers: `Cache-Control: no-store`, `Content-Security-Policy`, `Cross-Origin-Resource-Policy`, `Referrer-Policy`, `X-Content-Type-Options`, and `X-Frame-Options`. These headers are applied centrally to success and error responses and are covered by contract tests.

Unsupported methods on known routes return structured `405` errors with an `Allow` header listing supported methods.

## Deployment

Build output is written to `dist` and excludes test files.

```sh
npm run build
NODE_ENV=production SOVEREIGN_ADMIN_API_KEY=<long-random-secret> npm run check:production
NODE_ENV=production SOVEREIGN_ADMIN_API_KEY=<long-random-secret> npm run verify:production
NODE_ENV=production SOVEREIGN_ADMIN_API_KEY=<long-random-secret> npm start
```

Docker image build:

```sh
docker build -t sovereign-ops-api -f apps/api/Dockerfile apps/api
```

Docker runtime example:

```sh
docker run --rm \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e SOVEREIGN_ADMIN_API_KEY=<long-random-secret> \
  sovereign-ops-api
```

Do not commit `.env` files. Use `.env.example` only as a template.

The server handles `SIGTERM` and `SIGINT` by closing the HTTP server before exiting. The container image includes a Docker `HEALTHCHECK` against `GET /health`.

`npm run smoke:production` builds the API, starts the production server on a temporary local port, verifies `GET /health`, sends `SIGTERM`, and confirms clean shutdown.

## Observability

Current mode: in-memory metrics. `GET /agents/metrics` exposes process, HTTP, audit, and telemetry event summaries for local debugging and operational checks. `GET /agents/snapshot` returns an admin-safe support bundle from already-safe audit, approval, dashboard, and metrics metadata, omitting recent telemetry event payloads. Both routes are admin-protected and do not expose secrets, request bodies, or full user input.

Next integration target: OpenTelemetry Collector. The API now records stable telemetry event concepts such as `http.request`, `advisor.route`, `advisor.execute`, `skill.execute`, and `api.error` with correlation fields like `requestId`, route, method, status code, advisor, and duration where available. A future exporter can send these events to an OpenTelemetry Collector, which can receive, process, and export telemetry to a backend without rewriting the HTTP server.

## External Trace Export

External trace export is optional and disabled by default. Enable generic OTLP export with environment variables:

```sh
SOVEREIGN_OTEL_ENABLED=true
OTEL_SERVICE_NAME=sovereign-ops-api
OTEL_EXPORTER_OTLP_ENDPOINT=<otlp-http-traces-endpoint>
OTEL_EXPORTER_OTLP_HEADERS=<otlp-auth-headers>
```

Do not commit endpoint credentials or OTLP headers. `GET /agents/metrics` only reports whether an endpoint is configured; it does not return endpoint values or headers.

Recommended production path:

```text
Sovereign Ops API -> OpenTelemetry Collector -> telemetry backend
```

The OpenTelemetry Collector can receive, process, redact, sample, and export telemetry to a backend. Langfuse can be used as one OTLP-compatible backend when configured with its endpoint and authorization headers, but the API adapter remains generic and does not depend on Langfuse-specific code.

## Developer Portal Metadata

Backstage and TechDocs metadata live at the repository root:

- `catalog-info.yaml` - Backstage System, Component, and API entities.
- `mkdocs.yml` - TechDocs site navigation.
- `docs/` - TechDocs source pages.
- `apps/api/openapi.yaml` - OpenAPI contract referenced by Backstage.

Run the metadata guard from the repository root:

```sh
npm --prefix apps/api run docs:check
```

Or from `apps/api`:

```sh
npm run docs:check
```

## MCP Bridge

The local MCP bridge lets agent clients discover safe Sovereign Ops advisor capabilities without reading the codebase. It uses stdio and is separate from the HTTP API server.

Build first, then run:

```sh
npm run build
npm run mcp:stdio
```

From the repository root:

```sh
npm --prefix apps/api run build
npm --prefix apps/api run mcp:stdio
```

MCP tools:

- `sovereign_advisor_route` - route an operator message to the best advisor.
- `sovereign_advisor_execute` - create a safe dry-run advisor execution result.
- `sovereign_skill_execute` - run one known advisor skill through the deterministic local skill executor.

MCP resources:

- `sovereign://openapi`
- `sovereign://docs/architecture`
- `sovereign://docs/api`

MCP prompts:

- `sovereign-operations-triage`
- `sovereign-security-review`
- `sovereign-compliance-review`

The MCP bridge intentionally does not expose `/agents/audit`, `/agents/dashboard`, `/agents/metrics`, protected visibility data, environment values, or database resources. Do not commit MCP client configuration containing credentials.

Validate the MCP catalog with:

```sh
npm run mcp:check
```

Validate the full MCP manifest, policy, and schema contract with:

```sh
npm run verify:mcp
```

## MCP Safety Policy

The MCP bridge has an explicit local safety policy around tools, resources, prompts, input sizes, and tool-call budgets.

Allowlists:

- Tools: `sovereign_advisor_route`, `sovereign_advisor_execute`, `sovereign_skill_execute`
- Resources: `sovereign://openapi`, `sovereign://docs/architecture`, `sovereign://docs/api`
- Prompts: `sovereign-operations-triage`, `sovereign-security-review`, `sovereign-compliance-review`

Limits:

- Operator input: 2,000 characters
- Skill id: 120 characters
- Tool calls per local session: 20
- Tool calls per minute: 10
- Resource read size: 20,000 characters
- Prompt size: 4,000 characters

The policy blocks forbidden surfaces and sensitive text categories before execution or resource return. Admin visibility endpoints remain intentionally unavailable through MCP. Validate policy metadata with:

```sh
npm run mcp:policy:check
```

## MCP Manifest Integrity

MCP tool descriptors are part of the client-facing agent contract. Descriptor drift or vague schemas can cause tool poisoning, so every MCP tool must keep a stable name, a clear human-readable purpose, and a strict object input schema.

Rules for adding a new MCP tool:

- Add the tool to `apps/api/src/mcp/manifest.ts`.
- Keep the tool name stable and deterministic.
- Provide a clear title and purpose.
- Use `inputSchema.type: "object"`.
- Declare `properties` and make every required field exist in `properties`.
- Set `additionalProperties: false`.
- Avoid hidden instruction language such as prompts to bypass, override, exfiltrate, or reveal secrets.
- Do not expose admin visibility endpoints, environment variables, credentials, or raw telemetry.

Run the integrity check after any manifest change:

```sh
npm run mcp:manifest:check
```

The integrity check compares the current deterministic manifest output with `apps/api/src/mcp/manifest.snapshot.json`. Update that snapshot only when a tool, resource, prompt, or schema change is intentional and reviewed.

To update the snapshot after an approved contract change:

```sh
npm run mcp:manifest:update-snapshot
```

`mcp:manifest:update` is kept as a compatibility alias, but the explicit governance command is `mcp:manifest:update-snapshot`. Sentinel never runs the update command automatically.

## Notes

- Advisor execution is dry-run and does not call external systems.
- `/agents/audit` and `/agents/dashboard` are read-only visibility endpoints.
- `/agents/metrics` is a read-only admin visibility endpoint. It does not expose secrets, request bodies, or environment variable values beyond the environment name.
- `/agents/snapshot` is a read-only admin support endpoint. It combines safe in-memory metadata and intentionally omits raw inputs, secrets, admin keys, OTLP headers, and recent telemetry event payloads.
- `/agents/approvals` endpoints are admin-protected. Approval and rejection record decisions only. Approved records can be replayed once in dry-run mode; no external side effects are performed. Pending records expire after 24 hours and expired records cannot be changed or executed. `GET /agents/approvals/summary` returns safe counts, and `POST /agents/approvals/expire` runs the same stale-record expiration sweep explicitly. Approval records store safe metadata, digests, and lengths rather than raw inputs or secrets.
- Audit, dashboard, and metrics data are currently in-memory only and reset when the process restarts.
