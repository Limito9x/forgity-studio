# Kế Hoạch Thực Thi: Tinh Gọn Runner/Executors & Hệ Thống Quản Lý Script

> **Mục tiêu cốt lõi**: 
> 1. **Dọn sạch nền móng Runner & Executors**: Dồn toàn bộ cấu hình máy trạm (Blender, UE5, Python, registered .uproject) về duy nhất `RunnerExecutorConfig` với cột `JSONB Settings`, xóa bỏ hoàn toàn `ProjectExecutorConfig` thừa thãi bên module Studio, làm UI chuẩn VS Code Settings.
> 2. **Xây dựng luồng Quản lý Script**: Ingestion, Reconciliation (In-place breaking changes), Pin Mapping, Test Run trên Runner và đồng bộ vào DB Studio.

---

## 🗺️ Tổng Quan Các Phase Thực Thi

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: TINH GỌN RUNNER & EXECUTORS (NỀN MÓNG BẮT BUỘC)               │
│ • Xóa bỏ ProjectExecutorConfig thừa ở module Studio                    │
│ • Nâng cấp RunnerExecutorConfig (thêm JSONB Settings, IsEnabled)       │
│ • Cập nhật AgentSegmentDispatcher đọc Executor Settings từ IRunnerApi  │
│ • Frontend: Xây dựng Runner Configuration Workspace (VS Code style)    │
│   kèm bảng map Project -> .uproject cho Unreal Engine (+ Add Project)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.1: BACKEND SCHEMA & ENTITY FOUNDATION (SCRIPT NODE DEFINITION) │
│ • Cập nhật NodeDefinition (ContentHash, Status, Version, OverrideTarget)│
│ • Tạo & Áp dụng EF Core Migration cho Module Pipeline                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.2: EVENT-DRIVEN RECONCILIATION & WOLVERINE EDGE CLEANUP        │
│ • Thêm EdgeReconciliationStrategy (KeepCompatiblePins vs UnpinAll)     │
│ • Viết Wolverine Event NodeDefinitionPinsChangedEvent                  │
│ • Viết Consumer ReconcilePipelineEdgesHandler kèm Structured Logs      │
│ • Unit / Integration Test kiểm chứng dọn dẹp dây cắm                   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.3: SCRIPT SCANNER & AST PARSER SERVICE (BACKEND & RUNNER)      │
│ • Scanner Service: Nhận diện NEW, OVERRIDE, MODIFIED, SYNCED, ERROR    │
│ • Parser: Bóc tách docstring, @override tag, hàm execute, type hints   │
│ • Endpoint TestRunCustomNode: Chạy sandbox trên Runner thật            │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.4: FRONTEND "SCRIPT INGESTION DECK" UI (NO MODALS)             │
│ • Cột Trái: Sidebar Preview kiểu PowerPoint (Mini-Cards, Pin Dots)     │
│ • Cột Phải: In-place Inspector (Action Bar Breaking Change, Pin Mapper)│
│ • Tích hợp Monaco Editor: Side-by-Side Diff cho MODIFIED / OVERRIDE    │
│ • Tích hợp nút Run Test trên Runner & Publish                          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.5: END-TO-END VERIFICATION & DEBUG LOGS AUDIT                  │
│ • Tạo thư mục mẫu (sample scripts: new, override, modified)            │
│ • Kiểm chứng 4 chặng debug log in ra terminal                          │
│ • Xác nhận tính tương thích trước khi chuyển sang Refactor Pipeline    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Chi Tiết Từng Phase Thực Thi

### Phase 0: Tinh Gọn Runner & Executors (Nền Móng Bắt Buộc)

* **Mục tiêu**: Loại bỏ sự phân mảnh kiến trúc. Xóa sổ thực thể `ProjectExecutorConfig` thừa thãi bên `Studio`, chuyển toàn bộ cấu hình máy trạm (Blender flags, GPU, Python venv, Unreal registered projects) về duy nhất `RunnerExecutorConfig` với cột `JSONB Settings`.
* **Các file tác động**:
  - `api/src/Modules/Studio/Automation.Studio/Domain/Entities/ProjectExecutorConfig.cs` (XÓA)
  - `api/src/Modules/Studio/Automation.Studio/Features/ProjectExecutorConfigs/*` (XÓA CÁC ENDPOINT CRUD THỪA)
  - `api/src/Modules/Studio/Automation.Studio.Contracts/IStudioApi.cs` (Gỡ bỏ `GetExecutorConfigAsync`)
  - `api/src/Modules/Runner/Automation.Runner/Domain/Entities/RunnerExecutorConfig.cs` (Thêm `Settings` JSONB, `IsEnabled`)
  - `api/src/Modules/Runner/Automation.Runner.Contracts/IRunnerApi.cs` (Thêm `GetExecutorConfigAsync(runnerId, executorKey)`)
  - `api/src/Modules/Pipeline/Automation.Pipeline/Engine/Orchestrator/Dispatchers/AgentSegmentDispatcher.cs` (Chuyển sang gọi `IRunnerApi`)
  - `web/src/features/runners/*` (Xây dựng Runner Configuration Workspace theo phong cách VS Code Settings)
