# Kế Hoạch Kỹ Thuật: Tháo Gỡ Gông Cùm Core Server, Kiến Trúc 2 Tầng (Component Pipe vs Master Orchestration), Auto-Gen Companion Tools & Rust Runner DAG Maestro (BL-053)

- **Mã Backlog**: `BL-053`
- **Ngày lập**: 12/11/2026
- **Trạng thái**: `Proposed / Pending Review`
- **Phạm vi tác động**:
  - `web/` & `web/src-tauri/` (Local Workspace, Palette Auto-Gen, Struct Schema, Inspector Parallel Mode, Dialog Registry)
  - `runner/` (`forgity-runner` Rust DAG Scheduler, Multi-wire Array Fan-in, Concurrency Semaphore Pool, Pure In-Memory Nodes)
  - `api/src/Modules/Pipeline/` (Tinh gọn Control Plane, cô lập/gỡ bỏ Core Server DB Tools khỏi luồng DCC, Out-of-Band Completion Event Hooks)
  - `pipeline-scripts/` (Chuẩn hóa pure file/manifest inputs & outputs)

---

## 1. Bối Cảnh & Nguyên Nhân Cốt Lõi ("3 Cái Bẫy Lịch Sử")

Qua quá trình giải phẫu các đồ thị thực tế trong Database (`Manual Inspect Daz` và `Daz Character To Blender & Fbx`), chúng ta đã nhận diện rõ **3 gông cùm kiến trúc** từng khiến một luồng công việc DCC 4 bước đơn giản bị phình to thành ma trận 20+ nodes chằng chịt dây nhợ:

1. **Bẫy 1 — Đem Database Entities (`EntityRef`) nhét vào làm Pin Dataflow**:
   - Trước đây, Pipeline bị ép phải hiểu `Workstation`, `Repository`, `Resource`, `ResourceVersionId`.
   - Hệ quả: Để truyền một đường dẫn file `.duf` vào Blender, TA phải nối một chuỗi node phụ trợ trên C# Server: `Start` $\rightarrow$ `BreakStruct (Workstation)` $\rightarrow$ `ResolveResources` $\rightarrow$ `BreakStruct (Resource)` $\rightarrow$ `FormatString` rồi mới tới được `ScopeContainer (Blender)`.
2. **Bẫy 2 — Dùng Database làm Trạm Trung Chuyển Trạng Thái Giữa Các Stage (Stateful DB Intermission)**:
   - Kết quả từ Stage 1 (Inspect Daz) phải gọi `UpdateResourceMetadataTool` lưu ngược vào bảng `Resources` của PostgreSQL, rồi khi sang Pipeline 2 lại phải query DB lôi ra đọc tiếp.
   - Hệ quả: Pipeline không thể chạy độc lập ở Local Workspace (Offline/Zero-DB) và tốc độ thực thi bị ghìm bởi round-trip mạng/database.
3. **Bẫy 3 — Trộn Lẫn .NET Server Stage Với DCC Stage Trên Cùng Một Mặt Phẳng Canvas**:
   - Một Pipeline vừa chứa các node chạy trên `.NET Server` (Cloud/API), vừa chứa `ScopeContainer` chạy trên `Rust Runner` (máy trạm cục bộ), buộc `ExecPlanner` phải cắt lát đồ thị (`DotNetSegment` $\leftrightarrow$ `RunnerSegment`), đóng gói state bắn qua lại RabbitMQ vô cùng nặng nề.

---

## 2. Tầm Nhìn Kiến Trúc Mới: Thanh Thoát, Phân Tầng & Tự Động Sinh (Code-Gen Mentality)

Khi gỡ bỏ hoàn toàn trách nhiệm xử lý chuỗi/struct/database ra khỏi .NET Server trong lúc chạy Pipeline, kiến trúc **Forgity Studio** lập tức đạt được sự thanh thoát thông qua **4 trụ cột cốt lõi**:

