# Kế Hoạch Thiết Kế & Triển Khai: Production-Grade Runner (Worker)

> **Tài liệu Kế hoạch Kỹ thuật (Technical Planning Document)**  
> **Vị trí**: `plans/workers/RUNNER_PRODUCTION_SETUP_PLAN.md`  
> **Ngày lập**: 2026-09-24  
> **Mục tiêu**: Chuẩn hóa toàn diện Automation Runner từ bản PoC thành hệ thống Daemon máy trạm chuẩn công nghiệp: Không tạo lại bánh xe, đóng gói độc lập, định danh phần cứng (Hardware Profiling), tách biệt tính năng quét Executor Config, và vận hành bền bỉ dưới dạng Windows Service.

---

## 1. Triết Lý Thiết Kế: "Không Tạo Lại Bánh Xe"

Thay vì tự phát minh ra các cơ chế phức tạp, kiến trúc Runner kế thừa các tiêu chuẩn đã được kiểm chứng từ các sản phẩm hàng đầu:
- **GitHub Actions & GitLab Runner**: Cơ chế **Ephemeral Setup Token** (Token dùng 1 lần, hết hạn sau 1h để đổi lấy Machine Key dài hạn) + Gói chạy tự chứa (Self-contained).
- **Flamenco (Blender Foundation)**: Cơ chế bắt tay nhận diện máy trạm đồ họa, tách bạch giữa **năng lực phần cứng** (GPU/VRAM) và **phần mềm cài đặt** (Blender versions).
- **Cloudflare Tunnel / WinSW**: Cơ chế bọc Daemon thành **Windows Service** nhẹ nhàng, tự khởi động cùng máy tính, tự phục hồi khi crash mà không cần mở cửa sổ dòng lệnh màu đen.

---

## 2. Mô Hình Phân Tầng Thông Tin Máy Trạm (Workstation Hierarchy)

Cần phân định rạch ròi 2 tầng thông tin để tránh xung đột dữ liệu:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RUNNER CORE (Phần Cứng)                         │
│  - Hostname, OS, Platform (Windows 11 x64)                             │
│  - Machine Key (MAC Address + Motherboard UUID)                        │
│  - Hardware Spec:                                                      │
│    ├── CPU: Model, Cores, Threads (e.g. AMD Ryzen 9 7950X, 16C/32T)   │
│    ├── RAM: Total Memory (e.g. 64GB)                                   │
│    └── GPU: NVIDIA RTX 4090, 24GB VRAM, CUDA Driver 560.xx             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Liên kết Many-to-Many
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   EXECUTOR CONFIGS (Phần Mềm Đồ Họa)                  │
│  (Quản lý độc lập - Có thể quét lại hoặc thêm/bớt thủ công)            │
│  ├── Blender:                                                          │
│  │   ├── v4.2 -> C:\Program Files\Blender Foundation\Blender 4.2       │
│  │   └── v5.2 -> C:\...\Blender 5.2\blender.exe                        │
│  ├── Unreal Engine:                                                    │
│  │   └── v5.4 -> D:\Epic Games\UE_5.4\Engine\Binaries\Win64\...        │
│  └── Python Standalone:                                                │
│      └── v3.12 -> C:\Users\...\AppData\Local\Programs\Python           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Kiến Trúc Chi Tiết Từng Trọng Tâm

### 3.1. Đóng Gói Phân Phối (Packaging & Distribution)
- **Vấn đề của PoC**: Máy trạm phải có sẵn Python, phải clone repo, cài `pip install`, dễ xung đột môi trường.
- **Giải pháp Production**:
  - Đóng gói toàn bộ `workers/` thành gói độc lập (Self-contained Archive `.zip` hoặc installer):
    - Sử dụng **Embedded Python 3.12** (chính thức từ Python.org, chỉ ~15MB) đi kèm folder thư viện độc lập `site-packages/`.
    - Cung cấp file thực thi chính: `automation-runner.exe` (hoặc bootstrap launcher `runner.bat`).
  - **Trải nghiệm người dùng**:
    - Tải file `automation-runner-win-x64.zip` từ trang Studio Settings hoặc Web Dashboard.
    - Giải nén ra thư mục bất kỳ (ví dụ: `C:\AutomationRunner`). Không yêu cầu quyền Administrator để giải nén.

