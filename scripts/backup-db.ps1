<#
.SYNOPSIS
    Forgity Studio - PostgreSQL Database Backup Script
.DESCRIPTION
    Creates a timestamped SQL or custom-format compressed backup of PostgreSQL database
    directly from the active Docker container.
.PARAMETER Format
    Backup format: 'sql' (plain SQL script) or 'dump' (compressed PostgreSQL custom archive). Default: 'sql'.
.PARAMETER Container
    Override PostgreSQL container name. Default reads from .env or auto-detects.
.PARAMETER OutputDir
    Directory to store the backup files. Default: 'backups'.
.EXAMPLE
    .\scripts\backup-db.ps1
.EXAMPLE
    .\scripts\backup-db.ps1 -Format dump
#>
[CmdletBinding()]
param(
    [ValidateSet("sql", "dump")]
    [string]$Format = "sql",
    [string]$Container = "",
    [string]$Database = "",
    [string]$User = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

# Auto-resolve workspace root
$wsRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDir) {
    $OutputDir = Join-Path $wsRoot "backups"
}
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Auto-parse .env if present
$envFile = Join-Path $wsRoot ".env"
$projectName = "forgity"
$envMode = "dev"
$dbUser = "postgres"
$dbName = "Forgity"

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line -split "=", 2
            $k = $parts[0].Trim()
            $v = $parts[1].Trim().Trim('"').Trim("'")
            if ($k -eq "PROJECT_NAME") { $projectName = $v }
            if ($k -eq "ENV_MODE")     { $envMode = $v }
            if ($k -eq "POSTGRES_USER") { $dbUser = $v }
            if ($k -eq "POSTGRES_DATABASE") { $dbName = $v }
        }
    }
}

if ($User) { $dbUser = $User }
if ($Database) { $dbName = $Database }

# Auto-detect container if not specified
if (-not $Container) {
    $candidates = @(
        "$projectName-db-$envMode",
        "$projectName-db-prod",
        "$projectName-db-dev",
        "forgity-db-prod",
        "forgity-db-dev"
    )
    foreach ($c in $candidates) {
        $found = docker ps -q --filter "name=^/$c$"
        if ($found) {
            $Container = $c
            break
        }
    }
    if (-not $Container) {
        # Check any running postgres container
        $firstPg = docker ps --filter "ancestor=postgres:17-alpine" --format "{{.Names}}" | Select-Object -First 1
        if ($firstPg) {
            $Container = $firstPg
        } else {
            $Container = "$projectName-db-$envMode"
        }
    }
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   FORGITY STUDIO - POSTGRESQL BACKUP             " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " - Container: $Container" -ForegroundColor White
Write-Host " - Database : $dbName" -ForegroundColor White
Write-Host " - User     : $dbUser" -ForegroundColor White
Write-Host " - Format   : $Format" -ForegroundColor White

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "forgity_${dbName}_${timestamp}.$Format"
$outPath = Join-Path $OutputDir $fileName

Write-Host "`nExecuting backup..." -ForegroundColor Yellow

if ($Format -eq "sql") {
    # Plain SQL backup
    docker exec -t $Container pg_dump -U $dbUser -d $dbName > $outPath
} else {
    # Compressed custom format (.dump)
    $tmpDump = "/tmp/backup_$timestamp.dump"
    docker exec $Container pg_dump -U $dbUser -d $dbName -F c -b -f $tmpDump
    docker cp "${Container}:${tmpDump}" $outPath
    docker exec $Container rm -f $tmpDump
}

if (Test-Path $outPath) {
    $bytes = (Get-Item $outPath).Length
    $sizeMb = [Math]::Round($bytes / 1MB, 2)
    Write-Host "`n[SUCCESS] Backup completed successfully!" -ForegroundColor Green
    Write-Host " - File Path: $outPath" -ForegroundColor Green
    Write-Host " - File Size: $sizeMb MB ($bytes bytes)" -ForegroundColor Cyan
} else {
    Write-Host "`n[ERROR] Backup failed. Output file was not created." -ForegroundColor Red
    exit 1
}
