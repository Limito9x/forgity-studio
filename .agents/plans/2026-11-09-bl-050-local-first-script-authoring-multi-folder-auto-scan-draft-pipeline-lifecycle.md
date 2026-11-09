# BL-050: Local-First Script Authoring, Multi-Folder Auto-Scan & Draft Pipeline Lifecycle

> **Mã công việc**: `BL-050`  
> **Trạng thái**: `Pending` *(Sẵn sàng triển khai sáng 10/11/2026)*  
> **Ngày tạo**: 09/11/2026  
> **Phạm vi**:
> - `web/` & `web/src-tauri/` (Local Watched Folders Store, Local Draft Nodes & Local Draft Pipelines Store, Multi-Folder Native Scanner, Canvas Local Draft Mode)
> - `api/src/Modules/Pipeline/` (Stateless AST & Contract Resolution API, Ephemeral/Transient Draft Execution Engine & One-Shot Publish Bundler)
> - `runner/` (`StageDispatcher` direct local `script_path` execution bypass khi `script_url` trống)

---

## 1. Tầm Nhìn & Triết Lý Kiến Trúc (Executive Summary)

Qua thực tiễn phát triển các pipeline DCC (Blender, Unreal Engine, Daz3D) và đối chiếu với các công cụ tiêu chuẩn ngành như **ComfyUI**, **Autodesk Dynamo**, và **Houdini**, chúng ta xác lập **Ranh giới Kiến trúc Tối hậu**:

### 1.1. Nguyên Tắc Bất Di Bất Dịch: "Đã là Draft thì 100% nằm ở Máy Local, TUYỆT ĐỐI KHÔNG ghi vào Database chung của Studio!"
- **Tại sao không lưu Draft vào Database (`NodeDefinitions`, `Pipelines`, `PipelineSnapshots`)?**
  1. **Tránh lộ rác cá nhân cho cả Team**: Khi một Developer/TA đang thử nghiệm script `test_bake.py` tại `D:/Users/Cong/...` hoặc vẽ một đồ thị nháp đang dang dở, đồng nghiệp mở máy khác lên **không được phép nhìn thấy** những bản nháp chưa hoàn thiện này.
  2. **Tránh ô nhiễm `PipelineSnapshots` và CAS Storage**: Trong vòng lặp `Edit ➔ Run ➔ Debug` (50–100 lần/ngày), nếu mỗi lần sửa hoặc chạy thử lại sinh ra `PipelineSnapshot` hoặc upload file lên S3/Postgres thì Database sẽ biến thành bãi rác.
  3. **Tránh xung đột đa người dùng**: Hai người cùng sửa thử nghiệm trên máy cá nhân sẽ hoàn toàn cô lập, chỉ khi nào bấm **Publish** mới hợp nhất lên DB chính thức của Studio.

### 1.2. Phân Tách 2 Luồng Hoạt Động Rạch Ròi Trên Hệ Thống

| Tiêu chí | Luồng 1: LOCAL DRAFT (Sandbox Cá Nhân trên Desktop) | Luồng 2: PUBLISHED STUDIO (Chính Thức cho Team) |
| :--- | :--- | :--- |
| **Nơi lưu trữ Script Nodes** | **100% trên máy Desktop** (`IndexedDB` / `localStorage` + file `.py` gốc trên ổ cứng tại `WatchedFolders`). | **Bảng `NodeDefinitions` trên PostgreSQL** + File `.py` đã băm SHA-256 trên **CAS Storage (MinIO/S3)**. |
| **Nơi lưu trữ Đồ thị Pipeline** | **100% trên máy Desktop** (Local Draft Pipeline JSON hoặc Local Working Copy chưa publish). | **Bảng `Pipelines` & `PipelineSnapshots` bất biến (`v1, v2...`)** trên PostgreSQL. |
| **Cách phân giải Chân Pin (AST + Structs)** | Gọi API **Vô trạng thái (Stateless)**: `POST /nodes/analyze-stateless` $\rightarrow$ Backend parse AST + ghép `StructType` rồi **trả JSON về ngay, KHÔNG lưu DB**. | Đọc từ `NodeDefinitions` đã lưu trong DB. |
| **Cách Thực Thi (`Run`)** | **`RunTransientDraftPipeline`**: Desktop gửi kèm công thức (`GraphData` + `LocalScriptDefinitions` với `FullPath`) $\rightarrow$ Backend dựng đồ thị trong RAM (`TransientPipelineGraphFactory`), **KHÔNG tạo `PipelineSnapshot`**, khóa cứng vào **Local Desktop Runner** và chạy trực tiếp file trên đĩa! | **`RunPipeline` chuẩn**: Đọc từ `PipelineSnapshot` bất biến trong DB, tải script qua `ScriptUrl` về cache của bất kỳ Runner nào trong Farm. |
| **Đối với `Resources` (FBX, Blend, Texture)** | **Giữ nguyên Sync Draft trên DB Repository** để đóng vai trò **"Phép thử thật" (Production Simulation)**, đảm bảo khi Artist sync tài nguyên lên chạy sẽ khớp 100% với lúc TA thiết kế. | Giữ nguyên vòng đời `Repository ➔ Resource ➔ Content Anchor`. |

