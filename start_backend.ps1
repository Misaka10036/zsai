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

function Start-BackendProcess {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments,

        [Parameter(Mandatory)]
        [string]$Name
    )

    Write-Step "Starting $Name..."
    $process = Start-Process `
        -FilePath $pythonPath `
        -ArgumentList $Arguments `
        -WorkingDirectory $repoRoot `
        -NoNewWindow `
        -PassThru
    $childProcesses.Add($process)
}

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw "Python virtual environment was not found at '$pythonPath'. Run 'uv sync --python 3.13 --all-extras' first."
}

Set-Location -LiteralPath $repoRoot
$env:PYTHONPATH = $repoRoot
$env:NLTK_DATA = Join-Path $repoRoot "nltk_data"

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
    Write-Step "Backend is running at http://127.0.0.1:9380"
    Write-Step "Scheduled-agent polling is active in the API server."
    Write-Step "Press Ctrl+C to stop the API server and task executors."

    while ($true) {
        foreach ($process in $childProcesses) {
            $process.Refresh()
            if ($process.HasExited) {
                throw "Backend process $($process.Id) exited with code $($process.ExitCode)."
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
    }
}