* **Công việc cụ thể**:
  1. **Backend - Module Studio**:
     - Xóa thực thể `ProjectExecutorConfig.cs` và DbSet tương ứng trong `StudioDbContext`.
     - Xóa các slice `GetProjectExecutorConfigs`, `DeleteProjectExecutorConfig`, `UpsertProjectExecutorConfig`.
     - Tạo migration dọn dẹp bảng `ProjectExecutorConfigs` trong module Studio.
  2. **Backend - Module Runner**:
     - Bổ sung `public JsonDocument? Settings { get; set; }` và `public bool IsEnabled { get; set; } = true;` vào `RunnerExecutorConfig`.
     - Tạo migration cập nhật bảng `runner_executor_configs`.
     - Viết endpoint `GetRunnerExecutorConfigs` và `UpdateRunnerExecutorConfig` (nhận `Settings` JSON tự do).
     - Implement `IRunnerApi.GetExecutorConfigAsync(Guid runnerId, string executorKey)` trả về `ExecutablePath` và `Settings`.
  3. **Backend - Pipeline Engine**:
     - Trong `AgentSegmentDispatcher.cs`: Đọc cấu hình từ `IRunnerApi`. Nếu là executor `unreal`, tự động trích xuất file `.uproject` từ `settings.registeredProjects[projectId]`.
  4. **Frontend - Runner Configuration Workspace**:
     - Xây dựng giao diện Modal/Page cấu hình Runner theo chuẩn **VS Code Settings**:
       - Cột trái: Phân cấp categories (`General`, `Concurrency & Limits`, `Executors` -> Python, Blender, Unreal, Custom CLI, `Network & Proxy`).
       - Cột phải: Dùng **Registry Pattern** (`ExecutorConfigRegistry`) để render các extension controls:
         - Common fields: Executable Path + Browse + Validate Binary, Headless Flags.
         - Blender extension: Checkboxes GPU (`CUDA`, `OptiX`).
         - Unreal extension: `Registered Unreal Projects (.uproject)` có nút `+ Add Project` map `ProjectId -> Đường dẫn .uproject`.
* **Tiêu chí nghiệm thu**:
  - DB sạch sẽ không còn `ProjectExecutorConfigs`. Cấu hình Runner lưu trọn vẹn trong `Settings` JSONB. Pipeline Dispatcher tra cứu `.uproject` của Unreal chính xác từ Runner config.

---

### Phase 1.1: Backend Schema & Entity Foundation (Script Node Definition)

* **Mục tiêu**: Bổ sung các trường siêu dữ liệu vào thực thể `NodeDefinition` để hỗ trợ hash kiểm tra thay đổi, trạng thái vòng đời và chỉ định tool bị ghi đè.
* **Các file tác động**:
  - `api/src/Modules/Pipeline/Automation.Pipeline/Domain/Entities/NodeDefinition.cs`
  - `api/src/Modules/Pipeline/Automation.Pipeline/Domain/Enums/NodeLifecycleStatus.cs` (Mới)
  - `api/src/Modules/Pipeline/Automation.Pipeline/Infrastructure/Persistence/Migrations/*`
* **Công việc cụ thể**:
  1. Thêm các thuộc tính vào `NodeDefinition`:
     - `ContentHash` (string): SHA-256 hash của mã nguồn script.
     - `SemanticVersion` (string): Phiên bản SemVer (mặc định `"1.0.0"`).
     - `Status` (enum `NodeLifecycleStatus`: `Draft`, `InReview`, `Published`, `Deprecated`).
     - `SourceRepositoryPath` (string?): Đường dẫn file tương đối trong thư mục ghim.
     - `OverrideTargetRefId` (string?): RefId của Tool/Node bị ghi đè (nếu có).
  2. Tạo EF Core Migration bằng script CLI dự án: `.\cli migration add AddScriptManagementFields -m Pipeline`.
  3. Áp dụng migration vào CSDL.
