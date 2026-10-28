# Runner & Pipeline Scripts Rules (`runner/` & `pipeline-scripts/`)

Quy tắc áp dụng bắt buộc khi xây dựng, mở rộng hoặc sửa đổi mã nguồn trong thư mục Native Rust Runner (`runner/`) và Kho Scripts Nghiệp Vụ (`pipeline-scripts/`).

---

## 1. Môi Trường Thực Thi & Kiến Trúc Phân Tầng

Hệ thống đã **khai tử hoàn toàn Python Worker Daemon** cũ và chuyển sang kiến trúc **Native Rust Host Daemon** kết hợp **Single Guest Script Injection**:

1. **Tầng Host Daemon (Native Rust Daemon)** tại `runner/`:
   - Được biên dịch thành binary độc lập nhẹ ~6MB (`forgity-runner.exe`).
   - Quản lý vòng đời tiến trình con qua **Windows Job Object** (`JobObject::create()`), đảm bảo khi hủy task (cancel) hoặc daemon tắt thì toàn bộ DCC subprocess (Blender, Unreal) bị dập tắt ngay lập tức mà không rò rỉ tiến trình mồ côi (orphan process).
   - Giao tiếp hai chiều thời gian thực với subprocess bằng **Windows Named Pipe IPC** (`\\.\pipe\forgity-ipc-{stage_id}`) với giao thức NDJSON.
   - Kết nối RabbitMQ nhận `StageTaskMessage`, stream tiến độ `StepProgressMessage` và trả về `StageResultMessage`.
   - Lưu trữ và streaming file trực tiếp lên/xuống MinIO/S3 (zero-RAM piped chunking).

2. **Tầng Guest Script (Single Universal Guest Runner)** tại `runner/scripts/stage_runner_guest.py`:
   - Được nhúng trực tiếp (embed) vào binary Rust thông qua macro `include_str!`.
   - Hoạt động đa hình tự thích ứng theo engine (Blender 4.x, Unreal Engine 5.x, Python thuần).
   - Tự động nạp context `PipelineHooks`, map tham số hàm `main()` / `execute()`, chuyển đổi kebab-case / snake_case, và giải quyết pin `$file`, `$ref`, `$data`.

3. **Kho Script Nghiệp Vụ (Pipeline Scripts Library)** tại `pipeline-scripts/`:
   - Được tổ chức **hoàn toàn phẳng** theo Executor:
     - `pipeline-scripts/blender/`: Toàn bộ script chạy trong Blender (bake, export FBX, inspect separated/unified mesh, apply UV, merge materials...).
     - `pipeline-scripts/unreal/`: Script import skeletal mesh, register appearance datatable, setup materials, inspect...
     - `pipeline-scripts/daz/`: `daz_inspector.py`.
     - `pipeline-scripts/ai/`: Script phân tích vai trò `classify_mesh_types.py`, `classify_material_manifest.py`.
     - `pipeline-scripts/presets/`: Các preset cấu hình chuyển giao FBX / DAZ.
   - Thư mục này đóng vai trò là thư viện công cụ mã nguồn để đóng gói thành Node Tool hoặc nạp lên Pipeline Canvas, độc lập hoàn toàn với daemon Runner.

---

## 2. Quy Tắc Bất Di Bất Dịch Về Guest Runner

- **TUYỆT ĐỐI KHÔNG xóa hoặc sửa bừa bãi** file [runner/scripts/stage_runner_guest.py](file:///d:/FullStack/Automation/runner/scripts/stage_runner_guest.py).
- **Zero External Dependencies:** File này phải chạy được trên môi trường Python nhúng sạch nhất (chỉ dùng Python standard library `importlib`, `inspect`, `io`, `json`, `os`, `sys`). Tuyệt đối không thêm thư viện thứ ba (`requests`, `pydantic`, `aiohttp`...).
- **Dọn rác bộ nhớ engine:**
  - Với **Blender**: Gọi `purge_blender_orphans()` sau mỗi step để dọn sạch unused datablocks/meshes, tránh phình RAM.
  - Với **Unreal Engine**: Gọi `unreal.SystemLibrary.collect_garbage()` nếu cần giải phóng UObjects.

---

## 3. Quy Chuẩn Quản Trị Bộ Nhớ Đệm & Lưu Trữ (Cache & Clean)

- Thư mục cache runtime nằm tại `runner/cache/` (hoặc `%LOCALAPPDATA%/Forgity/` / `%USERPROFILE%/.automation-runner/`):
  - `cache/assets/`: Content-Addressable Storage (CAS) lưu file nhị phân tải từ S3 theo SHA-256 hash.
  - `cache/scripts/`: Script tải từ Studio.
  - `cache/python-packages/`: Thư mục lưu trữ isolated Python dependencies tải qua `pip install --target`.
  - `temp/`: Thư mục làm việc tạm của từng stage (`temp/{stage_id}`).
  - `logs/`: Nhật ký thực thi của runner.
- **Lệnh dọn dẹp:** Sử dụng lệnh CLI chuẩn:
  - `forgity-runner clean`: Dọn toàn bộ `temp/` và các log cũ hơn 7 ngày.
  - `forgity-runner clean --all`: Xóa sạch cả toàn bộ `cache/assets/`, `cache/scripts/` và `cache/python-packages/`.

---

## 4. Biên Dịch & Kiểm Thử Runner Rust

- Khi chỉnh sửa code trong `runner/src/`:
  - Kiểm tra compile: `cargo check` bên trong thư mục `runner/`.
  - Build release binary: `cargo build --release` ➔ sinh file `runner/target/release/forgity-runner.exe`.

