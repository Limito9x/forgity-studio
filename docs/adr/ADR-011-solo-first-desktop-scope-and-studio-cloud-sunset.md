# ADR-011: Solo-First Desktop Scope & Studio Cloud / RabbitMQ / gRPC Sunset

- **Status:** Accepted
- **Date:** 2026-11-19
- **Supersedes / Extends:** ADR-008 (Runner-Only Local Execution Engine)

## Context
Forgity Studio originally included a multi-tenant Cloud Studio architecture with remote runner pairing tokens, RabbitMQ job queues, and a persistent gRPC runner daemon (`forgity-runner start`). Following the shift to Local-First execution (ADR-007, ADR-008) and Cloud Template containers (ADR-010), all pipeline execution now happens locally on the user's workstation via `forgity-runner run-bundle`.

Keeping Studio multi-tenancy, RabbitMQ, and gRPC active added unnecessary deployment complexity, auth friction, and binary overhead for the Desktop MVP.

## Decision
1. **Studio Cloud Zone Closed (Dormant):**
   - The Studio zone in the Desktop UI is hidden (`UnifiedSidebar.tsx`), and root `/` always routes directly to `/local` (Workspace).
   - Runner registration no longer depends on Studio pairing tokens or `RunnerStudio` links.
2. **RabbitMQ & gRPC Closed:**
   - Backend (`Program.cs`, `RunnerModule.cs`) no longer registers or maps `RunnerGrpcService`.
   - `WolverineRabbitMqExtensions.UseSharedRabbitMq` is opt-in (`RabbitMQ:Enabled = true` required); by default Wolverine runs in-memory.
   - `forgity-runner` disables `start`, `daemon`, and `register` commands; it operates purely as a local execution CLI (`run-bundle`) bundled as a Tauri Sidecar (`externalBin`).
3. **Device-First Auto Check-in for Quota:**
   - Desktop clients automatically call `POST /api/runners/check-in` (`AllowAnonymous`) on startup with their `HardwareFingerprint` and `MachineKey`.
   - Template Library & Quota (`AddTemplateToLibrary`, `AcquireComponentScripts`, `ConsumeTemplateQuota`) bind to the workstation's hardware `MachineKey` independently of Studio.
