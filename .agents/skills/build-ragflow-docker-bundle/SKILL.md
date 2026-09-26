---
name: build-ragflow-docker-bundle
description: Build the current RAGFlow checkout into its production Docker image and package that image with Compose dependency images, deployment configuration, checksums, and one-command launchers for offline or air-gapped delivery. The bundle is RAGFlow only (compiled web/ frontend and Python backend). Use when asked to compile, package, export, or deliver a complete runnable RAGFlow Docker image bundle.
---

# Build RAGFlow Docker Bundle

## Overview

Use the repository's production multi-stage `Dockerfile` target `production`.
It compiles the RAGFlow React frontend from `web/`, copies it into the
production image, and installs the Python backend and Nginx in the same
deployable application image. Then export that image and the selected Compose
dependencies as a self-contained archive.

The package is RAGFlow. `-Target` stays `production`. Selected profiles are
`elasticsearch`, `cpu`, and `metadata-mysql`. `智盛fontend/` is not a build
context, and there is no portal Compose service: the 智盛 portal ships only
inside the `all-in-one` target's application image. `-ExtraProfiles vivarly` is
rejected.

## Workflow

1. Work from the RAGFlow repository root and inspect `git status --short --branch`.
   Do not discard unrelated user changes.
2. Confirm Docker Engine, Docker Compose v2, Buildx, and `tar` are available.
3. Run the script in dry-run mode first:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 -DryRun
   ```

4. Build the CPU + Elasticsearch package, including MySQL as RAGFlow's metadata
   database:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -DependencyImage infiniflow/ragflow_deps:local-3.3.0 `
     -ExtraProfiles metadata-mysql
   ```

   The script splits comma-separated `-ExtraProfiles` values into separate
   Compose `--profile` flags and writes that list into the bundled
   `COMPOSE_PROFILES`. `metadata-mysql` is required for the MySQL service.

5. Pass parameters for non-default targets:

   ```powershell
   # GPU runtime
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 -Device gpu

   # Add optional services
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -ExtraProfiles tei-cpu,sandbox
   ```

   Keep `metadata-mysql` in `-ExtraProfiles` whenever the bundle must start
   MySQL. Optional profiles are `tei-cpu`, `tei-gpu`, `sandbox`, and `jaeger`.

   **To bake the 智盛 portal into the application image**, build the
   `all-in-one` target with a distinct `-Version`:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -Target all-in-one -Version <commit>-aio `
     -DependencyImage infiniflow/ragflow_deps:local-3.3.0 `
     -ExtraProfiles metadata-mysql
   ```

   `-Version` is required here: it defaults to the current commit, so an
   all-in-one build without it would retag `ragflow-local:<commit>` over an
   existing production image. nginx still serves the React frontend on `:80`;
   Apache serves the portal on `:8080`, published as `VIVARLY_PORT` (`18080` by
   default) through `docker/docker-compose.all-in-one.yml`. Only an all-in-one
   bundle carries that override, and its launcher passes both compose files.
   A `production` bundle publishes no portal port at all.

   Pass `-NeedMirror` together with `-DependencyImage`. `-NeedMirror` points
   apt at `mirrors.tuna.tsinghua.edu.cn`; `archive.ubuntu.com` and
   `mirrors.aliyun.com` both dropped large package downloads from this
   network. `-NeedMirror` also selects the Huawei mirror of
   `infiniflow/ragflow_deps:latest` unless `-DependencyImage` is set. That
   published image can be older than this checkout: the Dockerfile copies
   `tika-server-standard-3.3.0.jar`, while the mirrored image still has Tika
   3.0.0. Build a local deps image from `ragflow_deps/` first. If
   `huggingface.co/InfiniFlow/deepdoc` is not in that directory, copy
   `/huggingface.co` from the older deps image into the new one before the
   application build.

6. Report the generated `.tar.gz` path and adjacent `.sha256` file. Do not claim
   the package is runnable unless the real build completed. If only a dry-run
   was performed, say so explicitly.

## Output Contract

The archive must contain:

- `images/ragflow-images.tar`: the RAGFlow production image and selected dependency images.
- `docker/`: Compose files, `.env`, entrypoint, and mounted configuration.
- `load-and-run.sh` and `load-and-run.ps1`: offline load and launch helpers.
- `manifest.json`: source commit, dirty state, target, platform, profiles, and images.
- `SHA256SUMS`: checksums for every file in the bundle.

The default package targets `linux/amd64`, CPU, and Elasticsearch. MySQL is
included through the `metadata-mysql` profile. MinIO and Valkey have no profile
and are always selected. The React frontend from `web/` is compiled into the
RAGFlow image and served by nginx on `:80`, with the `/api` proxy to the
Python API. `manifest.json` records `application_target` as `production`.

The bundle carries no portal files: `docker/` holds no `vivarly/` or
`all-in-one/` directory, and the bundled `docker-compose.yml` has no portal
service, no portal environment, and no `:8080` mapping. Only a
`-Target all-in-one` bundle adds `docker/docker-compose.all-in-one.yml`, which
supplies all three.

The bundled `.env` sets `EXPOSE_MYSQL_PORT=3307` and
`SEAFILE_SERVER_HOSTNAME=172.20.1.131:8082`. On an existing server, do not
replace its `.env`. Load the new images and run
`docker compose --env-file .env up -d --pull never` in the existing Compose
directory. Named volumes keep MySQL, MinIO, Elasticsearch, and Seafile data.
Do not run `docker compose down -v`. Treat `docker/.env` as sensitive because
it can contain credentials.

## Verification

After a real build, verify:

```powershell
Get-FileHash .\dist\docker-bundle\*.tar.gz -Algorithm SHA256
tar -tzf .\dist\docker-bundle\<bundle>.tar.gz
```

Check the portal is absent from a `production` bundle by inspecting the rendered
config, not by whether `up -d` succeeded: Compose silently dedupes identical
duplicate port mappings, so a leftover `:8080` would go unnoticed.

```powershell
docker compose --env-file docker/.env -f docker/docker-compose.yml config | Select-String ':8080'
```

Confirm `manifest.json` inside the archive has `application_target` `production`
and `compose_profiles` `elasticsearch`, `cpu`, `metadata-mysql` (plus any
optional profiles the user asked for). The image list is exactly
`ragflow-local:<version>` plus the dependency images; there is no portal image.
For an `all-in-one` bundle, `application_target` is `all-in-one` and the archive
also contains `docker/docker-compose.all-in-one.yml`.

If a Docker daemon is available and resources permit, extract the archive into a
temporary directory, run the platform launcher, and check:

```powershell
docker compose --env-file .env ps
docker compose --env-file .env config --quiet
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:80/
```

Read [references/bundle-options.md](references/bundle-options.md) when choosing
non-default profiles, target platforms, or distribution settings.
