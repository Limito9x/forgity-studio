# ADR-008: Runner-Only 2-Tier Local Execution Engine & Removal of Backend Runtime

- **Trạng thái:** `Accepted`
- **Ngày quyết định:** `2026-11-14`
- **Phạm vi ảnh hưởng:** `runner/`, `web/src-tauri/`, `web/src/features/pipelines/`, `api/src/Modules/Pipeline/`
- **Liên kết:** [ADR-006](file:///d:/FullStack/Automation/docs/adr/ADR-006-local-first-script-authoring-and-ephemeral-draft-lifecycle.md), [ADR-007](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md), [archive/pre-local-first-cleanup](git://archive/pre-local-first-cleanup)

---

## 1. Bối Cảnh & Lỗ Hổng Cũ (Context & Problem Statement)

Dù [ADR-006](file:///d:/FullStack/Automation/docs/adr/ADR-006-local-first-script-authoring-and-ephemeral-draft-lifecycle.md) và [ADR-007](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md) đã đưa Authoring về Local Workspace (`*.component.yaml`, `*.pipeline.yaml`, `.forgity/workspace.db`), luồng **Run Draft** trước đây vẫn phải đi vòng qua `.NET` Backend:

```
LocalWorkspacePage -> HTTP POST /run-draft -> .NET ExecPlanner -> Redis -> RabbitMQ stage_tasks -> forgity-runner -> SignalR -> Canvas
```

Kiến trúc vòng vèo này bộc lộ 4 vấn đề cốt lõi:
1. **Độ trễ và phụ thuộc hạ tầng không cần thiết:** Chạy script trên chính máy người dùng nhưng lại bắt buộc đi qua HTTP API, Redis, RabbitMQ và SignalR.
2. **Trùng lặp Engine & phình to Backend:** `Automation.Pipeline.Runtime` trên `.NET` phải duy trì `ExecPlanner`, `PipelineOrchestrator`, `DotNetSegmentDispatcher`, `RunnerSegmentDispatcher`, `ExecutionEntityStore`, `RedisExecutionStateStore`, cùng các C# server-side `Tools` (`GetVariableTool`, `FilterResourcesTool`, `UpdateResourceMetadataTool`...) — trong khi logic lập lịch DAG vốn dĩ thuộc về Rust Runner.
3. **Khó kiểm thử độc lập từng Component:** Không thể chạy thử 1 `*.component.yaml` như một unit test thuần túy ở local rồi mới lắp ghép vào Master Pipeline.
4. **Lệch hướng Local-First Automation:** Mô hình bắt người dùng upload file lên `Repository` trung tâm và gắn `GameplayTags` thủ công để phục vụ các C# `FilterResourcesTool` ở chặng sau tạo ra gánh nặng thao tác thủ công, đi ngược triết lý dữ liệu chảy trực tiếp qua `Struct` / `Blackboard` trên máy local.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

### Phương án A: Giữ `.NET` Runtime Engine trên Backend, chỉ tối ưu caching
- **Ưu điểm:** Không phải viết Orchestrator trong Rust.
- **Nhược điểm:** Vẫn lệ thuộc mạng/Redis/RabbitMQ khi chạy local, không thể chạy offline, tiếp tục phải bảo trì song song 2 hệ thống graph.

### Phương án B: Chuyển Engine sang Rust Runner và để Runner tự đọc `.forgity/workspace.db`
- **Ưu điểm:** Chạy 100% local, bỏ được Backend Engine.
- **Nhược điểm:** Runner bị trói chặt vào schema SQLite `workspace.db` của Tauri; khi đổi schema bên Client hoặc sau này chạy Template từ Cloud sẽ bị gãy hoặc phải viết lại tầng đọc dữ liệu.

### Phương án C (Được chọn): Runner-Only 2-Tier Engine nhận DTO `ExecutionBundle` + `stdout` JSON-lines + Gỡ bỏ hoàn toàn Backend `Runtime/`
- **Ưu điểm:** Runner trở thành **Pure Execution Engine** không biết đến SQLite hay UI; Local Client (Tauri) chịu trách nhiệm chuẩn hóa dữ liệu từ `workspace.db` thành JSON DTO `ExecutionBundle`; `ComponentOrchestrator` chạy độc lập như unit test; xóa sạch `Automation.Pipeline.Runtime` trên `.NET`.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Tách Data Preparation khỏi Execution Engine bằng DTO `ExecutionBundle`
- **Local Client (Tauri — [local_execution.rs](file:///d:/FullStack/Automation/web/src-tauri/src/commands/local_execution.rs)):** Đọc `.forgity/workspace.db` (`local_scripts`, `local_constants`, `local_pipelines`) và đóng gói thành 1 JSON DTO duy nhất (`ExecutionBundle`: `runId`, `pipelineKind`, `rootPipeline`, `runtimeInputs`, `scripts`, `components`, `constants`), rồi bơm qua `stdin` cho `forgity-runner run-bundle --stdin --json-events`.
- **Runner (`forgity-runner` — [bundle.rs](file:///d:/FullStack/Automation/runner/src/core/bundle.rs), [traits.rs](file:///d:/FullStack/Automation/runner/src/core/traits.rs)):** Định nghĩa trait `ResourceResolver` và implementation `BundleResourceResolver` nạp DTO vào `HashMap` trong RAM để tra cứu O(1). `WorkspaceResolver` ([workspace_resolver.rs](file:///d:/FullStack/Automation/runner/src/core/workspace_resolver.rs)) chỉ còn là adapter phụ cho lệnh CLI `run-local` khi dev test ngoài terminal.

### 3.2. Thuật Toán Điều Phối 2 Tầng Trong Rust Runner
Cả 2 tầng dùng chung lõi **Event-Driven Kahn's Topological DAG** (`DagScheduler` + `Blackboard` + Tokio `JoinSet`), nhưng tách rạch ròi trách nhiệm:
1. **Tầng 1 — `ComponentOrchestrator` ([component_orchestrator.rs](file:///d:/FullStack/Automation/runner/src/core/component_orchestrator.rs)) — *Hybrid DAG + Bounded Scatter-Gather*:**
   - Chạy độc lập 1 `*.component.yaml` (`Start` -> Pure nodes `Constant` / `MakeStruct` / `BreakStruct` / `Joint` chạy inline < 1ms -> Exec scripts qua `StageDispatcher` + Named Pipe IPC -> `End`).
   - Hỗ trợ chế độ Batch qua `execute_batch_concurrent`: dùng `tokio::sync::Semaphore(max_concurrency)` để giới hạn số tiến trình DCC song song, tự flatten mảng đầu ra và hỗ trợ `skip_on_error`.
2. **Tầng 2 — `MasterOrchestrator` ([master_orchestrator.rs](file:///d:/FullStack/Automation/runner/src/core/master_orchestrator.rs)) — *Hierarchical Fork-Join DAG*:**
   - Chỉ điều phối luồng lớn: `Start`, `End`, `Sequence` (fan-out các nhánh độc lập), `Joint` (barrier merge khi đủ cạnh vào), và `local:component:*` (ủy thác xuống `ComponentOrchestrator`).
   - **Cấm tuyệt đối** chứa script `.py` lẻ, `MakeStruct`, `BreakStruct` hay `Constant` trực tiếp trong Master Pipeline.

### 3.3. Theo Dõi Tiến Trình Phi Tập Trung Qua `stdin` / `stdout` Pipe
- `StageDispatcher` được tách khỏi `RabbitMqClient` thông qua trait `EventSink` ([traits.rs](file:///d:/FullStack/Automation/runner/src/core/traits.rs)).
- Ở chế độ local, `StdoutJsonEventSink` phát mỗi sự kiện (`run_started`, `node_started`, `node_progress`, `node_completed`, `run_completed`) thành 1 dòng JSON ra `stdout` (toàn bộ log kỹ thuật đẩy sang `stderr`).
- Runner hoàn toàn không biết Client là ai. Tauri đọc `stdout` từng dòng và `app.emit("local-pipeline://event")` để React Canvas ([usePipelineLiveTracking.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineLiveTracking.ts)) cập nhật màu trạng thái, logs và `executionOutputs` realtime.

### 3.4. Gỡ Bỏ Hoàn Toàn `Automation.Pipeline.Runtime` Trên `.NET` Backend
- Lưu trữ snapshot lịch sử tại commit `95de420` trên nhánh `archive/pre-local-first-cleanup`.
- Trên nhánh `develop`, xóa bỏ toàn bộ `api/src/Modules/Pipeline/Automation.Pipeline/Runtime/`, `RedisExecutionStateStore`, `RedisExecutionMemoryStore`, `PipelineGrpcExtensions`, `ExecPlanValidator`, `ValidatePipeline`, và các C# server-side `Tools` gắn với engine cũ.
- Các nhu cầu phụ trợ (sync VCS, thông báo, đẩy dữ liệu sau khi chạy) về sau sẽ được thiết kế như **side-effect / plugin event** từ `RunnerExecutionEvent`, thay cho mô hình `Repository` / `GameplayTags` thủ công.

### 3.5. Định Hướng Cloud / Paid Template (Trust Boundary & Asset Streaming)
- **Local Dev Mode:** Tauri Client đọc `.forgity/workspace.db`, build `ExecutionBundle` JSON và bơm vào `stdin` Runner.
- **Cloud / Paid Template Mode:** Backend query DB, sinh presigned URL cho assets nặng (không nhét binary vào DTO), đóng gói & ký chữ ký số (HMAC/Ed25519) lên `ExecutionBundle` (kèm quota/run ticket). Client chỉ chuyển tiếp gói đã ký sang `stdin` Runner (hoặc truyền ticket để Runner tự fetch); Rust Runner verify chữ ký bằng key nhúng trong binary native, tự stream asset qua `StreamDownloader` -> `cache/assets`, rồi đưa vào cùng `BundleResourceResolver` — đủ để chống sửa lén/copy thô cho 99% người dùng phổ thông mà không cần thay đổi lõi Engine.

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

### Lợi ích
- **100% Local-First & Zero Network Latency:** Chạy pipeline ngay trên máy trạm không cần Redis, RabbitMQ hay SignalR.
- **Unit-Testable Components:** Có thể chạy thử riêng từng `*.component.yaml` qua `run-bundle` / `run-local` trước khi ghép vào Master Pipeline.
- **Tách biệt rạch ròi:** Tauri quản lý workspace & đóng gói `ExecutionBundle`; Runner chỉ tập trung thực thi DAG & DCC subprocess (`JobObject` + Named Pipe); `.NET` Backend tinh gọn chỉ còn Auth, Studio, Storage, Authoring/Publish.

### Đánh đổi & Lưu ý kiểm soát
- **Đồng bộ Contract 3 nơi:** Schema JSON của `ExecutionBundle` và `RunnerExecutionEvent` phải được giữ khớp giữa Tauri (`local_execution.rs`), Runner (`bundle.rs`, `traits.rs`), và React (`usePipelineLiveTracking.ts`).
- **Phạm vi thực thi:** Không còn hỗ trợ chạy pipeline trực tiếp từ trình duyệt web thuần không có Tauri/Runner local (phù hợp với định hướng Desktop App + Native Runner của Forgity Studio).
