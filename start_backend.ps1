[CmdletBinding()]
param(
    [ValidateRange(1, 32)]
    [int]$Workers = 1,

    [switch]$SkipDependencies,

    # Opt-in: initialize / migrate database tables before starting services.
    [switch]$InitDatabase
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$composeFile = Join-Path $repoRoot "docker\docker-compose-base.yml"
$composeEnvFile = Join-Path $repoRoot "docker\.env"
$serviceConfig = Join-Path $repoRoot "conf\service_conf.yaml"
$childProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$startupLogs = Join-Path $repoRoot ('logs\startup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))

function Write-Step {
    param([string]$Message)
    Write-Host "[RAGFlow backend] $Message" -ForegroundColor Cyan
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
    }
}

function Initialize-Database {
    $maxAttempts = 30
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Write-Step "Initializing database tables (attempt $attempt/$maxAttempts)..."
        & $pythonPath -c "from api.db.db_models import init_database_tables; init_database_tables()"
        if ($LASTEXITCODE -eq 0) {
            break
        }

        if ($attempt -eq $maxAttempts) {
            throw "Database initialization failed after $maxAttempts attempts."
        }

        Write-Warning "Database is not ready yet. Retrying in 5 seconds."
        Start-Sleep -Seconds 5
    }

    Write-Step "Running model-provider database migrations..."
    Invoke-CheckedCommand -FilePath $pythonPath -Arguments @(
        "tools/scripts/mysql_migration.py",
        "--stages", "tenant_model_provider,tenant_model_instance,tenant_model,model_id_config",
        "--config", $serviceConfig,
        "--execute",
        "--database-version", "v0.26.0",
        "--mark-database-version-on-success"
    )
    Invoke-CheckedCommand -FilePath $pythonPath -Arguments @(
        "tools/scripts/mysql_migration.py",
        "--stages", "tenant_model_seeding,model_type_merge,tenant_model_id_migration",
        "--config", $serviceConfig,
        "--execute",
        "--database-version", "v0.27.0.dev1",
        "--mark-database-version-on-success"
    )
}

function Test-BackendPort {
    $probe = @'
import socket
from common.config_utils import get_base_config
config = get_base_config("ragflow", {})
host, port = config.get("host", "127.0.0.1"), int(config["http_port"])
try:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        listener.bind((host, port))
except OSError as exc:
    raise SystemExit(f"Cannot bind API address {host}:{port}: {exc}. Check existing RAGFlow processes and Docker port mappings.")
print(f"{host}:{port}")
'@
    $address = $probe | & $pythonPath -
    if ($LASTEXITCODE -ne 0) {
        throw 'API port is unavailable; no backend processes were started.'
    }
    return $address
}

function Start-BackendProcess {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [Parameter(Mandatory)]
        [string]$Name
    )

    Write-Step "Starting $Name..."
    # Own the process handle from launch so even an early exit retains its code.
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $pythonPath
    $startInfo.Arguments = (@('-u', '-X', 'faulthandler') + $Arguments) -join ' '
    $startInfo.WorkingDirectory = $repoRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $logName = $Name -replace '[^a-zA-Z0-9_-]', '-'
    New-Item -ItemType Directory -Path $startupLogs -Force | Out-Null
    $outputPath = Join-Path $startupLogs "$logName.stdout.log"
    $errorPath = Join-Path $startupLogs "$logName.stderr.log"
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $process | Add-Member -NotePropertyName BackendName -NotePropertyValue $Name
    if (-not $process.Start()) {
        $process.Dispose()
        throw "Could not start $Name."
    }
    $childProcesses.Add($process)
    $process | Add-Member -NotePropertyName OutputFile -NotePropertyValue ([System.IO.FileStream]::new($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite, 1))
    $process | Add-Member -NotePropertyName ErrorFile -NotePropertyValue ([System.IO.FileStream]::new($errorPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite, 1))
    $process | Add-Member -NotePropertyName OutputCopy -NotePropertyValue ($process.StandardOutput.BaseStream.CopyToAsync($process.OutputFile))
    $process | Add-Member -NotePropertyName ErrorCopy -NotePropertyValue ($process.StandardError.BaseStream.CopyToAsync($process.ErrorFile))
    $process | Add-Member -NotePropertyName ErrorLog -NotePropertyValue $errorPath
    Write-Step "$Name logs: $outputPath / $errorPath"
}

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw "Python virtual environment was not found at '$pythonPath'. Run 'uv sync --python 3.13 --all-extras' first."
}

Set-Location -LiteralPath $repoRoot
$env:PYTHONPATH = $repoRoot
$env:NLTK_DATA = Join-Path $repoRoot "nltk_data"
$env:LITELLM_LOCAL_MODEL_COST_MAP = 'True'

try {
    if (-not $SkipDependencies) {
        $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
        if (-not $docker) {
            throw "Docker CLI was not found. Install/start Docker Desktop or use -SkipDependencies."
        }

        Write-Step "Checking Docker Desktop..."
        & $docker.Source info *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Docker Desktop is not running. Start it and run this script again."
        }

        Write-Step "Starting MySQL, Redis, MinIO, Elasticsearch, and other backend dependencies..."
        Invoke-CheckedCommand -FilePath $docker.Source -Arguments @(
            "compose",
            "--env-file", $composeEnvFile,
            "-f", $composeFile,
            "up", "-d"
        )
    }

    $apiAddress = Test-BackendPort

    if ($InitDatabase) {
        Initialize-Database
    }

    for ($workerId = 0; $workerId -lt $Workers; $workerId++) {
        Start-BackendProcess `
            -Name "task executor $workerId" `
            -Arguments @("rag/svr/task_executor.py", "-i", [string]$workerId)
    }

    Start-BackendProcess -Name "API server" -Arguments @("api/ragflow_server.py")

    Write-Host ""
    Write-Step "Backend processes launched; waiting for API initialization at $apiAddress."
    Write-Step "Press Ctrl+C to stop the API server and task executors."

    while ($true) {
        foreach ($process in $childProcesses) {
            $process.Refresh()
            if ($process.HasExited) {
                $process.WaitForExit()
                throw "$($process.BackendName) (PID $($process.Id)) exited with code $($process.ExitCode). Error log: $($process.ErrorLog)"
            }
        }
        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Step "Stopping backend processes..."
    foreach ($process in $childProcesses) {
        try {
            $process.Refresh()
            if (-not $process.HasExited) {
                Stop-Process -Id $process.Id -Force
            }
        }
        catch {
            Write-Warning "Could not stop process $($process.Id): $($_.Exception.Message)"
        }
        finally {
            $process.WaitForExit()
            foreach ($copy in @($process.OutputCopy, $process.ErrorCopy)) {
                if ($null -ne $copy) { $null = $copy.GetAwaiter().GetResult() }
            }
            if ($null -ne $process.OutputFile) { $process.OutputFile.Dispose() }
            if ($null -ne $process.ErrorFile) { $process.ErrorFile.Dispose() }
            $process.Dispose()
        }
    }
}
