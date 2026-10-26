# Kế Hoạch Triển Khai: Khôi Phục TriggerPipelineExecutionHandler (BL-015) & Toàn Diện Hóa Kiểm Thử Run Pipeline

> **Ngày lập:** 25/10/2026  
> **Mục tiêu:** Khôi phục `TriggerPipelineExecutionHandler` bị mất trong commit `d07e52c` (giải quyết triệt để BL-015), đảm bảo việc kích hoạt Run Pipeline chuyển đúng trạng thái từ `Pending` sang `Running`, đồng thời xây dựng bộ kiểm thử tự động (Unit / Integration Tests) toàn diện cho toàn bộ luồng `RunPipeline` và `TriggerPipelineExecution`.

---

## 1. Phân Tích Hiện Trạng & Rủi Ro

1. **Hiện trạng BL-015**:
   - `RunPipelineEndpoint` nhận request `POST /api/pipelines/{id}/run`, `RunPipelineHandler` tạo `PipelineExecution` ở trạng thái `Pending` trong Postgres và gọi `bus.PublishAsync(new TriggerPipelineExecutionMessage(execution.Id, command.RuntimeInputs))`.
   - Trong commit `d07e52c`, class `TriggerPipelineExecutionHandler` đã bị xóa nhầm khỏi [RunPipeline.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Runtime/Features/Execution/RunPipeline.cs).
   - Không có consumer xử lý `TriggerPipelineExecutionMessage` -> `PipelineOrchestrator.ExecuteOrResumeAsync` không bao giờ chạy -> Execution bị treo vĩnh viễn ở `Pending`.

2. **Khoảng mù kiểm thử**:
   - Không có file test nào test Happy Path cho `RunPipelineHandler`.
   - Không có file test nào cho `TriggerPipelineExecutionHandler`.
   - `PipelineOrchestratorTests` chỉ test trực tiếp method nội bộ của orchestrator, bỏ qua Wolverine message routing.

---

## 2. Các Bước Triển Khai

### Giai đoạn 1: Khôi phục `TriggerPipelineExecutionHandler` trong `RunPipeline.cs`
- Thêm lại class `TriggerPipelineExecutionHandler` vào [RunPipeline.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Runtime/Features/Execution/RunPipeline.cs) theo chuẩn Single-File VSA.
- Inject:
  - `IPipelineOrchestrator orchestrator`
  - `PipelineDbContext db`
  - `IHubContext<PipelineExecutionHub> hubContext`
  - `ILogger<TriggerPipelineExecutionHandler> logger`
- Xử lý:
  - Gọi `await orchestrator.ExecuteOrResumeAsync(message.ExecutionId, message.RuntimeInputs, ct)`.
  - Bắt lỗi unhandled / thất bại: Đánh dấu `exec.MarkFailed(errorMessage, failSnapshot)` và bắn SignalR `"PipelineExecutionFinished"` để UI nhận được thông báo lỗi thay vì bị treo.

### Giai đoạn 2: Xây dựng bộ test toàn diện `RunPipelineTests.cs`
- Tạo file mới [RunPipelineTests.cs](file:///d:/FullStack/Automation/api/tests/Automation.Pipeline.Tests/RunPipelineTests.cs) trong project `Automation.Pipeline.Tests`.
- Kịch bản kiểm thử:
  1. `RunPipelineHandler_ValidPipeline_CreatesExecutionAndPublishesTriggerMessage`:
     - Arrange: Pipeline hợp lệ với Start và Tool node.
     - Act: Gọi `RunPipelineHandler.HandleAsync(command)`.
     - Assert: Trả về `Result.Ok(dto)`, tạo record `PipelineExecution` với status `Pending`, `mockBus.PublishAsync` nhận đúng `TriggerPipelineExecutionMessage`.
  2. `TriggerPipelineExecutionHandler_OnMessageReceived_CallsOrchestrator`:
     - Arrange: Execution trong DB ở trạng thái `Pending`.
     - Act: Gọi `TriggerPipelineExecutionHandler.HandleAsync(message)`.
     - Assert: `orchestrator.ExecuteOrResumeAsync(executionId, runtimeInputs, ct)` được gọi chính xác 1 lần.
  3. `TriggerPipelineExecutionHandler_OnOrchestratorFailure_MarksExecutionFailedAndBroadcastsSignalR`:
     - Arrange: `orchestrator.ExecuteOrResumeAsync` trả về `Result.Fail(...)`.
     - Act: Gọi `TriggerPipelineExecutionHandler.HandleAsync(message)`.
     - Assert: `PipelineExecution` trong DB chuyển thành `ExecutionStatus.Failed`, lưu `ErrorMessage`, và SignalR Client nhận `PipelineExecutionFinished`.
  4. `TriggerPipelineExecutionHandler_OnUnexpectedException_HandlesGracefullyAndMarksFailed`:
     - Arrange: `orchestrator.ExecuteOrResumeAsync` ném ngoại lệ bất ngờ (Exception).
     - Act: Gọi `TriggerPipelineExecutionHandler.HandleAsync(message)`.
     - Assert: Không crash worker, bắt ngoại lệ, ghi log error, cập nhật DB thành `Failed` và phát SignalR.

### Giai đoạn 3: Kiểm chứng & Cập nhật Backlog
- Chạy `dotnet test` toàn bộ test suite của `Automation.Pipeline.Tests`.
- Cập nhật [BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md) chuyển trạng thái **BL-015** từ `Pending` sang `Resolved`.