* **Tiêu chí nghiệm thu**:
  - Bảng `automation_pipeline.node_definitions` có đầy đủ các cột mới, migration chạy thành công mà không gây lỗi DB.

---

### Phase 1.2: Event-Driven Reconciliation & Wolverine Edge Cleanup

* **Mục tiêu**: Xây dựng cơ chế cập nhật script đè (In-place Update) kèm 2 chiến lược xử lý dây cắm (`KeepCompatiblePins` vs `UnpinAll`) chạy bất đồng bộ qua Wolverine Event để API phản hồi tức thì < 50ms.
* **Các file tác động**:
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Nodes/UpdateCustomNode.cs`
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Nodes/Events/NodeDefinitionPinsChangedEvent.cs` (Mới)
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Nodes/Handlers/ReconcilePipelineEdgesHandler.cs` (Mới)
* **Công việc cụ thể**:
  1. Định nghĩa `EdgeReconciliationStrategy`:
     ```csharp
     public enum EdgeReconciliationStrategy
     {
         KeepCompatiblePins = 0,
         UnpinAll = 1
     }
     ```
  2. Cập nhật `UpdateCustomNodeCommand` & `Request` tiếp nhận `EdgeReconciliationStrategy`.
  3. Trong `UpdateCustomNodeHandler`: Sau khi cập nhật `NodeDefinition`, bắn sự kiện qua Wolverine:
     `await bus.PublishAsync(new NodeDefinitionPinsChangedEvent(...))`
  4. Viết `ReconcilePipelineEdgesHandler`:
     - Tìm tất cả `PipelineNode` có `RefId == node.Key`.
     - Lấy danh sách `PipelineEdge` liên quan.
     - Nếu `UnpinAll`: Xóa sạch edges.
     - Nếu `KeepCompatiblePins`: Giữ lại dây cắm nếu pin đích/nguồn vẫn tồn tại và cùng kiểu dữ liệu; chỉ tháo dây trỏ vào pin đã bị xóa hoặc đổi kiểu không tương thích.
     - **Structured Logging chi tiết**:
       - `[INFO] [Wolverine:Reconcile] Received event for NodeKey: {Key}`
       - `[DEBUG] [Wolverine:Reconcile] Found {NodeCount} nodes in {PipelineCount} pipelines.`
       - `[INFO] [Wolverine:Reconcile] Completed: Preserved {PreservedCount} edges, Detached {DetachedCount} edges.`
  5. Viết một Integration Test / Unit Test nhỏ để kiểm chứng việc gỡ dây nối tự động khi chạy handler.
* **Tiêu chí nghiệm thu**:
  - API trả về 200 OK ngay lập tức; Background Consumer dọn rác dây cắm chuẩn xác và in đầy đủ log ra terminal.

---

### Phase 1.3: Script Scanner & AST Parser Service (Backend & Runner)

* **Mục tiêu**: Cung cấp API quét thư mục script, phân tích cú pháp AST nhận diện chân cắm, docstrings, và phân loại trạng thái so sánh với Database.
* **Các file tác động**:
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Nodes/ScanScriptFolder.cs` (Mới)
  - `api/src/Modules/Pipeline/Automation.Pipeline/Features/Nodes/TestRunCustomNode.cs` (Mới)
  - `workers/worker/stages/base.py` hoặc runner test script (Hỗ trợ Test Run)
* **Công việc cụ thể**:
  1. Xây dựng Endpoint `POST /api/pipeline/nodes/scan-folder`:
     - Nhận danh sách metadata các file được quét (từ Desktop Tauri hoặc Local Runner).
     - So sánh với `NodeDefinition` trong DB và `ToolRegistry` (Builtin Tools).
     - Trả về danh sách `ScannedScriptDto`:
       - `FileName`, `SourcePath`, `ContentHash`.
       - `MatchStatus`: `New`, `Override`, `Modified`, `Synced`, `SyntaxError`.
       - `OverrideTarget`: Tên & RefId của Tool bị đè (nếu có tag `@override` hoặc trùng Key).
       - `PinDiff`: Danh sách pin mới thêm, pin bị xóa, pin đổi kiểu.
  2. Xây dựng Endpoint `POST /api/pipeline/nodes/test-run`:
     - Cho phép gửi script và mock input values để Runner chạy thử nghiệm trong sandbox và trả về log kết quả.
