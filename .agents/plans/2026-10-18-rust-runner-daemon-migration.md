# Kế Hoạch Kỹ Thuật: Xây Dựng Rust Runner Daemon Siêu Nhẹ (Forgity Runner Native)

> **Mã tài liệu:** `PLAN-2026-10-18-RUST-RUNNER-DAEMON`  
> **Trạng thái:** DRAFT / PROPOSED  
> **Phạm vi:** Thư mục mới `runner/` (ngang hàng với `api/`, `web/`, `workers/`, `packages/proto/`)  
> **Mục tiêu:** Thay thế dần Host Daemon Python bằng Native Binary Rust (Single Executable, Zero-Python Dependency cho tầng Host, <15MB RAM, Windows Job Object Kill sạch 100%, Local Named Pipe IPC 2 chiều).

---

## 1. Bối Cảnh & Động Lực (Motivation)

### 1.1. Vấn Đề Với Host Daemon Python Hiện Tại (`workers/`)
1. **Rào cản Onboarding (Environment Friction):**
   - Người dùng / Tester phải tự cài Python 3.12+, tạo `venv`, gõ lệnh `pip install -r requirements.txt`.
   - Dễ gặp lỗi xung đột C-extensions (`grpcio`, `cryptography`) trên các bản Windows khác nhau hoặc thiếu `PATH`.
2. **Tiêu tốn tài nguyên nền (High Memory Footprint):**
   - Python Daemon vừa khởi động nạp toàn bộ thư viện gRPC, Pydantic, RabbitMQ đã ngốn **80MB – 130MB RAM** dù chưa nhận job nào.
   - Khi artist đang làm việc với các cảnh 3D nặng trong Blender/Unreal, việc daemon ngầm ngốn RAM gây cảm giác khó chịu.
3. **Cơ chế IPC qua Stdout thiếu ổn định:**
   - Đang bắt subprocess Blender/Unreal in `PIPELINE_EVENT:` ra `stdout`. Trong khi đó, Blender/Unreal spew hàng chục nghìn dòng log C++ làm trôi hoặc nghẽn buffer pipe của OS.
4. **Quản lý Subprocess Tree trên Windows:**
   - Khi hủy job hoặc crash, Python subprocess thỉnh thoảng để lại tiến trình "mồ côi" (zombie process) của Blender/Unreal chạy ngầm chiếm dụng GPU/VRAM.

### 1.2. Giải Pháp: `runner/` (Native Rust Runner Daemon)
- **Đóng gói 1 file duy nhất (`forgity-runner.exe` / `forgity-runner`):** Dung lượng ~15–20MB, tải về là chạy ngay, **Zero Dependencies**.
- **RAM nền siêu nhẹ:** Chỉ **5MB – 15MB RAM**, CPU idle 0%.
- **Local Named Pipe IPC 2 Chiều (`\\.\pipe\forgity-ipc-{jobId}`):**
  - Tách rời 100% dòng log thô (`stdout`) khỏi dòng sự kiện trạng thái (`Named Pipe`).
  - Cho phép script Python bên trong Blender gửi request hỏi Host tải thêm Asset hoặc Metadata theo nhu cầu (On-Demand).
- **Windows Job Objects Native:** Khi daemon hoặc job bị hủy, Windows tự động tiêu diệt toàn bộ cây tiến trình con (Blender/Unreal) sạch sẽ 100%, không bao giờ kẹt VRAM.
- **Tận dụng tối đa tài nguyên có sẵn:**
  - Hợp đồng gRPC đã nằm độc lập tại `packages/proto/` (`agent.proto`, `execution_state.proto`), Rust chỉ cần gen code bằng `tonic-build`.
  - Giữ nguyên toàn bộ Python Stage Scripts dành cho Blender/Unreal (`bpy` / `unreal`), Rust Runner chỉ đóng vai trò Host gọi Subprocess.

---

## 2. Kiến Trúc Phân Tầng & Luồng Dữ Liệu Nội Bộ (Data Flow)

