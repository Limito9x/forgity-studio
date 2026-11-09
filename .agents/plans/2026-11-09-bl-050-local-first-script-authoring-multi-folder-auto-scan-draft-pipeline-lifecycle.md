# BL-050: Local-First Script Authoring, Multi-Folder Auto-Scan & Draft Pipeline Lifecycle

> **Mã công việc**: `BL-050`  
> **Trạng thái**: `Pending` *(Sẵn sàng triển khai sáng 10/11/2026)*  
> **Ngày tạo**: 09/11/2026  
> **Phạm vi**:
> - `web/` & `web/src-tauri/` (Local Watched Folders Store, Multi-Folder Native Scanner, Node Library Sync UI, Canvas Draft Mode)
> - `api/src/Modules/Pipeline/` (Stateless AST & Contract Resolution, `LocalDraft` Node Definition, Local FullPath Execution Dispatch & One-Shot Publish Bundler)
> - `runner/` (`StageDispatcher` direct local `script_path` execution bypass khi `script_url` trống)

---

## 1. Tầm Nhìn & Triết Lý Kiến Trúc (Executive Summary)

Qua thực tiễn phát triển các pipeline DCC (Blender, Unreal Engine, Daz3D) và đối chiếu với các công cụ tiêu chuẩn ngành như **ComfyUI**, **Autodesk Dynamo**, và **Houdini**, chúng ta nhận diện rõ bản chất:

1. **Sự lệch pha của mô hình Upload truyền thống**:
   - Mã nguồn Python script (`.py`) trong giai đoạn phát triển (Dev/R&D) là **tệp sống (Hot-code)**, được chỉnh sửa liên tục từng giây trong VS Code / PyCharm.
   - Bắt buộc người dùng phải kéo thả / upload từng file `.py` lên Cloud Storage (MinIO/S3) mỗi khi sửa 1 dòng code biến vòng lặp `Edit ➔ Run ➔ Debug` từ **1 giây** thành **1 phút** đầy mệt mỏi.
2. **Phân định ranh giới Vàng: "Client-Side Authoring & Server-Side Governance"**:
   - **Script (Hành động / Logic)**: Trong giai đoạn phát triển, 100% **Local-First (Draft)**. Nằm trên ổ cứng máy trạm, được Tauri Desktop tự động quét từ nhiều thư mục theo dõi (`Watched Folders`), phân giải chân Pin qua API Backend nhưng **tuyệt đối không upload file nhị phân** và trỏ thẳng bằng `FullPath`.
   - **Resource (Tài sản dự án)**: Giữ nguyên mô hình **Sync Draft lên DB** (`Repository ➔ Sync ➔ Tag/Content Link ➔ Pipeline`). Điều này đóng vai trò là **"Phép thử thật" (Production Simulation)**, đảm bảo khi Technical Artist thiết kế pipeline chạy mượt trên máy mình thì 3D Artist trong nhóm đồng bộ tài nguyên lên chạy cũng khớp 100%.
   - **Chống Crack & Bảo toàn Trí tuệ Server**: Dù script nằm ở local, việc phân giải hợp đồng ngữ cảnh (`INodeContractResolver`: Structs, Wildcards, Content Types) và cấp quyền thực thi DAG (`PipelineOrchestrator` & License Gate) vẫn nằm hoàn toàn trên Backend `.NET`. Khi chạy thử nghiệm Draft, toàn bộ các Stage được **khóa cứng (Pin/Lock) vào Local Desktop Runner** của máy đó.
   - **Đóng băng khi Phát hành (One-Shot Publish)**: Chỉ khi pipeline đã chạy hoàn chỉnh và người dùng bấm **"Publish"**, hệ thống mới tự động gom (bundle) các script local, băm SHA-256, đẩy lên CAS Storage và đóng băng thành `PipelineSnapshot` bất biến cho toàn Studio sử dụng.

---

## 2. Kiến Trúc Luồng Dữ Liệu (Mental Model)

