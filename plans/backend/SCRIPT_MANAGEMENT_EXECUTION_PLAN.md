# Kế Hoạch Thực Thi: Quản Lý Script & Custom Nodes Tập Trung Trong Studio (Shared Scripts & In-place Governance)

> **Vị trí**: `plans/backend/SCRIPT_MANAGEMENT_EXECUTION_PLAN.md`  
> **Phiên bản**: v2.0 (2026-09-28) — Cập nhật sau phản hồi thực chiến và loại bỏ over-engineering  
> **Mục tiêu cốt lõi**:
> 1. **Dọn sạch nền móng Runner & Executors**: Dồn toàn bộ cấu hình máy trạm về `RunnerExecutorConfig` (JSONB `Settings`), xóa bỏ `ProjectExecutorConfig` thừa.
> 2. **Xây dựng hệ thống Quản lý Script cho Studio**:
>    - Hỗ trợ **Batch Script Upload** (kéo thả nhiều file script Python một cách tự nhiên).
>    - **Core Immutability**: Builtin Tools (C# Resolver Tools, Core Tools) là bất di bất dịch, không bao giờ bị ghi đè.
>    - **User Script Override Only**: Override chỉ áp dụng khi người dùng/đồng đội muốn cập nhật đè phiên bản mới lên một Custom Node của người dùng đã có trong Studio.
>    - **PinDiff & Impact Analysis (Breaking Changes Guard)**: AST Parser bóc tách chân cắm, so sánh Pin Diff với DB, cảnh báo các Pipeline bị ảnh hưởng và áp dụng `EdgeReconciliationStrategy` dọn dẹp dây cắm bất đồng bộ qua Wolverine.
> 3. **Đón đầu tương lai**: Tích hợp Sandbox Test Run trên Runner và Automation Studio MCP Server (AI Agents).

---

## 🗺️ Tổng Quan Các Phase & Trạng Thái Thực Tế

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: TINH GỌN RUNNER & EXECUTORS (NỀN MÓNG)          [PARTIAL 85%] │
│ • Backend: Xóa ProjectExecutorConfig, nâng cấp RunnerExecutorConfig   │
│   (Settings JSONB, IsEnabled) và IRunnerApi                           │
│ • Frontend: Hoàn thiện Runner Settings Workspace                       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.1: BACKEND SCHEMA & ENTITY FOUNDATION               [DONE 100%]│
│ • NodeDefinition: ContentHash, Status, SemanticVersion,                │
│   OverrideTargetRefId, SourceRepositoryPath                            │
│ • EF Core Migration đã áp dụng                                         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.2: EVENT-DRIVEN RECONCILIATION & WOLVERINE          [DONE 100%]│
│ • EdgeReconciliationStrategy (KeepCompatiblePins vs UnpinAll)          │
│ • Wolverine Event NodeDefinitionPinsChangedEvent                       │
│ • Consumer ReconcilePipelineEdgesHandler dọn dẹp dây cắm ngầm         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.3: BATCH UPLOAD, PIN DIFF & IMPACT ANALYSIS          [DONE 100%]│
│ • AST Parser: Bóc tách pins (Inputs/Outputs) từ script Python          │
│ • PinDiff & Impact Service: So sánh chân cắm với DB, cảnh báo          │
│   số lượng Pipeline/Node bị ảnh hưởng                                  │
│ • Batch Upload & In-place Override API (Chỉ override User Script)      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.4: FRONTEND CUSTOM NODE MANAGEMENT & INGESTION       [DONE 100%]│
│ • Quản lý danh sách Custom Nodes (Trạng thái Draft/Published, Version) │
│ • Batch Upload Drawer: Kéo thả nhiều file script .py                   │
│ • PinDiff & Impact Preview Dialog (Cảnh báo Breaking Changes,          │
│   lựa chọn KeepCompatiblePins vs UnpinAll)                             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1.5: END-TO-END VERIFICATION & TESTING                           │
│ • Kiểm chứng upload file mới & override custom node cũ                 │
│ • Kiểm chứng dọn dẹp dây cắm Pipeline thật bởi Wolverine Handler       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FUTURE PHASES (DÀNH CHO GIAI ĐOẠN SAU)                                 │
│ • Phase 2 (Future): Script Sandbox Test Run trên Runner thật           │
│ • Phase 3 (Future): Automation Studio MCP Server (Cursor/Claude Agent) │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Chi Tiết Từng Phase Thực Thi

### Phase 0: Tinh Gọn Runner & Executors (Nền Móng Bắt Buộc)

* **Trạng thái**: Đã hoàn thành 85% (Backend core đã xong, chỉ còn giao diện frontend settings).
* **Mục tiêu**: Loại bỏ sự phân mảnh kiến trúc. Xóa sổ thực thể `ProjectExecutorConfig` thừa thãi bên `Studio`, chuyển toàn bộ cấu hình máy trạm (Blender flags, GPU, Python venv, Unreal registered projects) về duy nhất `RunnerExecutorConfig` với cột `JSONB Settings`.
* **Hiện trạng code**:
  - ✅ Đã xóa `ProjectExecutorConfig.cs` và DbSet tương ứng khỏi `StudioDbContext`.
  - ✅ Đã xóa các slice CRUD `ProjectExecutorConfigs` cũ.
  - ✅ Đã thêm `Settings` (JSONB) và `IsEnabled` vào `RunnerExecutorConfig.cs`.
  - ✅ `IRunnerApi` đã có `GetExecutorConfigAsync(runnerId, executorKey)`.
  - 🔄 Frontend: Hoàn thiện bảng `RunnerExecutorConfig` theo phong cách VS Code Settings (phân nhóm Executors, map `.uproject` cho Unreal).

---

### Phase 1.1: Backend Schema & Entity Foundation (ĐÃ HOÀN THÀNH ✅)

* **Trạng thái**: Hoàn thành 100%.
* **Nội dung đã triển khai**:
  - `NodeDefinition.cs` đã được bổ sung đầy đủ:
    - `ContentHash` (string): SHA-256 hash của mã nguồn script.
    - `SemanticVersion` (string): Phiên bản SemVer (mặc định `"1.0.0"`).
    - `Status` (enum `NodeLifecycleStatus`: `Draft`, `InReview`, `Published`, `Deprecated`).
    - `SourceRepositoryPath` (string?): Đường dẫn lưu trữ hoặc tên file tương đối.
    - `OverrideTargetRefId` (string?): RefId của Custom Node bị ghi đè (nếu là override).
  - Đã có EF Core Migration áp dụng vào CSDL PostgreSQL.

---

### Phase 1.2: Event-Driven Reconciliation & Wolverine Edge Cleanup (ĐÃ HOÀN THÀNH ✅)

* **Trạng thái**: Hoàn thành 100%.
* **Nội dung đã triển khai**:
  - Đã định nghĩa `EdgeReconciliationStrategy`:
    - `KeepCompatiblePins = 0` (Giữ nguyên dây nối tương thích, chỉ tháo dây vào pin bị xóa hoặc đổi kiểu không tương thích).
    - `UnpinAll = 1` (Rút sạch dây nối trên toàn bộ Pipeline sử dụng node này để cấu hình lại từ đầu).
  - Đã có Wolverine Event `NodeDefinitionPinsChangedEvent`.
  - Đã có Wolverine Consumer `ReconcilePipelineEdgesHandler`:
    - Quét các `PipelineNode` có `RefId == node.Key`.
    - Phân tích và tháo dỡ các `PipelineEdge` lỗi ngầm trong background mà không làm chậm HTTP API (< 50ms).
    - Structured Logging đầy đủ vào Console Terminal.

---

### Phase 1.3: Batch Upload, Pin Diff & Impact Analysis Service (ĐÃ HOÀN THÀNH ✅)

* **Triết lý điều chỉnh sau phản hồi**:
  - ❌ **Loại bỏ**: Cơ chế scan folder tự động ngầm phức tạp, file watcher cồng kềnh, quy ước tag `@override` trong script.
  - ✅ **Tập trung vào giá trị thực**:
    1. **Batch Upload**: Người dùng có thể chọn hoặc kéo thả nhiều file `.py` cùng lúc lên giao diện Studio.
    2. **Quy tắc Override chuẩn mực của Studio**:
       - **Builtin Tools (Core Tools)**: Bất di bất dịch. Không cho phép script người dùng ghi đè lên Builtin Tools.
       - **User Scripts (Custom Nodes)**: Chỉ cho phép ghi đè lên các Custom Node của người dùng (khi script upload có cùng Key hoặc người dùng chủ động chọn đè lên một Custom Node cũ).
    3. **Pin Diff & Impact Analysis**:
       - Backend AST Parser phân tích script Python để trích xuất danh sách Pin (`Inputs` và `Outputs`).
       - So sánh Pin giữa file script mới và `NodeDefinition` hiện có trong DB:
         - 🟢 Pin mới được thêm vào (`AddedPins`).
         - 🔴 Pin bị xóa (`RemovedPins`) ➔ Tiềm ẩn Breaking Change!
         - 🟡 Pin bị đổi kiểu dữ liệu (`ModifiedPins`) ➔ Tiềm ẩn Breaking Change!
       - **Thống kê tác động (Impact Summary)**:
         - Đếm số lượng Pipeline (`affectedPipelineCount`) và số Node instances (`affectedNodeCount`) đang sử dụng Node này trong Studio.
         - Dự báo số lượng dây nối (`affectedEdgesCount`) sẽ bị ngắt kết nối nếu chọn chiến lược `KeepCompatiblePins` hoặc `UnpinAll`.

* **Các file & Endpoint đã xây dựng**:
  1. Sử dụng `PythonScriptSchemaParser.cs` (Tree-sitter AST).
  2. Endpoint `POST /api/pipeline/nodes/custom/analyze-batch` (`AnalyzeCustomNodesBatch.cs`).
  3. Endpoint `POST /api/pipeline/nodes/custom/batch-upsert` (`BatchUpsertCustomNodes.cs`).

---

### Phase 1.4: Frontend Custom Node Management & Ingestion UI (ĐÃ HOÀN THÀNH ✅)

* **Mục tiêu**: Xây dựng giao diện quản lý Custom Node hiện đại, trực quan tại Node Library với khả năng kéo thả nhiều file script và duyệt Breaking Changes.
* **Các thành phần đã xây dựng**:
  1. Nút **Batch Upload Scripts** trên Header của `NodeLibrary.tsx`.
  2. Component `BatchUploadScriptsDialog.tsx`:
     - Drag & Drop zone hỗ trợ đa file `.py`.
     - Preview danh sách node với Badge `New Node` vs `Override Existing Node`.
     - Cảnh báo tác động dây nối (`AlertTriangle`).
     - Hiển thị Pin Diff trực quan (`Added`, `Removed`, `TypeChanged`).
     - Lựa chọn chiến lược dọn dây nối `KeepCompatiblePins` vs `UnpinAll`.
     - Đồng bộ API qua `useAnalyzeCustomNodesBatchMutation` và `useBatchUpsertCustomNodesMutation`.
       - Hiển thị bảng **Pin Diff**: Cảnh báo rõ ràng các pin bị xóa hoặc đổi kiểu dữ liệu.
       - Hiển thị hộp cảnh báo tác động: *"Script này đang được sử dụng trong 2 Pipeline. Có 3 dây cắm sẽ bị tháo dỡ."*
       - Lựa chọn chiến lược dọn dây nối:
         - `(●) Keep Compatible Pins` (Mặc định - Giữ dây hợp lệ, tháo dây gãy).
         - `( ) Unpin All Connections` (Rút sạch dây nối để cấu hình lại).
       - Tích hợp Monaco Editor xem Side-by-Side Diff giữa code cũ và code mới.
  4. Nút `[Publish All / Save Nodes]` để hoàn tất lưu trữ vào Studio.

---

### Phase 1.5: End-to-End Verification & Edge Reconciliation Testing

* **Mục tiêu**: Kiểm chứng toàn diện luồng nghiệp vụ trên môi trường thật.
* **Kịch bản kiểm thử**:
  1. **Upload script mới**: Kéo thả 2 file script Python vào giao diện ➔ Hệ thống parse chân pin chính xác ➔ Lưu thành công vào `NodeDefinition`.
  2. **Override custom node có breaking change**:
     - Đặt một Custom Node vào một Pipeline và cắm 3 dây nối vào các chân `input_a`, `input_b`, `input_c`.
     - Upload phiên bản mới của script đã xóa chân `input_b` và đổi kiểu `input_c`.
     - Giao diện hiển thị đúng Pin Diff và số dây bị ảnh hưởng.
     - Chọn `KeepCompatiblePins` và bấm Publish.
     - Kiểm tra Database & Pipeline Canvas: Dây nối vào `input_a` còn nguyên; dây nối vào `input_b` và `input_c` đã được tháo dỡ sạch sẽ bởi Wolverine Handler.

---

## 🔮 Các Giai Đoạn Tương Lai (Future Phases)

Sau khi hệ thống Quản lý Script và Custom Nodes hoạt động trơn tru trong Studio, các tính năng nâng cao sau sẽ được triển khai:

### Phase 2 (Future): Script Sandbox Test Run Trên Runner Thật

* **Mục tiêu**: Cho phép Technical Artist kiểm tra chạy thử script trên Runner máy trạm (Blender/Unreal headless) với dữ liệu giả lập (mock inputs) trước khi chính thức Publish vào thư viện Studio.
* **Cơ chế**:
  - Gửi lệnh test-run qua gRPC/RabbitMQ tới Runner chỉ định.
  - Runner khởi chạy subprocess cách ly, chuyển mock inputs vào script và thu thập logs stdout/stderr và kết quả outputs.
  - Stream kết quả trực tiếp về giao diện Studio để người dùng thấy log chạy thực tế.

### Phase 3 (Future): Automation Studio MCP Server (Model Context Protocol)

* **Mục tiêu**: Mở rộng giao thức MCP để các AI Coding Agent (Cursor, Claude Desktop, Antigravity) có thể tương tác trực tiếp với Automation Studio.
* **Cấu trúc Sub-project**: `Automation.Mcp` hỗ trợ JSON-RPC over SSE / Stdio.
* **Bộ MCP Tools tiêu chuẩn**:
  - `pipeline_list_projects`: Lấy danh sách dự án và ngữ cảnh Studio.
  - `pipeline_get_node_catalogue`: Truy vấn danh mục tool và node hiện có để AI học cách phối hợp.
  - `pipeline_parse_python_script`: AI gửi script để backend kiểm tra tính hợp lệ và bóc tách chân cắm AST.
  - `pipeline_test_run_node`: AI yêu cầu Runner chạy thử nghiệm mã vừa sinh ra.
  - `pipeline_upsert_custom_node`: AI nạp Custom Node ở trạng thái `Draft` lên Studio để người dùng duyệt.
  - `pipeline_trigger_execution`: AI kích hoạt chạy thử nghiệm Pipeline từ xa.

---

## 📋 Tóm Tắt Nhiệm Vụ Tiếp Theo

Sau khi hoàn tất cập nhật các tài liệu plan:
1. Tiếp tục triển khai **Phase 1.3: Batch Upload, Pin Diff & Impact Analysis Service** trong backend `Automation.Pipeline`.