### 2.1. Sơ Đồ Tổng Thể
```mermaid
graph TD
    subgraph Cloud / Backend
        API[".NET Modular Monolith (api/)"]
        RMQ["RabbitMQ (runner.{id})"]
        gRPC["gRPC Server (AgentService)"]
        S3["S3 / MinIO (Asset Storage)"]
    end

    subgraph Native Host Runner ["Forgity Runner Daemon (runner/ - Rust)"]
        CLI["Clap CLI (register, start, doctor, clean)"]
        
        subgraph Tokio Actor Channels
            QueueConsumer["RabbitMQ Consumer (lapin)"]
            Dispatcher["Job Engine Dispatcher"]
            IpcServer["Local Named Pipe IPC Server"]
            Reporter["gRPC Progress & State Reporter"]
            LogPipedStreamer["Tokio Async Stdout/Stderr Streamer"]
        end

        StorageEngine["Asset Cache & Zero-Copy S3 Streamer (sha2)"]
        WinJob["Windows Job Object Manager"]
    end

    subgraph DCC Engine Subprocesses
        BlenderProc["blender.exe -b -P run_stage.py"]
        UnrealProc["UnrealEditor-Cmd.exe -run=pythonscript"]
    end

    API -->|Dispatch Job| RMQ
    RMQ -->|Consume| QueueConsumer
    QueueConsumer -->|mpsc channel| Dispatcher
    Dispatcher --> WinJob
    WinJob -->|Spawn with Job Object| BlenderProc
    WinJob -->|Spawn with Job Object| UnrealProc

    %% IPC vs Log Separation
    BlenderProc <-->|Named Pipe IPC (Events & Requests)| IpcServer
    UnrealProc <-->|Named Pipe IPC (Events & Requests)| IpcServer
    BlenderProc -.->|Raw Stdout/Stderr Logs| LogPipedStreamer
    UnrealProc -.->|Raw Stdout/Stderr Logs| LogPipedStreamer

    IpcServer -->|Progress Events| Reporter
    Reporter -->|gRPC Streaming| gRPC
    Dispatcher <--> StorageEngine
    StorageEngine <-->|Piped Chunk Streaming| S3
```

### 2.2. Sự Tách Biệt Đột Phá Giữa Kênh Log và Kênh IPC
| Kênh giao tiếp | Công nghệ | Dữ liệu truyền tải | Mục đích |
| :--- | :--- | :--- | :--- |
| **Log Stream** | `stdout` / `stderr` pipes | Chữ thô do Blender / Unreal C++ in ra | Mirror ghi ra đĩa log & stream hiển thị trên Web Console Drawer |
| **Event IPC** | Windows Named Pipe (`\\.\pipe\...`) | Framed JSON / Packets nhị phân 2 chiều | Bắn sự kiện Step Started, Progress %, Step Finished; Yêu cầu tải Asset |

---

## 3. Cấu Trúc Thư Mục Đề Xuất (`runner/`)