---

## 2. Kiến Trúc Luồng Dữ Liệu (Mental Model)

```mermaid
flowchart TD
    subgraph Desktop ["1. Tauri Desktop Workstation (100% Local Persistence)"]
        VSCode["VS Code / IDE\n(Sửa file .py trực tiếp trên đĩa)"]
        WatchDirs["Watched Folders (Local Disk)\nVD: D:/.../pipeline-scripts"]
        LocalStore[("Local Desktop Store (IndexedDB)\n- watchedFolders[]\n- localDraftNodes[]\n- localDraftPipelines[]")]
        LocalRunner["Forgity Native Rust Runner\n(Local Workstation Identity)"]
    end

    subgraph BackendStateless ["2. Backend .NET 10 — Chế Độ Stateless & Ephemeral (Khi Dev/Draft)"]
        StatelessAPI["POST /nodes/analyze-stateless\n(NativePythonScriptAnalyzer +\nINodeContractResolver)"]
        TransientRun["POST /pipelines/run-transient-draft\n(TransientPipelineGraphFactory in-RAM\nKHÔNG tạo PipelineSnapshot)"]
    end

    subgraph BackendStudio ["3. Backend .NET 10 — Chế Độ Published (Khi Chốt Cho Team)"]
        PublishAPI["POST /pipelines/publish-from-draft\n(Thâu tóm 1 lượt)"]
        DB[("PostgreSQL Studio DB\n- NodeDefinitions (Published)\n- Pipelines & PipelineSnapshots (v1, v2)\n- CAS AssetLinks (SHA-256)")]
    end

    VSCode -->|Ctrl + S| WatchDirs
    WatchDirs -->|Quét .py + SHA-256| StatelessAPI
    StatelessAPI -->|Trả về Full Resolved Pins\n(0 DB Write)| LocalStore

    LocalStore -->|Bấm Run Draft\n(Gửi Graph + FullPath Scripts)| TransientRun
    TransientRun -->|Khóa cứng LocalRunnerId\nscript_path = D:/.../bake.py| LocalRunner
    LocalRunner -->|Thực thi trực tiếp từ ổ đĩa\n(0 Upload / 0 Download)| WatchDirs

    LocalStore -.->|Khi hoàn tất 100%: Bấm PUBLISH| PublishAPI
    PublishAPI -.->|Upload Scripts lên CAS +\nTạo PipelineSnapshot v1| DB
```

---

## 3. Thiết Kế Kỹ Thuật Chi Tiết

### 3.1. Tầng Lưu Trữ Cục Bộ Trên Tauri Desktop (`LocalStudioDraftStore`)
Toàn bộ trạng thái nháp của Developer được quản lý tại Frontend/Desktop (sử dụng Zustand + `persist` vào `IndexedDB` / `localStorage` theo từng `projectId`):

1. **`watchedFolders: WatchedScriptFolder[]`**:
   - Danh sách nhiều thư mục trên ổ cứng máy tính được người dùng chọn qua **Tauri Native Folder Picker** (`open({ directory: true })`).
   - Ví dụ:
     - `D:/FullStack/Automation/pipeline-scripts`
     - `E:/MyCustomDCCScripts/unreal`
2. **`localDraftNodes: Record<string, LocalDraftNodeDefinition>`**:
   - Lưu toàn bộ các Script Node được quét từ `watchedFolders` kèm kết quả phân giải chân Pin từ Backend:
     ```ts
     export interface LocalDraftNodeDefinition {
       key: string;                 // VD: "blender/bake_character"
       name: string;
       label: string;
       executor: string;            // "blender" | "unreal" | "python"
       scriptFullPath: string;      // VD: "D:/FullStack/Automation/pipeline-scripts/blender/bake_character.py"
       folderRootPath: string;
       contentHash: string;         // SHA-256 tính tại local
       inputs: PinDefinitionDto[];  // Đã được Backend resolve đầy đủ
       outputs: PinDefinitionDto[];
       dependencies: ScriptDependencyDto[];
       lastSyncedAt: string;
     }
     ```
