# Forgity Studio — Native Runner Daemon

[![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)]()
[![Binary Size](https://img.shields.io/badge/Binary%20Size-6.1%20MB-brightgreen.svg)]()
[![Memory Idle](https://img.shields.io/badge/Idle%20RAM-%3C15%20MB-success.svg)]()

**Forgity Studio Native Runner Daemon (`forgity-runner`)** is a single-binary, high-performance background daemon designed to execute headless 3D pipelines directly on workstation GPUs using Blender 3D and Unreal Engine.

It replaces the legacy Python host daemon (`workers/`), offering zero runtime dependencies, instant sub-millisecond cold starts, zero-RAM S3 streaming, Windows Kernel Job Object process containment, and local Named Pipe IPC.

---

## Key Architectural Advantages

| Metric / Feature | Legacy Python Worker (`workers/`) | Forgity Native Runner (`runner/`) |
| :--- | :--- | :--- |
| **Packaging** | Requires Python 3.12, venv, pip wheels (~300MB) | **Single standalone executable (`forgity-runner.exe`, 6.1 MB)** |
| **Idle RAM Footprint** | ~100MB – 150MB | **~8MB – 12MB** |
| **Subprocess Containment** | OS kill signals (prone to orphaned zombie processes) | **Windows Kernel Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`)** |
| **IPC Communication** | Grepping `PIPELINE_EVENT:` text on `stdout` | **Local 2-way Named Pipe IPC (`\\.\pipe\forgity-ipc-{stage_id}`)** |
| **S3 Asset Streaming** | Buffered network I/O into RAM | **Chunked zero-RAM piped streaming (64KB chunks) with single-pass SHA-256** |
| **DCC Discovery** | Hardcoded standard paths | **Automatic system hardware & registry DCC scanner (`doctor`)** |

---

## Quick Start CLI Commands

### 1. Environment Doctor
Scans hardware (CPU cores, RAM, GPU, VRAM) and automatically detects installed Blender and Unreal Engine versions:
```powershell
forgity-runner doctor
```

### 2. Workstation Registration
Registers the workstation with Forgity Studio Backend API using a setup token:
```powershell
forgity-runner register --token <REGISTRATION_TOKEN> --api-url http://localhost:5189
```

### 3. Background Daemon Execution
Starts consuming pipeline stage tasks from RabbitMQ (`stage_tasks.{runner_id}`):
```powershell
forgity-runner start
```

### 4. Cache & Storage Maintenance
Cleans temporary pipeline files and deletes logs older than 7 days (or all cached assets with `--all`):
```powershell
forgity-runner clean
forgity-runner clean --all
```

---

## Building from Source

```powershell
cd runner
cargo build --release
```

The optimized standalone binary will be located at:
`runner/target/release/forgity-runner.exe` (Size: ~6.1 MB)
