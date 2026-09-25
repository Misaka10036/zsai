[CmdletBinding()]
param(
    [string]$Version,
    [string]$ImageRepository = "ragflow-local",
    [string]$DependencyImage,
    [ValidateSet("elasticsearch", "infinity", "opensearch", "oceanbase", "seekdb")]
    [string]$DocEngine = "elasticsearch",
    [ValidateSet("cpu", "gpu")]
    [string]$Device = "cpu",
    [ValidateSet("production", "all-in-one")]
    [string]$Target = "production",
    [string[]]$ExtraProfiles = @(),
    [ValidateSet("linux/amd64", "linux/arm64")]
    [string]$Platform = "linux/amd64",
    [string]$OutputDirectory = "dist/docker-bundle",
    [string]$EnvFile = "docker/.env",
    [switch]$NeedMirror,
    [switch]$NoCache,
    [switch]$SkipPull,
    [switch]$KeepBundleDirectory,
    [string]$GiteeTokenFile,
    [switch]$SkipAppBuild,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Format-Command {
    param([string]$Executable, [string[]]$Arguments)
    $quoted = foreach ($argument in $Arguments) {
        if ($argument -match '[\s"]') {
            '"' + ($argument -replace '"', '\"') + '"'
        } else {
            $argument
        }
    }
    return "$Executable $($quoted -join ' ')"
}

function Invoke-Native {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [switch]$Capture
    )

    Write-Host ("> " + (Format-Command -Executable $Executable -Arguments $Arguments)) -ForegroundColor DarkGray
    if ($DryRun) {
        return @()
    }

    if ($Capture) {
        $output = & $Executable @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $(Format-Command -Executable $Executable -Arguments $Arguments)"
        }
        return @($output)
    }

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $(Format-Command -Executable $Executable -Arguments $Arguments)"
    }
}

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Resolve-FromProject {
    param([string]$PathValue, [string]$ProjectRoot)
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $PathValue))
}

function Set-EnvValue {
    param([string]$Content, [string]$Name, [string]$Value)
    $escapedName = [regex]::Escape($Name)
    $line = "$Name=$Value"
    if ($Content -match "(?m)^${escapedName}=.*$") {
        return [regex]::Replace($Content, "(?m)^${escapedName}=.*$", $line)
    }
    return $Content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}

function Get-DockerHubMirrorImage {
    param([string]$Image, [string]$MirrorPrefix)

    $firstSegment = ($Image -split "/", 2)[0]
    if ($Image.Contains("/") -and ($firstSegment.Contains(".") -or $firstSegment.Contains(":") -or $firstSegment -eq "localhost")) {
        return $null
    }

    $dockerHubPath = if ($Image.Contains("/")) { $Image } else { "library/$Image" }
    return "$MirrorPrefix/$dockerHubPath"
}

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../.."))
$dockerfile = Join-Path $projectRoot "Dockerfile"
$composeFile = Join-Path $projectRoot "docker/docker-compose.yml"
$sourceDockerDirectory = Join-Path $projectRoot "docker"
$resolvedEnvFile = Resolve-FromProject -PathValue $EnvFile -ProjectRoot $projectRoot
$resolvedOutputDirectory = Resolve-FromProject -PathValue $OutputDirectory -ProjectRoot $projectRoot

foreach ($requiredFile in @($dockerfile, $composeFile, $resolvedEnvFile)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required file does not exist: $requiredFile"
    }
}

if (-not $Version) {
    Require-Command "git"
    $Version = ((& git -C $projectRoot rev-parse --short=12 HEAD) | Select-Object -First 1).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $Version) {
        throw "Unable to derive a version from Git. Pass -Version explicitly."
    }
}

$safeVersion = $Version -replace '[^A-Za-z0-9_.-]', '-'
if (-not $safeVersion) {
    throw "Version '$Version' cannot be converted into a valid Docker tag."
}

$profiles = @($DocEngine, $Device) + @($ExtraProfiles) |
    ForEach-Object { $_ -split ',' } |
    Where-Object { $_ -and $_.Trim() } |
    ForEach-Object { $_.Trim() } |
    Select-Object -Unique
$profileCsv = $profiles -join ","

if ($Target -eq "all-in-one" -and $profiles -contains "vivarly") {
    throw "-Target all-in-one already serves the portal inside the application image. Drop 'vivarly' from -ExtraProfiles, or build -Target production to keep the standalone portal container."
}

