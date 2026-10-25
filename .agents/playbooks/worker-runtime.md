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

## 8. Môi Trường Thực Thi: Local Dev (`workers/`) vs Production Package (`AppData\Local\Forgity\runner`)

Trên một máy tính trạm của Developer, có thể tồn tại **2 bản Runner song song** với mục đích khác nhau:

| Tiêu chí so sánh | Bản Local Dev trong Repo (`workers/`) | Bản Installed Package (`%LOCALAPPDATA%\Forgity\runner\`) |
| :--- | :--- | :--- |
| **Nguồn gốc** | Mã nguồn trực tiếp trong Git workspace (`d:\FullStack\Automation\workers`). | Tải về từ GitHub Release zip qua lệnh 1-Click One-Liner từ Web UI Connect Runner. |
| **Cách khởi chạy** | Chạy thủ công: `.\runner.bat start` (hoặc `python cli.py start`). | Chạy ngầm tự động: Windows Task Scheduler hoặc Registry HKCU Run (`pythonw.exe`). |
| **Cửa sổ hiển thị** | **Có cửa sổ Console:** In trực tiếp toàn bộ log stdout/stderr của Blender/Unreal, RabbitMQ và gRPC. | **Không có cửa sổ (Windowless - `pythonw`):** Chạy âm thầm dưới nền, toàn bộ log ghi vào file. |
| **Phân tầng Log** | Ghi log console + mirror stage log ra `worker/runtime/logs/`. | - `runner.log`: Ghi sự kiện hệ thống (kết nối RabbitMQ, heartbeat).<br>- `logs/<executor>_<ts>_<stage>.log`: Ghi chi tiết từng stage DCC. |
| **Mục đích sử dụng** | Dùng khi phát triển tính năng mới, viết và debug script Blender / Unreal. | Dùng để kiểm thử luồng Onboarding của Trial User hoặc chạy production render node. |

> [!WARNING]
> **CẢNH BÁO XUNG ĐỘT SINGLE-INSTANCE & TRANH CHẤP QUEUE:**
> Cả 2 bản Runner nếu dùng chung cấu hình sẽ lắng nghe chung **1 hàng đợi RabbitMQ** (`stage_tasks.{agentId}`).
> **QUY TẮC BẮT BUỘC KHI DEV:** Trước khi chạy `.\runner.bat start` trong repo, **BẮT BUỘC PHẢI TẮT** bản Daemon ngầm bằng lệnh:
> ```powershell
> .\runner.bat service stop
> # hoặc kiểm tra và dừng tiến trình ngầm:
> taskkill /F /IM pythonw.exe
> ```
> Nếu không tắt bản Daemon ngầm, RabbitMQ sẽ chia tải (Round-Robin) hoặc Daemon ngầm (chạy bản zip cũ) sẽ chớp lấy task trước, dẫn đến việc mất tín hiệu realtime hoặc chạy bằng code cũ!

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
6. **Tắt Daemon ngầm trước khi Dev Local:** Luôn chạy `.\runner.bat service stop` trước khi gõ `.\runner.bat start` trong repo để tránh tranh chấp hàng đợi RabbitMQ.
7. **An toàn tuyệt đối khi chạy Windowless (`pythonw`):** Không dùng `print()` trực tiếp khi đọc stdout của DCC Subprocess; luôn sử dụng `logger` hoặc bọc try-except để không làm đứt luồng `PIPELINE_EVENT`.

---

## 11. Kiến Trúc Native Rust Runner (`runner/`) & Strategy Pattern Cho DCC

Để tối ưu hóa tài nguyên RAM (< 15MB) và đảm bảo tính cách ly tuyệt đối của tiến trình trên hệ điều hành, hệ thống chuyển dịch sang **Native Rust Runner (`runner/`)**.

```
runner/src/
├── core/
│   ├── dispatcher.rs             # Pure Stage Orchestrator (Job Object, Named Pipe, IPC)
│   └── executors/                # DCC Strategy Pattern
│       ├── mod.rs                # Trait `DccExecutor` & struct `ExecutorRegistry`
│       ├── blender.rs            # BlenderStrategy (-b --python ... -- --pipe ... --task ...)
│       ├── unreal.rs             # UnrealStrategy (Validate .uproject, -run=pythonscript)
│       └── python.rs             # Standalone Python CLI Strategy
├── storage/
│   ├── cache.rs                  # StorageManager: CAS deduplication, Absolute Path & Verbatim stripping
│   └── downloader.rs             # Zero-RAM chunked streaming download S3/MinIO
└── process/
    ├── job_object.rs             # Windows Job Object process tree hard containment
    └── subprocess.rs             # Subprocess spawner & live log streamer
```

### 11.1. Trait `DccExecutor` & Strategy Pattern
- **Single Responsibility:** `dispatcher.rs` đóng vai trò là "Nhạc trưởng" (Orchestrator). Mọi logic khởi tạo cờ lệnh và tiền kiểm tra của từng phần mềm 3D (Blender, Unreal, Maya) được ủy quyền cho các struct triển khai trait `DccExecutor`:
  ```rust
  pub trait DccExecutor: Send + Sync {
      fn name(&self) -> &'static str;
      fn validate(&self, task: &StageTaskMessage) -> Result<()>;
      fn build_args(&self, task: &StageTaskMessage, ctx: &ExecutionContext) -> Result<Vec<String>>;
      fn prepare_env(&self, task: &StageTaskMessage, ctx: &ExecutionContext) -> Result<HashMap<String, String>>;
      fn cleanup(&self, task: &StageTaskMessage) -> Result<()>;
  }
  ```
- **Fail-Fast Prerequisite Validation:** Hook `validate()` kiểm tra tính hợp lệ của môi trường (ví dụ file `.uproject` của Unreal có tồn tại thực sự trên đĩa không) **trước khi tiến trình OS được khởi động**, ngăn ngừa crash vô nghĩa sau 15 giây khởi động engine.

### 11.2. Chuẩn Cờ Lệnh Headless Của Unreal Engine (`UnrealEditor-Cmd.exe`)
- **Tên Commandlet Bắt Buộc:** Unreal Engine sử dụng reflection C++ tìm class `UPythonScriptCommandlet`. Cờ CLI bắt buộc phải là **`-run=pythonscript`** (tuyệt đối không dùng `-run=ExecutePythonScript`).
- **Đường Dẫn Dự Án (`.uproject`):** Bắt buộc phải là đối số đầu tiên truyền vào CLI để Unreal nạp plugins theo Project Context.
- **Cờ Output & Headless Chuẩn:**
  ```text
  UnrealEditor-Cmd.exe <project.uproject> -run=pythonscript -script=<script_path> -stdout -FullStdOutLogOutput -UTF8Output -nullrhi -unattended -nosplash
  ```

### 11.3. Chuẩn Đường Dẫn Tuyệt Đối (Absolute Path) & Windows Verbatim Prefix (`\\?\`)
- **Nguyên nhân lỗi CWD:** Khi Unreal Engine hoặc Blender chạy headless, thư mục làm việc hiện tại (CWD) của chúng có thể bị thay đổi về thư mục cài đặt (`Engine\Binaries\Win64` hoặc `Blender Foundation\Blender`). Nếu `StorageManager` trả về đường dẫn tương đối `.\cache\assets\...`, guest script bên trong DCC sẽ báo lỗi `Script not found` ngay lập tức.
- **Quy chuẩn bắt buộc:**
  1. Toàn bộ đường dẫn script (`step.script_path`) và file pin assets khi ghi vào `task.json` **BẮT BUỘC PHẢI LÀ ĐƯỜNG DẪN TUYỆT ĐỐI (Absolute Path)**.
  2. Sử dụng hàm `normalize_absolute_path()` để **bóc tách tiền tố Windows Verbatim `\\?\`** (do `canonicalize` sinh ra), tránh gây lỗi parser command line của Unreal/Blender.
  3. Khi spawn tiến trình con qua `SubprocessRunner`, luôn truyền `Some(self.storage.base_dir())` để ép thư mục làm việc về Runner root.

### 11.4. Bộ Kiểm Chứng Tự Động (`cargo test`)
Mọi thay đổi liên quan đến Command Builder, Strategy Registry, Path Normalization và Storage Manager **bắt buộc phải có Unit Tests** và pass 100% trước khi đóng gói Release:
```bash
cargo test
# Đảm bảo pass 11/11 tests bao gồm:
# - test_registry_lookup_case_insensitive
# - test_unreal_build_args_and_clean_path
# - test_unreal_validation_fails_on_nonexistent_project
# - test_storage_manager_paths_are_absolute
# - test_normalize_verbatim_path
```

---

## 12. Vòng Đời Biến Môi Trường (Environment Variables) & Caveat Khi Runner Đang Chạy

### 12.1. Hiện Tượng "Bóng Ma" Biến Môi Trường Cũ (Stale In-Memory Env)
- **Cơ chế hoạt động:** Khi lệnh `forgity-runner.exe start --local` được khởi chạy, nó parse file `runner.toml` một lần duy nhất lúc khởi động và lưu bảng `[env]` vào struct bộ nhớ `RunnerConfig.env`.
- **Hệ quả khi Runner chạy nền liên tục (Daemon):**
  - Nếu user chỉnh sửa `runner.toml` (ví dụ cập nhật `GEMINI_API_KEY` từ mock value `"123456"` sang key thật `AQ.Ab8...`) **trong khi Runner vẫn đang chạy**, tiến trình Runner host **KHÔNG** tự động reload file này.
  - Khi có Stage mới được dispatch, `StageDispatcher` tiếp tục lấy giá trị cũ từ RAM (`self.custom_env`) và tiêm vào subprocess qua `cmd.env(k, v)`.
  - Kết quả: Subprocess Python nhận biến môi trường `os.environ["GEMINI_API_KEY"] = "123456"` cũ rích, dẫn đến lỗi xác thực API `400 INVALID_ARGUMENT`.

### 12.2. Nguyên Tắc Thiết Kế Cho Pipeline Scripts (Zero-Stale-Env Pattern)
Để ngăn ngừa tình trạng trên, toàn bộ script chạy trên Runner (đặc biệt là các script AI hoặc DCC cần credentials) **BẮT BUỘC** tuân thủ quy tắc 3 lớp:

1. **Ưu tiên đọc file cấu hình trực tiếp từ đĩa trước (`runner.toml`):**
   - Đọc trực tiếp từ file đĩa `D:\FullStack\Automation\runner\runner.toml` hoặc `%LOCALAPPDATA%\Forgity\runner.toml`. Dữ liệu trên đĩa luôn là dữ liệu mới nhất mà người dùng vừa sửa.
2. **Kiểm tra tính hợp lệ của Key (`is_valid_key`):**
   - Luôn kiểm tra định dạng và độ dài (`len >= 15`), đồng thời loại bỏ các placeholder rác (như `"123456"`, `"none"`, `"null"`, `"gemini"`, `"openai"`).
   - Nếu biến môi trường nhận từ OS là key giả/mock, **tự động bỏ qua** và fallback về file trên đĩa hoặc báo lỗi rõ ràng.
3. **Quy tắc thao tác khi sửa cấu hình Runner:**
   - Khi sửa bất kỳ giá trị nào trong `runner.toml` (nhất là API keys và thông số RabbitMQ), **bắt buộc phải restart lại tiến trình Runner** (`Ctrl+C` và chạy lại `forgity-runner.exe start --local`) để Runner host nạp mới 100% bảng biến môi trường.

