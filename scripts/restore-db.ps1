<#
.SYNOPSIS
    Forgity Studio - PostgreSQL Database Restore Script
.DESCRIPTION
    Restores a PostgreSQL database backup (SQL or custom dump) into the active Docker container.
    Safely terminates active connections before restoring.
.PARAMETER File
    Path to backup file (.sql or .dump).
.PARAMETER Force
    Skip interactive confirmation prompt.
.EXAMPLE
    .\scripts\restore-db.ps1 -File .\backups\forgity_Forgity_20261018_154500.sql
.EXAMPLE
    .\scripts\restore-db.ps1 -File .\backups\forgity_Forgity_20261018_154500.dump -Force
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$File,
    [string]$Container = "",
    [string]$Database = "",
    [string]$User = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Resolve file path
if (-not [System.IO.Path]::IsPathRooted($File)) {
    $File = Join-Path (Get-Location) $File
}
if (-not (Test-Path $File)) {
    Write-Host "[ERROR] Backup file not found: $File" -ForegroundColor Red
    exit 1
}

$ext = [System.IO.Path]::GetExtension($File).ToLowerInvariant()
if ($ext -notin @(".sql", ".dump", ".bin")) {
    Write-Host "[WARNING] Unrecognized file extension '$ext'. Supported: .sql, .dump" -ForegroundColor DarkYellow
}

# Auto-resolve workspace root
$wsRoot = Split-Path -Parent $PSScriptRoot
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
        $Container = "$projectName-db-$envMode"
    }
}

Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "   FORGITY STUDIO - POSTGRESQL RESTORE            " -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host " - Backup File: $File" -ForegroundColor White
Write-Host " - Container  : $Container" -ForegroundColor White
Write-Host " - Database   : $dbName" -ForegroundColor White
Write-Host " - User       : $dbUser" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Yellow

if (-not $Force) {
    Write-Host "`n[CAUTION] Restoring will overwrite existing data in '$dbName'!" -ForegroundColor Red
    $confirm = Read-Host "Are you sure you want to proceed with restore? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Restore operation aborted by user." -ForegroundColor Gray
        exit 0
    }
}

Write-Host "`n[1/3] Terminating active connections to '$dbName'..." -ForegroundColor Yellow
$termSql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$dbName' AND pid <> pg_backend_pid();"
docker exec -i $Container psql -U $dbUser -d postgres -c $termSql | Out-Null

Write-Host "[2/3] Restoring database contents..." -ForegroundColor Yellow
if ($ext -eq ".dump" -or $ext -eq ".bin") {
    $tmpDump = "/tmp/restore_temp.dump"
    docker cp $File "${Container}:${tmpDump}"
    # Use pg_restore with --clean --if-exists
    docker exec -i $Container pg_restore -U $dbUser -d $dbName --clean --if-exists -v $tmpDump
    docker exec $Container rm -f $tmpDump
} else {
    # Plain SQL restore
    Get-Content $File -Raw | docker exec -i $Container psql -U $dbUser -d $dbName
}

Write-Host "`n[3/3] Verifying database tables..." -ForegroundColor Yellow
docker exec -i $Container psql -U $dbUser -d $dbName -c "\dt"

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " [SUCCESS] DATABASE RESTORE COMPLETED!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
