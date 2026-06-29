# Release Workflow

Use this workflow when publishing a new version of the backend, frontend, GitHub release, and Docker image.

## Preferred flow

1. Finish and verify code changes.
2. Run the local release helper:

```bash
./scripts/release.sh v1.0.7
```

3. The helper updates versions, builds frontend/backend locally, commits version files, creates a git tag, pushes it, and creates the GitHub Release.
4. Pushing the `vX.Y.Z` tag triggers `.github/workflows/docker-publish.yml`, which builds and pushes the multi-arch Docker image to GHCR.

## Docker image

Default image repo: `ghcr.io/maple0517/reader-next`.

Published tags:

- `latest`
- `vX.Y.Z`
- `X.Y.Z`
- `X.Y`

Users upgrade with:

```bash
docker compose pull
docker compose up -d
```

## Version controls

```bash
# Exact version
./scripts/release.sh v1.0.7
./scripts/release.sh 1.0.7

# Auto-bump modes
./scripts/release.sh --patch
./scripts/release.sh --minor
./scripts/release.sh --major
```

## Manual Docker publish fallback

See `DOCKER_RELEASE.md` for manual Docker Buildx commands.
