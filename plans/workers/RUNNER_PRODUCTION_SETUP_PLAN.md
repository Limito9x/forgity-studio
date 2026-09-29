# Kế Hoạch Thiết Kế & Triển Khai: Production-Grade Runner (Worker)

> **Tài liệu Kế hoạch Kỹ thuật (Master Technical Blueprint)**  
> **Vị trí**: `plans/workers/RUNNER_PRODUCTION_SETUP_PLAN.md`  
> **Trạng thái**: Hoàn thành Giai đoạn 1-3 (Phase 1-3 Done 100% ✅), Giai đoạn 4 = Future  
> **Cập nhật ngày**: 2026-09-28  
> **Tóm tắt tiến độ**: Đã hoàn thành 100% Giai đoạn 1 (Backend Core, Scanner, gRPC), Giai đoạn 2 (Frontend Management, Onboarding Dialog, Runner Card, Software Catalog), và Giai đoạn 3 (Remote File/Folder Browser 2-panel). Giai đoạn 4 (Đóng gói phân phối) dành cho tương lai.

---

## 1. Tầm Nhìn & Viễn Cảnh Vận Hành (The "Remote Control" Vision)

Mục tiêu tối thượng của Runner là **biến chiếc PC đồ họa mạnh mẽ tại nhà/studio thành một trạm tính toán đám mây cá nhân (Personal Cloud Node)**:

1. **Cài đặt 1 lần duy nhất**: Người dùng tải gói Runner về PC, chạy file `install.bat` hoặc 1 dòng lệnh với Setup Token. Runner tự động thiết lập chạy ngầm cùng Windows mỗi khi đăng nhập.
2. **Điều khiển từ mọi nơi (Web First)**:
   - Mở Web Dashboard thấy ngay máy trạm ở nhà đang **Online**, cấu hình phần cứng hiển thị trực quan (`NVIDIA RTX 3050 4GB`, `16GB RAM`, `AMD Ryzen 7 16 Threads`, `Idle`).
   - Mở modal cấu hình Pipeline: Bấm nút **"Browse Remote Files"** ➔ Màn hình hiện lên một File Browser trực quan giống hệt Blender: có ổ `C:`, ổ `D:`, thư mục `Desktop`, các folder dự án đã ghim.
   - Chọn file `D:/Projects/Scene_01.blend`, chọn bản `Blender 5.2`, bấm **"Start Pipeline"**.
   - Máy trạm tự động nhận lệnh qua RabbitMQ/gRPC, kích hoạt tiến trình render ngầm, stream log và thông số GPU trực tiếp về Web.

---

## 2. Các Hạng Mục ĐÃ HOÀN TẤT (Completed Foundation) ✅

Toàn bộ nền tảng cốt lõi từ Backend đến Worker Daemon đã được triển khai và kiểm thử hoàn tất:

### 2.1. Backend Core & Database (`api/`) ✅
- **Entity & PostgreSQL JSONB**:
  - [Runner.cs](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Domain/Entities/Runner.cs): Đã bổ sung 5 cột indexable (`OsPlatform`, `CpuModel`, `TotalRamBytes`, `PrimaryGpuName`, `PrimaryGpuVramBytes`), `LastHardwareScannedAt`, và cột JSONB `HardwareDetails` ([RunnerHardwareProfile.cs](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Domain/Entities/RunnerHardwareProfile.cs)).
  - Đã sinh và áp dụng EF Core Migration: `20260926054054_AddRunnerHardwareProfile`.
- **Vertical Slice Architecture Endpoints**:
  - [ScanRunnerHardware.cs](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Features/Runners/ScanRunnerHardware.cs): `POST /runners/{runnerId}/hardware/scan` kích hoạt Runner quét lại phần cứng từ xa qua gRPC.
  - [UpdateRunnerHardwareProfile.cs](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Features/Runners/UpdateRunnerHardwareProfile.cs): `POST /runners/{runnerId}/hardware-profile` cho phép Runner push snapshot khi khởi động hoặc chạy lệnh rescan.
  - [ScanExecutors.cs](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Features/Runners/ScanExecutors.cs): `POST /runners/{runnerId}/executors/scan` kích hoạt Runner quét phần mềm đồ họa cài đặt.
  - `IRunnerApi` & `RunnerApiService`: Triển khai `SendScanHardwareCommandAsync` và `SendScanExecutorsCommandAsync`.
  - **Build status**: `dotnet build Automation.sln` đạt **0 Warning / 0 Error**.

