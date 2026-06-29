# Docker Release Runbook

Default image repo: `ghcr.io/maple0517/reader-next`.

## Published tags

- `latest`: newest tagged release.
- `vX.Y.Z`: exact release tag.
- `X.Y.Z`: exact release tag without the leading `v`.
- `X.Y`: newest patch release in a minor line.

## Automatic release through GitHub Actions

1. Make sure repo Actions can write GitHub Packages:
   - repository Settings → Actions → General → Workflow permissions → Read and write permissions.
2. Create and push a semver tag:

```bash
git tag v1.0.7
git push origin v1.0.7
```

3. Watch the `Publish Docker image` workflow.
4. Verify the image:

```bash
docker buildx imagetools inspect ghcr.io/maple0517/reader-next:v1.0.7
docker buildx imagetools inspect ghcr.io/maple0517/reader-next:1.0.7
docker pull ghcr.io/maple0517/reader-next:latest
```

## Manual local build

Use this when testing the image before tagging.

```bash
docker build -t reader-next:local .
docker run --rm -p 18080:18080 -v reader-storage-test:/app/storage reader-next:local
```

Open `http://localhost:18080`.

## Manual multi-arch publish

Use Docker Buildx when GitHub Actions is unavailable.

```bash
export IMAGE=ghcr.io/maple0517/reader-next
export TAG=v1.0.7

docker login ghcr.io
docker buildx create --use --name reader-release || docker buildx use reader-release
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ${IMAGE}:${TAG} \
  -t ${IMAGE}:latest \
  --push \
  .
```

## Runtime contract

- Container port: `18080`.
- Persistent data: `/app/storage`.
- Static frontend: `/app/web/dist`.
- Default database URL: `sqlite:/app/storage/reader.db?mode=rwc`.
- Secrets stay in runtime env files; never bake `SECURE_KEY` or `INVITE_CODE` into images.

## User upgrade

```bash
docker compose pull
docker compose up -d
```
