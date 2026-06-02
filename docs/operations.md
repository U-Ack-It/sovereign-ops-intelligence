# Operations

## Local Verification

Run from the repository root:

```sh
npm --prefix apps/api test
npm --prefix apps/api run smoke:route
npm --prefix apps/api run sentinel
npm --prefix apps/api run smoke:production
```

## MCP Bridge

The MCP bridge is a local stdio process for agent clients. It is not an HTTP listener and it is only active when launched explicitly.

```sh
npm --prefix apps/api run build
npm --prefix apps/api run mcp:stdio
```

Run the manifest guard with:

```sh
npm --prefix apps/api run mcp:check
npm --prefix apps/api run mcp:policy:check
npm --prefix apps/api run mcp:manifest:check
npm --prefix apps/api run mcp:manifest:update-snapshot
npm --prefix apps/api run verify:mcp
```

The bridge exposes safe advisor routing and dry-run execution tools plus selected read-only docs resources. It does not expose internal visibility endpoints. Do not commit MCP client configuration containing credentials.

MCP policy limits:

- Input text: 2,000 characters
- Skill id: 120 characters
- Tool calls per session: 20
- Tool calls per minute: 10
- Resource reads: 20,000 characters
- Prompt text: 4,000 characters

MCP manifest integrity rules require every tool to use a strict object schema with declared properties and `additionalProperties: false`. New tool descriptors must avoid hidden instructions, policy-bypass wording, admin endpoint exposure, and secret references. Run `verify:mcp` before trusting a manifest change.

Use `mcp:manifest:update-snapshot` only after the changed MCP contract has been reviewed and accepted. Sentinel does not run this command automatically.

## Production Verification

```sh
npm --prefix apps/api run ci:check
npm --prefix apps/api run check:production
npm --prefix apps/api run openapi:check
npm --prefix apps/api run verify:production
npm --prefix apps/api run verify:release
npm --prefix apps/api start
```

`check:production` requires a safe `SOVEREIGN_ADMIN_API_KEY` when `NODE_ENV=production`.
`ci:check` verifies that GitHub Actions uses the release verification path and that `verify:release` keeps docs, OpenAPI, MCP, normal API, and production checks wired together.
`openapi:check` verifies that documented paths stay aligned with server routes and admin route security.
`verify:release` runs docs, MCP, API, and production checks; provide a safe `SOVEREIGN_ADMIN_API_KEY` in the environment before running it.

## Docker

Build:

```sh
docker build -t sovereign-ops-api -f apps/api/Dockerfile apps/api
```

Run with production environment values supplied at runtime. Do not bake secrets into the image.

## Required Production Environment

- `NODE_ENV=production`
- `SOVEREIGN_ADMIN_API_KEY`

## Runtime Rate Limit Environment

- `SOVEREIGN_RATE_LIMIT_AGENT_ACTIONS`
- `SOVEREIGN_RATE_LIMIT_ADMIN_VISIBILITY`
- `SOVEREIGN_RATE_LIMIT_WINDOW_MS`

These are optional in-memory guardrails for agent action POST routes and admin visibility/approval routes. Do not use them as a replacement for upstream edge protection in production.

## Optional OTLP Environment

- `SOVEREIGN_OTEL_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`

Do not commit real secrets, endpoint credentials, or OTLP headers.


## Human Approval Workflow

Approval-required agent actions return `ACTION_REQUIRES_APPROVAL` and create an in-memory pending approval record. Operators can inspect records with `GET /agents/approvals` or `GET /agents/approvals/:id`, view safe counts with `GET /agents/approvals/summary`, and explicitly sweep stale pending records with `POST /agents/approvals/expire`. Operators can record a decision with `POST /agents/approvals/:id/approve` or `POST /agents/approvals/:id/reject`. These endpoints are admin-protected. Approval decisions do not automatically execute deferred actions. `POST /agents/approvals/:id/execute` replays approved records exactly once in dry-run mode and performs no external side effects. Pending records expire after 24 hours; expired records remain visible as safe metadata but cannot be approved, rejected, or executed.

For operational handoff or debugging, admins can call `GET /agents/snapshot`. The snapshot is read-only and combines safe in-memory advisor, audit, approval, and metrics metadata. It intentionally omits raw inputs, secrets, admin keys, OTLP headers, and recent telemetry event payloads.