$applicationImage = "${ImageRepository}:${safeVersion}"
$architecture = ($Platform -split "/", 2)[1]
$bundleName = "ragflow-docker-bundle-${safeVersion}-${architecture}"
$bundleDirectory = Join-Path $resolvedOutputDirectory $bundleName
$archivePath = Join-Path $resolvedOutputDirectory "${bundleName}.tar.gz"

$outputFull = [System.IO.Path]::GetFullPath($resolvedOutputDirectory)
$bundleFull = [System.IO.Path]::GetFullPath($bundleDirectory)
$driveRoot = [System.IO.Path]::GetPathRoot($bundleFull)
if ($bundleFull -eq $projectRoot -or $bundleFull -eq $driveRoot -or $bundleFull.Length -le $driveRoot.Length + 3) {
    throw "Unsafe bundle output path: $bundleFull"
}

Write-Step "Build plan"
Write-Host "Project:       $projectRoot"
Write-Host "Application:   $applicationImage"
Write-Host "Target:        $Target"
Write-Host "Platform:      $Platform"
Write-Host "Profiles:      $profileCsv"
Write-Host "Bundle:        $archivePath"
Write-Host "Configuration: $resolvedEnvFile"
Write-Warning "The selected .env file is copied into the bundle. Review its passwords and secrets before distributing the archive."
if (-not $PSBoundParameters.ContainsKey("Version")) {
    Write-Warning "The version defaults to the current commit, so a second target built from the same commit reuses the image tag and overwrites the existing archive. Pass -Version <commit>-<suffix> to keep both."
}

if ($DryRun) {
    Write-Host "`nDry run complete. No image was built and no output was written." -ForegroundColor Green
    exit 0
}

Require-Command "docker"
Require-Command "tar"
# Prefer the Windows system tar. GNU tar, which shadows it on PATH when this
# script is launched from Git-Bash or MSYS, reads "C:\..." as a remote
# host:path and fails with "Cannot connect to C: resolve failed" at the final
# compress step.
$tarExecutable = "tar"
if ($env:OS -eq "Windows_NT") {
    $systemTar = Join-Path $env:SystemRoot "System32\tar.exe"
    if (Test-Path -LiteralPath $systemTar -PathType Leaf) {
        $tarExecutable = $systemTar
    }
}
Invoke-Native -Executable "docker" -Arguments @("version")
Invoke-Native -Executable "docker" -Arguments @("compose", "version")
Invoke-Native -Executable "docker" -Arguments @("buildx", "version")

if (Test-Path -LiteralPath $bundleDirectory) {
    Write-Step "Remove the previous generated bundle directory"
    Remove-Item -LiteralPath $bundleDirectory -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
New-Item -ItemType Directory -Path (Join-Path $bundleDirectory "docker") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $bundleDirectory "images") -Force | Out-Null

$dockerHubMirror = "swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io"
if ($SkipAppBuild) {
    Write-Step "Reuse the existing application image $applicationImage"
    Invoke-Native -Executable "docker" -Arguments @("image", "inspect", $applicationImage)
} else {
    Write-Step "Build the combined frontend and backend application image ($Target)"
    $mirrorValue = if ($NeedMirror) { "1" } else { "0" }
    $buildArguments = @(
        "buildx", "build",
        "--platform", $Platform,
        "--target", $Target,
        "--load",
        "--tag", $applicationImage,
        "--build-arg", "NEED_MIRROR=$mirrorValue",
        "--file", $dockerfile
    )
    if ($NoCache) {
        $buildArguments += "--no-cache"
    }
    if ($NeedMirror) {
        $buildArguments += @("--build-context", "ubuntu:24.04=docker-image://$dockerHubMirror/library/ubuntu:24.04")
    }
    $resolvedDependencyImage = if ($DependencyImage) {
        $DependencyImage
    } elseif ($NeedMirror) {
        "$dockerHubMirror/infiniflow/ragflow_deps:latest"
    }
    if ($resolvedDependencyImage) {
        $buildArguments += @("--build-context", "infiniflow/ragflow_deps:latest=docker-image://$resolvedDependencyImage")
    }
    if ($GiteeTokenFile) {
        $resolvedTokenFile = Resolve-FromProject -PathValue $GiteeTokenFile -ProjectRoot $projectRoot
        if (-not (Test-Path -LiteralPath $resolvedTokenFile -PathType Leaf)) {
            throw "Gitee token file does not exist: $resolvedTokenFile"
        }
        $buildArguments += @("--secret", "id=gitee_token,src=$resolvedTokenFile")
    }
    $buildArguments += $projectRoot
    Invoke-Native -Executable "docker" -Arguments $buildArguments
}