```text
runner/
├── Cargo.toml                  # Khai báo crate & dependencies (tokio, tonic, lapin, clap, winapi...)
├── build.rs                    # Tự động gọi tonic-build biên dịch packages/proto/*.proto
├── src/
│   ├── main.rs                 # CLI Entry point & Router subcommand
│   ├── cli/                    # Định nghĩa giao diện lệnh bằng Clap
│   │   ├── mod.rs
│   │   ├── register.rs         # forgity-runner register --token <TOKEN>
│   │   ├── start.rs            # forgity-runner start (chạy daemon ngầm)
│   │   ├── doctor.rs           # forgity-runner doctor (tự quét Blender/Unreal/GPU)
│   │   └── clean.rs            # forgity-runner clean (dọn dẹp cache rác)
│   ├── config/                 # Đọc/Ghi config toml (%LOCALAPPDATA%/Forgity/runner.toml)
│   ├── core/                   # Bộ điều phối trung tâm (Actor Loop & Dispatcher)
│   │   ├── mod.rs
│   │   ├── dispatcher.rs       # Điều phối vòng đời Job
│   │   └── state.rs            # Trạng thái Runner (Idle, Running, Error)
│   ├── ipc/                    # Local Named Pipe Server (Giao tiếp với Subprocess)
│   │   ├── mod.rs
│   │   ├── pipe_server.rs      # Lắng nghe kết nối từ Blender/Unreal
│   │   └── protocol.rs         # Định nghĩa các thông điệp IPC (Event, RequestAsset...)
│   ├── process/                # Quản lý tiến trình cấp thấp
│   │   ├── mod.rs
│   │   ├── job_object.rs       # Windows Job Object API (diệt sạch cây tiến trình con)
│   │   └── subprocess.rs       # Spawn tiến trình với tokio::process::Command
│   ├── executors/              # Triển khai Executor theo từng DCC (Trait Pattern)
│   │   ├── mod.rs
│   │   ├── traits.rs           # trait SubprocessExecutor
│   │   ├── blender.rs          # Blender executor (build cờ CLI, env, scripts)
│   │   ├── unreal.rs           # Unreal Engine headless executor
│   │   └── python.rs           # Standalone Python executor
│   ├── storage/                # Quản lý Cache & Tải tệp
│   │   ├── mod.rs
│   │   ├── cache.rs            # Kiểm tra hash SHA-256 (sha2), quản lý thư mục cache
│   │   ├── lock.rs             # File lock (.storage.lock)
│   │   └── s3.rs               # Stream S3/MinIO bằng reqwest/aws-sdk
│   ├── queue/                  # RabbitMQ consumer (lapin)
│   └── grpc/                   # Client gRPC sinh từ proto (tonic)
└── scripts/                    # Scripts Python nhúng chạy BÊN TRONG Blender / Unreal
    ├── stage_runner_blender.py # Script gọi bpy và kết nối vào Named Pipe
    └── stage_runner_unreal.py  # Script gọi unreal API và kết nối vào Named Pipe
```

---

## 4. Lộ Trình Triển Khai Chi Tiết (Phased Roadmap)

### Phase 1: Nền Móng Cargo, Proto Compilation & CLI Doctor
- [x] Khởi tạo thư mục `runner/` và cấu hình `Cargo.toml` với các dependencies tối ưu.
- [x] Viết `build.rs` tích hợp `tonic-build` biên dịch `packages/proto/agent.proto` và `execution_state.proto` (tự động phát hiện protoc từ NuGet cache của máy).
- [x] Viết CLI cơ bản bằng `clap`:
  - `forgity-runner --version`
  - `forgity-runner doctor`: Quét ổ đĩa Windows tự động phát hiện chính xác các bản Blender và Unreal Engine thực tế trên máy.

### Phase 2: Đăng Ký Runner & Cấu Hình Cục Bộ (`register`)
- [x] Xây dựng module `cli::register` kết nối tới Backend Core (`api/runners/register-token`).
- [x] Thực hiện bắt tay (handshake): Gửi thông tin phần cứng (GPU name, VRAM, CPU cores, RAM, OS version) lên backend qua `/api/runners/{id}/hardware-profile`.
- [x] Lưu trữ an toàn `RunnerId`, `MachineKey`, `RabbitMQ` và `RegistrationToken` vào tệp cấu hình `runner.toml` (hỗ trợ đọc/ghi tự động).

### Phase 3: RabbitMQ Consumer, Windows Job Objects & Named Pipe IPC
- [x] Tích hợp `lapin` kết nối RabbitMQ, lắng nghe hàng đợi `stage_tasks.{runner_id}`, hỗ trợ `basic_qos(1)` và DLX.
- [x] Xây dựng module `ipc::pipe_server` & `ipc::protocol`:
  - Khởi tạo Named Pipe cục bộ `\\.\pipe\forgity-ipc-{stage_execution_id}` với Tokio NamedPipeServer.
  - Viết module Python guest runner `runner/scripts/stage_runner_guest.py` cực nhẹ chuẩn stdlib kết nối 2 chiều qua Pipe (NDJSON).