```mermaid
flowchart TD
    subgraph Desktop ["Tauri Desktop Workstation (Local-First Authoring)"]
        VSCode["VS Code / IDE\n(Sửa file .py trực tiếp)"]
        WatchDirs["Watched Folders (Local Disk)\nVD: D:/.../pipeline-scripts"]
        LocalStore["Local Workspace Config\n(watchedFolders[], localRunnerId)"]
        LocalRunner["Forgity Native Rust Runner\n(Local Machine Identity)"]
    end

    subgraph Backend ["Forgity Backend .NET 10 (Server Governance & SSOT)"]
        Analyzer["HybridScriptSchemaAnalyzer +\nINodeContractResolver"]
        NodeDB[("PostgreSQL: NodeDefinitions\nStatus = Draft (SourceRepositoryPath = FullPath)\nhoặc Published (AssetLink SHA-256)")]
        Orchestrator["PipelineOrchestrator &\nRunnerSegmentDispatcher"]
        CAS[("CAS Storage (MinIO/S3)\nChỉ lưu khi Publish")]
    end

    VSCode -->|Ctrl + S| WatchDirs
    WatchDirs -->|1. Tauri Scan .py contents| Analyzer
    Analyzer -->|2. Trả về Full Resolved Pins\n(Structs, Options, File Pins)| NodeDB
    NodeDB -->|3. Hiển thị ngay trên Canvas Palette| Desktop

    Desktop -->|4. Run Draft Pipeline\n(Khóa vào Local Runner)| Orchestrator
    Orchestrator -->|5. Dispatch StageTaskMessage\n(script_path = D:/.../bake.py, script_url = null)| LocalRunner
    LocalRunner -->|6. Chạy trực tiếp file .py trên ổ đĩa\n(0ms upload, 0ms download)| WatchDirs

    Desktop -.->|7. Khi hoàn tất: Bấm PUBLISH| CAS
    CAS -.->|8. Băm SHA-256 & Freeze Snapshot| NodeDB
```

---

## 3. Thiết Kế Chi Tiết Từng Phân Hệ

### 3.1. Quản Lý Thư Mục Theo Dõi Cục Bộ (Multi-Folder Watcher trên Tauri Desktop)
- **Lưu trữ cấu hình máy trạm**:
  - Lưu tại `localStorage` / cấu hình cục bộ của Tauri Desktop theo từng `projectId` (không lưu đường dẫn ổ đĩa cá nhân của dev lên DB chung nếu chưa cần thiết, hoặc chỉ lưu `SourceRepositoryPath` trên `NodeDefinition` ở trạng thái `Draft`).
  - Cấu trúc cấu hình `LocalScriptWatchConfig`:
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
- **Tauri Rust Command (`scan_local_script_folders`)**:
  - Bổ sung command trong `web/src-tauri/src/lib.rs`:
    - Nhận danh sách `folder_paths: Vec<String>`.
    - Quét đệ quy siêu tốc các file `.py` (bỏ qua `__pycache__`, `.venv`, `node_modules`, `.git`, và các file bắt đầu bằng `_` như `__init__.py`).
    - Tự động suy luận `executor` từ tên thư mục cha nếu có (`blender/`, `unreal/`, `daz/`, `ai/`) hoặc từ nội dung script (`import bpy`, `import unreal`).
    - Trả về danh sách `LocalDiskScriptItem`:
      - `fullPath`: Đường dẫn tuyệt đối chuẩn hóa (`D:/.../blender/bake_character.py`).
      - `relativePath`: Đường dẫn tương đối so với folder gốc (`blender/bake_character.py`).
      - `fileName`: Tên tệp (`bake_character.py`).
      - `content`: Nội dung mã nguồn UTF-8.
      - `contentHash`: Mã băm SHA-256 tính trực tiếp bằng Rust.
      - `lastModifiedMs`: Timestamp sửa đổi tệp.

---

