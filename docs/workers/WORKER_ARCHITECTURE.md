# Runner & DCC Stage Architecture

Forgity Studio executes all local and DCC workloads through **`forgity-runner`**, a native Rust binary (`runner/`), replacing the legacy Python `workers/` daemon.

## 1. Host vs. Guest Isolation

- **Host (`forgity-runner` in Rust):**
  - Receives an `ExecutionBundle` JSON payload via `stdin` (or connects to Studio Cloud via gRPC in cloud mode).
  - Schedules the Two-Tier DAG (`MasterOrchestrator` → `ComponentOrchestrator`).
  - Evaluates Pure nodes (`local:constant:*`, `makestruct`, `breakstruct`, `joint`) in-memory (`runner/src/core/pure_nodes.rs`).
  - Spawns DCC processes (`blender --background`, `UnrealEditor-Cmd.exe`, `python`) inside a **Windows Job Object** so child processes are cleanly terminated on cancellation or crash.
  - Emits structured JSON-lines events over `stdout` for Tauri / UI live tracking.
- **Guest (`runner/scripts/stage_runner_guest.py`):**
  - Runs *inside* the target DCC Python environment (e.g. Blender's embedded Python or Unreal's Python).
  - Receives a `StageTaskMessage` containing a sequence of connected steps for that DCC host.
  - Executes inline Pure steps and Python tool `main(**inputs)` functions sequentially within the **same** DCC process, passing outputs in-memory via `$ref` without restarting Blender/Unreal between nodes.

## 2. Unified DCC Stage

When `ComponentOrchestrator` (`runner/src/core/component_orchestrator.rs`) detects a contiguous chain of steps targeting the same DCC host (`blender` or `unreal`, including `python` and Pure nodes), it packs them into one `StageTaskMessage`:
- Eliminates repeated DCC startup overhead.
- Preserves in-memory scene state (`bpy.data`, `unreal.EditorAssetLibrary`) across steps.
- Isolates native crashes: if Blender or Unreal segfaults, `forgity-runner` catches the exit code, reports the failing node, and cleans up the Job Object.

## 3. Local Cache & Storage

- `cache/python-packages/`: Isolated per-runtime pip package cache.
- `cache/assets/`: Content-addressed asset cache.
- `runner_state.db`: Local SQLite state for runner housekeeping and cleanup.
