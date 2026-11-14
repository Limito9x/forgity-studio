# System Overview — Forgity Studio

Forgity Studio is a **Local-First, Two-Tier Workflow Orchestration Platform** designed for digital content creation (DCC) pipelines across Blender, Unreal Engine, Daz Studio, and Python toolchains.

## 1. Core Subsystems

| Subsystem | Path | Technology | Responsibility |
| :--- | :--- | :--- | :--- |
| **Desktop & Web UI** | `app/` | Tauri v2, React 19, Vite, Tailwind CSS, React Flow | Visual DAG canvas, Palette-driven node rendering, native Python AST script analysis (`src-tauri`), local workspace management, live execution viewer. |
| **Native Runner** | `runner/` | Rust (`forgity-runner`), `stage_runner_guest.py` | Local DAG execution engine. Reads `ExecutionBundle` from `stdin`, emits JSON-lines events to `stdout`, manages isolated DCC subprocesses and Windows Job Objects. |
| **Cloud Backend (Optional)** | `api/` | .NET 10, FastEndpoints, Wolverine, EF Core, PostgreSQL, RabbitMQ | Studio Cloud collaboration, build-time node registry, CAS file storage, and remote runner coordination. |
| **Shared Contracts** | `packages/proto/` | Protobuf (`agent.proto`, `execution_state.proto`) | Single Source of Truth for gRPC communication between Cloud Backend and remote runners. |

## 2. Local-First Execution Flow

1. **Workspace & Palette**: `app/src-tauri` scans local Python scripts, Constants, Structs, and Component Pipes, indexing them into `.forgity/workspace.db` (SQLite WAL) and exposing them as `paletteItems`.
2. **Palette-Driven Canvas**: `PipelineCanvas` hydrates node shapes (`inputs`, `outputs`, `label`, `executor`) directly from `paletteItems` by `refId`. Snapshots (`.forgity/snapshots/*.snap.json`) store only instance data (`position`, `configValues`, `fileAssets`, `edges`).
3. **Execution Bundle**: Clicking **Run Draft** builds an `ExecutionBundle` DTO and pipes it to `forgity-runner` via `stdin`.
4. **Two-Tier Orchestration**:
   - **Master Pipeline (`*.pipeline.yaml`)** sequences Component Pipes and Pure `Joint` nodes.
   - **Component Pipe (`*.component.yaml`)** resolves Constants/Structs in-memory and packs connected steps of the same DCC host (plus inline Pure nodes) into a **Unified DCC Stage** (`StageTaskMessage`) executed inside a single DCC process via `stage_runner_guest.py`.
5. **Live Telemetry**: `forgity-runner` streams JSON-lines events (`node_started`, `node_completed`, `node_failed`, `log`) over `stdout` back to Tauri, which updates the Canvas and Runner Logs drawer in real time.
