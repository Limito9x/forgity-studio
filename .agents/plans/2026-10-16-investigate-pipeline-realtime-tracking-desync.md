# Kế Hoạch Kỹ Thuật: Khắc Phục Triệt Để Luồng Đồng Bộ Tiến Độ Pipeline Real-time (Web Canvas <-> API <-> Runner)

> **Mã công việc:** `PLAN-2026-10-16-PIPELINE-REALTIME-DESYNC`  
> **Trạng thái:** Pending Execution  
> **Ngày lập:** 16-10-2026 (Tái cấu trúc: Phân tách riêng Core Server & Runner, Bổ sung Cập nhật Playbook)  
> **Phạm vi:** Backend Core (`api/`), Runner Daemon (`workers/`), Frontend Canvas (`web/`), Playbooks (`.agents/playbooks/`)

---

## 1. Triết Lý Kiến Trúc Chuẩn (Architectural Single Source of Truth)

Theo đúng quy chuẩn thiết kế tại [pipeline-engine.md](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-engine.md), hệ thống phân định rõ 2 ranh giới:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. PHẠM VI NGHIỆP VỤ CỦA TOOL NODE (Business Domain Execution)                                     │
│   • Các Tool Node (GetResource, FetchAsset, ExportBundle...) hoàn toàn được phép query database    │
│     nghiệp vụ hoặc gọi API sang các module khác (Resources, Files, Assets...).                    │
│   • Với các Tool có dây Exec (luồng thực thi tuần tự): Engine BẮT BUỘC phải đợi (await) tool đó    │
│     chạy xong trọn vẹn mới chuyển giao sang step tiếp theo.                                       │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. PHẠM VI QUẢN LÝ VÒNG ĐỜI PIPELINE (Pipeline Lifecycle Management - RANH GIỚI ĐỎ)                │
│   • [Khởi tạo]: Tạo 1 bản ghi PipelineExecution trong PostgreSQL với Status = Running.            │
│                 Lập ExecPlan DAG ("bản đồ" stage/step). Nạp Variables & Context vào Redis/RAM.    │
│   • [Suốt Runtime]: TUYỆT ĐỐI KHÔNG ĐỤNG / GHI / QUERY BẢNG PipelineExecution TRONG POSTGRESQL!    │
│     - Không query tìm CurrentBatchId.                                                             │
│     - Không ghi nhận step progress trung gian vào Database.                                       │
│     - Toàn bộ Hot Lifecycle State (NodeOutputs, NodeStatus, Live Step) lưu 100% tại REDIS / RAM. │
│     - StepProgressMessage mang thẳng { pipelineExecutionId, pipelineId, nodeId, status, outputs }.│
│     - Consumer nhận tin ──> Ghi thẳng Redis ──> Bắn SignalR tức thì (< 1ms, zero DB lock/query).  │
│   • [Kết thúc (Succeeded / Failed / Timeout)]:                                                    │
│     - Gôm toàn bộ Snapshot đồ thị dữ liệu từ Redis (IExecutionStateStore).                        │
│     - Cập nhật 1 LẦN DUY NHẤT vào bản ghi PipelineExecution trong PostgreSQL.                     │
│     - Bắn SignalR "PipelineExecutionFinished" giải phóng UI Web Canvas.                           │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Mô Hình Phân Tách Trách Nhiệm: Host Runner (Ambassador) vs Subprocess (Executor)

Nhằm đảm bảo **tiến trình đồ họa (Blender / Unreal) siêu nhẹ nhàng, không ôm đồm bất kỳ gánh nặng mạng nào**, hệ thống áp dụng mẫu thiết kế **Ambassador / Sidecar Pattern**:

```
                       ┌──────────────────────────────────────────────┐
                       │               CLOUD SERVER                   │
                       └──────────────────────▲───────────────────────┘
                                              │ (RabbitMQ Message Bus)
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ THẰNG RUNNER ORCHESTRATOR TRÊN HOST (pipeline_consumer.py) - SINGLE GATEWAY                  │
│                                                                                             │
│  1. BƠM DỮ LIỆU ĐẦU VÀO (Input Injection):                                                  │
│     • Nhận task từ Cloud, chuẩn bị sẵn toàn bộ inputs của các stage trước.                  │
│     • Khởi động Blender và bơm (inject) trọn vẹn JSON qua stdin vào Blender.                │
│                                                                                             │
│  2. LẮNG NGHE & NGOẠI GIAO VỚI SERVER (The Stage Bridge):                                   │
│     • Lắng nghe interface báo cáo từ stdout của Blender.                                    │
│     • Bắn StepProgressMessage lên RabbitMQ (kèm outputs, hoặc báo lỗi fail-fast tức thì).   │
│     • Khi Blender tắt: Gửi StageResultMessage báo cáo toàn bộ Stage hoàn tất.               │
└─────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │ (Local IPC Pipe: Stdin / Stdout Event Interface)
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIẾN TRÌNH BLENDER (Headless Subprocess - Hoàn Toàn Offline & Cô Lập)                        │
│                                                                                             │
│   • Thằng điều phối bên trong (`stage_runner.py`):                                          │
│     - Đọc inputs được bơm từ stdin. KHÔNG MỞ gRPC, KHÔNG MỞ KẾT NỐI MẠNG RA NGOÀI.          │
│     - Chạy tuần tự từng script: `outputs = script.main(inputs)`.                            │
│     - Step 2 cần data của Step 1: Lấy ngay từ RAM nội bộ (`all_step_outputs`).              │
│                                                                                             │
│   • INTERFACE BÁO RA NGOÀI CHO RUNNER ORCHESTRATOR (qua Stdout):                            │
│     - Bắt đầu step: `PIPELINE_EVENT: step_started`.                                         │
│     - Xong step: `PIPELINE_EVENT: step_completed` kèm `{ outputs }`.                        │
│     - Gặp lỗi: Bắt Exception, báo ngay `PIPELINE_EVENT: step_failed` kèm `{ error_message }`.│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Bản Đồ Phân Chia Các Phase Triển Khai (Roadmap)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [PHASE 1: TÁI CẤU TRÚC CORE PIPELINE SERVER (Backend C#)] - [COMPLETED]                │
│   [x] 1.1 Chuẩn hóa AgentContracts.cs: StepProgressMessage tự thân đầy đủ trường       │
│   [x] 1.2 Tái cấu trúc StepProgressConsumer.cs: ZERO DB QUERY, lưu Redis + SignalR     │
│   [x] 1.3 Sửa StageResultConsumer.cs: Luôn bắn SignalR PipelineExecutionFinished khi lỗi│
│   [x] 1.4 Tái cấu trúc RunnerSegmentDispatcher.cs: Bỏ fake running, kích hoạt Watchdog │
│   [x] 1.5 Xây dựng StageTimeoutHandler.cs: Tự động ngắt pipeline ma quá 30 phút        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [PHASE 2: REFACTOR RUNNER DAEMON & EXECUTOR (Python Worker)] - [COMPLETED]             │
│   [x] 2.1 Gỡ bỏ hoàn toàn gRPC ExecutionStateClient trong stage_runner.py (Offline)    │
│   [x] 2.2 Chuẩn hóa interface pipeline_hooks.py: step_started, step_completed, failed  │
│   [x] 2.3 Tái cấu trúc base.py & pipeline_consumer.py: Hứng trọn outputs, Fail-Fast   │
│   [x] 2.4 Đồng bộ contracts.py: Cập nhật StepProgressMessage tương ứng C#              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [PHASE 3: ĐỒNG BỘ HÓA FRONTEND CANVAS & CANVAS LOCK (React/Web)] - [COMPLETED]         │
│   [x] 3.1 Cập nhật usePipelineSignalR.ts: Chuyển tiếp outputs, error_message, status   │
│   [x] 3.2 Tái cấu trúc usePipelineLiveTracking.ts: Bỏ chặn !currentExecution, live out  │
│   [x] 3.3 Thêm ExecutionStatusBanner.tsx: Nhận diện trực quan Live Tracking vs Draft  │
│   [x] 3.4 Thiết lập Canvas Execution Lock: Khóa an toàn isLocked chống sửa khi đang chạy │
│   [x] 3.5 Đồng bộ LiveExecutionDrawer.tsx: Tự động mở tab Logs khi bắt đầu chạy        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [PHASE 4: XÂY DỰNG BỘ TEST TỰ ĐỘNG (Automated Unit & Integration Tests Suite)]         │
│   4.1 Backend Unit Tests: StepProgressConsumerTests (Zero-DB), StageResult, Timeout    │
│   4.2 Worker Python Tests: test_subprocess_event_streaming, test_step_progress         │
│   4.3 Regression Test toàn bộ 24 test suite cũ trong Automation.Pipeline.Tests         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [PHASE 5: KIỂM THỬ NGHIỆM THU TOÀN DIỆN E2E (Live Canvas & Subprocess Verification)]   │
│   5.1 Kiểm thử Zero-DB Step Progress & Live Node Outputs trên Web Canvas               │
│   5.2 Kiểm thử Fail-Fast khi Blender script vấp lỗi                                    │
│   5.3 Kiểm thử Stage Timeout Watchdog khi tắt Runner đột ngột                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [PHASE 6: CẬP NHẬT CẨM NANG VẬN HÀNH & KIẾN TRÚC (Playbook & Docs Update - MANDATORY)] │
│   6.1 Cập nhật .agents/playbooks/pipeline-engine.md: Ambassador Pattern & Zero-DB Hot  │
│   6.2 Cập nhật Sequence Diagram tương tác giữa Server <-> Host Runner <-> Subprocess   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Chi Tiết Kỹ Thuật Từng Phase

### PHASE 1: TÁI CẤU TRÚC CORE PIPELINE SERVER (Backend C#)

1. **Chuẩn hóa Hợp đồng C# [AgentContracts.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Engine/Messages/AgentContracts.cs):**
   ```csharp
   public class StepProgressMessage
   {
       [JsonPropertyName("pipeline_execution_id")]
       public string PipelineExecutionId { get; set; } = string.Empty;

       [JsonPropertyName("pipeline_id")]
       public string PipelineId { get; set; } = string.Empty;

       [JsonPropertyName("stage_execution_id")]
       public string StageExecutionId { get; set; } = string.Empty;

       [JsonPropertyName("step_execution_id")]
       public string StepExecutionId { get; set; } = string.Empty;

       [JsonPropertyName("status")]
       public string Status { get; set; } = string.Empty; // "running" | "succeeded" | "failed"

       [JsonPropertyName("outputs")]
       public Dictionary<string, object?>? Outputs { get; set; }

       [JsonPropertyName("error_message")]
       public string? ErrorMessage { get; set; }
   }
   ```

2. **Tái cấu trúc [StepProgressConsumer.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/HandleAgentCallback/StepProgressConsumer.cs) - ZERO DB QUERY:**
   - **Xóa bỏ 100% câu lệnh query `db.PipelineExecutions`**.
   - Lấy trực tiếp `executionId` và `pipelineId` từ `message`.
   - Cập nhật trạng thái node vào Redis: `stateStore.SetNodeStatusAsync(executionId, nodeId, message.Status, ct)`.
   - Nếu có `message.Outputs`: Cập nhật ngay vào Redis: `memoryStore.SetNodeAllOutputsAsync(executionId, nodeId, message.Outputs, scope: null, ct)`.
   - Bắn trực tiếp SignalR `PipelineNodeExecutionUpdated` vào group `$"pipeline_{pipelineId}"` kèm `status`, `outputs`, `errorMessage`.
   - Nếu `message.Status == "failed"`: Lập tức kích hoạt fail-fast, lưu DB `MarkFailed(errorMessage)` và bắn `PipelineExecutionFinished`.
   - **Thời gian xử lý < 1ms, zero DB lock, triệt tiêu 100% race condition.**

3. **Sửa lỗi Fail-Fast trong [StageResultConsumer.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/HandleAgentCallback/StageResultConsumer.cs):**
   - Khi `!message.Succeeded`:
     - Gôm snapshot state từ Redis (`stateStore.GetFullStateAsync` hoặc `CaptureExecutionStateSnapshotAsync`).
     - Đánh dấu `execution.MarkFailed(err, snapshot)`.
     - Lưu DB `await db.SaveChangesAsync(ct)`.
     - **BẮT BUỘC BẮN SIGNALR `PipelineExecutionFinished`** (kèm `status: Failed` và `errorMessage`) để Web Canvas dừng spinner và hiện viền đỏ ngay lập tức.

4. **Tái cấu trúc [RunnerSegmentDispatcher.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Engine/Orchestrator/Dispatchers/RunnerSegmentDispatcher.cs):**
   - Xóa bỏ vòng lặp broadcast "Fake Running" hàng loạt cho tất cả các steps khi vừa dispatch. Node giữ nguyên trạng thái `pending` cho đến khi worker thực sự emit `step_started`.
   - Kích hoạt **Stage Timeout Watchdog**:
     ```csharp
     await messageBus.PublishAsync(
         new StageTimeoutCheckMessage(execution.Id, stageId),
         new DeliveryOptions { ScheduleDelay = TimeSpan.FromMinutes(30) }
     );
     ```

5. **Xây dựng `StageTimeoutHandler.cs` (Wolverine Consumer):**
   - Lắng nghe `StageTimeoutCheckMessage`.
   - Kiểm tra: Nếu `execution.Status == WaitingForRunner` và `CurrentBatchId == message.StageId`:
     - Tự động chuyển `execution.MarkFailed("Stage timed out: Runner did not respond within 30 minutes.")`.
     - Lưu DB, bắn SignalR `PipelineExecutionFinished(Failed)`, giải phóng key Redis.
     - **Đảm bảo không bao giờ có Pipeline ma bị kẹt mãi mãi.**

---

### PHASE 2: REFACTOR RUNNER DAEMON & EXECUTOR (Python Worker)

1. **Tái cấu trúc [stage_runner.py](file:///d:/FullStack/Automation/workers/worker/scripts/stage_runner.py) (Blender Offline & Siêu Nhẹ):**
   - **XÓA BỎ 100% gRPC `ExecutionStateClient` khỏi Blender**.
   - Đọc JSON inputs được Host bơm sẵn qua `stdin`.
   - Duyệt tuần tự các steps:
     - Gọi `script.main(step_inputs)`.
     - Lưu kết quả vào biến RAM `all_step_outputs` cho các step sau trong cùng stage dùng lại.
     - Báo kết quả ra stdout qua interface `PipelineHooks`.
     - Purge RAM đồ họa `purge_orphans()` sau mỗi step.

2. **Chuẩn hóa Interface [pipeline_hooks.py](file:///d:/FullStack/Automation/workers/worker/scripts/lib/pipeline_hooks.py):**
   - Định nghĩa format chuẩn:
     - `PIPELINE_EVENT: {"event": "step_started", "step_execution_id": "..."}`
     - `PIPELINE_EVENT: {"event": "step_completed", "step_execution_id": "...", "succeeded": true, "outputs": {...}}`
     - `PIPELINE_EVENT: {"event": "step_failed", "step_execution_id": "...", "succeeded": false, "error_message": "...", "traceback": "..."}`

3. **Tái cấu trúc [base.py](file:///d:/FullStack/Automation/workers/worker/executors/base.py) & [pipeline_consumer.py](file:///d:/FullStack/Automation/workers/worker/pipeline_consumer.py) (Host Single Gateway):**
   - Host đọc stream stdout của Blender, bắt trọn vẹn `outputs` và `error_message`.
   - Gói đầy đủ vào `StepProgressMessage` gửi về RabbitMQ queue `step_progress`.
   - Khi có event `step_failed`: Ngay lập tức gửi tin báo lỗi lên RabbitMQ và kill tiến trình Blender (Fail-Fast, không để chạy vô ích).

4. **Đồng bộ Hợp đồng [contracts.py](file:///d:/FullStack/Automation/workers/worker/contracts.py):**
   - Cập nhật `StepProgressMessage` có đủ: `pipeline_execution_id`, `pipeline_id`, `stage_execution_id`, `step_execution_id`, `status`, `outputs`, `error_message`.

---

### PHASE 3: ĐỒNG BỘ HÓA PHÍA FRONTEND CANVAS (`web/`)

1. **Hoàn thiện [usePipelineLiveTracking.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineLiveTracking.ts):**
   - Gỡ bỏ điều kiện chặn `if (!currentExecution) return;`.
   - Cập nhật trực tiếp `liveNodeStatuses` và outputs vào React Flow nodes ngay khi nhận event từ SignalR.
   - Bắt event `PipelineExecutionFinished` kể cả khi thất bại để dừng spinner và hiển thị thông báo lỗi.
2. **Tối ưu UX Khởi Chạy:**
   - Khi bấm Run Pipeline trên modal, lập tức kích hoạt `setActiveExecutionId(executionId)` và mở Drawer Live Logs tab để người dùng theo dõi output stream của Runner theo thời gian thực.

---

### PHASE 4: XÂY DỰNG BỘ TEST TỰ ĐỘNG (Automated Unit & Integration Tests Suite)

Nhằm lấp đầy khoảng trống kiểm thử nguy hiểm (vốn là nguyên nhân để lọt lỗi Race Condition và nuốt SignalR) và bảo vệ hệ thống không bị hồi quy, phase này xây dựng các unit/integration test nhẹ (< 3–5 giây) chạy hoàn toàn trên RAM/Mock:

1. **Backend Unit Tests ([Automation.Pipeline.Tests](file:///d:/FullStack/Automation/api/tests/Automation.Pipeline.Tests)):**
   - **`StepProgressConsumerTests.cs` (Kiểm thử Zero-DB & Realtime SignalR):**
     * `Handle_StepStarted_ShouldUpdateRedisStateAndBroadcastSignalR_WithoutQueryingDatabase`:
       - Verify `stateStore.SetNodeStatusAsync` được gọi với `"Running"`.
       - Verify SignalR hub gửi event `PipelineNodeExecutionUpdated`.
       - Verify `PipelineDbContext` hoàn toàn không bị chạm tới (Zero-DB check).
     * `Handle_StepCompleted_ShouldStoreOutputsInRedisMemory_UpdateState_AndBroadcastSignalR`:
       - Verify `memoryStore.SetNodeAllOutputsAsync` ghi đúng toàn bộ dictionary outputs.
       - Verify `stateStore.SetNodeStatusAsync` đổi trạng thái sang `"Succeeded"`.
       - Verify SignalR hub gửi `PipelineNodeExecutionUpdated` kèm outputs.
     * `Handle_StepFailed_ShouldRecordFailureInRedis_AndFailFast`:
       - Verify khi step lỗi, consumer cập nhật trạng thái `"Failed"` và kích hoạt ngắt execution dứt khoát.
   - **`StageResultConsumerTests.cs` (Kiểm thử Fail-Fast & Kết thúc Stage):**
     * `Handle_WhenStageFailed_ShouldPersistError_AndBroadcastPipelineExecutionFinishedSignalR`:
       - Verify khi `succeeded = false`, Server BẮT BUỘC bắn SignalR `PipelineExecutionFinished(false)` để Web Canvas dừng spinner ngay lập tức.
     * `Handle_WhenStageSucceeded_ShouldTriggerOrchestratorResume`:
       - Verify orchestrator tiếp tục thực thi các stage tiếp theo trong DAG.
   - **`StageTimeoutHandlerTests.cs` (Kiểm thử Watchdog Timeout):**
     * `Handle_WhenStageStillWaitingForRunner_ShouldAbortAndBroadcastFailedSignalR`:
       - Verify khi nhận `StageTimeoutCheckMessage` mà stage vẫn chưa xong, execution tự động đổi sang `Failed` ("Stage timed out") và bắn SignalR.
     * `Handle_WhenStageAlreadyCompleted_ShouldIgnoreSafely`:
       - Verify nếu stage đã hoàn thành trước hạn, message timeout bị bỏ qua an toàn.

2. **Runner Python Tests ([workers/tests](file:///d:/FullStack/Automation/workers/tests)):**
   - **`test_subprocess_event_streaming.py`:**
     * `test_parse_pipeline_event_with_outputs_and_error`:
       - Giả lập stream stdout có dòng `PIPELINE_EVENT: {"event": "step_completed", "step_execution_id": "...", "succeeded": true, "outputs": {"result": 42}}`.
       - Verify `BaseSubprocessExecutor` parse chính xác và truyền đủ `outputs` vào callback.
     * `test_stage_runner_offline_execution`:
       - Chạy subprocess `stage_runner.py` với payload mock qua stdin.
       - Verify script hoàn thành và emit đúng chuỗi `PIPELINE_EVENT` ra stdout mà không cần khởi tạo bất kỳ kết nối gRPC/mạng nào.
   - **`test_pipeline_consumer_step_progress.py`:**
     * Mock RabbitMQ pika channel.
     * Verify khi `_on_step_progress` được gọi, message `StepProgressMessage` gửi đi chứa trọn vẹn: `pipeline_execution_id`, `pipeline_id`, `stage_execution_id`, `step_execution_id`, `status`, `outputs`, `error_message`.

3. **Regression Test Toàn Hệ Thống:**
   - Chạy toàn bộ 24 test suites hiện có trong `Automation.Pipeline.Tests` để xác nhận không có bất kỳ regression nào trong việc phân tách DAG (`ExecPlanner`), resolve pin (`PinValueResolver`), hay cấu hình node.

---

### PHASE 5: KIỂM THỬ NGHIỆM THU TOÀN DIỆN E2E (Live Canvas & Subprocess Verification)

1. **Kiểm thử Zero-DB Step Progress:**
   - Chạy pipeline bình thường. Kiểm tra Server log: `StepProgressConsumer` xử lý mượt mà từng step mà không có bất kỳ câu lệnh SQL `SELECT ... FROM PipelineExecutions`.
   - UI Canvas đổi màu chính xác: Step #0 running -> succeeded, Step #1 running -> succeeded, Step #2 running -> succeeded.
   - Click vào từng node trên Canvas kiểm tra Inspector hiển thị ngay outputs của step.
2. **Kiểm thử Fail-Fast:**
   - Cố tình gây lỗi trong script Blender (syntax error).
   - Xác nhận: Ngay khi lỗi xảy ra, Server nhận tin lỗi và bắn SignalR ngay lập tức. UI Canvas chuyển viền đỏ và hiển thị đúng thông điệp lỗi, không bị treo spinner.
3. **Kiểm thử Timeout Watchdog:**
   - Giả lập tình huống tắt Runner daemon ngay sau khi dispatch.
   - Xác nhận: Sau thời gian timeout, pipeline tự động chuyển sang `Failed` với lý do `Stage timed out` rõ ràng và UI cập nhật dừng tiến trình.

---

### PHASE 6: CẬP NHẬT CẨM NANG VẬN HÀNH & KIẾN TRÚC (Playbook & Docs Update - MANDATORY)

Sau khi hoàn thành và kiểm nghiệm ổn định các Phase trên, Agent **BẮT BUỘC** thực hiện cập nhật tài liệu kiến trúc cốt lõi:

1. **Cập nhật [.agents/playbooks/pipeline-engine.md](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-engine.md):**
   - Ghi nhận mô hình **Ambassador / Sidecar Pattern** của Runner Daemon (Blender chạy offline, Host Daemon làm Single Gateway).
   - Ghi nhận nguyên tắc **Hot State Zero-DB** của `StepProgressConsumer` (đọc từ tin nhắn tự thân, ghi Redis `stateStore` & `memoryStore`, zero SQL queries trong runtime).
   - Ghi nhận cơ chế **Fail-Fast** và **Stage Timeout Watchdog** chống treo vĩnh viễn (Zombie Executions).
   - Cập nhật lại sơ đồ tuần tự (Sequence Diagram) tương tác giữa Web <-> Server <-> Host Runner <-> Subprocess Blender.
2. **Đồng bộ hóa Index:**
   - Đảm bảo tài liệu phản ánh chính xác 100% mã nguồn thực tế của hệ thống.


