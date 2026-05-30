# API

The OpenAPI contract is available at `apps/api/openapi.yaml`.

## Public Routes

- `GET /health`
- `GET /ready`
- `GET /version`
- `POST /agents/route`
- `POST /agents/execute`
- `POST /agents/skills/execute`

## Admin-Protected Routes

- `GET /agents/audit`
- `GET /agents/dashboard`
- `GET /agents/metrics`

When `SOVEREIGN_ADMIN_API_KEY` is configured, protected visibility routes require:

```text
x-admin-api-key: <configured key>
```

In production, missing admin API key configuration fails closed for protected visibility routes.

## Request IDs

Every response includes an `x-request-id` header. Clients may provide `x-request-id`; otherwise the API generates one. Error bodies also include `error.requestId`.

## Notes

Advisor execution is dry-run only. The API does not call vendors, modify credentials, send messages, execute contracts, or perform destructive actions.

## MCP Bridge

The local MCP stdio bridge is separate from the HTTP API. Build first, then run:

```sh
npm --prefix apps/api run build
npm --prefix apps/api run mcp:stdio
```

Safe MCP tools:

- `sovereign_advisor_route`
- `sovereign_advisor_execute`
- `sovereign_skill_execute`

Read-only MCP resources:

- `sovereign://openapi`
- `sovereign://docs/architecture`
- `sovereign://docs/api`

MCP prompts:

- `sovereign-operations-triage`
- `sovereign-security-review`
- `sovereign-compliance-review`

The MCP bridge is local-first and does not expose internal visibility endpoints or environment values. Do not commit MCP client configuration containing credentials.