```mermaid
flowchart TB
    subgraph Tier1["TẦNG 1: COMPONENT PIPES (Đơn vị DCC nguyên tử - 1 Pipeline = 1 Môi trường)"]
        CP1["🎨 Component Pipe: Daz Body Bake\n(100% Blender Stage)\nIn: duf_file, bake_res -> Out: fbx_files, textures"]
        CP2["👗 Component Pipe: Wardrobe Export\n(100% Blender Stage)\nIn: duf_file, subdiv -> Out: fbx_files, thumbnails"]
        CP3["🎮 Component Pipe: Unreal Character Ingest\n(100% Unreal Stage)\nIn: fbx_files[], manifest -> Out: uasset_paths[]"]
    end

    subgraph AutoGen["TẦNG AUTO-GEN (Tương tự TanStack Router / Orval Code-Gen)"]
        AG1["⚡ Auto-Gen Parallel Batch Node\n(Tự động nâng cấp file_path: String -> file_paths: Array<String>)\nKèm cấu hình Concurrency Slots (Max 1..N)"]
        AG2["🧩 Auto-Gen Local Struct Make/Break\n(Đọc từ .forgity/local_structs.json)\nThực thi Pure In-Memory 0ms tại Rust Runner"]
    end

    subgraph Tier2["TẦNG 2: MASTER PIPELINE (Orchestration, Phân Luồng & Hợp Lưu)"]
        M_In["📥 Input: Folder / List .duf Files"] --> M_Inspect["🔍 Fast DUF Inspector + AI Classifier\n(Tách Body Files[] vs Clothes Files[])"]
        M_Inspect -->|body_files[]| M_Bake["⚡ [Parallel Batch] Daz Body Bake\n(Concurrency = 1 hoặc 2)"]
        M_Inspect -->|clothes_files[]| M_Cloth["⚡ [Parallel Batch] Wardrobe Export\n(Concurrency = 4)"]
        M_Bake -->|fbx_files[]| M_Joint["🔗 Node Joint / Barrier\n(Chờ cả 2 nhánh hoàn tất & Gộp mảng Multi-Wire)"]
        M_Cloth -->|fbx_files[]| M_Joint
        M_Joint -->|merged_fbx_files[]| M_UE["🎮 Unreal Character Ingest\n(Đánh thức UE5 1 lần duy nhất - Import trọn gói)"]
    end

    CP1 -.->|Auto-Gen Wrapper| AG1
    CP2 -.->|Auto-Gen Wrapper| AG1
    AG1 ==> M_Bake
    AG1 ==> M_Cloth
    CP3 ==> M_UE
```

### 2.1. Phân Tầng 2 Cấp Độ Pipeline: Component Pipe vs Master Pipeline
- **Component Pipe (Pipeline Đơn Vị / Thuần 1 DCC)**:
  - Mỗi Component Pipe được gắn cố định với **1 Executor duy nhất** ngay ở cấp độ Pipeline Header (ví dụ: `executor: "blender"`, `executor: "unreal"`, hoặc `executor: "python"`).
  - **Không cần vẽ khung `ScopeContainer` rườm rà trên Canvas nữa**: bản thân Component Pipe chính là một chiếc hộp DCC khép kín. Mọi script thả vào đều chạy trong cùng phiên DCC đó.
  - Đầu vào và đầu ra chỉ làm việc với kiểu dữ liệu nguyên thủy (`String`, `Number`, `Boolean`, `File Path`, `Array`, và `Local Struct`). Tuyệt đối không chứa `EntityRef` của Database.
- **Master Pipeline (Pipeline Lắp Ghép & Điều Phối)**:
  - Dùng để nối các Component Pipes lại với nhau thành dây chuyền sản xuất lớn (ví dụ: `Python/AI Classify` $\rightarrow$ `Blender Bake` + `Blender Clothes` $\rightarrow$ `Joint` $\rightarrow$ `Unreal Import`).
  - Hỗ trợ điều phối rẽ nhánh song song (**Sequence / Parallel Scatter**) và điểm hội tụ (**Joint / Barrier Gather**).

