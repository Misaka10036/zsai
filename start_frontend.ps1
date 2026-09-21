[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 9222,

    [ValidateRange(1, 65535)]
    [int]$ZhishengPort = 8080,

    [string]$BackendUrl = 'http://127.0.0.1:9380',

    [string]$PhpPath,

    [ValidateSet("python", "go", "hybrid")]
    [string]$ApiProxyScheme = "python",

    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$webRoot = Join-Path $repoRoot "web"
$nodeModules = Join-Path $webRoot "node_modules"
$zhishengRoot = Join-Path $repoRoot '智盛fontend'
$startupLogs = Join-Path $repoRoot ('logs\frontend-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$childProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

function Write-Step {
    param([string]$Message)
    Write-Host "[RAGFlow frontend] $Message" -ForegroundColor Cyan
}

function Test-FrontendPort {
    param([int]$ListenPort)
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $ListenPort)
    try {
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
    }
    catch {
        throw "Port $ListenPort is unavailable. Stop the existing service or choose a different frontend port."
    }
    finally { $listener.Stop() }
}

function Start-FrontendProcess {
    param([string]$Name, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory, [hashtable]$Environment)
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $FilePath
    $info.Arguments = ($Arguments | ForEach-Object {
        '"' + ($_ -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
    }) -join ' '
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) { $info.EnvironmentVariables[$key] = [string]$Environment[$key] }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $info
    $process | Add-Member -NotePropertyName FrontendName -NotePropertyValue $Name
    if (-not $process.Start()) { $process.Dispose(); throw "Could not start $Name." }
    $childProcesses.Add($process)
    $outputPath = Join-Path $startupLogs "$Name.stdout.log"
    $errorPath = Join-Path $startupLogs "$Name.stderr.log"
    $process | Add-Member -NotePropertyName OutputFile -NotePropertyValue ([System.IO.FileStream]::new($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite, 1))
    $process | Add-Member -NotePropertyName ErrorFile -NotePropertyValue ([System.IO.FileStream]::new($errorPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite, 1))
    $process | Add-Member -NotePropertyName OutputCopy -NotePropertyValue ($process.StandardOutput.BaseStream.CopyToAsync($process.OutputFile))
    $process | Add-Member -NotePropertyName ErrorCopy -NotePropertyValue ($process.StandardError.BaseStream.CopyToAsync($process.ErrorFile))
    $process | Add-Member -NotePropertyName ErrorLog -NotePropertyValue $errorPath
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "npm was not found. Install Node.js and ensure npm.cmd is available in PATH."
}

$node = Get-Command node.exe -ErrorAction Stop
if (-not $PhpPath) {
    $php = Get-Command php.exe -ErrorAction SilentlyContinue
    if ($php) { $PhpPath = $php.Source }
    else {
        $wingetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
        $PhpPath = Get-ChildItem -Path (Join-Path $wingetRoot 'PHP.PHP.*\php.exe') -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
}
if (-not $PhpPath -or -not (Test-Path -LiteralPath $PhpPath -PathType Leaf)) {
    throw 'PHP was not found. Install PHP 8.2+ or pass -PhpPath with the full path to php.exe.'
}
$PhpPath = (Resolve-Path -LiteralPath $PhpPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $zhishengRoot 'index.php'))) {
    throw "Zhisheng frontend was not found at '$zhishengRoot'."
}
$phpCheck = @'
<?php
if (PHP_VERSION_ID < 80200) { fwrite(STDERR, "PHP 8.2+ is required.\n"); exit(1); }
foreach (['curl', 'fileinfo', 'pdo_mysql', 'session', 'mbstring'] as $ext) {
    if (!extension_loaded($ext)) { fwrite(STDERR, "Missing PHP extension: $ext\n"); exit(1); }
}
'@
$phpCheck | & $PhpPath
if ($LASTEXITCODE -ne 0) { throw 'PHP runtime validation failed.' }
if ($Port -eq $ZhishengPort) { throw 'The two frontends must use different ports.' }
$backendUri = $null
if (-not [Uri]::TryCreate($BackendUrl, [UriKind]::Absolute, [ref]$backendUri) -or $backendUri.Scheme -notin @('http', 'https')) {
    throw 'BackendUrl must be an absolute HTTP or HTTPS URL.'
}
Test-FrontendPort $Port
Test-FrontendPort $ZhishengPort

