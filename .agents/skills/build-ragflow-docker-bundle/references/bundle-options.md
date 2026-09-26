# Bundle Options

The canonical entry point is:

```powershell
tools/scripts/build_docker_bundle.ps1
```

The bundle built by this skill is the RAGFlow production image plus the
Compose dependencies for profiles `elasticsearch`, `cpu`, and `metadata-mysql`.
`智盛fontend/` is not copied into an image unless you build the `all-in-one`
target, and `-ExtraProfiles vivarly` is rejected — there is no portal Compose
service any more.

## Important parameters

| Parameter | Default | Purpose |
| --- | --- | --- |
| `-Version` | current short Git commit | Docker tag and bundle version. A second build from the same commit reuses the image tag and overwrites `dist/docker-bundle/` unless `-Version` differs. |
| `-ImageRepository` | `ragflow-local` | local application image repository |
| `-Target` | `production` | `production` (Python backend + the React frontend compiled from `web/`) or `all-in-one` (also bakes the 智盛 PHP portal into the image). Pair `all-in-one` with `-Version <commit>-aio` so it cannot retag a production image. |
| `-DocEngine` | `elasticsearch` | Compose document engine profile |
| `-Device` | `cpu` | `cpu` or `gpu` application service |
| `-ExtraProfiles` | empty | `metadata-mysql` for this package, plus optional `tei-cpu`, `tei-gpu`, `sandbox`, or `jaeger`. `vivarly` is rejected. |
| `-Platform` | `linux/amd64` | `linux/amd64` or `linux/arm64` |
| `-NeedMirror` | off | point apt at Tsinghua. It does not supply every Docker Hub tag (`mysql:8.0.40` was missing). A failed mirror pull falls back to a local image of the same name. |
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
  This package adds `metadata-mysql` because RAGFlow's `DB_TYPE` defaults to
  `mysql`. The script writes the selected profiles over `COMPOSE_PROFILES`.
- Portal: `-Target all-in-one` bakes the 智盛 portal into the application image,
  and only that bundle carries `docker/docker-compose.all-in-one.yml`, which
  publishes `VIVARLY_PORT` (`18080`) and the portal environment. A `production`
  bundle publishes no portal port, so it cannot collide with a host port.
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
