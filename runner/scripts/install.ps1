<#
.SYNOPSIS
    Forgity Studio Native Runner - 1-Click Bootstrap & Auto-Update Script for Windows PowerShell
.DESCRIPTION
    Zero-dependency workstation bootstrap: downloads or updates the single-binary Native Rust runner (forgity-runner.exe),
    registers the machine via setup token, configures global PATH, and launches the high-performance background daemon.
#>

# Configuration - injected by server at generation time
$Url        = "http://localhost:5189/api"
$Token      = ""
$Name       = ""
$AppName    = "Forgity Studio"
$InstallDir = ""

$ErrorActionPreference = "Stop"

$title = "$AppName - NATIVE RUNNER SETUP".ToUpper()
$bannerLine = "=" * [Math]::Max(50, $title.Length + 6)
Write-Host $bannerLine -ForegroundColor Cyan
Write-Host ("   {0}   " -f $title) -ForegroundColor Cyan
Write-Host $bannerLine -ForegroundColor Cyan

# 1. Determine Installation Directory
Write-Host "`n[1/3] Setting up runner directories..." -ForegroundColor Yellow
if (-not $InstallDir) {
    # Check if run from within workspace repository
    if ($MyInvocation.MyCommand.Path) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $wsDir = Split-Path -Parent $scriptDir
        if (Test-Path "$wsDir\runner\target\release\forgity-runner.exe") {
            $InstallDir = "$wsDir\runner\target\release"
        }
    }

    if (-not $InstallDir) {
        $InstallDir = "$env:LOCALAPPDATA\Forgity\runner"
    }
}

Write-Host " - Installation Directory: $InstallDir" -ForegroundColor Green
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$exePath = "$InstallDir\forgity-runner.exe"

# 2. Download / Update Native Runner Binary
Write-Host "`n[2/3] Fetching latest native runner package..." -ForegroundColor Yellow
$zipPath = "$env:TEMP\forgity-runner.zip"

# Stop existing daemon if runner is already installed to prevent file lock
if (Test-Path $exePath) {
    Write-Host " - Existing runner detected, ensuring background daemon is stopped..." -ForegroundColor DarkGray
    try {
        & $exePath daemon stop 2>$null | Out-Null
    } catch {}
    Get-Process -Name "forgity-runner" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    # Rename current binary as .old fallback if still locked
    $oldExe = "$exePath.old"
    if (Test-Path $oldExe) { Remove-Item $oldExe -Force -ErrorAction SilentlyContinue }
    try {
        Rename-Item -Path $exePath -NewName "forgity-runner.exe.old" -Force -ErrorAction SilentlyContinue
    } catch {}
}

$packageUrls = @(
    "https://github.com/Limito9x/forgity-studio/releases/latest/download/forgity-runner.zip",
    "$Url/runners/bootstrap/package.zip"
)
$downloadSuccess = $false
foreach ($pUrl in $packageUrls) {
    try {
        Write-Host "   Downloading package from $pUrl..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $pUrl -OutFile $zipPath -TimeoutSec 90
        Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        $downloadSuccess = $true
        Write-Host " - Native runner extracted successfully." -ForegroundColor Green
        break
    } catch {
        Write-Host "   Could not download from $pUrl, trying alternative..." -ForegroundColor DarkGray
    }
}

# Clean up .old executable
if (Test-Path "$exePath.old") {
    Remove-Item "$exePath.old" -Force -ErrorAction SilentlyContinue
}

if (-not $downloadSuccess -or -not (Test-Path $exePath)) {
    Write-Host "[ERROR] Failed to obtain forgity-runner.exe from all available sources." -ForegroundColor Red
    exit 1
}

# Configure PATH environment variable
try {
    & $exePath setup 2>$null | Out-Null
} catch {}

# 3. Register Workstation Runner
Write-Host "`n[3/3] Registering workstation with $AppName API..." -ForegroundColor Yellow
if (-not $Token) {
    Write-Host "[WARNING] No setup token provided. Run 'forgity-runner register' manually to pair with studio." -ForegroundColor DarkYellow
} else {
    $regArgs = @("register", "--api-url", $Url, "--token", $Token)
    & $exePath $regArgs
}

# 4. Install & Launch Native Runner Daemon
Write-Host "`n[4/4] Starting background daemon..." -ForegroundColor Yellow
& $exePath daemon install
& $exePath daemon start

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " [SUCCESS] FORGITY RUNNER DAEMON READY & RUNNING!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Workstation daemon is now active and connected to Forgity Studio." -ForegroundColor Green
Write-Host "Quick management commands (from $InstallDir):" -ForegroundColor Cyan
Write-Host "  .\\forgity-runner.exe daemon status  - Check daemon PID & health" -ForegroundColor White
Write-Host "  .\\forgity-runner.exe daemon stop    - Stop background daemon" -ForegroundColor White
Write-Host "  .\\forgity-runner.exe daemon start   - Start background daemon" -ForegroundColor White
Write-Host "  .\\forgity-runner.exe update         - Self-update to latest release" -ForegroundColor White
Write-Host "  .\\forgity-runner.exe doctor         - Check Blender & Unreal DCC installations" -ForegroundColor White
Write-Host "  .\\forgity-runner.exe clean          - Clean cached artifacts & old logs" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
