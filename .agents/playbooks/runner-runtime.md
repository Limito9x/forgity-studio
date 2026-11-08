# Runner Playbook: Native Rust Runner Runtime, IPC, Job Object & Storage Engine

> **Phạm vi:** Tài liệu hướng dẫn kỹ thuật cốt lõi cho **Native Rust Runner Daemon** (`runner/`, binary `forgity-runner.exe`):
> 1. Vòng đời tiến trình Host Rust Daemon & Quản lý DCC Subprocess qua **Windows Job Object**.
> 2. Giao thức IPC hai chiều qua **Windows Named Pipe** (`\\.\pipe\forgity-ipc-{stage_id}`).
> 3. Tự động tiêm Single Guest Runner đa hình (`runner/scripts/stage_runner_guest.py`).
> 4. Cấu trúc lưu trữ Runtime Storage (`cache/`, `temp/`, `logs/`, `.storage.lock`).
> 5. Cơ chế dọn rác bộ nhớ & đệm (`forgity-runner clean`).
>
> **Quy tắc bắt buộc:** Agent phải đọc tài liệu này trước khi chỉnh sửa bất kỳ module nào trong `runner/`. Sau khi thay đổi code, phải cập nhật lại tài liệu này.

---

## 1. Bản Đồ Kiến Trúc Host Rust Daemon & Subprocess IPC

Hệ thống điều phối thực thi chạy hoàn toàn trên binary Native Rust hiệu năng cao (`forgity-runner.exe`):

```mermaid
sequenceDiagram
    autonumber
    participant RMQ as RabbitMQ
    participant Host as Forgity Runner (Rust Daemon)
    participant Pipe as Named Pipe Server (\\.\pipe\forgity-ipc-*)
    participant Sub as DCC Subprocess (Blender/Unreal/Python)
    participant Guest as stage_runner_guest.py (Injected)

    RMQ->>Host: Nhận StageTaskMessage (JSON)
    Host->>Host: Tạo Windows Job Object (Chặn rò rỉ tiến trình)
    Host->>Pipe: Khởi tạo Named Pipe Server
    Host->>Sub: Spawns DCC Subprocess với gán Job Object & env FORGITY_IPC_PIPE
    Sub->>Guest: Guest Runner thực thi bên trong Engine
    Guest->>Pipe: Gửi "handshake" (DCC Name, Version, PID)
    Host->>RMQ: Gửi Status = Running
    loop Từng Step trong Stage
        Guest->>Pipe: Gửi "step_started" & "step_progress"
        Host->>RMQ: Stream StepProgressMessage
        Guest->>Guest: Dynamic import script, gọi main(), purge_orphans()
        Guest->>Pipe: Gửi "step_completed" (outputs / error)
    end
    Guest->>Pipe: Gửi "stage_completed"
    Host->>RMQ: Gửi StageResultMessage
    Host->>Host: Đóng Job Object & Dọn temp directory
```

---

## 2. Windows Job Object: Bảo Đảm Zero Process Leak

