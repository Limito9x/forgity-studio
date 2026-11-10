# BL-050: Local-First Script Authoring, Multi-Folder Auto-Scan & Draft Pipeline Lifecycle

> **Mã công việc**: `BL-050`  
> **Trạng thái**: `Pending` *(Sẵn sàng triển khai sáng 10/11/2026)*  
> **Ngày tạo**: 09/11/2026  
> **Phạm vi**:
> - `web/` & `web/src-tauri/` (Local Watched Folders Store, Local Draft Nodes & Local Draft Pipelines Store qua IndexedDB, Multi-Folder Native Scanner, Canvas Local Draft Mode & Two-Way DSL Mirroring)
> - `api/src/Modules/Pipeline/` (Stateless AST & Contract Resolution API, Ephemeral/Transient Draft Execution Engine & One-Shot Publish Bundler với Versioning SemVer)
> - `runner/` (`StageDispatcher` direct local `script_path` execution bypass khi `script_url` trống, CLI runner headless execution command)
> - `ai/` & `mcp/` (Mặt tiền Declarative Pipeline DSL `.pipeline.yaml`, MCP Palette Discovery + CLI Self-Healing Execution Loop)

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
| **Định danh & Version Script** | Định danh bằng `Key` theo Relative Path (`blender/bake_character`). Version chính là **SHA-256 ContentHash** (Hot-reload tức thì khi sửa code). | Lưu `Key` chuẩn, Semantic Versioning (**SemVer: `1.0.0`, `1.1.0`**), kèm nguồn gốc **`SourceOrigin: folder@runner-id`**. |
| **Nơi lưu trữ Đồ thị Pipeline** | **100% trên máy Desktop** (IndexedDB + File phẳng phản chiếu 2 chiều **`.pipeline.yaml`**). | **Bảng `Pipelines` & `PipelineSnapshots` bất biến (`v1, v2...`)** trên PostgreSQL. |
| **Cách phân giải Chân Pin (AST + Structs)** | Gọi API **Vô trạng thái (Stateless)**: `POST /nodes/analyze-batch-stateless` $\rightarrow$ Backend parse AST + ghép `StructType` rồi **trả JSON về ngay, KHÔNG lưu DB**. | Đọc từ `NodeDefinitions` đã lưu trong DB. |
| **Cách Thực Thi (`Run`)** | **`RunTransientDraftPipeline`**: Gửi kèm công thức (`GraphData` + `LocalScriptDefinitions` với `FullPath`) $\rightarrow$ Backend dựng đồ thị trong RAM (`TransientPipelineGraphFactory`), **KHÔNG tạo `PipelineSnapshot`**, khóa cứng vào **Local Desktop Runner** và chạy trực tiếp file trên đĩa! | **`RunPipeline` chuẩn**: Đọc từ `PipelineSnapshot` bất biến trong DB, tải script qua `ScriptUrl` về cache của bất kỳ Runner nào trong Farm. |
| **Đối với `Resources` (FBX, Blend, Texture)** | **Giữ nguyên Sync Draft trên DB Repository** để đóng vai trò **"Phép thử thật" (Production Simulation)**, đảm bảo khi Artist sync tài nguyên lên chạy sẽ khớp 100% với lúc TA thiết kế. | Giữ nguyên vòng đời `Repository ➔ Resource ➔ Content Anchor`. |

---

## 2. Kiến Trúc Luồng Dữ Liệu (Mental Model)

