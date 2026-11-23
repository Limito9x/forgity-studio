# Forgity Studio — Native Execution Engine (`forgity-runner`)

[![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)]()
[![Memory Idle](https://img.shields.io/badge/Idle%20RAM-%3C15%20MB-success.svg)]()

**Forgity Native Runner (`forgity-runner`)** is a standalone Rust execution engine bundled as a Tauri sidecar to execute local-first, two-tier DCC pipelines (Blender, Unreal Engine, Python) directly on the user's workstation.

Per **ADR-011**, legacy remote RabbitMQ/gRPC daemon commands (`register`, `start`, `daemon`) have been retired in favor of direct local execution (`run-bundle`, `worker`, `workspace run`).

---

## Key Architectural Advantages

| Feature | Legacy Python Worker (`workers/`) | Forgity Native Runner (`runner/`) |
| :--- | :--- | :--- |
| **Packaging** | Requires Python 3.12, venv, pip wheels (~300MB) | **Single standalone executable (`forgity-runner.exe`)** |
| **Subprocess Containment** | OS kill signals (prone to orphaned zombie processes) | **Windows Kernel Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`)** |
| **IPC Communication** | Grepping `PIPELINE_EVENT:` text on `stdout` | **Local 2-way Named Pipe IPC (`\\.\pipe\forgity-ipc-{stage_id}`)** |
| **DCC Pool & Stage Batching** | Fresh DCC spawn per node | **Persistent DCC stage execution via `stage_runner_guest.py`** |
| **DCC Discovery** | Hardcoded standard paths | **Automatic system hardware & registry DCC scanner (`doctor`, `dcc scan`)** |

---

## Quick Start CLI Commands

### 1. Environment Doctor
Scans hardware (CPU cores, RAM, GPU, VRAM) and automatically detects installed Blender and Unreal Engine versions:
```powershell
forgity-runner doctor
```

### 2. Local Bundle Execution (Used by Tauri Sidecar)
Executes an `ExecutionBundle` JSON file locally and emits structured JSON-lines telemetry:
```powershell
forgity-runner run-bundle --bundle path/to/bundle.json --json-events
```

### 3. Workspace CLI & MCP Server
Run, validate, or expose a local workspace to AI coding agents over MCP:
```powershell
forgity-runner workspace run --file path/to/pipeline.yaml
forgity-runner mcp --workspace path/to/workspace
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

The standalone binary will be located at:
`runner/target/release/forgity-runner.exe`
