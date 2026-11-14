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

---

## 5. Quy Chuẩn Kho Scripts Nghiệp Vụ (`pipeline-scripts/`): Dumb Executor & Palette SSOT

1. **Tuyệt Đối Tuân Thủ Mental Model "Palette SSOT vs Dumb Executor":**
   - Script thực thi (ví dụ: `import_character_wardrobe.py`, `bake_mesh.py`, `export_fbx.py`) là **thợ cơ học thuần túy (Dumb Executor)**.
   - Toàn bộ tham số kỹ thuật (`TC_*`, `sRGB`, `VT`, đường dẫn `package_path` của Schema/Skeleton, danh sách Tags) **BẮT BUỘC** phải được định nghĩa từ **Palette (Contracts do `inspect_game_contracts.py` trích xuất)** và được ánh xạ qua **Manifest do AI phân loại**.
   - Executor chỉ nhận `manifest` và `contracts` để thao tác từng bước cơ học.

2. **Các "Lằn Ranh Đỏ" Bị Nghiêm Cấm Trong Pipeline Scripts:**
   - **CẤM Suy Đoán Bằng Regex (Zero Heuristic Regex):** Không tự viết regex để đoán chuỗi, đoán tên slot, đổi camelCase sang snake_case để thử vận may.
   - **CẤM Tự Bới Cây Thư Mục (Zero Filesystem Hunting):** Không tự viết vòng lặp `os.walk` hay leo ngược cây thư mục tìm file `.uproject` / `.ini`. Mọi đường dẫn phải do Runner hoặc Contract cung cấp tường minh.
   - **CẤM Bù Đắp Sai Sót Ở Hạ Nguồn (Zero Downstream Patching):** Nếu thiếu dữ liệu (ví dụ không tìm thấy Skeleton hay Schema), PHẢI báo lỗi rõ ràng hoặc dừng lại (Fail-Fast), KHÔNG ĐƯỢC tự bịa danh sách folder candidate để mò mẫm. Lỗi thiếu dữ liệu phải được giải quyết ở khâu Inspect/Manifest thượng nguồn.
   - **Độc Lập Về Trách Nhiệm (Single Responsibility):** Script import chỉ import; không kiêm nhiệm việc phân tích file `.ini`, không kiêm nhiệm việc tự sinh schema.

3. **Quy Chuẩn Thiết Kế Pin & Bắt Buộc Giải Trình Tính Tất Yếu (Pin Justification & Hygiene Rule):**
   - **Bắt buộc giải trình trong docstring:** Mọi Input Pin và Output Pin của hàm `main()` PHẢI được ghi chú rõ ràng: Kiểu dữ liệu, Mục đích và Tính tất yếu (tại sao bắt buộc phải có pin này mà không thể suy ra từ convention).
   - **CẤM Rác Pin & Pass-through Pin (Zero Pin Pollution):** Tuyệt đối cấm nhận một biến ở Input rồi lại trả về chính biến đó ở Output dictionary (như nhận `contracts` rồi trả về `contracts`). Canvas không phải là ống dẫn pass-through bừa bãi.
   - **CẤM Trivial Primitive Spam:** Không mở pin cho các chuỗi primitive vụn vặt (`character_name`, `character_tag`, `destination_folder`...) khi chúng hoàn toàn có thể tự infer từ tên file FBX hoặc quy ước cấu trúc thư mục của dự án.
   - **Bắt buộc 100% Type Hints:** Toàn bộ tham số của hàm `main()` bắt buộc phải có chú thích kiểu (`str`, `List[str]`, `Dict[str, Any]`, v.v.).

4. **Nghiệm Thu Bắt Buộc Qua Script Harness (Mandatory Harness Verification Gate):**
   - Trước khi báo cáo hoàn tất việc tạo mới hoặc sửa đổi bất kỳ script nào trong `pipeline-scripts/`, Agent **BẮT BUỘC** phải chạy lệnh kiểm duyệt tự động:
     ```bash
     python pipeline-scripts/tests/script_harness.py check <path_to_script>
     ```
   - Script chỉ được coi là đạt chuẩn khi vượt qua toàn bộ các cổng: Pin Hygiene, Redline Anti-Heuristics, và Dry-Run Verification.


