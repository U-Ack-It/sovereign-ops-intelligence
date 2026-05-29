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

When `SOVEREIGN_ADMIN_API_KEY` is configured, requests to `GET /agents/audit` and `GET /agents/dashboard` must include:

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

## Notes

- Advisor execution is dry-run and does not call external systems.
- `/agents/audit` and `/agents/dashboard` are read-only visibility endpoints.
- Audit and dashboard data are currently in-memory only and reset when the process restarts.