- [x] Xây dựng module `process::job_object`:
  - Đăng ký tiến trình Blender/Unreal vào Windows Kernel Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`).
  - Đảm bảo khi runner dừng hoặc crash, mọi tiến trình 3D con đều bị Windows kernel giải phóng 100%, không bao giờ để lại zombie process ăn VRAM.
- [x] Hoàn thiện Dispatcher và lệnh `forgity-runner start`:
  - Thu nhận log stdout/stderr đẩy vào file `logs/{stage_id}.log`.
  - Stream tiến độ real-time `step_progress` và trả về kết quả `stage_results` qua RabbitMQ với graceful shutdown Ctrl+C.

### Phase 4: Runtime Storage, SHA-256 Checksum & S3 Piped Streaming
- [ ] Quản lý bộ nhớ đệm: `cache/assets`, `cache/scripts`, `temp/`, `logs/`.
- [ ] Tích hợp crate `sha2` kiểm tra tính toàn vẹn của scripts và model 3D.
- [ ] Xây dựng cơ chế tải S3 zero-copy streaming: Tải trực tiếp vào đĩa đệm không qua RAM trung gian.
- [ ] Hỗ trợ cơ chế On-Demand Fetching: Subprocess có thể yêu cầu tải bổ sung file qua Named Pipe.

### Phase 5: Đóng Gói Binary Độc Lập & Kiểm Thử Song Song
- [ ] Tối ưu cờ build Cargo release: LTO (Link-Time Optimization), `strip = true`, `opt-level = "z"` (nén kích thước binary xuống mức nhỏ nhất).
- [ ] Chạy kiểm thử song song (Side-by-side verification):
  - Chạy cùng 1 Pipeline trên Python worker (`workers/`) và Rust runner (`runner/`).
  - Kiểm tra độ chuẩn xác của kết quả model/texture, so sánh RAM tiêu thụ (100MB vs 10MB) và tốc độ thực thi.

---

## 5. Cẩm Nang "Học Lỏm" Cú Pháp Rust Qua Dự Án Này (Cheat Sheet Cho Bạn)

Khi theo dõi code Rust trong dự án này, bạn sẽ làm quen với các khái niệm cốt lõi sau:

| Khái niệm trong Rust | Tương đương trong C# / TypeScript | Điểm đặc biệt cần chú ý |
| :--- | :--- | :--- |
| **`Option<T>` (`Some` / `None`)** | `nullable` (`T?` trong C#/TS) | Rust **không có `null`**. Muốn giá trị có thể rỗng bắt buộc bọc trong `Option`. Tránh triệt để lỗi NullReferenceException! |
| **`Result<T, E>` (`Ok` / `Err`)** | `Result<T>` trong FluentResults | Rust không dùng Exception (`try/catch`) cho lỗi thường. Hàm trả về `Result`, dùng toán tử `?` để quăng lỗi lên trên cực ngắn gọn. |
| **`match` (Pattern Matching)** | `switch / case` hiện đại | So khớp mẫu cực mạnh mẽ, bắt buộc phải cover hết mọi trường hợp của Enum (trình biên dịch sẽ báo lỗi nếu bạn quên 1 case). |
| **`Ownership` & `&Borrow`** | Tham chiếu biến | Giá trị chỉ có 1 chủ sở hữu (Owner). Muốn dùng ké thì mượn (`&`), muốn sửa thì mượn có thể thay đổi (`&mut`). Không cần Garbage Collector mà vẫn an toàn bộ nhớ! |
| **`Trait`** | `Interface` trong C# / TS | Định nghĩa giao ước hành vi cho struct (ví dụ `SubprocessExecutor`). |
| **`tokio::select!`** | `Promise.race` trong JS | Lắng nghe nhiều luồng bất đồng bộ cùng lúc (ví dụ: vừa chờ job mới, vừa lắng nghe tín hiệu Cancel, cái nào tới trước xử lý cái đó). |

---

## 6. Nguyên Tắc An Toàn Song Song

> [!IMPORTANT]
> **Tuyệt đối không xóa hay làm xáo trộn thư mục `workers/` hiện tại.**  
> Thư mục `workers/` (Python) tiếp tục giữ vai trò chính cho đợt thử nghiệm Trial Users Cohort 1.  
> Thư mục `runner/` (Rust) được phát triển song song như một bản nâng cấp thế hệ 2 hoàn hảo.
