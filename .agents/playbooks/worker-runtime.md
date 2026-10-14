# Worker Playbook: Runtime Storage, Cache & Subprocess Lifecycle

> **Phạm vi:** Tài liệu hướng dẫn và kỹ thuật mô tả cốt lõi cách vận hành cho:
> 1. Cấu trúc thư mục Runtime Storage của Worker (`worker/runtime/`).
> 2. Cơ chế Mutex Lock (`.storage.lock`) tránh đụng độ giữa Subprocess và Sweeper.
> 3. Cơ chế Phân giải Script & Asset có Cache theo mã băm SHA-256 (`script_resolver.py`).
> 4. Quá trình thực thi Subprocess Headless (Blender / Unreal Engine).
> 5. Background Cleanup Daemon (TTL & LRU Quota Eviction).
>
> **Quy tắc bắt buộc:** Agent phải đọc tài liệu này trước khi chỉnh sửa bất kỳ module nào trong `workers/`. Sau khi thay đổi code, phải cập nhật lại tài liệu này.

---

## 1. Cấu Trúc Thư Mục Runtime Storage (`worker/runtime/`)

Thư mục runtime của Worker được quản lý tập trung và cô lập, tuyệt đối không xả rác ra thư mục gốc:

```
worker/runtime/
├── .storage.lock                      # Mutex file lock bảo vệ IO đa tiến trình
├── cache/
│   ├── scripts/{sha256_hash}/         # Thư mục cache custom scripts tải từ API
│   │   └── {original_name}.py         # File script Python đã verify SHA-256
│   └── assets/{sha256_hash}/          # Thư mục cache binary file assets (FBX, textures...)
│       └── {filename}                 # File asset đã verify dung lượng / hash
├── temp/
│   └── {stage_execution_id}/          # Thư mục TEMP cô lập cho từng phiên subprocess
└── logs/
    ├── unreal_latest.log              # Log trực tiếp của Unreal Engine
    └── worker.log                     # Log của tiến trình Worker daemon
```

---

## 2. Cơ Chế Mutex File Lock (`.storage.lock`)

Để tránh trường hợp **Background Cleanup Daemon xóa nhầm file temp/cache mà một Subprocess Blender/Unreal đang đọc**, hệ thống sử dụng cơ chế khóa file đa nền tảng:

```python
with storage_lock(blocking=True):
    # Chỉ khi lấy được lock thì mới thực thi StageTaskMessage
    self._process_message(ch, method, properties, body)
```

- **Cơ chế khóa:**
  - Trên Windows (`os.name == "nt"`): Dùng `msvcrt.locking` khóa byte đầu tiên của file `.storage.lock`.
  - Trên Linux/macOS: Dùng `fcntl.flock(handle, fcntl.LOCK_EX)`.
- **Nguyên tắc an toàn:**
  - Tiến trình chạy Stage giữ khóa độc quyền (Exclusive Lock).
  - Background Cleanup chỉ chạy khi acquire được lock không chặn (`blocking=False`). Nếu có Stage đang chạy, cleanup tự động bỏ qua lượt quét để không gây crash.

---

## 3. Cơ Chế Cache Khi Dispatch Script & Asset

Khi Backend dispatch một Stage sang Worker, message mang theo `ScriptUrl` và `ScriptHash` (SHA-256).

```mermaid
graph TD
    A[Worker nhận StepExecution: script_url + script_hash] --> B{Kiểm tra cache local:<br/>cache/scripts/{hash}/{entry}}
    B -->|Đã có & đúng SHA-256| C[Tái sử dụng file ngay lập tức<br/>os.utime cập nhật Access Time]
    B -->|Chưa có hoặc hash lệch| D[Tải file tạm từ script_url vào .tmp]
    D --> E{Verify SHA-256 checksum}
    E -->|Khớp 100%| F[os.replace đổi tên .tmp -> {entry}.py]
    E -->|Không khớp| G[Ném lỗi ValueError, từ chối chạy!]
    F --> C
```

- **Atomic File Download:** File được tải vào file tạm đuôi `.tmp` trước. Chỉ khi verify đúng SHA-256 mới dùng `os.replace` để đưa vào vị trí cache chính thức, tránh tình trạng file bị lỗi khi mạng đứt giữa chừng.
- **Local Fallback:** Chỉ khi không có `script_url` và `script_hash`, Worker mới dò tìm script tích hợp sẵn trong thư viện phẳng `workers/pipelines/` (và fallback `worker/scripts/`).

---

## 4. Quá Trình Thực Thi Subprocess Headless

`BaseSubprocessExecutor` điều phối việc gọi các phần mềm DCC bên ngoài:

1. **Môi trường cô lập (Isolated Environment):**
   - Tạo thư mục riêng trong `worker/runtime/temp/`.
   - Ghi đè biến môi trường `TEMP`, `TMP`, `TMPDIR` trỏ vào thư mục này để Blender / Unreal không xả rác vào `AppData` của Windows.