Khác với Python subprocess truyền thống (khi bị crash hoặc cancel dễ bỏ lại `blender.exe` chạy ngầm chiếm 100% CPU), Rust Runner sử dụng API Win32 **Windows Job Object** ([`runner/src/process/job_object.rs`](file:///d:/FullStack/Automation/runner/src/process/job_object.rs)):

- Cấu hình cờ `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
- Mọi tiến trình con hoặc cháu chắt sinh ra từ DCC đều bị gán vào Job Object này.
- Khi người dùng bấm **Cancel Run** trên Canvas hoặc khi daemon thoát: Rust đóng handle Job Object ➔ Hệ điều hành Windows lập tức thu hồi và tiêu diệt sạch toàn bộ cây tiến trình con trong 0ms.

---

## 3. Cấu Trúc Runtime Storage (`runner/cache/`, `temp/`, `logs/`)

Storage của Runner được quản lý tập trung và an toàn:

```
runner/ (hoặc %LOCALAPPDATA%/Forgity/runner/)
├── .storage.lock                  # Mutex lock chống tranh chấp IO đa tiến trình
├── cache/
│   ├── assets/                    # File nhị phân tải từ S3 (CAS theo SHA-256)
│   ├── scripts/                   # Script Python tải từ Studio (theo SHA-256)
│   └── python-packages/           # Isolated packages theo Python runtime + requirements
├── temp/
│   └── {stage_execution_id}/      # Thư mục tạm cô lập cho từng phiên stage (task.json)
└── logs/
    └── runner_{date}.log          # Nhật ký vận hành Rust Runner
```

---

## 4. Quản Trị Bộ Nhớ Đệm & Quét Dọn (`forgity-runner clean`)

### Python dependencies riêng (06/11/2026)

- Analyzer trả `dependencies`; `useScriptBatchPublish` phải giữ trường này khi gọi batch upsert. Backend lưu trên `NodeDefinition` và `RunnerSegmentDispatcher` gửi `steps[].dependencies`.
- Rust `core/python_packages.rs` resolve interpreter của executor: Python dùng executable đã chọn; Unreal dùng `Engine/Binaries/ThirdParty/Python3/Win64/python.exe` cùng Engine; Blender hỏi `sys.prefix` qua chính Blender rồi dùng `bin/python.exe`.
- Probe identity bằng implementation, full version, SOABI, platform và machine. Cache key chứa identity và requirements đã sort/deduplicate, bảo toàn case của URL/markers.
- Python hệ thống chạy `pip --python <embedded-python> install --ignore-installed --target <staging> ...`. Pip chọn wheels theo embedded interpreter; không chạy ensurepip và không ghi packages vào DCC gốc. Máy host cần có Python + pip hỗ trợ `--python`.
- Pip cài vào `<key>.installing-<uuid>`; chỉ khi exit thành công mới ghi `.forgity-complete` và rename sang `<key>`. Lỗi/timeout dừng stage trước khi launch DCC, dọn staging của lần thử đó; thư mục chưa có marker hợp lệ không được reuse. Staging còn lại do runner bị kill được dọn bằng `clean --all`.
- Dispatcher truyền `site_packages_path` tuyệt đối trong task.json. Guest dùng stdlib `site.addsitedir`, ưu tiên cache ở đầu `sys.path`; thiếu thư mục/lỗi injection trả stage failed rõ ràng. Không thay đổi site-packages/config gốc của DCC.
- Warm DCC chỉ reuse khi `site_packages_path` khớp, kể cả null. Đổi bộ requirements sẽ restart session để tránh giữ native modules của cache trước. Khi reuse, nhả mutex trước khi ghi snapshot để tránh tự deadlock.
- Dependencies của custom node đã publish trước bản sửa có thể đang rỗng; Analyze/Publish lại script để cập nhật. Cache không tự suy đoán imports từ business script tại runtime.

Kiểm tra: `cargo test --locked`, `python -B -m unittest discover -s scripts/tests -v` trong runner. Test tải packages thực: đặt `FORGITY_TEST_UNREAL_EXE`, chạy `cargo test --locked unreal_pydantic_openai_smoke -- --ignored --nocapture`. Test này chỉ import thư viện bằng bundled Python và giữ cache cho runner; không chạy pipeline/game project.

Đã kiểm chứng 06/11/2026: Python Unreal 3.11.8 nạp được pydantic 2.14.3/openai 3.46.0 từ cache riêng; commandlet chạy `scripts/tests/unreal_package_smoke.py` với env `FORGITY_TEST_PACKAGE_CACHE` báo `FORGITY_PACKAGE_SMOKE_OK`. Bundled Python không inject vẫn không thấy hai packages. Test commandlet chỉ import và validate model đơn giản, không chạy AI classification hay sửa game assets.

Runner cung cấp công cụ dọn rác chuyên nghiệp:

1. **Lệnh Bảo Trì (Maintenance)**:
   ```bash
   forgity-runner clean
   ```
   - Xóa sạch toàn bộ các thư mục tạm trong `temp/`.
   - Purge toàn bộ log cũ hơn 7 ngày trong `logs/`.

2. **Lệnh Thanh Trừng Toàn Diện (Full Purge)**:
   ```bash
   forgity-runner clean --all
   ```
   - Xóa toàn bộ file cache trong `cache/assets/`, `cache/scripts/` và `cache/python-packages/`.

---

## 5. Danh Mục Script Nghiệp Vụ (`pipeline-scripts/`)

Các script nghiệp vụ DCC được lưu trữ phẳng theo từng Executor tại `pipeline-scripts/`:
- `pipeline-scripts/blender/`: Script thao tác scene, UV, vật liệu, bake, FBX export, inspect mesh.
- `pipeline-scripts/unreal/`: Script import skeletal mesh, tạo vật liệu, datatables.
- `pipeline-scripts/daz/`: Script phân tích phả hệ Daz Studio (`daz_inspector.py`).
- `pipeline-scripts/ai/`: Script phân tích vai trò `classify_mesh_types.py`, `classify_material_manifest.py`.
- `pipeline-scripts/presets/`: Preset chuyển giao DCC.

---

## 6. Persistent Warm DCC Process Pool & Keep-Alive Daemon (BL-040)

### Stage completion fixes (2026-11-06)

- `DccPool.release` drops the sessions mutex before writing the snapshot; snapshot writing acquires the same mutex. Holding it caused a deadlock after the Idle log, preventing result publication, unregister and RabbitMQ ACK.
- Warm dispatch waits for both guest `stage_completed` and resident `stage_finished`, draining guest step results even when the control pipe arrives first. Success requires both results, handshake and successful steps; resident success never overrides guest failure. A missing matching completion is bounded by a five-second inactivity timeout.
- Guest sends the detailed failed stage result, closes IPC, then exits with code 1. Resident therefore reports failure for script/package errors. Cancellation releases the session once, then follows normal unregister/result publication.
- These changes remove the deadlock causing unacknowledged tasks to replay after restart. They do not add durable deduplication or an execution-status check before delivery: arbitrary process crashes can still cause RabbitMQ redelivery.
- Regression checks: `cargo test --locked`; `python -B -m unittest discover -s scripts/tests -v`.

Để loại bỏ hoàn toàn độ trễ khởi động lại Engine 15–45s giữa các Stage, Runner hỗ trợ cơ chế giữ ấm tiến trình DCC (Unreal Engine):

1. **Vòng Đời Resident Host**:
   - Khi `keepAliveMinutes > 0`, Runner khởi động `UnrealEditor-Cmd.exe` với script bọc [`runner/scripts/dcc_resident_host.py`](file:///d:/FullStack/Automation/runner/scripts/dcc_resident_host.py).
   - Tiến trình kết nối tới Named Pipe điều khiển nội bộ `\\.\pipe\forgity_dcc_{key}` (với `key = sha256(exe|uproject)[..12]`).
   - Mỗi khi nhận `RunStage`:
     - Thiết lập lại `FORGITY_IPC_PIPE` và `FORGITY_TASK_JSON` cho Stage mới.
     - Dọn sạch `step_module_*` trong `sys.modules` để nạp ngay script mới sửa trên đĩa.
     - Đồng bộ lại Unreal Asset Registry cho `/Game`.
     - Thực thi `stage_runner_guest.main()` an toàn (bắt `SystemExit`) và phản hồi `StageFinished`.

2. **Reaper Tự Động & Hạn Tắt (TTL)**:
   - Sau khi Stage kết thúc, tiến trình chuyển sang trạng thái `Idle` và bộ đếm ngược `keep_alive` bắt đầu chạy (mặc định 30 phút).
   - Background Reaper của Runner quét mỗi 30s. Nếu session hết hạn mà không có Stage mới, Runner sẽ gửi tín hiệu `Shutdown` và đóng Job Object để trả lại RAM/VRAM.

3. **Convention Quản Lý In-Memory (`forgity dcc ...`)**:
   - Hệ thống không làm rác gói `agent.proto`. Thay vào đó, Backend gửi lệnh `ExecuteCommand` với `program = "forgity"` và `args = ["dcc", "list"|"stop", ...]`.
   - Daemon Runner chặn xử lý in-memory trực tiếp qua `Arc<DccPool>`, trả JSON trạng thái qua stdout.
   - Người dùng có thể xem trạng thái tiến trình ấm (`Warm • PID • time left`) và bấm **Stop** trực tiếp trên thẻ Unreal Project trong Studio Dashboard.