```mermaid
flowchart TD
    subgraph Desktop ["1. Tauri Desktop Workstation (100% Local Persistence)"]
        VSCode["VS Code / AI Agent\n(Sửa file .py trực tiếp trên đĩa)"]
        WatchDirs["Watched Folders (Local Disk)\nVD: D:/.../pipeline-scripts"]
        LocalStore[("Local Desktop Store (IndexedDB)\n- watchedFolders[]\n- localDraftNodes[]\n- localDraftPipelines[]")]
        DSLMirror["Two-Way DSL Mirror\n(`draft-pipelines/*.pipeline.yaml`)"]
        LocalRunner["Forgity Native Rust Runner\n(Local Workstation Identity)"]
    end

    subgraph BackendStateless ["2. Backend .NET 10 — Chế Độ Stateless & Ephemeral (Khi Dev/Draft)"]
        StatelessAPI["POST /nodes/analyze-batch-stateless\n(NativePythonScriptAnalyzer +\nINodeContractResolver)"]
        TransientRun["POST /pipelines/run-draft\n(TransientPipelineGraphFactory in-RAM\nKHÔNG tạo PipelineSnapshot)"]
    end

    subgraph BackendStudio ["3. Backend .NET 10 — Chế Độ Published (Khi Chốt Cho Team)"]
        PublishAPI["POST /pipelines/publish-from-draft\n(Thâu tóm 1 lượt & Băm SHA-256)"]
        DB[("PostgreSQL Studio DB\n- NodeDefinitions (SemVer, Origin: folder@runner-id)\n- Pipelines & PipelineSnapshots (v1, v2)\n- CAS AssetLinks (SHA-256)")]
    end

    VSCode -->|Ctrl + S| WatchDirs
    WatchDirs -->|Quét .py + SHA-256| StatelessAPI
    StatelessAPI -->|Trả về Full Resolved Pins\n(0 DB Write)| LocalStore
    LocalStore <-->|Two-Way Sync| DSLMirror

    DSLMirror -->|Bấm Run / forgity run\n(Gửi Graph + FullPath Scripts)| TransientRun
    TransientRun -->|Khóa cứng LocalRunnerId\nscript_path = D:/.../bake.py| LocalRunner
    LocalRunner -->|Thực thi trực tiếp từ ổ đĩa\n(0 Upload / 0 Download)| WatchDirs

    LocalStore -.->|Khi hoàn tất 100%: Bấm PUBLISH| PublishAPI
    PublishAPI -.->|Upload Scripts lên CAS +\nBump SemVer + Tạo PipelineSnapshot v1| DB
```

---

## 3. Thiết Kế Kỹ Thuật Chi Tiết

### 3.1. Tầng Lưu Trữ Cục Bộ Trên Tauri Desktop (`LocalStudioDraftStore` qua IndexedDB)
Toàn bộ trạng thái nháp của Developer được quản lý tại Frontend/Desktop (sử dụng Zustand + `idb-keyval` adapter lưu trữ bền vững vào `IndexedDB` theo từng `projectId`):

1. **`watchedFolders: WatchedScriptFolder[]`**:
   - Danh sách nhiều thư mục trên ổ cứng máy tính được người dùng chọn qua **Tauri Native Folder Picker** (`open({ directory: true })`).
   - Cấu trúc:
     ```ts
     export interface WatchedScriptFolder {
       id: string;
       path: string;          // VD: "D:/FullStack/Automation/pipeline-scripts"
       label: string;         // VD: "Core Pipeline Scripts"
       enabled: boolean;
       lastScannedAt?: string;
       scriptCount?: number;
     }
     ```
2. **`localDraftNodes: Record<string, LocalDraftNodeDefinition>`**:
   - Lưu toàn bộ các Script Node được quét từ `watchedFolders` kèm kết quả phân giải chân Pin từ Backend:
     ```ts
     export interface LocalDraftNodeDefinition {
       key: string;                 // Relative Path, VD: "blender/bake_modular_character"
       name: string;
       label: string;
       executor: string;            // "blender" | "unreal" | "python"
       scriptFullPath: string;      // VD: "D:/FullStack/Automation/pipeline-scripts/blender/bake_modular_character.py"
       folderRootPath: string;
       sourceOrigin: string;        // Pattern: "folder@runner-id"
       contentHash: string;         // SHA-256 tính tại local (Hot-Reload key)
       inputs: PinDefinitionDto[];  // Đã được Backend resolve đầy đủ
       outputs: PinDefinitionDto[];
       dependencies: ScriptDependencyDto[];
       lastSyncedAt: string;
     }
     ```
3. **`localDraftPipelines: Record<string, LocalDraftPipelineDocument>`**:
   - Khi người dùng tạo một **Local Draft Pipeline**:
     - Đồ thị (`nodes`, `edges`, `parameters`) lưu tức thì vào IndexedDB mà không gọi API lên DB.
     - Đồng thời phản chiếu ra file phẳng **`draft-pipelines/<name>.pipeline.yaml`**.

---

### 3.2. Mặt Tiền Declarative Pipeline DSL (`.pipeline.yaml`) — Cầu Nối Giữa Người và AI
Để AI Agent (như Antigravity, Cursor, Claude) có thể đọc hiểu và chỉnh sửa đồ thị mà không bị "ngộ độc" bởi đống JSON 2000 dòng tọa độ visual 2D:

- **Format Declarative DSL (`.pipeline.yaml`)**:
  ```yaml
  pipeline: "Genesis 9 Modular Bake"
  version: "draft"
  runner: "local"

  nodes:
    - id: filter_mesh
      tool: "tools/filter_resources"
      inputs:
        extension: ".fbx"
        keyword: "Female_Base"

    - id: bake_step
      tool: "local:blender/bake_modular_character"
      inputs:
        fbx_path: filter_mesh.outputs.first
        bake_mode: "Cycles"

    - id: ue_import
      tool: "local:unreal/import_wardrobe"
      inputs:
        fbx_files: [bake_step.outputs.diffuse_map, bake_step.outputs.normal_map]
  ```
- **Cơ chế Two-Way Mirror (Tấm gương 2 chiều)**:
  - **Save on Canvas**: Tự động chuyển Visual Graph $\rightarrow$ xuất file `.pipeline.yaml`.
  - **Edit YAML (bởi AI hoặc Dev)**: Canvas phát hiện file thay đổi $\rightarrow$ Tự động chạy thuật toán Auto-Layout (Dagre) vẽ lại các hộp node và dây nối trên màn hình.

---

### 3.3. Bộ Phân Giải Chân Pin Vô Trạng Thái (Stateless Node Contract Analyzer API)
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

### 3.4. Luồng Thực Thi Đồ Thị Nháp Tạm Thời (`RunTransientDraftPipeline` — Không Cần `PipelineSnapshot`)
- **Endpoint mới**: `POST /api/projects/{projectId}/pipelines/run-draft`
- **Payload gửi lên**:
  - `GraphData`: Toàn bộ `Nodes`, `Edges`, `Parameters` hiện tại trên Canvas (hoặc biên dịch từ YAML).
  - `LocalScriptDefinitions`: Danh sách các `LocalDraftNodeDefinition` đang dùng trong đồ thị (chứa `Key`, `Executor`, `ScriptFullPath`, `ContentHash`, `Inputs`, `Outputs`, `Dependencies`).
  - `TargetLocalRunnerId`: ID của Local Workstation Runner trên chính máy Desktop đó.
  - `RuntimeInputs`: Các giá trị input lúc chạy.
- **Cách Engine xử lý**:
  - Tạo đối tượng `Pipeline` ảo trong RAM (qua `TransientPipelineGraphFactory`) và nạp các `LocalScriptDefinitions` thành các `NodeDefinition` ảo trong RAM (với `SourceRepositoryPath = ScriptFullPath`).
  - Khởi tạo `PipelineExecution` với `SnapshotId = null` và lưu toàn bộ công thức `TransientGraph + LocalScriptDefinitions` vào `ExecutionState` JSONB để phục vụ Resume / Callback.
  - `RunnerSegmentDispatcher.cs` truyền thẳng `ScriptPath = def.SourceRepositoryPath` (VD: `D:/FullStack/Automation/pipeline-scripts/blender/bake.py`) và `ScriptUrl = null` xuống Runner.
  - Khóa cứng `effectiveRunnerId = TargetLocalRunnerId`.
- **Tại Rust Runner (`runner/src/core/dispatcher.rs` & `stage_runner_guest.py`)**:
  - Khi `script_url` là `None`, `dispatcher.rs` giữ nguyên `step.script_path`.
  - Kiểm tra `Path::new(&step.script_path).is_file()`, log rõ: `[LocalDraft] Executing local script directly from disk: ...` và nạp thẳng vào Blender / Unreal / Python guest runner.

---

### 3.5. Quy Trình "Thâu Tóm 1 Lượt & Publish" (`PublishDraftToStudio`) Kèm Nguồn Gốc `folder@runner-id`
Khi người dùng đã thử nghiệm xong ở chế độ Local Draft và muốn đưa Pipeline + Scripts lên Studio cho cả nhóm cùng sử dụng:
- Bấm nút **"Publish to Studio"**:
  1. **Thâu tóm Scripts & Bump SemVer**:
     - Tauri Desktop đọc nội dung các file `.py` từ `scriptFullPath` của các node có mặt trong Pipeline.
     - Tự động upload lên CAS Storage (`IAssetApi`), băm SHA-256.
     - Gọi `BatchUpsertCustomNodes` để lưu chính thức vào bảng `NodeDefinitions`:
       - `Status = NodeLifecycleStatus.Published`
       - `SemanticVersion`: Nếu là lần đầu publish thì gán `1.0.0`; nếu đã có thì tự động bump minor `1.1.0`.
       - `SourceRepositoryPath = "folder@runner-id"` (Lưu nguồn gốc xuất xứ máy trạm để sau này có thể Eject ngược về đúng máy tác giả).
  2. **Thâu tóm File Parameters (nếu có)**:
     - Nếu chân pin nào đang trỏ đường dẫn file tạm trên đĩa, hỗ trợ đóng gói upload thành `AssetLink` chuẩn.
  3. **Đóng băng `Pipeline` & `PipelineSnapshot`**:
     - Chuyển toàn bộ các tham chiếu node từ `local:*` thành `studio:<node-key>@<version>`.
     - Lưu đồ thị vào bảng `Pipelines` và tạo bản chụp `PipelineSnapshot` (`v1`, `v2`...) chính thức trong Database!

---

### 3.6. Bổ Trợ AI: Mô Hình "CLI Làm Đôi Tay, MCP Làm Cặp Kính"
- **MCP Server (Cặp kính mắt — Context & Discovery)**:
  - Cung cấp 2 công cụ MCP gọn nhẹ:
    - `mcp_get_palette_nodes`: Trả về danh sách JSON cấu trúc các node có sẵn (cả Local Draft lẫn Studio Published).
    - `mcp_validate_pipeline_yaml`: Kiểm tra tính hợp lệ của file `.pipeline.yaml` (dây nối, kiểu dữ liệu, chân pin bắt buộc).
- **CLI Runner (Đôi bàn tay — Execution & Self-Healing Loop)**:
  - Lệnh terminal:
    ```bash
    forgity run draft-pipelines/genesis9_bake.pipeline.yaml --report json
    ```
  - Runner chạy tại chỗ, xuất báo cáo `test_report.json`.
  - AI đọc báo cáo, thấy dòng code Python nào bị crash thì tự sửa file `.py` ngoài đĩa và chạy lại lệnh ➔ **Vòng lặp tự sửa lỗi (Self-Healing) cực kỳ mượt mà**.

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Implementation)

### Phase 1: Tauri Multi-Folder Scanner, IndexedDB Store & Stateless Analyzer API
- [ ] **1.1 (Tauri Rust)**: Thêm command `scan_local_script_folders` trong `web/src-tauri/src/lib.rs` quét đệ quy nhiều thư mục, lọc file `.py`, tính SHA-256 và trả về nội dung.
- [ ] **1.2 (Backend .NET)**: Tạo Endpoint vô trạng thái `POST /api/projects/{projectId}/nodes/analyze-batch-stateless` phân tích hàng loạt script qua `IScriptSchemaAnalyzer` và chuẩn hóa `PinDefinition` mà **không lưu DB**.
- [ ] **1.3 (Frontend Store)**: Xây dựng `useLocalDraftStudioStore.ts` (lưu `watchedFolders`, `localDraftNodes`, `localDraftPipelines` vào IndexedDB qua `idb-keyval`) kèm cơ chế **Hash Short-Circuit** (chỉ gửi những file `.py` có SHA-256 thay đổi lên API analyze).

### Phase 2: Ephemeral Draft Execution Engine & Direct Disk Runner
- [ ] **2.1 (Backend Runtime)**: Nâng cấp `PipelineExecutionState` để mang theo `TransientGraphData` và `TransientNodeDefinitions` cho các lượt chạy Draft (`SnapshotId = null`).
- [ ] **2.2 (Backend Dispatcher)**: Nâng cấp `RunnerSegmentDispatcher.cs` và `PipelineOrchestrator.cs`:
  - Khôi phục đồ thị tạm và `TransientNodeDefinitions` từ `ExecutionState` trong suốt vòng đời chạy.
  - Cho phép node có `SourceRepositoryPath` (FullPath) bypass `assetApi.GetFilesAsync` và truyền thẳng `ScriptPath = SourceRepositoryPath`, `ScriptUrl = null` xuống Runner.
  - Khóa cứng `TargetRunnerId` vào Local Desktop Runner của máy người dùng.
- [ ] **2.3 (Backend Endpoint)**: Tạo Endpoint `POST /api/projects/{projectId}/pipelines/run-draft` nhận trực tiếp đồ thị nháp + danh sách script local và kích hoạt chạy ngay lập tức.
- [ ] **2.4 (Rust Runner)**: Tinh chỉnh `runner/src/core/dispatcher.rs` kiểm tra và log rõ khi chạy script trực tiếp từ `script_path` local mà không có `script_url`.

### Phase 3: Giao Diện Node Library Local-First, Two-Way DSL & 1-Click Publish
- [ ] **3.1 (Node Library UI)**:
  - Thêm bảng quản lý **Watched Script Folders** (chọn nhiều thư mục bằng Native Picker, nút **Scan & Sync**).
  - Hợp nhất hiển thị giữa **Local Draft Nodes** (từ máy cá nhân, có badge `Local Draft` + đường dẫn file) và **Published Studio Nodes** (từ DB, có nút *Eject to Local*).
- [ ] **3.2 (Pipeline List & Two-Way DSL Mirroring)**:
  - Cho phép tạo **"New Local Draft Pipeline"** (lưu ở IndexedDB, badge `Local Draft`).
  - Tự động xuất file phẳng `draft-pipelines/<name>.pipeline.yaml` mỗi khi lưu đồ thị.
  - Nút **"Sync Local Scripts"** ngay trên Canvas Toolbar: sửa code `.py` ngoài VS Code $\rightarrow$ bấm 1 nút trên Canvas $\rightarrow$ cập nhật chân Pin ngay lập tức.
  - Khi bấm **Run** trên Draft Pipeline: gọi `run-draft` khóa vào Local Desktop Runner.
- [ ] **3.3 (One-Shot Publish Wizard)**:
  - Nút **"Publish to Studio"**: Tự động đọc các file `.py` local đang dùng trong đồ thị, upload lên CAS Storage, đăng ký `NodeDefinitions` (`Published`, SemVer, Origin `folder@runner-id`) và tạo `Pipeline` + `PipelineSnapshot` chính thức trên DB.

### Phase 4: CLI Headless Run Command & MCP Palette Integration
- [ ] **4.1 (CLI Tool)**: Hỗ trợ lệnh `forgity run <path.pipeline.yaml> --report json` cho phép chạy headless pipeline từ terminal.
- [ ] **4.2 (MCP Server)**: Cung cấp `get_available_nodes` và `validate_pipeline_yaml` hỗ trợ AI tự động thiết kế và debug pipeline.
- [ ] **4.3 (Verification & Playbooks)**: Viết unit tests và cập nhật `.agents/playbooks/pipeline-engine.md` và `.agents/playbooks/pipeline-canvas-sync.md`.

---

## 5. Kế Hoạch Kiểm Thử Nghiệm Thu (Verification Plan)
- [ ] **Test 1 (Zero DB Pollution khi Scan & Sửa Script)**: Thêm 2 thư mục vào Watched Folders, bấm Scan $\rightarrow$ 10+ nodes xuất hiện trên máy local với đầy đủ chân Pin, kiểm tra bảng `NodeDefinitions` trong DB thấy **0 bản ghi rác** được thêm vào.
- [ ] **Test 2 (1-Second Hot Reload)**: Sửa code `.py` trong VS Code (thêm tham số hoặc sửa logic), bấm Run Draft Pipeline $\rightarrow$ Local Runner chạy trực tiếp file trên ổ cứng `D:/...` ngay lập tức, không tạo `PipelineSnapshot` rác trong DB.
- [ ] **Test 3 (Two-Way DSL Mirroring)**: Lưu đồ thị trên Canvas $\rightarrow$ Kiểm tra file `draft-pipelines/test.pipeline.yaml` được tạo ra gọn gàng. Sửa 1 tham số trong YAML $\rightarrow$ Canvas nhận diện và cập nhật lại giao diện.
- [ ] **Test 4 (AI CLI Execution Loop)**: Chạy `forgity run draft-pipelines/test.pipeline.yaml --report json` từ terminal $\rightarrow$ Runner thực thi trơn tru và nhả file report JSON.
- [ ] **Test 5 (Thâu tóm & Publish kèm SemVer & Origin)**: Bấm **Publish to Studio** $\rightarrow$ Toàn bộ scripts và đồ thị được đóng gói lên S3 + DB `NodeDefinitions` với SemVer `1.0.0` và Origin `folder@runner-id` + DB `PipelineSnapshots`, sẵn sàng cho các máy khác trong Team sử dụng.
