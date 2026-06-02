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
- `GET /agents/approvals`
- `GET /agents/approvals/:id`
- `POST /agents/approvals/:id/approve`
- `POST /agents/approvals/:id/reject`
- `POST /agents/approvals/:id/execute`

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

## MCP Safety Policy

The MCP bridge enforces a policy before any local tool call, resource read, or prompt return.

Allowlists:

- Tools: `sovereign_advisor_route`, `sovereign_advisor_execute`, `sovereign_skill_execute`
- Resources: `sovereign://openapi`, `sovereign://docs/architecture`, `sovereign://docs/api`
- Prompts: `sovereign-operations-triage`, `sovereign-security-review`, `sovereign-compliance-review`

Budgets and limits:

- Max input length: 2,000 characters
- Max skill id length: 120 characters
- Max tool calls per session: 20
- Max tool calls per minute: 10
- Max resource read: 20,000 characters
- Max prompt size: 4,000 characters

Policy errors are structured with a code, message, policy area, and limit where relevant. Admin visibility endpoints are intentionally not exposed as MCP tools or resources.

## MCP Manifest Integrity

MCP tool descriptors are guarded as a client-facing contract. New tools must be added through `apps/api/src/mcp/manifest.ts` with stable names, clear descriptions, strict object schemas, declared properties, and `additionalProperties: false`.

Every required field must exist in the schema properties. Tool and field descriptions must not contain hidden-instruction language, secret references, admin endpoint exposure, or policy-bypass wording.

Run the MCP contract checks with:

```sh
npm --prefix apps/api run verify:mcp
```

This runs the manifest catalog check, policy check, and manifest integrity/schema hardening check.

The integrity check compares the live deterministic manifest output against `apps/api/src/mcp/manifest.snapshot.json`. Snapshot updates should be reviewed as client-facing contract changes.


## Approval Decisions

`requires_approval` actions create in-memory approval records and do not execute. Admin-protected approval decision endpoints can mark records as approved or rejected, but the current baseline records the decision only and does not execute deferred actions automatically. Approval records store safe metadata, digests, lengths, and safe context keys rather than raw input, authorization headers, secrets, tokens, passwords, private keys, or OTLP values.