Write-Step "Prepare self-contained Compose configuration"
$deploymentFiles = @(
    "docker-compose.yml",
    "docker-compose-base.yml",
    "service_conf.yaml.template",
    "entrypoint.sh",
    "init.sql",
    "init-clickhouse.sql",
    "infinity_conf.toml",
    "oceanbase-entrypoint.sh",
    "migration.sh"
)
foreach ($relativeFile in $deploymentFiles) {
    $source = Join-Path $sourceDockerDirectory $relativeFile
    if (Test-Path -LiteralPath $source -PathType Leaf) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $bundleDirectory "docker/$relativeFile") -Force
    }
}
foreach ($relativeDirectory in @("nginx", "oceanbase/init.d", "seafile", "vivarly", "all-in-one")) {
    $source = Join-Path $sourceDockerDirectory $relativeDirectory
    if (Test-Path -LiteralPath $source -PathType Container) {
        $destination = Join-Path $bundleDirectory "docker/$relativeDirectory"
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    }
}
New-Item -ItemType Directory -Path (Join-Path $bundleDirectory "docker/ragflow-logs") -Force | Out-Null

$envContent = [System.IO.File]::ReadAllText($resolvedEnvFile, [System.Text.UTF8Encoding]::new($false))
$envContent = Set-EnvValue -Content $envContent -Name "DOC_ENGINE" -Value $DocEngine
$envContent = Set-EnvValue -Content $envContent -Name "DEVICE" -Value $Device
$envContent = Set-EnvValue -Content $envContent -Name "COMPOSE_PROFILES" -Value $profileCsv
$envContent = Set-EnvValue -Content $envContent -Name "RAGFLOW_IMAGE" -Value $applicationImage
$envContent = Set-EnvValue -Content $envContent -Name "EXPOSE_MYSQL_PORT" -Value "3307"
$envContent = Set-EnvValue -Content $envContent -Name "SEAFILE_SERVER_HOSTNAME" -Value "172.20.1.131:8082"
$vivarlyImage = "ragflow-vivarly:${safeVersion}"
if ($profiles -contains "vivarly") {
    $envContent = Set-EnvValue -Content $envContent -Name "VIVARLY_IMAGE" -Value $vivarlyImage
}
$bundleEnvFile = Join-Path $bundleDirectory "docker/.env"
[System.IO.File]::WriteAllText($bundleEnvFile, $envContent, [System.Text.UTF8Encoding]::new($false))

if ($profiles -contains "vivarly") {
    Write-Step "Build the VIVARILY user frontend image $vivarlyImage from the maintained portal directory"
    $portalSource = Get-ChildItem -LiteralPath $projectRoot -Directory |
        Where-Object {
            (Test-Path -LiteralPath (Join-Path $_.FullName "views\admin\agent.php")) -and
            (Test-Path -LiteralPath (Join-Path $_.FullName "ragflow_api.php"))
        } |
        Select-Object -First 1 -ExpandProperty FullName
    $portalInfra = Join-Path $sourceDockerDirectory "vivarly"
    if (-not $portalSource) {
        throw "Could not find the maintained portal directory (views/admin/agent.php and ragflow_api.php) under $projectRoot"
    }
    $vivarlyContext = Join-Path $bundleDirectory "docker/vivarly"
    if (Test-Path -LiteralPath $vivarlyContext) {
        Remove-Item -LiteralPath $vivarlyContext -Recurse -Force
    }
    New-Item -ItemType Directory -Path $vivarlyContext -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $portalSource "*") -Destination $vivarlyContext -Recurse -Force
    foreach ($infraFile in @("Dockerfile", "apache.conf", "php.ini", ".dockerignore")) {
        Copy-Item -LiteralPath (Join-Path $portalInfra $infraFile) -Destination (Join-Path $vivarlyContext $infraFile) -Force
    }
    $localPortalConfig = Join-Path $vivarlyContext "config.local.php"
    if (Test-Path -LiteralPath $localPortalConfig) {
        Remove-Item -LiteralPath $localPortalConfig -Force
    }
    $vivarlyDockerfile = Join-Path $vivarlyContext "Dockerfile"
    $vivarlyBuildArgs = @(
        "build",
        "--platform", $Platform,
        "--tag", $vivarlyImage,
        "--file", $vivarlyDockerfile
    )
    if ($NeedMirror) {
        $phpMirror = Get-DockerHubMirrorImage -Image "php:8.2-apache" -MirrorPrefix $dockerHubMirror
        if ($phpMirror) {
            & docker pull --platform $Platform $phpMirror
            if ($LASTEXITCODE -eq 0) {
                $vivarlyBuildArgs += @("--build-arg", "PHP_IMAGE=$phpMirror")
            } else {
                Write-Warning "Mirror image $phpMirror is unavailable. Using php:8.2-apache."
            }
        }
    }
    $vivarlyBuildArgs += $vivarlyContext
    Invoke-Native -Executable "docker" -Arguments $vivarlyBuildArgs
}