### 2.2. Cơ Chế "Auto-Gen" Thông Minh (Lấy cảm hứng từ Orval / TanStack Router)
1. **Auto-Gen Parallel Subpipeline (Thăng hạng Đơn lẻ $\rightarrow$ Song song/Tuần tự Hàng loạt)**:
   - Khi TA thiết kế xong một Component Pipe xử lý **1 file** (`duf_file: String` $\rightarrow$ `fbx_files: Array<String>`), hệ thống tự động sinh ra biến thể **Batch/Parallel** trong Palette (hoặc cho phép bật `Execution Mode: Single | Parallel Batch` ngay trên Node Inspector khi kéo Component Pipe vào Master Pipeline).
   - **Cơ chế nâng hạng Pin tự động**:
     - Input đơn `duf_file: String` tự động thăng hạng thành `duf_files: Array<String>`.
     - Các Input cấu hình tĩnh (như `bake_resolution: 2048`) được giữ nguyên và broadcast (truyền giống nhau) cho mọi tiến trình con.
     - Bổ sung tham số điều khiển `max_concurrency: Int` (mặc định `1` = chạy tuần tự từng file trong các process sạch độc lập; `>1` = chạy song song tối đa $N$ tiến trình).
     - Output `fbx_files: Array<String>` từ mỗi tiến trình con sẽ được Rust Runner chờ thu thập đủ 100% và **gộp phẳng (Flatten / Gather)** thành một mảng tổng duy nhất trước khi mở khóa cho node đứng sau.
2. **Auto-Gen Local Struct (`Make <Struct>` & `Break <Struct>`)**:
   - Các định nghĩa Struct được lưu tại `.forgity/local_structs.json` ngay trong Local Workspace (và đồng bộ 2 chiều với Studio DB khi Publish/Pull).
   - Ngay khi lưu một Struct (ví dụ `CharacterManifest` hoặc `BakeConfig`), hệ thống tự động sinh sẵn 2 node `Make CharacterManifest` và `Break CharacterManifest` trong Palette.
   - Các node `Make/Break` này mang cờ `is_pure: true`, được **Rust Runner giải quyết trực tiếp trong RAM (0ms)** bằng thao tác gộp/tách `serde_json::Value` mà không cần gọi về .NET Server hay mở Python.

### 2.3. Quy Tắc Ngữ Pháp Đồ Thị (`Exec` vs `Pure Data`) & Ranh Giới Thực Thi 1 Máy Trạm
1. **Phân định rõ `Action Nodes (Exec + Data)` và `Pure Helper Nodes (Data Only)`**:
   - **Action Nodes (Python/DCC Script, Component Pipe, Subpipeline, Joint)**: Giữ nguyên chân **`Exec In` / `Exec Out`** (dây trắng) + **`Data Pins`** để kiểm soát tuyệt đối thứ tự thời gian khi thao tác trên Scene 3D trong RAM (`bpy.context.scene`) hoặc điều phối rẽ nhánh/hợp lưu.
   - **Pure Helper Nodes (`Make <Struct>`, `Break <Struct>`, `Pipeline Input`)**: **CHỈ CÓ `Data Pins` (Không có chân `Exec`)**. Khi một Action Node cần dữ liệu từ `Make/Break Struct`, Rust Runner tự động lấy giá trị trong bộ nhớ (`0ms`) mà không bắt người dùng nối dây `Exec` đi vòng qua các node phụ trợ này.
2. **Quy tắc "1 Pipeline Execution = 1 Target Machine (Runner)"**:
   - Do trọng lực dữ liệu vật lý (Data Gravity: hàng chục file `.fbx`, textures `4K` và project Unreal `100GB+` nằm trên ổ đĩa cục bộ), một lần chạy Pipeline (dù là Component Pipe hay Master Pipeline) **luôn thực thi trọn vẹn từ đầu đến cuối trên 1 máy trạm (1 Runner) duy nhất**.
   - **Khai tử việc chọn `TargetRunnerId` lắt nhắt ở từng Stage con**: Việc chọn máy chạy chỉ diễn ra **1 lần duy nhất ở cấp độ Lệnh Chạy (`Run Pipeline`)**. Khi cần phối hợp nhiều máy khác nhau trong Studio, sử dụng các Pipelines độc lập nối với nhau qua sự kiện **Repository Sync / Trigger (`BL-032`)**.

