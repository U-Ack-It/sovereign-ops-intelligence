# Architecture

Sovereign Ops Intelligence is centered on a small TypeScript API service under `apps/api`.

```text
Client or internal tool
  -> Sovereign Ops API
      -> Advisor router
      -> Skill registry and dry-run execution
      -> In-memory audit trail
      -> Dashboard and metrics endpoints
      -> Observability boundary
      -> Optional OTLP trace export
  -> Docker runtime

Local MCP client
  -> Sovereign Ops MCP stdio bridge
      -> Advisor router
      -> Skill registry and dry-run execution
      -> Read-only OpenAPI and docs resources
```

## Runtime Components

- API server: Node HTTP server with no web framework dependency.
- Advisor routes: deterministic mapping from request text to Estate, Security, Vendor, Concierge, Compliance, or Operations Advisor.
- Skill execution: dry-run, plan-only skill execution with no real-world side effects.
- Audit trail: in-memory advisor and API event history.
- Dashboard: advisor cards and audit summary for future UI/client consumption.
- Metrics: in-memory HTTP, process, audit, and telemetry summaries.
- Observability boundary: safe telemetry event spine with `requestId`, route, method, status, advisor, and duration fields.
- Optional OTLP export: generic OpenTelemetry trace adapter, disabled by default.
- Docker runtime: production build, `npm start`, graceful shutdown, and `/health` container check.
- MCP stdio bridge: local-first bridge for agent clients to discover safe advisor tools, selected docs, and short operational prompts without starting the HTTP server.

## In-Memory Limits

Audit, dashboard, and metrics data are currently in-memory only. They reset when the process restarts and are not durable records. The audit trail and telemetry buffers are intentionally bounded for local operational visibility.

The MCP bridge intentionally does not expose internal visibility endpoints, environment values, telemetry internals, or database resources.
