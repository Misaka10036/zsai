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

4. Build the CPU + Elasticsearch package, including MySQL and the 智盛 portal:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -DependencyImage infiniflow/ragflow_deps:local-3.3.0 `
     -ExtraProfiles metadata-mysql,vivarly
   ```

   The script splits comma-separated `-ExtraProfiles` values into separate
   Compose `--profile` flags. `metadata-mysql` is required for the MySQL
   service. `vivarly` builds the
   portal image from `智盛fontend/` plus `docker/vivarly/Dockerfile`,
   `apache.conf`, and `php.ini`. Do not package `docker/vivarly` PHP sources
   or `config.local.php`.

   **To serve the portal from the application image itself** instead of a
   separate container, build the `all-in-one` target:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -Target all-in-one `
     -Version <commit>-aio `
     -DependencyImage infiniflow/ragflow_deps:local-3.3.0 `
     -ExtraProfiles metadata-mysql `
     -NeedMirror
   ```

   The application image then runs both web servers: nginx on `:80` for the
   compiled React frontend and the `/api` proxy, and Apache with mod_php on
   `:8080` serving `智盛fontend/` from `/var/www/html`. Compose publishes the
   portal as `${VIVARLY_PORT:-18080}:8080`, so the portal URL is unchanged at
   `http://<host>:18080/views/login.php`. Because the portal keeps its own
   document root, no portal source file needs a path change; the vhost
   `PassEnv`s the `DB_*` and `RAGFLOW_*` variables because `config.php` reads
   them with `getenv()`.

   `-Target all-in-one` and the `vivarly` profile are **mutually exclusive** —
   both bind `VIVARLY_PORT`. The script rejects the combination.

   Pass `-Version <commit>-aio`: the version defaults to the current commit, so
   building a second target from the same commit reuses the image tag and
   overwrites the existing `dist/docker-bundle/` archive.

5. Pass parameters for non-default targets:

   ```powershell
   # GPU runtime
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 -Device gpu

   # Add optional services
   powershell -ExecutionPolicy Bypass -File .\tools\scripts\build_docker_bundle.ps1 `
     -ExtraProfiles tei-cpu,sandbox
   ```

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

- `images/ragflow-images.tar`: application and selected dependency images.
- `docker/`: Compose files, `.env`, entrypoint, and mounted configuration.
- `load-and-run.sh` and `load-and-run.ps1`: offline load and launch helpers.
- `manifest.json`: source commit, dirty state, target, platform, profiles, and images.
- `SHA256SUMS`: checksums for every file in the bundle.

The default package targets `linux/amd64`, CPU, and Elasticsearch. MySQL is
included only when `metadata-mysql` is one of the profiles. MinIO and Valkey
have no profile and are always selected. The React frontend is compiled into
the RAGFlow image.

The 智盛 portal is included in one of two mutually exclusive ways. With
`-ExtraProfiles vivarly` it is a **separate image and container**. With
`-Target all-in-one` it is **baked into the application image**: nginx serves
the React frontend on `:80` and Apache serves the portal on `:8080`, published
as `VIVARLY_PORT` (`18080`). Either way the portal needs the `metadata-mysql`
profile so its MySQL database exists. Treat `docker/.env` as sensitive because
it can contain credentials.

The bundled `.env` sets `EXPOSE_MYSQL_PORT=3307` and
`SEAFILE_SERVER_HOSTNAME=172.20.1.131:8082`. On an existing server, do not
replace its `.env`. Load the new images and run
`docker compose --env-file .env up -d --pull never` in the existing Compose
directory. Named volumes keep MySQL, MinIO, Elasticsearch, and Seafile data.
Do not run `docker compose down -v`.

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

On the `all-in-one` target, also confirm both web servers listen and answer:

```powershell
docker exec <container> ss -lntp | Select-String ':(80|8080|9380)\b'
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:80/
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:18080/views/login.php
curl.exe -s -o NUL -w "%{http_code}`n" http://127.0.0.1:18080/css/style.css
docker exec <container> php -r "var_dump(getenv('RAGFLOW_BASE_URL'));"
```

`RAGFLOW_BASE_URL` must read `http://127.0.0.1:9380`, not `http://ragflow-cpu`:
the portal shares the container with the Python API. Then exercise the portal
by hand — login, search, upload, chat streaming, and Agent create/cancel —
because the all-in-one target runs PHP 8.3 (Ubuntu 24.04) while the standalone
`vivarly` image runs 8.2.

Read [references/bundle-options.md](references/bundle-options.md) when choosing
non-default profiles, target platforms, or distribution settings.