2. **Khởi chạy tiến trình con:**
   - **Blender:** Gọi binary `blender.exe -b -P <wrapper_script.py> -- <args>`.
   - **Unreal Engine:** Gọi commandlet headless hoặc Python remote interface.
3. **Quản lý Vòng đời & Dọn rác:**
   - Đọc stdout/stderr theo thời gian thực để bắt log.
   - Khi subprocess kết thúc (dù thành công hay crash): hàm `cleanup_after_execution` luôn được gọi trong khối `finally:` để xóa sạch thư mục temp tương ứng và dọn rác RAM.

---

## 5. Background Cleanup Daemon (TTL & LRU Quota)

Hàm `cleanup(dry_run=False)` trong [runtime_storage.py](file:///d:/FullStack/Automation/workers/core/runtime_storage.py) vận hành theo các chính sách:

- **Temp TTL (24 giờ):** Bất kỳ file temp nào cũ hơn 24 giờ kể từ lần sửa cuối sẽ bị xóa.
- **Logs TTL (7 ngày - 168 giờ):** Log cũ hơn 7 ngày tự động xóa.
- **Cache TTL (7 ngày) & Quota Quá tải (2GB):**
  - Cache cũ hơn 7 ngày bị xóa.
  - Nếu tổng dung lượng thư mục `cache/` vượt quá 2GB (`cache_max_bytes`), cơ chế **LRU (Least Recently Used)** sẽ xóa các file ít được truy cập nhất cho đến khi dung lượng hạ về mức cho phép.
- **Daemon Thread:** Được khởi động ngầm trong `PipelineConsumer.start()` qua thread daemon `sweeper`, tự động kích hoạt sau mỗi chu kỳ (mặc định 1800 giây = 30 phút).

---

---

## 6. Kiến Trúc Daemon Supervisor & Bộ Lệnh Dịch Vụ (`runner service`)

Worker Daemon là một tiến trình **headless 100% (không dùng pystray GUI)**, được giám sát tự động bởi bộ quản lý dịch vụ gốc của từng hệ điều hành:

### 6.1. Cơ Chế Giám Sát Theo Từng Hệ Điều Hành
- **Windows (On Logon - User Session)**:
  - Khởi chạy ngầm thông qua `pythonw.exe cli.py start` (không mở cửa sổ console).
  - Ưu tiên 1: Đăng ký Windows Task Scheduler task `\Automation\RunnerDaemon` với trigger `At logon` (`/SC ONLOGON /RU %USERNAME%`).
  - Fallback an toàn (khi không có quyền Administrator): Tự động ghi vào **Windows Current User Startup Registry** (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run: AutomationRunnerDaemon`).
  - **Lợi ích cốt lõi:** Tiến trình chạy trong phiên đăng nhập của người dùng nên Blender và Unreal Engine có **100% quyền truy cập GPU driver (CUDA, OptiX, DirectX 12, Vulkan)**, tránh triệt để lỗi crash mất GPU do *Session 0 Isolation* của Windows Services truyền thống.
- **Linux**: Sử dụng `systemd --user` unit (`~/.config/systemd/user/automation-runner.service`) kèm `loginctl enable-linger $USER` để daemon tiếp tục chạy ngay cả khi ngắt kết nối SSH.
- **macOS**: Sử dụng `launchd` LaunchAgent (`~/Library/LaunchAgents/com.automation.runner.plist`).

### 6.2. Bộ Lệnh Quản Lý Dịch Vụ CLI
```bash
runner service install [--no-autostart]   # Đăng ký daemon vào hệ điều hành
runner service uninstall                  # Gỡ bỏ daemon khỏi hệ điều hành
runner service start                      # Khởi động daemon chạy ngầm
runner service stop                       # Dừng daemon một cách an toàn (graceful)
runner service restart                    # Khởi động lại daemon
runner service status                     # Báo cáo trạng thái (Running, PID, Auto-Start)
runner service logs [-n 50] [-f]          # Xem log tập trung và live follow
```

### 6.3. Khóa PID Đơn Instance & Log Rotation Tập Trung
- **Single-instance Enforcement:** Sử dụng file `worker/runtime/runner.pid`. Nếu phát hiện instance khác đang hoạt động, daemon từ chối khởi chạy trùng lặp.
- **Log Rotation:** Root logger ghi log ra `worker/logs/runner.log` thông qua `RotatingFileHandler` (20MB x 5 backups) giúp ổ đĩa không bị tràn khi chạy dài ngày.

---

## 7. Quy Trình Cài Đặt One-Liner Dòng Lệnh (1-Click Bootstrap)
- **Windows (PowerShell)**:
  ```powershell
  & ([scriptblock]::Create((irm "http://<api-host>/api/runners/bootstrap/install.ps1"))) -Url "http://<api-host>/api" -Token "AGT-xxxx"
  ```
- **Linux/macOS (Bash)**:
  ```bash
  curl -fsSL http://<api-host>/api/runners/bootstrap/install.sh | bash -s -- --url "http://<api-host>/api" --token "AGT-xxxx"
  ```
- **Real-Time Pairing Handshake:** Sau khi cài đặt và gửi thông tin phần cứng qua `runner register --non-interactive`, Backend lưu trạng thái vào cache `runner_token_status:{token}`. Web UI modal tự động bắt được trạng thái này qua endpoint `GET /api/runners/tokens/{token}/status` và hiển thị màn hình chúc mừng mà không cần tải lại trang.

---

---

## 9. Chuẩn Hóa Packaging Release, Version Handshake & Remote In-Place Auto-Update

### 9.1. Quản Lý Phiên Bản & Handshake gRPC
- **File `VERSION` tập trung:** Nằm tại thư mục gốc của Worker daemon (`workers/VERSION`). Hàm `get_worker_version()` (`core/version.py`) tự động đọc phiên bản này.
- **Handshake khởi tạo:** Khi Daemon kết nối gRPC tới Backend (`AgentMessage`), nó gửi kèm trường `app_version`.
- **Lưu trữ Backend:** `RunnerGrpcService` tự động cập nhật `Runner.AppVersion` và `Runner.LastSeenAt` trong PostgreSQL, hiển thị trực quan phiên bản trên giao diện Web UI (Badge `v1.0.0`).

### 9.2. Quy Trình Đóng Gói Sạch (Release Packaging)
- **Script đóng gói tự động:** `python workers/tools/package_release.py [--version x.y.z] [--output-dir dir]`.
- **Các bước thực thi:**
  1. Tự động biên dịch lại toàn bộ Proto contracts (`compile_protos.py`) đảm bảo stubs Python luôn đồng bộ với `packages/proto`.
  2. Nén toàn bộ mã nguồn sạch của daemon vào file `automation-runner-v{version}.zip`.
  3. **Tuyệt đối loại trừ:** `__pycache__`, `.pytest_cache`, `.venv`, `venv`, `config.json`, `agent_config.json`, `.env`, `.storage.lock`, `cache/`, `temp/`, `logs/`, `dist/`.
  4. Tính toán và sinh file mã băm SHA-256 `automation-runner-v{version}.zip.sha256`.
- **CI/CD Tự Động (GitHub Actions):** File workflow `.github/workflows/release-runner.yml` tự động kích hoạt khi push tag `v*.*.*` hoặc qua `workflow_dispatch`, thực hiện đóng gói và publish Release artifact lên GitHub Releases.

### 9.3. Cơ Chế Nâng Cấp Từ Xa In-Place (Remote Auto-Update)
- **Khởi phát từ Server:** Quản trị viên kích hoạt nút **Update** trên Web UI hoặc gọi API `POST /api/runners/{runnerId}/upgrade` với `{ downloadUrl, targetVersion, expectedSha256 }`.
- **Lệnh gRPC `UpdateRunnerCommand`:** Backend gửi payload qua stream hai chiều.
- **Thực thi an toàn tại Daemon (`update_handler.py`):**
  1. Tải gói zip về `workers/temp/update_{version}.zip`.
  2. Kiểm tra mã băm SHA-256 đối chiếu với `expectedSha256` (nếu không khớp, hủy cập nhật ngay lập tức).
  3. Giải nén đè mã nguồn mới vào thư mục chạy hiện tại. **BẢO TỒN TUYỆT ĐỐI:** `config.json`, `agent_config.json`, `.env`, `.venv/`, `cache/`, `logs/`, `temp/`.
  4. Cập nhật file `VERSION` lên phiên bản mới.
  5. Phản hồi `UpdateRunnerCommandResult(current_version, updated_version, restart_scheduled=true)`.
  6. Sau 2 giây, kích hoạt tiến trình graceful restart daemon (qua OS Service Manager hoặc spawn process mới).

---

## 10. Tóm Tắt Quy Tắc Cho Agent Khi Chạm Vào Worker
1. **Luôn dùng `settings()[0]` để lấy Runtime Root:** Tuyệt đối không hardcode đường dẫn `os.path.join(..., "temp")` lung tung ngoài thư mục runtime.
2. **Không bỏ qua Mutex Lock:** Mọi thao tác tiêu thụ task và dọn dẹp đều phải bọc qua `storage_lock()`.
3. **Script từ xa bắt buộc có URL & SHA-256:** Không bao giờ cho phép thực thi script từ xa trôi nổi mà không kiểm tra mã băm bảo mật.
4. **Không đưa GUI dependencies (như pystray) vào Daemon:** Runner Daemon bắt buộc phải duy trì tính chất headless 100%.
5. **Bảo tồn tệp bí mật và môi trường:** Tuyệt đối không xóa hay ghi đè `config.json` và `.venv/` khi nâng cấp hay đóng gói Runner.