---

### 3.2. Quy Trình Cấp Token & Xác Thực An Toàn (Pairing Flow)

1. **Trên Web UI (Studio Admin)**:
   - Người dùng bấm **"Add Runner to Studio"**.
   - Backend sinh một **Setup Token** (ký JWT hoặc mã UUID có thời hạn 30-60 phút, chứa `StudioId` đích).
   - Web hiển thị:
     - **Option A (One-Liner PowerShell - Khuyên dùng)**: Đoạn lệnh copy gồm tải zip -> giải nén -> chạy lệnh đăng ký.
     - **Option B (Thủ công)**: Setup Token dạng chuỗi text để paste vào file config hoặc CLI.
2. **Trên Máy Trạm (Workstation Registration)**:
   - Lệnh đăng ký:
     ```powershell
     .\automation-runner.exe register --url "https://api.my-studio.com" --token "std-tk-9a8b7c..."
     ```
   - **Các bước Runner thực hiện ngầm**:
     - Thu thập thông tin phần cứng (CPU, RAM, GPU qua `wmic` / `nvidia-smi`).
     - Gửi request `POST /api/runners/register-with-token` lên Backend.
     - Backend xác thực Setup Token ➔ Đăng ký Runner vào Database ➔ Liên kết vào Studio tương ứng ➔ Trả về **Machine Secret (Permanent Token)**.
     - Runner lưu cấu hình bảo mật vào file cục bộ: `%LOCALAPPDATA%\AutomationStudio\runner_config.json` (chỉ user sở hữu máy mới đọc được).

---

### 3.3. Thu Thập & Nhúng Cấu Hình Phần Cứng (Hardware Profiling)
Module `hardware_info.py` tự động chạy khi khởi động và đăng ký:
- **CPU**: Tên chip, số nhân/luồng (`platform.processor()`, `psutil.cpu_count()`).
- **RAM**: Dung lượng RAM vật lý (`psutil.virtual_memory().total`).
- **GPU (Tối quan trọng cho VFX/3D)**:
  - Gọi công cụ tiêu chuẩn `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits` (có fallback qua DirectX/WMI nếu máy không có card NVIDIA).
  - Lấy được: Tên GPU (e.g. `RTX 4090`), VRAM (e.g. `24576 MB`), Driver version.
- **Ý nghĩa**:
  - Giúp Web Dashboard hiển thị cấu hình máy trực quan.
  - Sau này Pipeline Engine có thể route Job thông minh (ví dụ: Job bake texture 8K chỉ giao cho máy có VRAM ≥ 16GB).

---

### 3.4. Quét & Bổ Sung Executor Config (Tính Năng Riêng Biệt)
- Đây là một tiến trình **độc lập với đăng ký phần cứng**:
  - Runner có lệnh:
    ```powershell
    .\automation-runner.exe scan-executors
    ```
  - Hoặc Backend có thể gửi tín hiệu từ xa qua gRPC: **"Request Runner re-scan software"**.