if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    if ($SkipInstall) {
        throw "Frontend dependencies are missing. Run this script without -SkipInstall first."
    }

    Write-Step "Installing frontend dependencies..."
    Push-Location -LiteralPath $webRoot
    try {
        & $npm.Source install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
    }
    finally { Pop-Location }
}

$vitePath = Join-Path $nodeModules 'vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $vitePath)) { throw 'Vite is missing. Run npm install in web/.' }
New-Item -ItemType Directory -Path $startupLogs -Force | Out-Null
try {
    Start-FrontendProcess -Name 'vite' -FilePath $node.Source -WorkingDirectory $webRoot `
        -Arguments @($vitePath, '--host', '--port', [string]$Port, '--strictPort') `
        -Environment @{ PORT = [string]$Port; API_PROXY_SCHEME = $ApiProxyScheme }
    $portalWorkerPorts = @()
    for ($workerIndex = 0; $workerIndex -lt 3; $workerIndex++) {
        do {
            $portReservation = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
            $portReservation.Start()
            $workerPort = $portReservation.LocalEndpoint.Port
            $portReservation.Stop()
        } while ($workerPort -in $portalWorkerPorts -or $workerPort -eq $Port -or $workerPort -eq $ZhishengPort)
        $portalWorkerPorts += $workerPort
        Start-FrontendProcess -Name "zhisheng-php-$workerIndex" -FilePath $PhpPath -WorkingDirectory $zhishengRoot `
            -Arguments @('-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'upload_max_filesize=128M', '-d', 'post_max_size=128M', '-d', 'max_execution_time=300', '-S', "127.0.0.1:$workerPort", '-t', $zhishengRoot) `
            -Environment @{ RAGFLOW_BASE_URL = $BackendUrl.TrimEnd('/') }
    }
    Start-FrontendProcess -Name 'zhisheng' -FilePath $node.Source -WorkingDirectory $repoRoot `
        -Arguments @((Join-Path $repoRoot 'tools/php-dev-proxy.cjs'), [string]$ZhishengPort, [string]($portalWorkerPorts[2]), [string]($portalWorkerPorts[0]), [string]($portalWorkerPorts[1])) `
        -Environment @{}

    Write-Step "Vite: http://127.0.0.1:$Port (API proxy: $ApiProxyScheme)"
    Write-Step "Zhisheng: http://127.0.0.1:$ZhishengPort (backend: $BackendUrl)"
    Write-Step "Logs: $startupLogs"
    Write-Step 'Press Ctrl+C to stop both frontends.'
    while ($true) {
        foreach ($process in $childProcesses) {
            $process.Refresh()
            if ($process.HasExited) {
                $process.WaitForExit()
                throw "$($process.FrontendName) (PID $($process.Id)) exited with code $($process.ExitCode). Error log: $($process.ErrorLog)"
            }
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Step 'Stopping frontend processes...'
    foreach ($process in $childProcesses) {
        try {
            if (-not $process.HasExited) { $process.Kill() }
            $process.WaitForExit()
            foreach ($copy in @($process.OutputCopy, $process.ErrorCopy)) {
                if ($null -ne $copy) { $null = $copy.GetAwaiter().GetResult() }
            }
        }
        finally {
            if ($null -ne $process.OutputFile) { $process.OutputFile.Dispose() }
            if ($null -ne $process.ErrorFile) { $process.ErrorFile.Dispose() }
            $process.Dispose()
        }
    }
}
