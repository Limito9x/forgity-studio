param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$RunnerDir = Join-Path $RepoRoot "runner"
$TargetTriple = "x86_64-pc-windows-msvc"
$DestDir = Join-Path $PSScriptRoot "..\binaries"
$DestFile = Join-Path $DestDir "forgity-runner-$TargetTriple.exe"

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

if ($Release) {
    Write-Host "Building forgity-runner (release)..."
    cargo build --release --manifest-path (Join-Path $RunnerDir "Cargo.toml")
    $SrcFile = Join-Path $RepoRoot "target\release\forgity-runner.exe"
} else {
    Write-Host "Building forgity-runner (debug)..."
    cargo build --manifest-path (Join-Path $RunnerDir "Cargo.toml")
    $SrcFile = Join-Path $RepoRoot "target\debug\forgity-runner.exe"
}

Copy-Item -Path $SrcFile -Destination $DestFile -Force
Write-Host "Staged sidecar binary to $DestFile"
