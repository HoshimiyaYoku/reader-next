# Docker Deployment and Release

This document is the single Docker runbook for Reader Next.

## File layout

```text
Dockerfile                         # canonical image build entrypoint
deploy/
  compose.yml                      # simple user deployment
  Caddyfile                        # optional Caddy reverse proxy config
  compose.caddy.yml                # production sample with Caddy
  env.docker.example               # deploy/compose.yml environment template
  env.prod.example                 # VPS deployment environment template
.github/workflows/docker-publish.yml # multi-arch GHCR publishing
```

Deprecated root files were removed: `Dockerfile.prod`, `Dockerfile.x86`, `docker-compose.prod.yml`, `DOCKER_RELEASE.md`, and `RELEASE_WORKFLOW.md`.

## Published image

Default image repo: `ghcr.io/maple0517/reader-next`.

Tags:

- `latest`: newest tagged release.
- `vX.Y.Z`: exact release tag.
- `X.Y.Z`: exact release tag without the leading `v`.
- `X.Y`: newest patch release in a minor line.

Architectures:

- `linux/amd64`
- `linux/arm64`

## User deployment

Run from the repository root:

```bash
cp deploy/env.docker.example .env.docker
docker compose -f deploy/compose.yml up -d
```

Upgrade:

```bash
docker compose -f deploy/compose.yml pull
docker compose -f deploy/compose.yml up -d
```

Runtime contract:

- Container port: `18080`.
- Persistent data: `/app/storage`.
- Static frontend: `/app/web/dist`.
- Default database URL: `sqlite:/app/storage/reader.db?mode=rwc`.
- Secrets stay in `.env.docker` or `.env.prod`; never bake `SECURE_KEY` or `INVITE_CODE` into the image.

## Production sample with Caddy

Run from the repository root:

```bash
cp deploy/env.prod.example .env.prod
docker compose -f deploy/compose.caddy.yml up -d
```

The deploy script uses the same compose file:

```bash
APP_DIR=/opt/reader/app scripts/deploy-do.sh
```

## Release flow

1. Verify changes locally.
2. Bump versions and create a tag through the release helper:

```bash
./scripts/release.sh v1.0.10
```

3. Pushing the `vX.Y.Z` tag triggers `.github/workflows/docker-publish.yml`.
4. The workflow builds `amd64` and `arm64` natively, then creates a multi-arch manifest.

Verify a published image:

```bash
docker buildx imagetools inspect ghcr.io/maple0517/reader-next:v1.0.10
```

## Manual image test

```bash
docker build -t reader-next:local .
docker run --rm -p 18080:18080 -v reader-storage-test:/app/storage reader-next:local
```

Open `http://localhost:18080`.
