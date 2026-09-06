# Bundle Options

The canonical entry point is:

```powershell
tools/scripts/build_docker_bundle.ps1
```

## Important parameters

| Parameter | Default | Purpose |
| --- | --- | --- |
| `-Version` | current short Git commit | Docker tag and bundle version |
| `-ImageRepository` | `ragflow-local` | local application image repository |
| `-DocEngine` | `elasticsearch` | Compose document engine profile |
| `-Device` | `cpu` | `cpu` or `gpu` application service |
| `-ExtraProfiles` | empty | extra Compose profiles such as `tei-cpu`, `sandbox`, or `jaeger` |
| `-Platform` | `linux/amd64` | `linux/amd64` or `linux/arm64` |
| `-NeedMirror` | off | use the Dockerfile's China mirror path |
| `-NoCache` | off | disable BuildKit layer cache |
| `-SkipPull` | off | reuse dependency images already present locally |
| `-EnvFile` | `docker/.env` | source runtime configuration copied into the bundle |
| `-KeepBundleDirectory` | off | retain the uncompressed directory beside the archive |
| `-DryRun` | off | validate inputs and print the build plan without changing state |

## Profile guidance

- Default: `elasticsearch,cpu`.
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
