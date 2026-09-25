# Bundle Options

The canonical entry point is:

```powershell
tools/scripts/build_docker_bundle.ps1
```

## Important parameters

| Parameter | Default | Purpose |
| --- | --- | --- |
| `-Version` | current short Git commit | Docker tag and bundle version. Pass a suffix such as `<commit>-aio` when building a second target from the same commit, otherwise the image tag and the archive name are reused. |
| `-ImageRepository` | `ragflow-local` | local application image repository |
| `-Target` | `production` | `production` (backend + React frontend) or `all-in-one` (also bakes in the 智盛 PHP portal) |
| `-DocEngine` | `elasticsearch` | Compose document engine profile |
| `-Device` | `cpu` | `cpu` or `gpu` application service |
| `-ExtraProfiles` | empty | extra Compose profiles such as `tei-cpu`, `sandbox`, or `jaeger` |
| `-Platform` | `linux/amd64` | `linux/amd64` or `linux/arm64` |
| `-NeedMirror` | off | point apt at Tsinghua. It does not supply every Docker Hub tag (`php:8.2-apache`, `mysql:8.0.40` were missing). A failed mirror pull falls back to a local image of the same name. |
| `-DependencyImage` | empty, or the Huawei mirror when `-NeedMirror` is set | image mounted as `infiniflow/ragflow_deps:latest` during the application build |
| `-OutputDirectory` | `dist/docker-bundle` | directory that receives the bundle directory and `.tar.gz` |
| `-NoCache` | off | disable BuildKit layer cache |
| `-SkipPull` | off | reuse dependency images already present locally |
| `-SkipAppBuild` | off | reuse the existing `ragflow-local:<version>` image instead of rebuilding it |
| `-GiteeTokenFile` | empty | file containing a Gitee token, passed as a BuildKit secret (`id=gitee_token`) for the `GITEE_TOKEN` build arg |
| `-EnvFile` | `docker/.env` | source runtime configuration copied into the bundle |
| `-KeepBundleDirectory` | off | retain the uncompressed directory beside the archive |
| `-DryRun` | off | validate inputs and print the build plan without changing state |

## Profile guidance

- Default script profiles: `elasticsearch,cpu`. MySQL is not in that set.
  Add `metadata-mysql` to export and start MySQL.
- 智盛 portal, two mutually exclusive shapes:
  - `-ExtraProfiles vivarly` — the portal is a separate image and container,
    built from `智盛fontend/` with `docker/vivarly/Dockerfile`, `apache.conf`,
    `php.ini`, and `.dockerignore` overlaid. `config.local.php` is removed
    before the image build. PHP 8.2.
  - `-Target all-in-one` — the portal is baked into the application image by
    the `all-in-one` Dockerfile stage: nginx keeps `:80` for the React frontend
    and the API proxy, Apache with mod_php serves `/var/www/html` on `:8080`,
    and Compose publishes `${VIVARLY_PORT:-18080}:8080`. `docker/all-in-one/portal.conf`
    supplies the vhost; `docker/vivarly/php.ini` is reused verbatim. PHP 8.3
    (Ubuntu 24.04). Drop `vivarly` from `-ExtraProfiles` — the script rejects
    the combination because both bind `VIVARLY_PORT`.
  Either shape needs `metadata-mysql` for the portal's database.
- Code-only upgrade of an existing server: keep that server's `.env` and
  volumes. `docker compose up -d --pull never` recreates containers whose
  images changed. `docker compose down -v` deletes database data.
- GPU: use `-Device gpu`; the destination host needs NVIDIA Container Toolkit.
- Alternative engines: use `-DocEngine infinity`, `opensearch`, `oceanbase`, or
  `seekdb`. Their resource requirements differ substantially.
- TEI: add `-ExtraProfiles tei-cpu` or `tei-gpu`.
- Sandbox: add `-ExtraProfiles sandbox`; review the sandbox settings in `.env`.
- Observability: add `-ExtraProfiles jaeger`.

The script asks Compose for the exact images required by the selected profiles,
pulls those dependency images, and exports them together. It does not export
images belonging only to inactive profiles.

## Security

The chosen `-EnvFile` is copied into the archive so the bundle can start without
reconstruction. It may include database, object-store, cache, or provider
credentials. Review and rotate defaults before production use, and distribute
the archive as sensitive material.
