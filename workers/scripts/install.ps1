<#
.SYNOPSIS
    Automation Studio Runner - 1-Click Bootstrap Script for Windows PowerShell
.DESCRIPTION
    Checks Python prerequisites, provisions virtual environment, registers runner
    non-interactively with setup token, and installs the background daemon into
    Windows Task Scheduler (On Logon).
#>

# Configuration - injected by server at generation time
$Url        = "http://localhost:5189/api"
$Token      = ""
$Name       = ""
$AppName    = "Forgity Studio"
$InstallDir = ""

$ErrorActionPreference = "Stop"

$title = "$AppName - RUNNER AGENT SETUP".ToUpper()
$bannerLine = "=" * [Math]::Max(50, $title.Length + 6)
Write-Host $bannerLine -ForegroundColor Cyan
Write-Host ("   {0}   " -f $title) -ForegroundColor Cyan
Write-Host $bannerLine -ForegroundColor Cyan

# 1. Pre-flight Check: Python
Write-Host "`n[1/5] Checking Python environment..." -ForegroundColor Yellow
$pythonExe = $null

if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonExe = "python"
} elseif (Get-Command "py" -ErrorAction SilentlyContinue) {
    $pythonExe = "py"
}

if (-not $pythonExe) {
    Write-Host "[ERROR] Python 3.10+ was not found on your system." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/ or run:" -ForegroundColor Yellow
    Write-Host "  winget install Python.Python.3.12" -ForegroundColor White
    exit 1
}

$pyVer = & $pythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
Write-Host " - Detected Python $pyVer ($pythonExe)" -ForegroundColor Green

# 2. Determine Installation Directory
Write-Host "`n[2/5] Setting up runner directories..." -ForegroundColor Yellow
if (-not $InstallDir) {
    # If script runs from within an existing local repository workers folder
    if ($MyInvocation.MyCommand.Path) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
        $parentDir = Split-Path -Parent $scriptDir
        if (Test-Path "$parentDir\cli.py") {
            $InstallDir = $parentDir
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

# Auto-download runner package if cli.py is not present
if (-not (Test-Path "$InstallDir\cli.py")) {
    Write-Host " - Downloading runner package..." -ForegroundColor Cyan
    $zipPath = "$env:TEMP\forgity-runner.zip"
    $packageUrls = @(
        "https://github.com/Limito9x/forgity-studio/releases/latest/download/forgity-runner.zip",
        "$Url/runners/bootstrap/package.zip"
    )
    $downloadSuccess = $false
    foreach ($pUrl in $packageUrls) {
        try {
            Write-Host "   Fetching from $pUrl..." -ForegroundColor Gray
            Invoke-WebRequest -Uri $pUrl -OutFile $zipPath -TimeoutSec 60
            Expand-Archive -Path $zipPath -DestinationPath $InstallDir -Force
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
            $downloadSuccess = $true
            Write-Host " - Runner package extracted successfully." -ForegroundColor Green
            break
        } catch {
            Write-Host "   Could not download from $pUrl, trying alternative..." -ForegroundColor DarkGray
        }
    }
    if (-not $downloadSuccess) {
        Write-Host "[ERROR] Failed to download runner package from all available sources." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host " - Found local runner source files at $InstallDir" -ForegroundColor Green
}

$venvPath = "$InstallDir\worker\venv"
$venvPython = "$venvPath\Scripts\python.exe"

# 3. Initialize Python Virtual Environment
Write-Host "`n[3/5] Initializing Python Virtual Environment..." -ForegroundColor Yellow
if (-not (Test-Path $venvPython)) {
    Write-Host " - Creating venv at $venvPath..." -ForegroundColor Gray
    & $pythonExe -m venv $venvPath
}

Write-Host " - Ensuring dependencies are installed..." -ForegroundColor Gray
$reqFile = "$InstallDir\worker\requirements.txt"
if (Test-Path $reqFile) {
    & $venvPython -m pip install --quiet --upgrade pip
    & $venvPython -m pip install --quiet -r $reqFile
} else {
    & $venvPython -m pip install --quiet --upgrade pip
    & $venvPython -m pip install --quiet grpcio grpcio-tools pika==1.3.2 requests==2.31.0
}

# 4. Register Runner
Write-Host "`n[4/5] Registering runner workstation..." -ForegroundColor Yellow
if (-not $Token) {
    Write-Host "[WARNING] No setup token provided. You will need to run 'runner register' manually." -ForegroundColor DarkYellow
} else {
    $regArgs = @("$InstallDir\cli.py", "register", "--url", $Url, "--token", $Token, "--non-interactive")
    if ($Name) {
        $regArgs += @("--name", $Name)
    }
    & $venvPython $regArgs
}

# 5. Install & Start Windows Task Scheduler Service
Write-Host "`n[5/5] Installing Task Scheduler Daemon..." -ForegroundColor Yellow
& $venvPython "$InstallDir\cli.py" "service" "install"
& $venvPython "$InstallDir\cli.py" "service" "start"

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " [SUCCESS] RUNNER SUCCESSFULLY INSTALLED & STARTED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Quick management commands (from $InstallDir):" -ForegroundColor Cyan
Write-Host "  .\\runner.bat service status   - Check daemon running state" -ForegroundColor White
Write-Host "  .\\runner.bat service logs     - View live runner logs" -ForegroundColor White
Write-Host "  .\\runner.bat service stop     - Stop the background daemon" -ForegroundColor White
Write-Host "  .\\runner.bat service restart  - Restart the daemon" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
