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

When `SOVEREIGN_ADMIN_API_KEY` is configured, requests to `GET /agents/audit`, `GET /agents/dashboard`, and `GET /agents/metrics` must include:

```text
x-admin-api-key: <configured key>
```

In production, `SOVEREIGN_ADMIN_API_KEY` must be configured and must not be an obvious placeholder. Run `npm run check:production` before deployment.

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

Current mode: in-memory metrics. `GET /agents/metrics` exposes process, HTTP, audit, and telemetry event summaries for local debugging and operational checks. It is admin-protected and does not expose secrets, request bodies, or full user input.

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

## Notes

- Advisor execution is dry-run and does not call external systems.
- `/agents/audit` and `/agents/dashboard` are read-only visibility endpoints.
- `/agents/metrics` is a read-only admin visibility endpoint. It does not expose secrets, request bodies, or environment variable values beyond the environment name.
- Audit, dashboard, and metrics data are currently in-memory only and reset when the process restarts.