* **Tiêu chí nghiệm thu**:
  - Gọi API scan folder trả về chính xác trạng thái diff của từng file; gọi test-run chạy ra log thực tế.

---

### Phase 1.4: Frontend "Script Ingestion Deck" UI (No Modals)

* **Mục tiêu**: Xây dựng giao diện trực quan tại `/projects/:projectId/scripts` theo chuẩn Deck Sidebar (PowerPoint-style), không dùng modal gây phiền toái.
* **Các file tác động**:
  - `web/src/features/pipelines/pages/ScriptManagementPage.tsx` (Mới)
  - `web/src/features/pipelines/components/scripts/ScriptSidebarDeck.tsx` (Mới)
  - `web/src/features/pipelines/components/scripts/ScriptMainInspector.tsx` (Mới)
  - `web/src/features/pipelines/components/scripts/VisualPinMapper.tsx` (Mới)
  - `web/src/features/pipelines/components/scripts/MonacoDiffViewer.tsx` (Mới)
* **Công việc cụ thể**:
  1. **Top Bar**:
     - Hiển thị Folder Path hiện tại, nút `[📂 Chọn Thư Mục]` (gọi Tauri native dialog hoặc file picker), nút `[🔄 Quét Lại]`, nút `[✓ Đồng Bộ Tất Cả]`.
  2. **Sidebar Preview bên trái**:
     - Danh sách thẻ thu nhỏ (Mini-Cards).
     - Badge màu: 🟢 `NEW`, 🔄 `OVERRIDE -> [Target]`, 🟡 `MODIFIED`, ⚪ `SYNCED`.
     - Chấm tròn trực quan Mini Pin Visual (inputs bên trái, outputs bên phải).
  3. **Main Inspector bên phải**:
     - Header hiển thị tên script, version, trạng thái.
     - **Visual Pin Mapper**: Bảng cấu hình các Pin (ID, Tên, Kiểu dữ liệu, Bắt buộc, Giá trị mặc định).
     - **Monaco Code & Diff View**: Hiển thị code Python hoặc so sánh 2 cột nếu là `MODIFIED` / `OVERRIDE`.
     - **In-place Breaking Change Action Bar**:
       - Radios chọn: `Keep Compatible Pins (Mặc định)` vs `Unpin All Relative Nodes`.
       - Nút `[▶ Chạy Thử Trên Runner]` và `[✓ Xuất Bản / Lưu Node]`.
* **Tiêu chí nghiệm thu**:
  - Thao tác chuyển đổi giữa các script mượt mà; xem code diff rõ ràng; bấm Publish gửi đúng payload kèm strategy mà không hề bật modal popup.

---

### Phase 1.5: End-to-End Verification & Debug Logs Audit

* **Mục tiêu**: Chuẩn bị bộ script mẫu để kiểm chứng toàn bộ luồng hoạt động thực tế trên CSDL mới dọn sạch.
* **Công việc cụ thể**:
  1. Tạo thư mục thử nghiệm `test_scripts/` với 3 kịch bản:
     - `script_new.py`: Script mới tinh với 2 input, 1 output.
     - `script_override.py`: Script có tag `@override: builtin.mesh_cleaner`.
     - `script_modified.py`: Tạo bản v1 trước, sau đó sửa code đổi kiểu 1 pin.
  2. Tạo 1 pipeline mẫu kiểm chứng với 1 node cắm dây vào `script_modified`.
  3. Kích hoạt Publish từ UI và quan sát toàn bộ **4 chặng Debug Log** trên Console Terminal:
     - Log Scanner $\rightarrow$ Log Update API $\rightarrow$ Log Wolverine Edge Cleanup $\rightarrow$ Log SignalR.
* **Tiêu chí nghiệm thu**:
  - Dây cắm lỗi bị tháo dỡ chính xác; dây cắm hợp lệ được bảo toàn; terminal log hiển thị rõ ràng, dễ hiểu.

---

## 🚀 Sẵn Sàng Bắt Đầu

Sau khi bạn xác nhận kế hoạch thực thi này, chúng ta sẽ bắt tay ngay vào **Phase 0: Tinh Gọn Runner & Executors (Xóa bỏ ProjectExecutorConfig thừa, nâng cấp RunnerExecutorConfig JSONB)**.