### 3.2. Bộ Phân Giải Chân Pin & Đồng Bộ Node Draft (API `SyncLocalDraftNodes`)
- **Tại sao phải đi qua API Backend?**
  - Như đã phân tích: `python_script_analyzer.py` ở Backend kết hợp với `NativePythonScriptAnalyzer` và `INodeContractResolver` để ánh xạ chính xác `PinPrimitiveType.Asset`, `PinCardinality`, `Literal` dropdown options, `Dependencies` (`pip` packages), và `StructType` của Project.
- **Endpoint mới: `POST /api/projects/{projectId}/nodes/custom/sync-local-drafts`**:
  - Nhận mảng các script từ Tauri Desktop:
    ```csharp
    public record LocalDraftScriptItem(
        string Key,
        string FullPath,
        string FileName,
        string? FolderExecutorHint,
        string Content,
        string ContentHash
    );
    ```
  - **Cơ chế tối ưu tốc độ (Hash Short-Circuit)**:
    - Nếu trong DB đã có `NodeDefinition` của `ProjectId + Key` với cùng `ContentHash` và `SourceRepositoryPath == FullPath`: **Bỏ qua phân tích AST (0ms)**, giữ nguyên Pin!
    - Chỉ những file `.py` mới hoặc vừa được dev sửa đổi (`ContentHash` thay đổi) mới được đưa qua `IScriptSchemaAnalyzer.AnalyzeAsync(content, fileName)`.
  - **Lưu trữ `NodeDefinition` ở trạng thái `Draft` (Zero-Asset-Upload)**:
    - Cập nhật `NodeDefinition`:
      - `Status = NodeLifecycleStatus.Draft`
      - `SourceRepositoryPath = item.FullPath` (Lưu chính xác FullPath trên máy dev).
      - `ContentHash = item.ContentHash`
      - `Inputs`, `Outputs`, `Dependencies`, `Executor`.
    - **KHÔNG yêu cầu `AssetId`**, **KHÔNG tạo `AssetLink`**, **KHÔNG chạm vào MinIO/S3**!
    - Phát sự kiện `NodeDefinitionPinsChangedEvent` để các Pipeline Draft đang mở tự động cập nhật chân Pin mới nhất.

---

### 3.3. Thực Thi Pipeline Draft: FullPath & Khóa Cứng Local Desktop Runner
- **1. Trong `RunnerSegmentDispatcher.cs` (Backend Runtime)**:
  - Hiện tại (dòng 52–65): Dispatcher bắt buộc mọi `usedDefs` phải có file trong `assetApi.GetFilesAsync(...)`, nếu không có sẽ báo lỗi:
    `Custom node '...' has no stored script matching its content. Reupload it before execution.`
  - **Nâng cấp hỗ trợ `LocalDraft` (File-Backed Node)**:
    - Khi chuẩn bị `StepExecution` cho một `NodeDefinition`:
      - Kiểm tra nếu `definition.Status == NodeLifecycleStatus.Draft` (hoặc không có `AssetLink` nhưng có `!string.IsNullOrWhiteSpace(definition.SourceRepositoryPath)`):
        - Không trả lỗi thiếu Asset!
        - Gán trực tiếp:
          - `ScriptPath = definition.SourceRepositoryPath` (FullPath trên ổ đĩa local, VD: `D:/FullStack/Automation/pipeline-scripts/blender/bake.py`)
          - `ScriptUrl = null`
          - `ScriptHash = definition.ContentHash`
          - `EntryPoint = Path.GetFileName(definition.SourceRepositoryPath)`
- **2. Khóa cứng Target Runner về Local Workstation Runner**:
  - Khi một Stage chứa bất kỳ step nào là `LocalDraft` (chạy bằng `SourceRepositoryPath` cục bộ):
    - Nếu người dùng đang bấm Run từ Tauri Desktop (gửi kèm `localRunnerId` trong `RuntimeInputs` hoặc tự động khớp với Runner online cùng máy):
    - `RunnerSegmentDispatcher` ưu tiên định tuyến tuyệt đối về `LocalRunnerId` đó.
    - Nếu Stage đang cấu hình trỏ sang một Remote Runner khác máy (không có ổ đĩa `D:/...` đó), hệ thống cảnh báo rõ ràng hoặc tự động override về Local Desktop Runner khi chạy ở chế độ Draft.
