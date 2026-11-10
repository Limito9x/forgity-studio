# BL-050: Local-First Script Authoring, Multi-Folder Auto-Scan & Draft Pipeline Lifecycle

> **Mã công việc**: `BL-050`  
> **Trạng thái**: `Pending` *(Sẵn sàng triển khai)*  
> **Ngày tạo**: 09/11/2026  
> **Phạm vi**:
> - `web/` & `web/src-tauri/` (Workspace Config `forgity.workspace.json`, Multi-Folder Native Scanner, IndexedDB Draft Store, Two-Way DSL Mirroring vào `primaryPipelineFolder`)
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
| **Nơi lưu trữ Cấu hình** | **File cấu hình chung `forgity.workspace.json`** quản lý danh sách `scriptFolders` và thư mục chính `primaryPipelineFolder`. | Cấu hình Studio & Project lưu trên PostgreSQL. |
| **Nơi lưu trữ Script Nodes** | **100% trên máy Desktop** (`IndexedDB` + file `.py` gốc trên ổ cứng tại các `scriptFolders`). | **Bảng `NodeDefinitions` trên PostgreSQL** + File `.py` đã băm SHA-256 trên **CAS Storage (MinIO/S3)**. |
| **Định danh & Version Script** | Định danh bằng `Namespace:RelativePath` (`core:blender/bake_character`). Version chính là **SHA-256 ContentHash** (Hot-reload tức thì). | Lưu `Key` chuẩn, Semantic Versioning (**SemVer: `1.0.0`, `1.1.0`**), kèm nguồn gốc **`SourceOrigin: folder@runner-id`**. |
| **Nơi lưu trữ Đồ thị Pipeline** | **100% trên máy Desktop** (IndexedDB + File phẳng phản chiếu 2 chiều **`.pipeline.yaml`** lưu tại `primaryPipelineFolder`). | **Bảng `Pipelines` & `PipelineSnapshots` bất biến (`v1, v2...`)** trên PostgreSQL. |
| **Cách phân giải Chân Pin (AST + Structs)** | Gọi API **Vô trạng thái (Stateless)**: `POST /nodes/analyze-batch-stateless` $\rightarrow$ Backend parse AST + ghép `StructType` rồi **trả JSON về ngay, KHÔNG lưu DB**. | Đọc từ `NodeDefinitions` đã lưu trong DB. |
| **Cách Thực Thi (`Run`)** | **`RunTransientDraftPipeline`**: Gửi kèm công thức (`GraphData` + `LocalScriptDefinitions` với `FullPath`) $\rightarrow$ Backend dựng đồ thị trong RAM (`TransientPipelineGraphFactory`), **KHÔNG tạo `PipelineSnapshot`**, khóa cứng vào **Local Desktop Runner** và chạy trực tiếp file trên đĩa! | **`RunPipeline` chuẩn**: Đọc từ `PipelineSnapshot` bất biến trong DB, tải script qua `ScriptUrl` về cache của bất kỳ Runner nào trong Farm. |
| **Đối với `Resources` (FBX, Blend, Texture)** | **Giữ nguyên Sync Draft trên DB Repository** để đóng vai trò **"Phép thử thật" (Production Simulation)**, đảm bảo khi Artist sync tài nguyên lên chạy sẽ khớp 100% với lúc TA thiết kế. | Giữ nguyên vòng đời `Repository ➔ Resource ➔ Content Anchor`. |

---

## 2. Kiến Trúc Luồng Dữ Liệu (Mental Model)