### 2.4. Tái Định Nghĩa Vai Trò: Rust Runner vs .NET Backend Server
| Thành phần | Trách nhiệm cũ (Rườm rà) | Trách nhiệm mới (Thanh thoát & Đúng chỗ) |
| :--- | :--- | :--- |
| **Rust Runner (`forgity-runner`)** | Chỉ biết nhận từng `RunnerSegment` cắt vụn từ Server và chạy tuần tự từ trên xuống dưới. | **Execution Maestro & In-Memory Blackboard tại máy trạm**:<br/>- Đọc trực tiếp toàn bộ DAG của Pipeline.<br/>- Giữ **In-Memory Blackboard (`DashMap`)** lưu toàn bộ giá trị Output Pins trong RAM (`0.001ms`, Zero Network) kèm flush checkpoint ra đĩa `.forgity/runs/<run_id>/state.json` (thay thế hoàn toàn vai trò Redis/Server State Store lúc đang chạy).<br/>- Quản lý bộ đếm phụ thuộc (`remaining_dependencies`), hỗ trợ **Multi-wire Array Fan-in** và `Semaphore` Worker Pool.<br/>- Phát **Live Telemetry Stream** nhẹ (trạng thái node, tiến độ `3/10`, log tách theo từng slot) và gửi **1 bản chốt sổ (`FinalExecutionReport`)** khi kết thúc. |
| **.NET Backend (`api/`)** | Ôm đồm `DotNetSegment`, `BreakStruct`, `FormatString`, `ResolveResources`, cắt đồ thị, làm trạm trung chuyển state kiểu Redis qua RabbitMQ. | **Studio Control Plane, Licensing Gate & Out-of-Band Event Hooks**:<br/>- Quản lý kho lưu trữ (Repositories, Content Anchors, Versioning), phân quyền Studio và kiểm tra **License / Trial Quota Guard** trước khi giao DAG xuống Runner.<br/>- Forward tín hiệu Telemetry qua SignalR và chỉ ghi DB **1 lần duy nhất (Single Final Flush)** khi nhận báo cáo kết thúc từ Runner.<br/>- Lắng nghe sự kiện `PipelineExecutionCompleted` (kèm `output_manifest.json`) để tự động đăng ký Resource/Tags/Content vào Database **sau khi** Pipeline đã chạy xong. |

---

## 3. Lộ Trình Triển Khai Chi Tiết Theo 5 Giai Đoạn (Phased Roadmap)

### Phase 1: Dọn Dẹp Gông Cùm Core Server & Chuẩn Hóa Local UI Ergonomics
**Mục tiêu**: Cô lập các C# Server Tools cũ kỹ mang nặng tính Database khỏi luồng sáng tạo DCC Pipeline, đồng thời hoàn thiện UX của Local Workspace.

1. **Phân loại & Ẩn (Deprecate/Isolate) Legacy Server Tools**:
   - Đánh dấu `[Obsolete]` hoặc chuyển các C# tools phụ thuộc DB (`QueryWorkstationResourcesTool`, `FilterResourcesTool`, `ResolveResourcesTool`, `SyncLocalChangeToRepositoryTool`, `UpdateResourceMetadataTool`, `FormatStringTool`) vào nhóm ẩn `Legacy Studio DB Tools` (không hiển thị trong Palette mặc định của Local Workspace & DCC Component Pipes).
   - Chuẩn bị lộ trình loại bỏ `DotNetSegment` xen giữa các `RunnerSegment`.
2. **Chuẩn hóa Global Dialog Registry trên Frontend (`web/`)**:
   - Chuyển `UnpackLocalPackageDialog` và `PullStudioPipelineDialog` vào `web/src/stores/dialog-registry.ts` (sử dụng `useDialogStore.getState().open(...)`) thay vì truyền state `isOpen` thủ công qua nhiều tầng component, tuân thủ đúng chuẩn kiến trúc Dialog của dự án.
3. **Chuẩn hóa Input/Output File Path & Directory Picker**:
   - Đảm bảo trên Local Desktop (Tauri), các chân pin kiểu `Asset` / `FilePath` / `FolderPath` cho phép chọn trực tiếp file/folder trên ổ đĩa vật lý (`D:/...`) mà không bắt buộc phải thông qua `Workstation` hay `EntityRef`.

---

### Phase 2: Hệ Thống Local Structs (`.forgity/local_structs.json`) & Auto-Gen Make/Break
**Mục tiêu**: Giúp TA định nghĩa cấu trúc dữ liệu phức hợp ngay tại Local bằng JSON phẳng và tự động có ngay cặp công cụ đóng gói (`Make`) / bóc tách (`Break`) trong Palette mà không cần chạm tới Backend C#.