### 2.2. Worker Daemon & System Core (`workers/`) ✅
- **Dọn dẹp & Tái cấu trúc chuẩn công nghiệp**:
  - Xóa bỏ các file rác cũ (`run_worker.bat`, `inspector_consumer.py`, queue `tasks.inspect`).
  - Di chuyển các script Admin/Dev vào [workers/tools/](file:///d:/FullStack/Automation/workers/tools/) (`compile_protos.py`, `purge_queues.py`).
  - Toàn bộ code, docstring, log, CLI prompts được chuyển đổi **100% sang tiếng Anh**.
  - **Bảo tồn tuyệt đối**: Các Stage Runners ([stage_runner.py](file:///d:/FullStack/Automation/workers/worker/scripts/stage_runner.py), [ue_stage_runner.py](file:///d:/FullStack/Automation/workers/worker/scripts/ue_stage_runner.py)) được giữ nguyên vẹn 100%.
- **Zero-Dependency Hardware Scanner** ([core/system/hardware.py](file:///d:/FullStack/Automation/workers/core/system/hardware.py)):
  - Sử dụng Windows Registry + ctypes native (không cần quyền Admin, không phụ thuộc WMI/psutil).
  - Quét trong **0.15s**: CPU (AMD Ryzen 7 16 threads), 16GB RAM, Dual GPU (AMD Radeon iGPU + NVIDIA GeForce RTX 3050 Laptop GPU 4GB VRAM [PRIMARY]), Ổ đĩa C & D.
- **Graphics Software Scanners** ([core/executors/](file:///d:/FullStack/Automation/workers/core/executors)):
  - Tách kiến trúc Base-First: [blender_scanner.py](file:///d:/FullStack/Automation/workers/core/executors/blender_scanner.py) (Registry, Steam, PATH), [unreal_scanner.py](file:///d:/FullStack/Automation/workers/core/executors/unreal_scanner.py) (Epic Games Launcher), [python_scanner.py](file:///d:/FullStack/Automation/workers/core/executors/python_scanner.py) (Host AI/DCC Python).
- **gRPC Contract & Handlers** ([handlers/](file:///d:/FullStack/Automation/workers/handlers/)):
  - [packages/proto/agent.proto](file:///d:/FullStack/Automation/packages/proto/agent.proto): Bổ sung `ScanHardwareCommand` & `ScanHardwareCommandResult`. Đã biên dịch sang C# và Python.
  - Handlers độc lập: [hardware_handler.py](file:///d:/FullStack/Automation/workers/handlers/hardware_handler.py), [executor_handler.py](file:///d:/FullStack/Automation/workers/handlers/executor_handler.py), [browse_handler.py](file:///d:/FullStack/Automation/workers/handlers/browse_handler.py), [scan_handler.py](file:///d:/FullStack/Automation/workers/handlers/scan_handler.py).
  - [commands/connect.py](file:///d:/FullStack/Automation/workers/commands/connect.py): Tinh gọn thành gRPC dispatcher thuần túy (~85 dòng).
- **CLI Entrypoint & Launcher** ([runner.bat](file:///d:/FullStack/Automation/workers/runner.bat) + [cli.py](file:///d:/FullStack/Automation/workers/cli.py)):
  - `runner.bat rescan-hardware`: Tái quét phần cứng tại chỗ và đồng bộ lên server.
  - `runner.bat diagnose`: Báo cáo 5 phần toàn diện (Identity, Hardware, Engines, RabbitMQ, gRPC).
  - `runner.bat start`: Khởi động worker ngầm + **Auto-diff hardware trên boot**.
  - `runner.bat register`: Kích hoạt bằng Setup Token, tự scan hardware ban đầu.

---

## 3. Lộ Trình Triển Khai Mới (Updated Roadmap)

```
[ ĐÃ HOÀN TẤT ✅ ] ── Giai đoạn 1: Backend Database & Worker Core (Phần cứng, gRPC, CLI)
      │
      ▼
[ ĐÃ HOÀN TẤT ✅ ] ── Giai đoạn 2: Hoàn thiện Frontend Runner Management & Onboarding UI
      │                ├─ 2.1: Dialog "Connect New Runner" (Sinh Token, copy lệnh 1-click)
      │                ├─ 2.2: Nâng cấp Runner Card (Hiển thị CPU, RAM, RTX 3050, VRAM, Disks)
      │                ├─ 2.3: Actions tương tác (Nút Re-scan Hardware & Scan Software từ xa)
      │                └─ 2.4: Chuẩn hóa thuật ngữ Runner trên toàn Frontend
      │
      ▼
[ ĐÃ HOÀN TẤT ✅ ] ── Giai đoạn 3: Remote File/Folder Picker Chuẩn Phong Cách Blender
      │                ├─ Mở rộng gRPC: Drives (dung lượng free), System Places, Pinned Folders
      │                ├─ Component RemoteFilePicker 2-panel (Left Sidebar + Right Explorer)
      │                └─ Tích hợp vào Pipeline Form / Project Config (chọn .blend, .uproject từ xa)
      │
      ▼
[ FUTURE 🔮 ] ───── Giai đoạn 4: Đóng Gói Phân Phối & Tự Khởi Động (Production Release)
                       ├─ Script `install.bat` 1-click (hỗ trợ cả CLI và click đúp nhập token)
                       ├─ Đóng gói kèm Python Embedded (~60MB zip độc lập, zero-dependency)
                       └─ Tự động hóa User Logon Task Scheduler (`runner.bat setup-autostart`)
```

---

## 4. Chi Tiết Các Giai Đoạn Tiếp Theo

### Giai Đoạn 2: Frontend Runner Management & Onboarding UI (Hoàn thành 100% ✅)

Mục tiêu: Đóng kín vòng lặp trải nghiệm người dùng trên Web Dashboard ([RunnerPage.tsx](file:///d:/FullStack/Automation/web/src/features/runners/RunnerPage.tsx)).

- [x] **Phase 2.1 - Data Layer & Custom Hooks**:
  - Đã tạo [types.ts](file:///d:/FullStack/Automation/web/src/features/runners/types.ts): Mở rộng `RunnerDto` với `RunnerHardwareProfile`, `RunnerGpuInfo`, `RunnerDiskInfo`, `ExecutorCandidateDto`.
  - Đã tạo [hardwareFormatter.ts](file:///d:/FullStack/Automation/web/src/features/runners/utils/hardwareFormatter.ts): Format bytes (B/MB/GB/TB), rút gọn nhãn GPU/CPU, tính toán % ổ đĩa và relative time bằng Temporal API.
  - Đã nâng cấp [useRunners.ts](file:///d:/FullStack/Automation/web/src/features/runners/hooks/useRunners.ts): Sử dụng 100% API sinh bởi Orval qua `createMutationHook`.

- [x] **Phase 2.2 - Onboarding Dialog (`ConnectRunnerDialog.tsx`)**:
  - Tạo [ConnectRunnerDialog.tsx](file:///d:/FullStack/Automation/web/src/features/runners/dialogs/ConnectRunnerDialog.tsx) kế thừa `BaseDialog` với giao diện UI/UX Pro Max, tự động sinh Setup Token, hiển thị thời hạn 15 phút, copy token và copy câu lệnh 1-click `.\runner.bat register`.
  - Đăng ký dialog vào Global Dialog Registry tại [dialogs/index.ts](file:///d:/FullStack/Automation/web/src/features/runners/dialogs/index.ts).
  - Tích hợp nút Primary **"Connect Runner"** trên Header và Empty State của [RunnerPage.tsx](file:///d:/FullStack/Automation/web/src/features/runners/RunnerPage.tsx).

- [x] **Phase 2.3 - Nâng Cấp Runner Card UI**:
  - Đã tạo [RunnerCard.tsx](file:///d:/FullStack/Automation/web/src/features/runners/components/RunnerCard.tsx): Hiển thị sống động Hostname, Platform, Online badge với animation pulsing dot xanh lá.
  - Hiển thị đầy đủ thông số phần cứng: Processor (CPU kèm số luồng), System Memory (RAM), Primary Graphics (GPU RTX 3050 + VRAM badge), Storage Drives (thanh tiến trình progress bar trực quan ổ C và D).
  - Tích hợp nút Re-scan trực tiếp trên Card và hiển thị thời gian quét tương đối chuẩn Temporal API.

- [x] **Phase 2.4 - Chuẩn Hóa Toàn Diện Thuật Ngữ "Agent" ➔ "Runner" Trên UI**:
  - Đã rà soát và chuyển đổi toàn bộ chuỗi hiển thị liên quan đến máy trạm từ "Agent" sang "Runner".
  - [ProjectExecutorConfigTable.tsx](file:///d:/FullStack/Automation/web/src/features/projects/components/ProjectExecutorConfigTable.tsx), [UpsertProjectExecutorConfigForm.tsx](file:///d:/FullStack/Automation/web/src/features/projects/components/UpsertProjectExecutorConfigForm.tsx), [UpsertProjectExecutorConfigDialog.tsx](file:///d:/FullStack/Automation/web/src/features/projects/dialogs/UpsertProjectExecutorConfigDialog.tsx).
  - [RunPipelineModal.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/dialogs/RunPipelineModal.tsx), [LiveExecutionDrawer.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/LiveExecutionDrawer.tsx), [NodeMetaForm.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/components/node-editor/NodeMetaForm.tsx), [PipelineStartNodeInspector.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/PipelineStartNodeInspector.tsx).

- [x] **Phase 2.5 - Quản Lý & Phát Hiện Phần Mềm DCC (`RunnerSoftwareDialog.tsx`)**:
  - Đã xây dựng mảng catalog metadata [dccEngines.ts](file:///d:/FullStack/Automation/web/src/features/runners/constants/dccEngines.ts) định nghĩa các ứng dụng DCC (Blender 3D, Unreal Engine, Python, Maya, 3ds Max, Houdini, Cinema 4D, Daz Studio, Unity) kèm CDN SVG icons chuẩn hãng (SimpleIcons), brand colors, category.
  - Đã tạo [RunnerSoftwareDialog.tsx](file:///d:/FullStack/Automation/web/src/features/runners/dialogs/RunnerSoftwareDialog.tsx): Kết nối API `useScanRunnerExecutors`, render danh sách ứng dụng với Logo SVG, Version badge, đường dẫn executable path kèm nút 1-click copy, trạng thái Valid badge và nút Re-scan.
  - Đăng ký dialog vào `GlobalDialogRegistry` và liên kết với nút **Software** trên mỗi [RunnerCard.tsx](file:///d:/FullStack/Automation/web/src/features/runners/components/RunnerCard.tsx).
  - Đã kiểm tra `pnpm run typecheck` và `pnpm build` đạt 0 Error, 0 Warning.


---

### Giai Đoạn 3: Remote File/Folder Picker Chuẩn Phong Cách Blender (Hoàn Thành 100% ✅)

Mục tiêu: Cho phép người dùng ngồi từ xa duyệt file/folder trên máy trạm thông qua giao diện Web 2 cột trực quan.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 📁 Remote File Browser (Runner: DESKTOP-DNN7HQ6)                                                    │
├────────────────────────────────┬────────────────────────────────────────────────────────────────────┤
│ ◀ LEFT SIDEBAR                 │ ▶ RIGHT CONTENT EXPLORER                                           │
│                                │                                                                    │
│ 🖥️ SYSTEM (Drives)             │ [ ◀ ] [ ▲ ]  D:/Projects/VFX_Shot01/Assets/  [ 🔍 Search... ] [ 🔄 ]│
│   💽 C: [OS]      (54GB Free)  │ ────────────────────────────────────────────────────────────────── │
│   💽 D: [DATA]    (156GB Free) │ Mode: [ All Blender Files (*.blend) ▼ ]                            │
│                                │                                                                    │
│ 📌 SYSTEM PLACES               │ [📁 ..]                                                            │
│   🏠 Home (User Profile)       │ [📁 textures]                               02/09/2026    Folder   │
│   🖥️ Desktop                   │ [📁 cache]                                  02/09/2026    Folder   │
│   📄 Documents                 │ [📦 character_rig.blend]         142.5 MB   01/09/2026    Blender  │
│   📥 Downloads                 │ [📦 environment_lighting.blend]  312.0 MB   28/08/2026    Blender  │
│                                │                                                                    │
│ ⭐ PINNED FOLDERS              │                                                                    │
│   📂 D:/Projects/VFX_Shot01    │                                                                    │
├────────────────────────────────┴────────────────────────────────────────────────────────────────────┤
│ Selected: [ D:/Projects/VFX_Shot01/Assets/character_rig.blend                                    ] │
│ Mode: File Picker (Extensions: .blend, .fbx)               [ Cancel ]  [ Select File (Open) ]       │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- [x] **3.1. Nâng cấp gRPC Contract (`agent.proto`)**:
  - Bổ sung `message SystemPlaceMessage { string name = 1; string path = 2; }`.
  - Mở rộng `BrowseCommandResult` với `repeated SystemPlaceMessage system_places = 5;` và `repeated string pinned_folders = 6;`.
  - Chạy `python tools/compile_protos.py` sinh lại mã Python gRPC stubs.
- [x] **3.2. Cập nhật Python Worker (`browse_handler.py`)**:
  - Tự động gọi `get_system_places()` và `get_pinned_folders()` trả về cùng dữ liệu duyệt file.
- [x] **3.3. Cập nhật Backend .NET**:
  - Bổ sung `RunnerSystemPlaceDto`, ánh xạ `SystemPlaces` và `PinnedFolders` trong `RunnerApiService.cs` và `DiscoverRunnerFolder.cs`.
  - Khởi động lại Backend API, chạy `pnpm run gen:api` đồng bộ types `SystemPlaceDto`, `pinnedFolders`.
- [x] **3.4. Xây dựng Component 2-Panel `FolderBrowser.tsx` & `RemoteFileBrowserDialog.tsx`**:
  - **Left Sidebar**: 
    - 📌 **System Places**: Home, Desktop, Downloads, Documents (icon trực quan, click nhảy ngay).
    - 💽 **Drives**: C:, D: với dung lượng free + progress bar cảnh báo đổi màu.
    - ⭐ **Pinned Folders**: Ghim / Bỏ ghim thư mục yêu thích (đồng bộ runner config và client state).
    - 🖥️ **Target Machine**: Hiển thị tên máy và machineKey.
  - **Right Explorer**: Breadcrumbs, Search, icon riêng biệt cho Unreal (.uproject), Blender (.blend), scripts và files.
  - Chạy `pnpm run typecheck` (`tsc -b`): **Thành công 100% (0 errors, 0 warnings)**.

---

### Giai Đoạn 4: Đóng Gói Phân Phối & Tự Khởi Động (Production Release)

Mục tiêu: Đưa Runner thành một gói phần mềm độc lập, người dùng không cần cài đặt Python.

1. **Script Cài Đặt Tự Động (`install.bat`)**:
   - Hỗ trợ 2 chế độ:
     - **Chế độ dòng lệnh**: `.\install.bat --token <SETUP_TOKEN>` (tự chạy im lặng từ đầu đến cuối).
     - **Chế độ tương tác**: Click đúp file `install.bat` ➔ nhắc người dùng dán Setup Token từ Web.
   - Tự động lấy Hostname, MachineKey, đăng ký với server, quét phần cứng và khởi động background daemon.
2. **Đóng Gói Gọn Gàng Kèm Python Embedded**:
   - Sử dụng **Python 3.12/3.13 Embedded** chính thức (~40MB).
   - Đã nhúng sẵn các dependency nhẹ (`grpcio`, `protobuf`, `pika`).
   - Tổng kích thước gói zip: **~60MB**. Người dùng chỉ việc giải nén và chạy.
3. **Chạy Ngầm Cùng Windows (Windows Task Scheduler)**:
   - Tránh cạm bẫy Session 0 Isolation của Windows Service (làm mất quyền tăng tốc phần cứng GPU NVIDIA và ổ đĩa mạng).
   - Lệnh `runner.bat setup-autostart` tự động đăng ký **User Logon Task**:
     - Khởi chạy tĩnh lặng bằng `pythonw.exe` (không hiện cửa sổ console đen).
     - Giữ 100% quyền GPU NVIDIA CUDA/OptiX và ổ đĩa mạng.
     - Tự động khởi động lại nếu tiến trình gặp sự cố.