```mermaid
flowchart TD
    subgraph Desktop ["1. Tauri Desktop Workstation (100% Local Persistence)"]
        WSConfig["Workspace Config\n(`forgity.workspace.json`)"]
        VSCode["VS Code / AI Agent\n(Sửa file .py trực tiếp trên đĩa)"]
        ScriptDirs["scriptFolders[]\n- core: ./pipeline-scripts\n- custom: E:/DCC_Tools"]
        LocalStore[("Local Desktop Store (IndexedDB)\n- localDraftNodes[]\n- localDraftPipelines[]")]
        DSLFolder["primaryPipelineFolder\n(`./pipelines/*.pipeline.yaml`)"]
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

    WSConfig --> ScriptDirs
    WSConfig --> DSLFolder
    VSCode -->|Ctrl + S| ScriptDirs
    ScriptDirs -->|Quét .py + SHA-256| StatelessAPI
    StatelessAPI -->|Trả về Full Resolved Pins\n(0 DB Write)| LocalStore
    LocalStore <-->|Two-Way Mirroring| DSLFolder

    DSLFolder -->|Bấm Run / forgity run\n(Gửi Graph + FullPath Scripts)| TransientRun
    TransientRun -->|Khóa cứng LocalRunnerId\nscript_path = D:/.../bake.py| LocalRunner
    LocalRunner -->|Thực thi trực tiếp từ ổ đĩa\n(0 Upload / 0 Download)| ScriptDirs

    LocalStore -.->|Khi hoàn tất 100%: Bấm PUBLISH| PublishAPI
    PublishAPI -.->|Upload Scripts lên CAS +\nBump SemVer + Tạo PipelineSnapshot v1| DB
```

---

## 3. Thiết Kế Kỹ Thuật Chi Tiết

### 3.1. File Thiết Lập Chung `forgity.workspace.json` & IndexedDB Store
Hệ thống không giả định hay ép cứng bất kỳ tên thư mục nào. Cấu trúc cấu hình máy trạm được lưu trữ tại file:
`forgity.workspace.json` (tại thư mục làm việc của người dùng):

```json
{
  "$schema": "https://forgity.studio/schemas/workspace.v1.json",
  "projectId": "01a1a713-8dd2-7c94-9a57-67ec6467b198",
  "primaryPipelineFolder": "./pipelines",
  "scriptFolders": [
    {
      "namespace": "core",
      "path": "./pipeline-scripts",
      "enabled": true
    },
    {
      "namespace": "custom_tools",
      "path": "E:/DCC_Tools/scripts",
      "enabled": true
    }
  ]
}
```

1. **`scriptFolders`**:
   - Quét tất cả file `.py` trong các folder này.
   - Node Key tự động mang namespace để không bao giờ sợ đụng hàng giữa các folder:
     - `core:blender/bake_character`
     - `custom_tools:unreal/auto_rig`
2. **`primaryPipelineFolder`**:
   - Thư mục được chỉ định để lưu các file **`*.pipeline.yaml`**.
   - Đóng vai trò là "tiếng nói chung" để AI Agent (Antigravity/Cursor) và lập trình viên cùng đọc/ghi logic đồ thị.
3. **IndexedDB Local Store (`idb-keyval`)**:
   - Cache toàn bộ kết quả phân giải chân pin của `localDraftNodes` và đồ thị visual 2D để giao diện Canvas nạp tức thì trong 0ms.

---

### 3.2. Mặt Tiền Declarative Pipeline DSL (`.pipeline.yaml`) — Cầu Nối Giữa Người và AI
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
      tool: "core:blender/bake_modular_character"
      inputs:
        fbx_path: filter_mesh.outputs.first
        bake_mode: "Cycles"

    - id: ue_import
      tool: "core:unreal/import_wardrobe"
      inputs:
        fbx_files: [bake_step.outputs.diffuse_map, bake_step.outputs.normal_map]
  ```
- **Cơ chế Two-Way Mirror (Tấm gương 2 chiều)**:
  - **Save on Canvas**: Tự động chuyển Visual Graph $\rightarrow$ xuất file `.pipeline.yaml` vào `primaryPipelineFolder`.
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
    forgity run ./pipelines/genesis9_bake.pipeline.yaml --report json
    ```
  - Runner chạy tại chỗ, xuất báo cáo `test_report.json`.
  - AI đọc báo cáo, thấy dòng code Python nào bị crash thì tự sửa file `.py` ngoài đĩa và chạy lại lệnh ➔ **Vòng lặp tự sửa lỗi (Self-Healing) cực kỳ mượt mà**.

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Implementation)

### Phase 1: Workspace Config, Tauri Scanner, IndexedDB & Stateless Analyzer API (✅ Đã hoàn thành)
- [x] **1.1 (Workspace Config & Store)**: Xây dựng cơ chế đọc/ghi `forgity.workspace.json` (quản lý `scriptFolders` và `primaryPipelineFolder`) và tích hợp IndexedDB (`idb-keyval`) kèm Tri-State Change Detection (`Unchanged`, `New`, `Modified`).
- [x] **1.2 (Tauri Rust Scanner)**: Thêm command `scan_local_script_folders` trong `web/src-tauri/src/lib.rs` quét đệ quy các `scriptFolders`, gắn prefix `namespace:`, lọc file `.py`, tính SHA-256 và trả về nội dung.
- [x] **1.3 (Backend .NET)**: Tạo Endpoint vô trạng thái `POST /api/pipeline/nodes/custom/analyze-batch-stateless` phân tích hàng loạt script qua `IScriptSchemaAnalyzer` + `IEntityStructRegistry` và chuẩn hóa `PinDefinition` mà **không lưu DB**.

### Phase 2: Ephemeral Draft Execution Engine, Direct Disk Runner & Workstation Affinity
- [ ] **2.1 (Zero-DB Ephemeral Execution Store — Redis TTL)**:
  - Mở rộng `PipelineExecutionState` để mang theo cờ `IsDraft = true`, `PreferredRunnerId`, `TransientGraphData` và `TransientNodeDefinitions`.
  - Khi chạy Draft Pipeline (chưa có mặt trong bảng `Pipelines`), **tuyệt đối không insert vào bảng `db.PipelineExecutions`** (tránh lỗi Foreign Key `PipelineId` và giữ sạch lịch sử DB).
  - Lưu trữ toàn bộ vòng đời thực thi nháp trong `IExecutionStateStore` (Redis / MemoryStore với TTL 2 giờ). Khi hoàn tất (`StageResultConsumer`), chỉ cập nhật Redis và bắn SignalR (`PipelineNodeExecutionUpdated`, `PipelineExecutionCompleted`) về Client/CLI.
- [ ] **2.2 (Workstation Affinity & Direct Disk Dispatcher)**:
  - Nâng cấp `RunnerSegmentDispatcher.cs` và `PipelineOrchestrator.cs`:
    - **Chính sách "User Workstation Affinity"**:
      - Với **Local Draft Run (`IsDraft = true`)**: Khóa cứng 100% các stage vào `PreferredRunnerId` (Local Desktop Runner của máy đang giữ file `.py`).
      - Với **Published Pipeline Run (khi bấm từ Desktop)**: Truyền `PreferredRunnerId` (nhận diện tự động qua `BL-047` Machine Key) làm ưu tiên mặc định để các stage chạy ngay trên máy Runner đang hoạt động của chính người dùng đang thao tác.
    - **Direct Disk Script Bypass**: Cho phép node có `SourceRepositoryPath` (FullPath trên đĩa) bypass hoàn toàn `assetApi.GetFilesAsync` (S3) và truyền thẳng `ScriptPath = SourceRepositoryPath`, `ScriptUrl = null` xuống Runner.
- [ ] **2.3 (Backend Endpoints)**:
  - Tạo Endpoint `POST /api/pipeline/run-draft` nhận trực tiếp đồ thị nháp + danh sách script local + `TargetRunnerId` và kích hoạt chạy Ephemeral ngay trong RAM/Redis.
  - Bổ sung trường `PreferredRunnerId` tùy chọn vào `RunPipelineCommand` (cho Published Pipelines) để hỗ trợ Workstation Affinity.
- [ ] **2.4 (Rust Runner Native Disk Execution)**:
  - Tinh chỉnh `runner/src/core/dispatcher.rs` kiểm tra khi `script_url` rỗng và `script_path` là đường dẫn file local tồn tại trên đĩa thì thực thi trực tiếp mà không tải từ S3.

### Phase 3: Phân Tách Scope Desktop vs Web, Giao Diện Node Library Local-First, Two-Way DSL & 1-Click Publish
- [ ] **3.1 (Phân định ranh giới Desktop Workbench vs Web Hub)**:
  - **Web Mode**: Ẩn/vô hiệu hóa chức năng Upload Script lẻ tẻ trên Web; chỉ hiển thị danh mục Node đã Publish ở chế độ Catalog Read-Only.
  - **Desktop Mode**: Hiển thị danh mục Node hợp nhất với prefix namespace rõ ràng, badge `Local Draft` và `Published Studio` (kèm nút **"Fork / Eject to Local"** để kéo pipeline/script đã publish về sửa tại máy trạm).
- [ ] **3.2 (Two-Way DSL Mirroring & Canvas Live Sync)**:
  - Khi lưu đồ thị trên Canvas: tự động xuất file `.pipeline.yaml` vào `primaryPipelineFolder`.
  - Nút **"Sync Local Scripts"** ngay trên Canvas Toolbar: sửa code `.py` ngoài VS Code $\rightarrow$ bấm 1 nút trên Canvas $\rightarrow$ cập nhật chân Pin ngay lập tức.
  - Khi bấm **Run** trên Desktop (dù là Draft hay Published Pipeline): tự động đính kèm `PreferredRunnerId` của máy trạm đang thao tác.
- [ ] **3.3 (One-Shot Publish Wizard)**:
  - Nút **"Publish to Studio"**: Tự động đọc các file `.py` local đang dùng trong đồ thị, upload lên CAS Storage, đăng ký `NodeDefinitions` (`Published`, SemVer, Origin `folder@runner-id`) và tạo `Pipeline` + `PipelineSnapshot` chính thức trên DB.

### Phase 4: CLI Headless Run Command & MCP Palette Integration
- [ ] **4.1 (CLI Tool)**: Hỗ trợ lệnh `forgity run <path.pipeline.yaml> --report json` cho phép chạy headless pipeline từ terminal dựa trên file cấu hình workspace.
- [ ] **4.2 (MCP Server)**: Cung cấp `mcp_get_palette_nodes` và `mcp_validate_pipeline_yaml` hỗ trợ AI tự động thiết kế và debug pipeline.
- [ ] **4.3 (Verification & Playbooks)**: Viết unit tests và cập nhật `.agents/playbooks/pipeline-engine.md` và `.agents/playbooks/pipeline-canvas-sync.md`.

---

## 5. Kế Hoạch Kiểm Thử Nghiệm Thu (Verification Plan)
- [ ] **Test 1 (Workspace Config & Zero DB Pollution)**: Khởi tạo `forgity.workspace.json`, bấm Scan $\rightarrow$ Nodes xuất hiện trên máy local theo đúng `namespace:relative_path`, kiểm tra bảng `NodeDefinitions` trong DB thấy **0 bản ghi rác** được thêm vào.
- [ ] **Test 2 (1-Second Hot Reload)**: Sửa code `.py` trong VS Code (thêm tham số hoặc sửa logic), bấm Run Draft Pipeline $\rightarrow$ Local Runner chạy trực tiếp file trên ổ cứng `D:/...` ngay lập tức, không tạo `PipelineSnapshot` rác trong DB.
- [ ] **Test 3 (Two-Way DSL Mirroring)**: Lưu đồ thị trên Canvas $\rightarrow$ Kiểm tra file `pipelines/test.pipeline.yaml` được tạo ra gọn gàng trong `primaryPipelineFolder`. Sửa 1 tham số trong YAML $\rightarrow$ Canvas nhận diện và cập nhật lại giao diện.
- [ ] **Test 4 (AI CLI Execution Loop)**: Chạy `forgity run pipelines/test.pipeline.yaml --report json` từ terminal $\rightarrow$ Runner thực thi trơn tru và nhả file report JSON.
- [ ] **Test 5 (Thâu tóm & Publish kèm SemVer & Origin)**: Bấm **Publish to Studio** $\rightarrow$ Toàn bộ scripts và đồ thị được đóng gói lên S3 + DB `NodeDefinitions` với SemVer `1.0.0` và Origin `folder@runner-id` + DB `PipelineSnapshots`, sẵn sàng cho các máy khác trong Team sử dụng.
