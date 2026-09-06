[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 9222,

    [ValidateSet("python", "go", "hybrid")]
    [string]$ApiProxyScheme = "python",

    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$webRoot = Join-Path $repoRoot "web"
$nodeModules = Join-Path $webRoot "node_modules"

function Write-Step {
    param([string]$Message)
    Write-Host "[RAGFlow frontend] $Message" -ForegroundColor Cyan
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    throw "npm was not found. Install Node.js and ensure npm.cmd is available in PATH."
}

Set-Location -LiteralPath $webRoot

if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) {
    if ($SkipInstall) {
        throw "Frontend dependencies are missing. Run this script without -SkipInstall first."
    }

    Write-Step "Installing frontend dependencies..."
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE."
    }
}

# Process environment variables override web/.env.development. The Python
# proxy is the default because scheduled-agent execution lives in that backend.
$env:PORT = [string]$Port
$env:API_PROXY_SCHEME = $ApiProxyScheme

Write-Step "Starting Vite on http://127.0.0.1:$Port"
Write-Step "API proxy mode: $ApiProxyScheme"
Write-Step "Press Ctrl+C to stop the frontend."

& $npm.Source run dev -- --port $Port
if ($LASTEXITCODE -ne 0) {
    throw "Frontend exited with code $LASTEXITCODE."
}
