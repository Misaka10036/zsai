---
name: build-ragflow-docker-bundle
description: Build the current RAGFlow checkout into a combined frontend/backend Docker image and package it with all Compose dependency images, deployment configuration, checksums, and one-command launchers for offline or air-gapped delivery. Use when asked to compile, package, export, or deliver a complete runnable RAGFlow Docker image bundle.
---

# Build RAGFlow Docker Bundle

## Overview

Use the repository's production multi-stage `Dockerfile`. It compiles the React
frontend, copies it into the production image, and installs the Python backend
and Nginx in the same deployable application image. Then export that image and
the selected Compose dependencies as a self-contained archive.

## Workflow

1. Work from the RAGFlow repository root and inspect `git status --short --branch`.
   Do not discard unrelated user changes.
2. Confirm Docker Engine, Docker Compose v2, Buildx, and `tar` are available.
3. Run the script in dry-run mode first:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 -DryRun
   ```

4. Build the default complete CPU + Elasticsearch package:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1
   ```

5. Pass parameters for non-default targets:

   ```powershell
   # China mirrors
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 -NeedMirror

   # GPU runtime
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 -Device gpu

   # Add optional services
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -ExtraProfiles tei-cpu,sandbox
   ```

6. Report the generated `.tar.gz` path and adjacent `.sha256` file. Do not claim
   the package is runnable unless the real build completed. If only a dry-run
   was performed, say so explicitly.

## Output Contract

The archive must contain:

- `images/ragflow-images.tar`: application and selected dependency images.
- `docker/`: Compose files, `.env`, entrypoint, and mounted configuration.
- `load-and-run.sh` and `load-and-run.ps1`: offline load and launch helpers.
- `manifest.json`: source commit, dirty state, platform, profiles, and images.
- `SHA256SUMS`: checksums for every file in the bundle.

The default package targets `linux/amd64`, CPU, and Elasticsearch. It includes
MySQL, MinIO, Valkey, Elasticsearch, and the combined RAGFlow image selected by
Compose. Treat `docker/.env` as sensitive because it can contain credentials.

## Verification

After a real build, verify:

```powershell
Get-FileHash .\dist\docker-bundle\*.tar.gz -Algorithm SHA256
tar -tzf .\dist\docker-bundle\<bundle>.tar.gz
```

If a Docker daemon is available and resources permit, extract the archive into a
temporary directory, run the platform launcher, and check:

```powershell
docker compose --env-file .env ps
docker compose --env-file .env config --quiet
```

Read [references/bundle-options.md](references/bundle-options.md) when choosing
non-default profiles, target platforms, or distribution settings.