3. **`localDraftPipelines: Record<string, LocalDraftPipelineDocument>`**:
   - Khi người dùng tạo một **Local Draft Pipeline** (hoặc bật chế độ *Local Draft Sandbox*):
     - Đồ thị (`nodes`, `edges`, `parameters`) lưu tức thì (0ms) ngay trong máy Desktop mà không gọi `SavePipelineGraph` lên DB và không sinh `PipelineSnapshot`.
     - Các tham số File/Asset trên node có thể chọn trực tiếp đường dẫn thật trên máy (`FullPath`).

---

### 3.2. Bộ Phân Giải Chân Pin Vô Trạng Thái (Stateless Node Contract Analyzer API)
- **Mục tiêu**: Biến mã nguồn Python `.py` trên máy Desktop thành một Node hoàn chỉnh có đầy đủ `Inputs`, `Outputs`, `Literal` select options, `Asset` file pins, `Dependencies` và kiểm tra khớp `StructType` của Project — **nhưng hoàn toàn KHÔNG ghi vào DB**.
- **Endpoint mới**: `POST /api/projects/{projectId}/nodes/analyze-batch-stateless`
  - **Request**:
    ```csharp
    public record StatelessScriptAnalyzeItem(
        string Key,
        string FileName,
        string FullPath,
        string? ExecutorHint,
        string Content,
        string ContentHash
    );
    public record AnalyzeBatchStatelessRequest(
        Guid ProjectId,
        List<StatelessScriptAnalyzeItem> Scripts
    );
    ```
  - **Xử lý tại Backend**:
    - Chạy song song (`Parallel / Task.WhenAll`) qua `IScriptSchemaAnalyzer.AnalyzeAsync(item.Content, item.FileName)`.
    - Áp dụng đầy đủ quy tắc chuẩn hóa Pin của `PipelineNodeContractResolver` (nhận diện `PinPrimitiveType.Asset`, `AllowedExtensions`, `StructType`, `FlowPinHelper.WithExecPins`).
    - Trả về danh sách `ResolvedLocalNodeDto` về cho Tauri Desktop lưu vào `localDraftNodes`.
    - **Zero Database Write**: Không chạm vào `db.NodeDefinitions`, không chạm vào `IAssetApi`.

---

### 3.3. Luồng Thực Thi Đồ Thị Nháp Tạm Thời (`RunTransientDraftPipeline` — Không Cần `PipelineSnapshot`)
Đây là điểm thay đổi cốt lõi mà bạn vừa chỉ ra về luồng `Snapshot` trên API:
- **Hiện tại**: `RunPipeline.cs` bắt buộc đọc `Pipeline` từ DB, bắt buộc khóa `PipelineSnapshot` vào bảng `PipelineSnapshots` (dòng 148–175), và `PipelineOrchestrator` đọc `db.NodeDefinitions` từ DB.
- **Thiết kế mới cho `RunTransientDraftPipeline`** (`POST /api/projects/{projectId}/pipelines/run-draft`):
  1. **Payload gửi lên khi bấm Run Draft**:
     - `GraphData`: Toàn bộ `Nodes`, `Edges`, `Parameters` hiện tại trên Canvas.
     - `LocalScriptDefinitions`: Danh sách các `LocalDraftNodeDefinition` đang dùng trong đồ thị (chứa `Key`, `Executor`, `ScriptFullPath`, `ContentHash`, `Inputs`, `Outputs`, `Dependencies`).
     - `TargetLocalRunnerId`: ID của Local Workstation Runner trên chính máy Desktop đó (lấy từ `useLocalMachineIdentity` của `BL-047`).
     - `RuntimeInputs`: Các giá trị input lúc chạy.
  2. **Cách Engine xử lý mà KHÔNG CẦN tạo `PipelineSnapshot` trong DB**:
     - Tạo đối tượng `Pipeline` ảo trong RAM (qua `TransientPipelineGraphFactory`) và nạp các `LocalScriptDefinitions` thành các `NodeDefinition` ảo trong RAM (với `SourceRepositoryPath = ScriptFullPath`).
     - Validate hợp đồng đồ thị qua `IPipelineContractValidator` (kèm các `NodeDefinition` ảo này).
     - Khởi tạo phiên thực thi (`PipelineExecution` với `SnapshotId = null` và lưu toàn bộ công thức `TransientGraph + LocalScriptDefinitions` vào `ExecutionState` JSONB để khi Runner trả kết quả callback qua RabbitMQ/gRPC thì `PipelineOrchestrator.ExecuteOrResumeAsync` khôi phục lại đúng đồ thị và definitions từ `ExecutionState` mà không cần bảng `PipelineSnapshots` hay `NodeDefinitions`!).
  3. **Tại `RunnerSegmentDispatcher.cs`**:
     - Khi step trỏ tới một `LocalDraftNode` (có `SourceRepositoryPath` là `FullPath` và không có `AssetLink`):
       - Bỏ qua hoàn toàn việc gọi `assetApi.GetFilesAsync()`.
       - Gán thẳng `step.ScriptPath = def.SourceRepositoryPath` (VD: `D:/FullStack/Automation/pipeline-scripts/blender/bake.py`) và `step.ScriptUrl = null`.
       - Khóa cứng `effectiveRunnerId = TargetLocalRunnerId`.
  4. **Tại Rust Runner (`runner/src/core/dispatcher.rs` & `stage_runner_guest.py`)**:
     - Khi `script_url` là `None`, `dispatcher.rs` giữ nguyên `step.script_path` (`D:/FullStack/...`).
     - Kiểm tra nhanh `Path::new(&step.script_path).is_file()`, log rõ: `[LocalDraft] Executing local script directly from disk: ...` và nạp thẳng vào Blender / Unreal / Python guest runner!

