# Kế Hoạch Thiết Kế & Triển Khai: Production-Grade Runner (Worker)

> **Tài liệu Kế hoạch Kỹ thuật (Master Technical Blueprint)**  
> **Vị trí**: `plans/workers/RUNNER_PRODUCTION_SETUP_PLAN.md`  
> **Trạng thái**: Đang triển khai (Active Execution)  
> **Cập nhật ngày**: 2026-09-26  
> **Tóm tắt tiến độ**: Đã hoàn thành 100% Nền tảng Backend DB, Dọn dẹp Worker Core, Hardware Scanner, gRPC Handlers và CLI. Đang tiến hành Giai đoạn 2: Hoàn thiện Frontend Management & Onboarding.

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
[ ĐÃ HOÀN TẤT ] ── Giai đoạn 1: Backend Database & Worker Core (Phần cứng, gRPC, CLI)
      │
      ▼
[ TRỌNG TÂM ] ── Giai đoạn 2: Hoàn thiện Frontend Runner Management & Onboarding UI
      │            ├─ 2.1: Dialog "Connect New Runner" (Sinh Token, copy lệnh 1-click)
      │            ├─ 2.2: Nâng cấp Runner Card (Hiển thị CPU, RAM, RTX 3050, VRAM, Disks)
      │            ├─ 2.3: Actions tương tác (Nút Re-scan Hardware & Scan Software từ xa)
      │            └─ 2.4: Chuẩn hóa thuật ngữ Runner trên toàn Frontend
      │
      ▼
[ GIAI ĐOẠN 3 ] ── Giai đoạn 3: Remote File/Folder Picker Chuẩn Phong Cách Blender
      │            ├─ Mở rộng gRPC: Drives (dung lượng free), System Places, Pinned Folders
      │            ├─ Component RemoteFilePicker 2-panel (Left Sidebar + Right Explorer)
      │            └─ Tích hợp vào Pipeline Form / Project Config (chọn .blend, .uproject từ xa)
      │
      ▼
[ GIAI ĐOẠN 4 ] ── Giai đoạn 4: Đóng Gói Phân Phối & Tự Khởi Động (Production Release)
                   ├─ Script `install.bat` 1-click (hỗ trợ cả CLI và click đúp nhập token)
                   ├─ Đóng gói kèm Python Embedded (~60MB zip độc lập, zero-dependency)
                   └─ Tự động hóa User Logon Task Scheduler (`runner.bat setup-autostart`)
```

---

## 4. Chi Tiết Các Giai Đoạn Tiếp Theo

### Giai Đoạn 2: Frontend Runner Management & Onboarding UI (Đang thực hiện)

Mục tiêu: Đóng kín vòng lặp trải nghiệm người dùng trên Web Dashboard ([RunnerPage.tsx](file:///d:/FullStack/Automation/web/src/features/runners/RunnerPage.tsx)).

1. **Task 2.1 - Onboarding Dialog (`ConnectRunnerDialog.tsx`)**:
   - Thêm nút chính **"Connect Runner"** trên Header trang Runners.
   - Bấm vào mở Dialog:
     - Gọi `useGenerateSetupToken` sinh Setup Token (hạn 15 phút).
     - Hiển thị Token rõ ràng với nút Copy.
     - Hiển thị câu lệnh 1-click để dán vào terminal máy trạm:
       ```bat
       .\runner.bat register
       ```
     - Kèm link tải gói Runner (chuẩn bị cho Giai đoạn 4).

2. **Task 2.2 - Nâng Cấp Runner Card UI**:
   - Thiết kế lại Card máy trạm trên Grid theo chuẩn thiết kế Shadcn/Tailwind:
     - **Header**: Tên máy tính (Hostname), Platform (Windows 11 AMD64), Badge trạng thái Online/Offline (Xanh/Xám).
     - **Hardware Badges**:
       - ⚡ **CPU**: Model CPU + Cores/Threads (e.g. AMD Ryzen 7 6800HS 16T).
       - 🧠 **RAM**: Tổng dung lượng (e.g. 15.3 GB).
       - 🎮 **GPU**: Card chính kèm VRAM (e.g. NVIDIA GeForce RTX 3050 Laptop GPU - 4.0 GB).
       - 💾 **Storage**: Các ổ đĩa chính (C: 54GB free, D: 156GB free).
     - **Last Seen / Scanned**: Thời điểm quét phần cứng gần nhất.

3. **Task 2.3 - Actions Tương Tác Trực Tiếp (Remote Triggers)**:
   - Nút **"Re-scan Hardware"**: Gọi `POST /runners/{id}/hardware/scan` ➔ máy trạm quét lại phần cứng và cập nhật realtime trên card.
   - Nút **"Scan Software"**: Gọi `POST /runners/{id}/executors/scan` ➔ hiển thị danh sách các bản Blender, Unreal, Python đã phát hiện trên máy đó.

4. **Task 2.4 - Chuẩn Hóa Thuật Ngữ**:
   - Rà soát các component (như `ProjectExecutorConfigTable.tsx`) đổi các chuỗi "Agent" thành "Runner" cho đồng bộ với toàn hệ thống.

---

### Giai Đoạn 3: Remote File/Folder Picker Chuẩn Phong Cách Blender

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

1. **Nâng cấp gRPC Contract (`agent.proto`)**:
   - Bổ sung `DriveInfoMessage` (mount, label, total_bytes, free_bytes).
   - Bổ sung `SystemPlaceMessage` (name, path).
   - Bổ sung `pinned_folders` (lưu tại local config máy trạm).
2. **Nâng cấp `core/system/file_browser.py` & Handler**:
   - Tự động phát hiện các ổ đĩa và thư mục hệ thống (Desktop, Downloads, Home) trong < 3ms.
   - Hỗ trợ thêm/xóa Pinned Folders vào `agent_config.json`.
3. **Xây dựng Component `RemoteFilePicker.tsx` (Frontend)**:
   - Left Sidebar: Drives với thanh dung lượng, System Places, Pinned Folders.
   - Right Explorer: Breadcrumb, tìm kiếm nhanh, lọc theo extension (`.blend`, `.uproject`).
   - Hai chế độ: Chọn Thư mục (Folder mode) hoặc Chọn Tệp (File mode).

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
