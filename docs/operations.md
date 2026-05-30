# Operations

## Local Verification

Run from the repository root:

```sh
npm --prefix apps/api test
npm --prefix apps/api run smoke:route
npm --prefix apps/api run sentinel
npm --prefix apps/api run smoke:production
```

## Production Verification

```sh
npm --prefix apps/api run check:production
npm --prefix apps/api run verify:production
npm --prefix apps/api start
```

`check:production` requires a safe `SOVEREIGN_ADMIN_API_KEY` when `NODE_ENV=production`.

## Docker

Build:

```sh
docker build -t sovereign-ops-api -f apps/api/Dockerfile apps/api
```

Run with production environment values supplied at runtime. Do not bake secrets into the image.

## Required Production Environment

- `NODE_ENV=production`
- `SOVEREIGN_ADMIN_API_KEY`

## Optional OTLP Environment

- `SOVEREIGN_OTEL_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`

Do not commit real secrets, endpoint credentials, or OTLP headers.
