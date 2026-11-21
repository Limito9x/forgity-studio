param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RunnerManifest = Join-Path $RepoRoot "runner\Cargo.toml"
$TargetBinDir = Join-Path $RepoRoot "app\src-tauri\binaries"
$TargetBin = Join-Path $TargetBinDir "forgity-runner-x86_64-pc-windows-msvc.exe"

if (-not $SkipBuild) {
    Write-Host "[stage-sidecar] Building forgity-runner (release)..."
    cargo build --release --manifest-path $RunnerManifest
}

$SourceBin = Join-Path $RepoRoot "runner\target\release\forgity-runner.exe"
if (-not (Test-Path $SourceBin)) {
    throw "forgity-runner.exe not found at $SourceBin"
}

New-Item -ItemType Directory -Path $TargetBinDir -Force | Out-Null
Copy-Item $SourceBin $TargetBin -Force
Write-Host "[stage-sidecar] Staged sidecar -> $TargetBin"