---

### 3.4. Quy Trình "Thâu Tóm 1 Lượt & Publish" (`PublishDraftToStudio`)
Khi người dùng đã thử nghiệm xong ở chế độ Local Draft và muốn đưa Pipeline + Scripts lên Studio cho cả nhóm cùng sử dụng:
- Bấm nút **"Publish to Studio"**:
  1. **Thâu tóm Scripts**:
     - Tauri Desktop đọc nội dung các file `.py` từ `scriptFullPath` của các node có mặt trong Pipeline (hoặc các node được chọn Publish).
     - Tự động upload lên CAS Storage (`IAssetApi`), băm SHA-256 và gọi `BatchUpsertCustomNodes` để lưu chính thức vào bảng `NodeDefinitions` (`Status = Published`).
  2. **Thâu tóm File Parameters (nếu có)**:
     - Nếu chân pin nào đang trỏ đường dẫn file tạm trên đĩa, hỗ trợ đóng gói upload thành `AssetLink` chuẩn.
  3. **Đóng băng `Pipeline` & `PipelineSnapshot`**:
     - Lưu đồ thị vào bảng `Pipelines` và tạo bản chụp `PipelineSnapshot` (`v1`, `v2`...) chính thức trong Database!

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Implementation)

### Phase 1: Tauri Multi-Folder Scanner & Stateless Analyzer API
- [ ] **1.1 (Tauri Rust)**: Thêm command `scan_local_script_folders` trong `web/src-tauri/src/lib.rs` quét đệ quy nhiều thư mục, lọc file `.py`, tính SHA-256 và trả về nội dung.
- [ ] **1.2 (Backend .NET)**: Tạo Endpoint vô trạng thái `POST /api/projects/{projectId}/nodes/analyze-batch-stateless` phân tích hàng loạt script qua `IScriptSchemaAnalyzer` và chuẩn hóa `PinDefinition` mà **không lưu DB**.
- [ ] **1.3 (Frontend Store)**: Xây dựng `useLocalDraftStudioStore.ts` (lưu `watchedFolders`, `localDraftNodes`, `localDraftPipelines` vào IndexedDB/localStorage) kèm cơ chế **Hash Short-Circuit** (chỉ gửi những file `.py` có SHA-256 thay đổi lên API analyze).