1. **Thiết kế Schema `.forgity/local_structs.json`**:
   ```json
   {
     "version": 1,
     "structs": [
       {
         "slug": "character_bake_item",
         "displayName": "Character Bake Item",
         "description": "Thông tin đầu vào cho 1 nhân vật cần bake",
         "fields": [
           { "name": "duf_path", "type": "Text", "description": "Đường dẫn file .duf" },
           { "name": "character_name", "type": "Text", "description": "Tên định danh nhân vật" },
           { "name": "bake_resolution", "type": "Number", "defaultValue": 2048 }
         ]
       }
     ]
   }
   ```
2. **Trình Quản Lý Struct Cục Bộ & Auto-Gen Palette**:
   - Bổ sung mục **Structs (`local_structs.json`)** vào `LocalWorkspaceOutliner.tsx` kèm Dialog tạo/sửa các trường (Fields) của Struct trực quan.
   - Viết bộ generator tự động (`structPaletteGenerator.ts` / Tauri Rust helper): Mỗi khi `local_structs.json` thay đổi, tự động sinh ra 2 `PaletteItemDto` ảo cho mỗi struct:
     - `core.struct.make.<slug>`: Các chân Input chính là danh sách `fields` của struct $\rightarrow$ 1 chân Output kiểu `Struct (<slug>)`.
     - `core.struct.break.<slug>`: 1 chân Input kiểu `Struct (<slug>)` $\rightarrow$ Các chân Output bung sẵn 100% theo `fields` (không cần chờ nối dây mới resolve như `BreakStructTool` cũ!).
3. **Đồng bộ 2 chiều (Studio Sync)**:
   - Khi đóng gói Export/Import Bundle hoặc Publish lên Studio, đính kèm danh sách `local_structs` được sử dụng bởi Pipeline để đảm bảo sang máy khác mở lên là chạy ngay.

---

### Phase 3: Kiến Trúc Pipeline 2 Tầng (Component Pipe vs Master Pipeline) & Auto-Gen Parallel Wrapper
**Mục tiêu**: Tách bạch rạch ròi giữa việc viết "Hộp công cụ đơn vị 1 DCC" (Component Pipe) và "Lắp ghép dây chuyền sản xuất" (Master Pipeline), kèm cơ chế tự động nâng cấp lên chạy Hàng loạt/Song song.

1. **Định nghĩa `pipelineKind: "component" | "master"` trong YAML & GraphData**:
   - **Khi tạo `Component Pipe`**:
     - Người dùng chọn ngay **Target Executor** (`blender`, `unreal`, `daz`, `python`).
     - Toàn bộ Canvas của Component Pipe mặc định thuộc về Executor đó — **loại bỏ hoàn toàn thao tác phải kéo `ScopeContainer` bọc bên ngoài**.
     - Khai báo rõ **Pipeline Inputs** (thông qua node `Start` / `PipelineInput`) và **Pipeline Outputs** (thông qua node mới `PipelineOutput` / `Return` để xuất rõ các chân đầu ra của hộp Component).
2. **Cơ chế Auto-Gen Component & Parallel Batch Node**:
   - Ngay khi một `Component Pipe` (ví dụ `daz_body_bake.pipeline.yaml`) được lưu:
     - Hệ thống tự động đọc chữ ký `Inputs` và `Outputs` của nó để đăng ký vào Palette dưới nhóm **Component Pipes**.
     - **Chế độ Batch / Parallel tự động**: Khi kéo Component Pipe này vào một `Master Pipeline`, trên **Node Inspector** sẽ có công tắc chuyển đổi (hoặc có sẵn 2 node trong Palette):
       - **Mode `Single` (1:1)**: Giữ nguyên chân `duf_file: Text` $\rightarrow$ `fbx_files: Array<Text>`.
       - **Mode `Parallel Batch` (N:N Gather)**:
         - Cho phép tích chọn chân Input nào là **Iterable Pin** (chân nhận danh sách phần tử cần lặp, ví dụ `duf_file` tự động đổi nhãn và kiểu thành `duf_files: Array<Text>`).
         - Hiển thị thanh trượt **`Max Concurrency`** (`1` = Tuần tự từng tiến trình sạch; `2..8` = Chạy song song $N$ tiến trình).
         - Các chân Output của Component Pipe tự động hoạt động ở chế độ **Barrier Gather & Flatten**: chờ toàn bộ $M$ phần tử trong mảng đầu vào chạy xong (dù `Max Concurrency = 1` hay `4`), gom tất cả kết quả lại thành một mảng tổng hợp duy nhất rồi mới kích hoạt node kế tiếp!

