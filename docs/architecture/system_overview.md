# System Overview — Forgity Studio

Forgity Studio is a **Solo-First, Local-First Two-Tier Workflow Orchestration Platform** designed for digital content creation (DCC) pipelines across Blender, Unreal Engine, Daz Studio, and Python toolchains (see **ADR-011**).

## 1. Core Subsystems

| Subsystem                      | Path                        | Technology                                             | Responsibility                                                                                                                                        |
| :----------------------------- | :-------------------------- | :----------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop & Web UI**           | `app/`                      | Tauri v2, React 19, Vite, Tailwind CSS, React Flow     | Visual DAG canvas, Palette-driven node rendering, local workspace management, Cloud Template & Admin Quota UI.                                        |
| **Shared Rust Core**           | `crates/forgity-core/`      | Rust, SQLite (WAL)                                     | Shared `.forgity/workspace.db` registry, Python AST analyzer bridge, DAG bundling, and template manifest persistence.                                 |
| **Native Runner**              | `runner/`                   | Rust (`forgity-runner`), `stage_runner_guest.py`       | Local DAG execution engine (`run-bundle` / `worker`). Emits JSON-lines events to `stdout`, manages isolated DCC subprocesses and Windows Job Objects. |
| **Cloud Template & Quota API** | `api/`                      | .NET 10, FastEndpoints, Wolverine, EF Core, PostgreSQL | Cloud Template Package catalog, Device-First Workstation Check-in (`/api/runners/check-in`), Library Forking, and Quota Management.                   |
| **Script Analyzer**            | `packages/script-analyzer/` | Python AST                                             | Static analysis of `def main(...)` signatures, docstrings, and `return {...}` outputs to infer node pins and executors.                               |
| **Pipeline Scripts**           | `pipeline-scripts/`         | Python (`bpy`, `unreal`, `ai`, presets)                | Built-in DAZ-to-Blender-to-Unreal automation scripts and presets.                                                                                     |

## 2. Local-First Execution Flow

1. **Workspace & Palette**: `app/src-tauri` (via `forgity-core` + `script-analyzer`) scans local Python scripts, Constants, Structs, and Component Pipes, indexing them into `.forgity/workspace.db` (SQLite WAL) and exposing them as `paletteItems`.
2. **Palette-Driven Canvas & SQLite State**: `PipelineCanvas` hydrates node shapes (`inputs`, `outputs`, `label`, `executor`) directly from `paletteItems` by `refId`. Canvas snapshots (`local_pipelines.snapshot_json`), Palette, Constants, Structs, and execution metrics are stored in `.forgity/workspace.db` (SQLite WAL), alongside portable `*.component.yaml` and `*.pipeline.yaml` files.
3. **Execution Bundle**: Clicking **Run Draft** builds an `ExecutionBundle` DTO and invokes `forgity-runner` sidecar (`run-bundle` / `worker`).
4. **Two-Tier Orchestration**:
   - **Master Pipeline (`*.pipeline.yaml`)** sequences Component Pipes and Pure `Joint` nodes.
   - **Component Pipe (`*.component.yaml`)** resolves Constants/Structs in-memory and packs connected steps of the same DCC host (plus inline Pure nodes) into a **Unified DCC Stage** (`StageTaskMessage`) executed inside a single DCC process via `stage_runner_guest.py`.
5. **Live Telemetry**: `forgity-runner` streams JSON-lines events (`node_started`, `node_completed`, `node_failed`, `log`) over `stdout` back to Tauri, which updates the Canvas and Runner Logs drawer in real time.