### Phase 2: Ephemeral Draft Execution Engine (Chạy Trực Tiếp Không Cần DB Snapshot)
- [ ] **2.1 (Backend Runtime)**: Nâng cấp `PipelineExecutionState` để mang theo `TransientGraphData` và `TransientNodeDefinitions` cho các lượt chạy Draft (`SnapshotId = null`).
- [ ] **2.2 (Backend Dispatcher)**: Nâng cấp `RunnerSegmentDispatcher.cs` và `PipelineOrchestrator.cs`:
  - Khôi phục đồ thị tạm và `TransientNodeDefinitions` từ `ExecutionState` trong suốt vòng đời chạy (bao gồm cả khi resume sau khi Runner chạy xong Stage).
  - Cho phép node có `SourceRepositoryPath` (FullPath) bypass `assetApi.GetFilesAsync` và truyền thẳng `ScriptPath = SourceRepositoryPath`, `ScriptUrl = null` xuống Runner.
  - Khóa cứng `TargetRunnerId` vào Local Desktop Runner của máy người dùng.
- [ ] **2.3 (Backend Endpoint)**: Tạo Endpoint `POST /api/projects/{projectId}/pipelines/run-draft` nhận trực tiếp đồ thị nháp + danh sách script local và kích hoạt chạy ngay lập tức.
- [ ] **2.4 (Rust Runner)**: Tinh chỉnh `runner/src/core/dispatcher.rs` kiểm tra và log rõ khi chạy script trực tiếp từ `script_path` local mà không có `script_url`.

### Phase 3: Giao Diện Local-First Node Library, Canvas Draft & 1-Click Publish
- [ ] **3.1 (Node Library UI)**:
  - Thêm bảng quản lý **Watched Script Folders** (chọn nhiều thư mục bằng Native Picker, nút **Scan & Sync**).
  - Hợp nhất hiển thị giữa **Local Draft Nodes** (từ máy cá nhân, có badge `Local Draft` + đường dẫn file) và **Published Studio Nodes** (từ DB).
- [ ] **3.2 (Pipeline List & Canvas UI)**:
  - Cho phép tạo **"New Local Draft Pipeline"** (lưu ở máy local, badge `Local Draft`) bên cạnh các Pipeline đã Publish trên Server.
  - Nút **"Sync Local Scripts"** ngay trên Canvas Toolbar: sửa code `.py` ngoài VS Code $\rightarrow$ bấm 1 nút trên Canvas $\rightarrow$ cập nhật chân Pin ngay lập tức.
  - Khi bấm **Run** trên Draft Pipeline: gọi `run-draft` khóa vào Local Desktop Runner.
- [ ] **3.3 (One-Shot Publish Wizard)**:
  - Nút **"Publish to Studio"**: Tự động đọc các file `.py` local đang dùng trong đồ thị, upload lên CAS Storage, đăng ký `NodeDefinitions` (`Published`) và tạo `Pipeline` + `PipelineSnapshot` chính thức trên DB.

### Phase 4: Kiểm Thử Tự Động & Cập Nhật Playbooks
- [ ] **4.1**: Viết Unit/Integration Tests cho `AnalyzeBatchStateless`, `RunDraftPipeline` (chạy hoàn chỉnh qua nhiều segments không cần `PipelineSnapshot` trong DB và không cần `AssetLink` cho script).
- [ ] **4.2**: Cập nhật `.agents/playbooks/pipeline-engine.md` và `.agents/playbooks/pipeline-canvas-sync.md`.

---

## 5. Kế Hoạch Kiểm Thử Nghiệm Thu (Verification Plan)
- [ ] **Test 1 (Zero DB Pollution khi Scan & Sửa Script)**: Thêm 2 thư mục vào Watched Folders, bấm Scan $\rightarrow$ 10+ nodes xuất hiện trên máy local với đầy đủ chân Pin, kiểm tra bảng `NodeDefinitions` trong DB thấy **0 bản ghi rác** được thêm vào.
- [ ] **Test 2 (1-Second Hot Reload)**: Sửa code `.py` trong VS Code (thêm tham số hoặc sửa logic), bấm Run Draft Pipeline $\rightarrow$ Local Runner chạy trực tiếp file trên ổ cứng `D:/...` ngay lập tức, không tạo `PipelineSnapshot` rác trong DB.
- [ ] **Test 3 (Dogfooding với Resource Draft)**: Dùng `FilterResourcesTool` lấy Resource đã Sync trong Repository truyền vào Local Script Node $\rightarrow$ Chạy mượt mà từ đầu tới cuối.
- [ ] **Test 4 (Thâu tóm & Publish)**: Bấm **Publish to Studio** $\rightarrow$ Toàn bộ scripts và đồ thị được đóng gói lên S3 + DB `NodeDefinitions` + `PipelineSnapshots`, sẵn sàng cho các máy khác trong Team sử dụng.