---

### Phase 4: Nâng Cấp Rust Runner (`forgity-runner`) Thành DAG Maestro & Concurrency Pool
**Mục tiêu**: Đưa toàn bộ trí tuệ điều phối đồ thị, chạy song song, gộp mảng nhiều dây (Multi-wire Fan-in) và nút hội tụ (`Joint / Barrier`) xuống tầng thực thi gốc bằng Rust siêu tốc.

1. **Bộ Điều Phối Đồ Thị Theo Bậc Phụ Thuộc (Topological Dependency Counter)**:
   - Thay vì chỉ chạy một danh sách phẳng (linear steps), `forgity-runner` nạp cấu trúc DAG:
     - Mỗi Node giữ một bộ đếm nguyên tử `remaining_dependencies: usize` (số lượng nhánh cha chưa hoàn thành).
     - Khi một Node hoàn tất, nó giảm bộ đếm của các Node con đi 1. Node con nào về `0` sẽ lập tức được đẩy vào `Ready Queue` của Tokio runtime để chạy ngay (cho phép Nhánh 1 `Bake Body` và Nhánh 2 `Export Clothes` tự động chạy song song nếu đủ tài nguyên!).
2. **Nút Hội Tụ `Joint / Barrier` & Cơ Chế Multi-Wire Array Fan-In**:
   - **Cho phép cắm nhiều dây vào cùng 1 chân Input kiểu `Array`** (ví dụ: dây `fbx_files[]` từ nhánh `Body Bake` và dây `fbx_files[]` từ nhánh `Wardrobe Clothes` cùng cắm vào chân `in_array` của node `Joint` hoặc cắm thẳng vào chân `fbx_files[]` của node `Unreal Ingest`).
   - **Quy tắc gộp mảng định hướng (Deterministic Array Concatenation)**:
     - Sắp xếp các dây đầu vào theo thứ tự ưu tiên cố định (theo thứ tự index dây nối hoặc tọa độ $Y$ của node nguồn từ trên xuống dưới) và nối phẳng (`flatten`) thành 1 mảng duy nhất: `[...branch_1_files, ...branch_2_files]`.
     - Chỉ khi **tất cả** các nhánh nối vào chân đó đều đã `Completed` (`remaining_dependencies == 0`), node đích mới được đánh thức dậy!
3. **Quản Lý Worker Pool Bằng `tokio::sync::Semaphore` & Process Isolation**:
   - Khi thực thi một Component Pipe ở chế độ `Parallel Batch (Max Concurrency = K)` với mảng đầu vào gồm $M$ files:
     - Rust Runner tạo một `Semaphore::new(K)`.
     - Với mỗi file $i \in [1..M]$, một Tokio task xin cấp phát 1 slot từ Semaphore, khởi chạy **một tiến trình DCC sạch hoàn toàn** (gắn vào Windows Job Object để đảm bảo không rò rỉ tiến trình zombie nếu hủy ngang) hoặc gửi lệnh qua Named Pipe tới Warm Process Pool (`BL-040`).
     - Ngay khi tiến trình của file $i$ kết thúc, giải phóng VRAM/RAM và nhả slot Semaphore cho file $i+1$ vào chạy.
     - Sau khi `join_all` toàn bộ $M$ tasks thành công, gộp mảng outputs và bắn tín hiệu mở khóa cho bước tiếp theo (ví dụ: đánh thức Unreal Engine dậy đúng 1 lần duy nhất để import toàn bộ).
4. **Thực Thi Tức Thì (`0ms`) Cho Pure Nodes Trong Rust**:
   - Các node `Make <Struct>`, `Break <Struct>`, `Joint / Merge Array`, `Route / Filter Array` được thực thi ngay trong bộ nhớ RAM của Rust bằng `serde_json::Value` mà không cần spawn bất kỳ tiến trình Python hay gọi API nào.