$dockerComposeArguments = @("compose", "--env-file", $bundleEnvFile)
foreach ($profile in $profiles) {
    $dockerComposeArguments += @("--profile", $profile)
}
$dockerComposeArguments += @("-f", (Join-Path $bundleDirectory "docker/docker-compose.yml"))

Write-Step "Resolve and acquire every image required by the selected Compose profiles"
$imageLines = Invoke-Native -Executable "docker" -Arguments ($dockerComposeArguments + @("config", "--images")) -Capture
$images = @($imageLines |
    ForEach-Object { "$_".Trim() } |
    Where-Object { $_ } |
    Select-Object -Unique)

if ($images -notcontains $applicationImage) {
    $images += $applicationImage
}
if (($profiles -contains "vivarly") -and ($images -notcontains $vivarlyImage)) {
    $images += $vivarlyImage
}
if ($images.Count -eq 0) {
    throw "Docker Compose did not resolve any images."
}

foreach ($image in $images) {
    if ($image -eq $applicationImage) {
        continue
    }
    if (($profiles -contains "vivarly") -and ($image -eq $vivarlyImage)) {
        continue
    }
    if (-not $SkipPull) {
        $pullImage = $image
        if ($NeedMirror) {
            $mirrorImage = Get-DockerHubMirrorImage -Image $image -MirrorPrefix $dockerHubMirror
            if ($mirrorImage) {
                $pullImage = $mirrorImage
            }
        }
        & docker pull --platform $Platform $pullImage
        if ($LASTEXITCODE -eq 0) {
            if ($pullImage -ne $image) {
                Invoke-Native -Executable "docker" -Arguments @("tag", $pullImage, $image)
            }
        } else {
            & docker image inspect $image | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to pull $pullImage and $image is not present locally."
            }
            Write-Warning "Could not pull $pullImage. Using the local image $image."
        }
    }
    Invoke-Native -Executable "docker" -Arguments @("image", "inspect", $image)
}

Write-Step "Export application and dependency images"
$imageArchive = Join-Path $bundleDirectory "images/ragflow-images.tar"
Invoke-Native -Executable "docker" -Arguments (@("image", "save", "--output", $imageArchive) + $images)

$commit = ((& git -C $projectRoot rev-parse HEAD) | Select-Object -First 1).Trim()
$dirty = [bool]((& git -C $projectRoot status --porcelain | Select-Object -First 1))
$manifest = [ordered]@{
    format_version = 1
    created_at_utc = [DateTime]::UtcNow.ToString("o")
    source_commit = $commit
    source_dirty = $dirty
    application_image = $applicationImage
    application_target = $Target
    platform = $Platform
    doc_engine = $DocEngine
    device = $Device
    compose_profiles = $profiles
    images = $images
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $bundleDirectory "manifest.json") -Encoding utf8

$startSh = @'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c SHA256SUMS
fi
docker image load --input images/ragflow-images.tar
cd docker
# Recreate containers whose images changed. Named volumes are kept.
# Never pass -v / --volumes: that deletes MySQL, MinIO, and Elasticsearch data.
docker compose --env-file .env up -d --pull never
docker compose --env-file .env ps
echo "RAGFlow is starting. Open http://localhost after the health checks pass."
echo "Existing database volumes were not deleted."
'@
[System.IO.File]::WriteAllText((Join-Path $bundleDirectory "load-and-run.sh"), ($startSh -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))