- **Cơ chế quét (Scanner)**:
  - **Blender Scanner**:
    - Quét registry `SOFTWARE\BlenderFoundation`
    - Quét các thư mục mặc định: `C:\Program Files\Blender Foundation\*`
    - Quét `PATH` môi trường
    - Đọc version thực tế bằng lệnh `blender.exe --version`
  - **Unreal Engine Scanner**:
    - Quét registry `SOFTWARE\EpicGames\Unreal Engine`
    - Quét các ổ đĩa phổ biến `C:\`, `D:\Program Files\Epic Games\UE_*`
  - **Báo cáo**:
    - Gửi danh sách phát hiện lên API `POST /api/runners/{runnerId}/executors/report`.
    - Trên Web UI có trang quản lý **Executor Configs** cho từng Runner: người quản lý có thể kích hoạt, tắt, hoặc tự thêm một đường dẫn tùy chỉnh (Custom Path).

---

### 3.5. Vận Hành Dưới Dạng Windows Service (Persistent Background Daemon)
- Để Runner chạy thực sự "nghiêm túc", nó không thể là một cửa sổ console cmd mà người dùng vô tình bấm tắt là chết.
- **Giải pháp**:
  - Sử dụng **WinSW (Windows Service Wrapper)** hoặc **NSSM**: Một file binary wrapper mã nguồn mở, kích thước ~500KB, tiêu chuẩn công nghiệp cho Windows.
  - Runner tích hợp lệnh quản lý:
    ```powershell
    .\automation-runner.exe service install    # Cài đặt Windows Service tự chạy cùng máy
    .\automation-runner.exe service start      # Bật dịch vụ ngầm
    .\automation-runner.exe service status     # Kiểm tra trạng thái
    .\automation-runner.exe service uninstall  # Gỡ bỏ dịch vụ
    ```
  - Khi cài làm Service:
    - Log ghi tự động ra file xoay vòng (rotating log): `%LOCALAPPDATA%\AutomationStudio\logs\runner.log`.
    - Tự động restart nếu bị crash bất ngờ.
    - Không hiển thị bất kỳ cửa sổ console nào làm phiền nghệ sĩ 3D đang làm việc trên máy trạm.

---

## 4. Lộ Trình Triển Khai Từng Bước (Roadmap Nghiên Cứu & Thực Hiện)

### Giai đoạn 1: Chuẩn Hóa Contracts & API Backend
1. Hoàn thiện bảng `Runner`:
   - Bổ sung các cột: `CpuInfo`, `RamTotalBytes`, `GpuName`, `GpuVramBytes`, `OsVersion`.
2. Tạo API cấp `SetupToken` (`POST /api/studios/{id}/setup-tokens`) và API đăng ký (`POST /api/runners/register-with-token`).
3. Chuẩn hóa API nhận diện Executors (`POST /api/runners/{id}/executors/report`).

### Giai đoạn 2: Nâng Cấp Module Worker Python
1. Viết module `core/hardware.py`: Thu thập CPU, RAM, GPU NVIDIA chuẩn xác, chịu lỗi (fail-safe nếu không có GPU).
2. Tách module `commands/scan_executors.py`: Tự động tìm Blender & Unreal trên Windows.
3. Cập nhật `commands/register.py`: Nhận argument CLI không tương tác (`--url`, `--token`, `--name`), tự chạy hardware scan và gửi lên Backend.

### Giai đoạn 3: Đóng Gói Phân Phối & Windows Service
1. Chuẩn bị thư mục phân phối `dist/` với Embedded Python 3.12 sạch sẽ.
2. Tích hợp `winsw.exe` và file template `runner-service.xml` để hỗ trợ lệnh `service install`.
3. Viết script bootstrap cài đặt nhanh `install.ps1`.

### Giai đoạn 4: Trải Nghiệm Giao Diện Trên Web
1. Xây dựng Dialog **"Connect Runner"** trên Frontend:
   - Hiển thị tab PowerShell One-Liner (có nút Copy nhanh).
   - Hiển thị tab Setup Token thủ công.
2. Nâng cấp bảng **Runners**:
   - Hiển thị badge phần cứng (GPU `RTX 4090 24GB`, RAM `64GB`).
   - Drawer/Tab xem các Executors (Blender 4.2, Blender 5.2) đã phát hiện trên máy đó.

---

## 5. Kết Luận
Cách tiếp cận này giúp dự án:
- **Đạt chuẩn công nghiệp**: Ổn định, an toàn, không phụ thuộc vào việc máy trạm có cài Python hay không.
- **Tôn trọng nghệ sĩ 3D**: Cài đặt 1 lần bằng 1 dòng lệnh, chạy ngầm tĩnh lặng, tự nhận diện Blender/GPU mà không bắt họ phải cấu hình phức tạp.
- **Dễ bảo trì**: Tách bạch 100% giữa thông tin máy vật lý và danh mục phần mềm cài đặt.