5. **In-Memory Blackboard (`DashMap`), Local Checkpoint (`state.json`) & Live Telemetry**:
   - **Thay thế hoàn toàn Redis / Server State Store lúc đang chạy**: Toàn bộ giá trị Output Pins (`(node_id, pin_id) -> serde_json::Value`) được giữ trong `DashMap` tại RAM của `forgity-runner` và tự động flush ra `.forgity/runs/<run_id>/state.json` sau mỗi bước (phục vụ Inspect giá trị chân pin, Resume/Retry ngay từ bước lỗi kể cả khi Offline, và deterministic per-item cache).
   - **Per-Slot Live Tracking**: Phát luồng sự kiện tiến độ thời gian thực (`NodeStateChanged`, `BatchItemProgress { completed, active, cached, total }`) và tách luồng stdout/stderr riêng biệt cho từng worker slot song song.
   - **Single Final Report Flush**: Khi chuyến chạy kết thúc, xuất báo cáo nghiệm thu `.forgity/runs/<run_id>/report.json` (thời gian chạy, danh mục file đầu ra, chi tiết lỗi từng phần tử) và gửi 1 lần duy nhất về `.NET Server` (nếu chạy ở chế độ Studio).

---

### Phase 5: Tái Cấu Trúc .NET Backend Thành Control Plane & Out-of-Band Event Hooks
**Mục tiêu**: Giải phóng Backend `.NET` khỏi gánh nặng cắt lát DAG, biến nó thành hệ thống quản trị Studio, kiểm soát bản quyền thương mại và lắng nghe sự kiện sau thực thi.

1. **Out-of-Band Post-Execution Hooks (Đăng ký tài nguyên tự động không làm bẩn DAG)**:
   - Pipeline chạy xong sẽ trả về một gói `ExecutionOutputManifest` chuẩn (chứa danh sách đường dẫn file đã sinh ra, thumbnails, tags, metadata).
   - Nếu Pipeline được kích hoạt từ **Studio Context** (ví dụ chạy từ một Repository hoặc Content Item trên Web/Desktop), một Wolverine Event Handler (`OnPipelineExecutionCompletedHandler`) trên Backend sẽ đọc `ExecutionOutputManifest` này để tự động cập nhật `Resources`, gắn `GameplayTags` và liên kết vào cây `ContentLinks` (`BL-031` / `BL-035`) — **mà người thiết kế Pipeline không cần phải gắn bất kỳ một node Database nào vào trong Canvas**!
2. **Đơn Giản Hóa `ExecPlanner` & Tích Hợp Cổng Bản Quyền (License/Quota Gate)**:
   - `ExecPlanner` trên Backend giờ chỉ làm nhiệm vụ: kiểm tra hợp lệ đồ thị (Preflight Gate), kiểm tra hạn mức thực thi (`BL-033` / `BL-042`), và đóng gói nguyên vẹn bản chụp DAG gửi xuống cho `forgity-runner` làm nhạc trưởng điều phối từ đầu đến cuối.

---

## 4. Tiêu Chí Nghiệm Thu Tổng Thể (Definition of Done)

1. **Độ gọn nhẹ của Đồ thị (Graph Simplicity)**:
   - Quy trình `Daz Character & Wardrobe -> Blender Bake/Export -> Unreal Engine 5 Ingest` giảm từ **20+ nodes (pha tạp DB/FormatString/BreakStruct)** xuống chỉ còn **3 Component Pipes đơn giản** ghép trong **1 Master Pipeline (4–5 nodes tổng cộng)**.
2. **Khả năng Chạy Offline / Local-First 100%**:
   - Toàn bộ Component Pipes, Local Structs (`Make/Break`), và Master Pipeline (bao gồm cả `Parallel Batch` và `Joint`) có thể soạn thảo và chạy thử trực tiếp tại Local Workspace trên Tauri Desktop với `forgity-runner` mà không cần đụng tới bảng `Resources` của PostgreSQL.
3. **Kiểm soát Tài nguyên & Đồng bộ Chuẩn xác**:
   - Khi truyền 5 files `.duf` vào node `Parallel Batch (Max Concurrency = 1 hoặc 2)`, Runner chạy đúng giới hạn tiến trình đồng thời, gom đủ kết quả của cả 5 files tại nút `Joint` trước khi gọi Unreal Engine import 1 lần duy nhất.
4. **Đảm bảo Chất lượng Build**:
   - `cargo check` (trên cả `runner/` và `web/src-tauri/`), `dotnet build`, và `pnpm --dir web build` đạt **0 errors**.