- **3. Trong `runner/src/core/dispatcher.rs` (Rust Runner Daemon)**:
  - Kiểm tra lại dòng 113–145 của `dispatcher.rs`:
    - Hiện tại: `if let Some(script_url) = &step.script_url { if !script_url.is_empty() { ... download ... } }`.
    - Khi `script_url` là `None` hoặc rỗng, Rust Runner **giữ nguyên `step.script_path`**!
    - Sau đó `stage_runner_guest.py` (dòng 378): `if script_path and os.path.exists(script_path):` sẽ đọc và thực thi **trực tiếp file `.py` ngay tại `D:/FullStack/...`** trên ổ cứng!
    - Đồng thời bổ sung kiểm tra fail-fast trong `dispatcher.rs`: Nếu `script_url` trống mà `Path::new(&step.script_path).exists()` là `false`, trả thông báo lỗi rõ ràng: *"Local draft script not found on this Runner disk at '{script_path}'. Make sure you are running on your local Desktop Runner."*
- **4. Tham số File / Asset Pin dạng FullPath khi chạy Draft**:
  - Trên Canvas Inspector (`AssetPinUpload.tsx` / `FormFileUpload.tsx`):
    - Khi chạy trên Tauri Desktop, cho phép nút **"Pick Local File (FullPath)"** bên cạnh Upload: dùng Native File Dialog lấy thẳng chuỗi đường dẫn `D:/Assets/Body.fbx` gán vào pin mà không cần upload lên S3.

---

### 3.4. Quy Trình "Thâu Tóm & Đóng Băng" Khi Publish (One-Shot Freeze to Production)
Khi người dùng đã thử nghiệm xong các Script Draft và Pipeline chạy ngon lành:
- Trên trang **Node Library** hoặc thanh công cụ **Pipeline Canvas**, cung cấp nút **"Publish Local Scripts"**:
  1. Tauri Desktop đọc nội dung các file `.py` từ `SourceRepositoryPath` của các Node đang ở trạng thái `Draft`.
  2. Upload 1 lượt lên CAS Storage (`IAssetApi`), tạo `AssetLink` chính thức gắn với `NodeDefinition`.
  3. Chuyển `NodeDefinition.Status` từ `Draft` $\rightarrow$ `Published`.
  4. Tạo bản chụp `PipelineSnapshot` bất biến.
- Lúc này, toàn bộ thành viên khác trong Team / Studio hoặc các Remote Render Farm Runners đều có thể kéo script từ `ScriptUrl` về chạy một cách độc lập và an toàn.

---

## 4. Lộ Trình Triển Khai Theo Giai Đoạn (Phased Implementation)

### Phase 1: Tauri Local Folder Scanner & Workspace Settings
- [ ] **1.1**: Bổ sung command Rust `scan_local_script_folders` trong `web/src-tauri/src/lib.rs` để quét đệ quy danh sách thư mục `.py`, tính SHA-256 và trích xuất thông tin file.
- [ ] **1.2**: Xây dựng store quản lý `WatchedScriptFolders` (`useWatchedScriptFoldersStore.ts`) lưu trữ danh sách các thư mục theo dõi trên Tauri Desktop, hỗ trợ thêm/xóa/bật/tắt folder bằng Native Folder Picker.

### Phase 2: Backend Stateless Draft Sync & Local FullPath Execution
- [ ] **2.1**: Tạo Endpoint & Handler `SyncLocalDraftNodes` (`POST /api/projects/{projectId}/nodes/custom/sync-local-drafts`) trong `Automation.Pipeline`:
  - So khớp `ContentHash` để chỉ phân tích lại những file `.py` thực sự thay đổi.
  - Gọi `IScriptSchemaAnalyzer` để bóc tách đầy đủ `Inputs`, `Outputs`, `Dependencies`, `Literal` options.
  - Tạo/Cập nhật `NodeDefinition` với `Status = Draft` và `SourceRepositoryPath = FullPath` mà không cần `AssetId`.