$startPs = @'
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
docker image load --input "images/ragflow-images.tar"
if ($LASTEXITCODE -ne 0) { throw "docker image load failed" }
Set-Location "docker"
docker compose --env-file ".env" up -d --pull never
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
docker compose --env-file ".env" ps
Write-Host "RAGFlow is starting. Open http://localhost after the health checks pass."
'@
[System.IO.File]::WriteAllText((Join-Path $bundleDirectory "load-and-run.ps1"), $startPs, [System.Text.UTF8Encoding]::new($false))

$readme = @"
RAGFlow complete offline Docker bundle
======================================

Application image: $applicationImage
Platform:          $Platform
Compose profiles:  $profileCsv

The application image contains both the compiled React frontend and the Python
backend, served through Nginx. This bundle also contains all dependency images
selected by the Compose profiles.

Linux:
  tar -xzf $(Split-Path -Leaf $archivePath)
  cd $bundleName
  bash load-and-run.sh

Windows PowerShell:
  tar -xzf $(Split-Path -Leaf $archivePath)
  cd $bundleName
  powershell -ExecutionPolicy Bypass -File .\load-and-run.ps1

Before production use, edit docker/.env and replace all default passwords.
Data is stored in Docker named volumes. docker compose up -d replaces containers
and code images only. Do not run docker compose down -v; that deletes MySQL,
MinIO, Elasticsearch, and Seafile data.

To update an existing server without replacing its database:
  1. Keep that server's docker/.env (passwords must still match the old MySQL volume).
  2. Load this bundle's images: docker image load --input images/ragflow-images.tar
  3. In the existing deployment directory, set RAGFLOW_IMAGE and VIVARLY_IMAGE
     in .env to the tags in manifest.json, or retag the loaded images to the
     names already in that .env.
  4. docker compose --env-file .env up -d --pull never
  5. Do not copy this bundle's docker/.env over the server file if the server
     already has its own passwords and API key.

If this bundle includes the seafile profile:
  Seafile UI:     http://localhost:8082
  Admin email:    value of SEAFILE_ADMIN_EMAIL in docker/.env
  Admin password: value of SEAFILE_ADMIN_PASSWORD in docker/.env
  Libraries:      日报 (daily reports) and 周报 (weekly reports)
  RAGFlow data source URL: http://host.docker.internal:8082

If this bundle includes the vivarly profile:
  User portal:    http://localhost:8080
  Default login:  admin / admin123
  RAGFlow API:    VIVARLY_RAGFLOW_BASE_URL in docker/.env
"@
[System.IO.File]::WriteAllText((Join-Path $bundleDirectory "README.txt"), $readme, [System.Text.UTF8Encoding]::new($false))

Write-Step "Create checksums"
$checksumFiles = Get-ChildItem -LiteralPath $bundleDirectory -File -Recurse |
    Where-Object { $_.Name -ne "SHA256SUMS" } |
    Sort-Object FullName
$checksumLines = foreach ($file in $checksumFiles) {
    $relativePath = $file.FullName.Substring($bundleDirectory.Length + 1).Replace("\", "/")
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $relativePath"
}
[System.IO.File]::WriteAllLines((Join-Path $bundleDirectory "SHA256SUMS"), $checksumLines, [System.Text.UTF8Encoding]::new($false))

Write-Step "Compress the portable bundle"
New-Item -ItemType Directory -Path $outputFull -Force | Out-Null
Invoke-Native -Executable $tarExecutable -Arguments @(
    "-czf", $archivePath,
    "-C", $resolvedOutputDirectory,
    $bundleName
)

if (-not $KeepBundleDirectory) {
    Remove-Item -LiteralPath $bundleDirectory -Recurse -Force
}

$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "${archivePath}.sha256" -Value "$archiveHash  $(Split-Path -Leaf $archivePath)" -Encoding ascii

Write-Host "`nBuild complete:" -ForegroundColor Green
Write-Host "  Archive: $archivePath"
Write-Host "  SHA256:  $archiveHash"
if ($KeepBundleDirectory) {
    Write-Host "  Folder:  $bundleDirectory"
}
