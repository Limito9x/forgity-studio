<#
.SYNOPSIS
    Builds the entire .NET solution (Automation.sln) safely by stopping any running API instances first.
.DESCRIPTION
    Checks if API processes or ports (5189, 50051) are active. If so, terminates them to prevent MSB3027 file locking errors, then runs dotnet build.
#>
param (
    [string]$Configuration = "Debug",
    [switch]$NoIncremental
)

$ErrorActionPreference = "Stop"

Write-Host "=== Safe .NET Solution Build ===" -ForegroundColor Cyan

# 1. Stop processes listening on API ports (5189 HTTP / 50051 gRPC)
$ports = @(5189, 50051)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Stopping process '$($proc.ProcessName)' (PID: $($proc.Id)) on port $port to prevent DLL locks..." -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 2. Stop Automation.Api process if still running
$apiProcs = Get-Process -Name "Automation.Api" -ErrorAction SilentlyContinue
if ($apiProcs) {
    foreach ($p in $apiProcs) {
        Write-Host "Stopping process Automation.Api (PID: $($p.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Milliseconds 500

# 3. Execute dotnet build
$slnPath = Join-Path $PSScriptRoot "api\Automation.sln"
if (-not (Test-Path $slnPath)) {
    # If running from inside api/ folder
    $slnPath = Join-Path $PSScriptRoot "Automation.sln"
}

Write-Host "Building solution: $slnPath [$Configuration]..." -ForegroundColor Cyan

$buildArgs = @("build", $slnPath, "-c", $Configuration)
if ($NoIncremental) {
    $buildArgs += "--no-incremental"
}

& dotnet @buildArgs
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`nBuild Succeeded!" -ForegroundColor Green
} else {
    Write-Host "`nBuild Failed with exit code $exitCode" -ForegroundColor Red
}

exit $exitCode