- [ ] **2.2**: Nâng cấp `RunnerSegmentDispatcher.cs`:
  - Cho phép `NodeDefinition` ở trạng thái `Draft` (có `SourceRepositoryPath`) bypass bước kiểm tra `assetApi.GetFilesAsync`.
  - Truyền trực tiếp `ScriptPath = def.SourceRepositoryPath` và `ScriptUrl = null` xuống `StepExecution`.
- [ ] **2.3**: Tinh chỉnh `runner/src/core/dispatcher.rs` log rõ chế độ `[LocalDraft] Executing script directly from disk: ...` khi `script_url` rỗng.

### Phase 3: Giao Diện Node Library Auto-Sync & Canvas Live Refresh
- [ ] **3.1**: Nâng cấp trang **Node Library** (`NodeLibrary.tsx`) trên Tauri Desktop:
  - Thêm khu vực / Popover **"Watched Script Folders"** (hiển thị các folder đang theo dõi, nút *Add Folder...* và nút **1-Click Scan & Sync**).
  - Hiển thị huy hiệu (Badge) phân biệt rõ node **`Local Draft`** (màu hổ phách/xanh dương kèm đường dẫn đĩa) và **`Published`** (màu xanh lá kèm hash).
- [ ] **3.2**: Trên **Pipeline Canvas**, thêm nút nhanh **"Sync Local Scripts"** trên thanh công cụ để khi dev vừa sửa code `.py` trong VS Code và đổi chân pin, chỉ cần bấm 1 nút là toàn bộ node trên Canvas cập nhật chân pin mới tức thì.
- [ ] **3.3**: Hỗ trợ nút **"Publish to Studio"** để đóng gói script từ `SourceRepositoryPath` lên CAS Storage khi muốn chốt phiên bản cho Team.

### Phase 4: Kiểm Thử & Đồng Bộ Tài Liệu
- [ ] **4.1**: Viết Unit Tests cho `SyncLocalDraftNodesHandler` và `RunnerSegmentDispatcherTests` (case chạy `NodeDefinition` với `SourceRepositoryPath` không cần AssetLink).
- [ ] **4.2**: Cập nhật Playbook `.agents/playbooks/pipeline-canvas-sync.md` và `.agents/playbooks/pipeline-engine.md`.

---

## 5. Kế Hoạch Kiểm Thử Nghiệm Thu (Verification Plan)
- [ ] **Test 1 (Multi-Folder Scan)**: Trên Tauri Desktop, chọn thư mục `D:/FullStack/Automation/pipeline-scripts`. Bấm **Scan & Sync** $\rightarrow$ Toàn bộ script (`blender/`, `unreal/`, `ai/`) được nạp vào Node Library dưới dạng `Draft` trong vài giây mà không cần kéo thả từng file.
- [ ] **Test 2 (1-Second Hot Edit Loop)**: Mở 1 file `.py` trong VS Code, thêm 1 tham số mới `test_factor: float = 1.5` vào hàm `main()`. Bấm **Sync** trên Forgity $\rightarrow$ Chỉ đúng 1 file đó được parse lại (<100ms), Node trên Canvas lập tức xuất hiện chân pin `Test Factor`.
- [ ] **Test 3 (Zero-Upload Local Execution)**: Bấm **Run Pipeline** với Resource Draft đã sync trong Repository $\rightarrow$ Local Runner thực thi trực tiếp file `.py` tại đường dẫn `D:/FullStack/Automation/pipeline-scripts/...` không tốn thời gian upload/download.
- [ ] **Test 4 (One-Shot Publish)**: Bấm Publish Node $\rightarrow$ Script được tải lên CAS Storage và chuyển trạng thái sang `Published`.
