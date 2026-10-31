# Kế Hoạch Kỹ Thuật: Phase 3 — Pre-flight Runner Environment Readiness Gate & Isolated Dynamic Dependencies Contract

> **Ngày hoàn thành & tài liệu hóa**: 27/10/2026  
> **Mã định danh**: `PL-TRIAL-PHASE-3` (Liên kết: `BL-022`, `BL-024`, `BL-007`)  
> **Phạm vi**: `api/` (Backend Pipeline & DTOs), `web/` (Canvas, Run Modal, Dynamic Dependencies Checklist), `runner/` (Rust Daemon contracts)  
> **Trạng thái**: `Done` (Frontend + Backend Contract), Sẵn sàng tiếp nối Phase 5 (Runner Subprocess Isolated Injection)

---

## 1. Bối Cảnh & Vấn Đề

1. **Rủi ro người dùng bấm Run mù quáng**:
   - Trước đây, khi bấm chạy một Pipeline (ví dụ cần Blender 4.x, Unreal Engine 5.x hoặc Native Python), nếu máy workstation hoặc Runner offline hoặc thiếu phần mềm, Pipeline vẫn được dispatch vào hàng đợi và rơi vào trạng thái `WaitingForRunner` vô tận, gây hoang mang cho Trial user.
2. **Dynamic Script Dependencies thiếu hợp đồng chính quy (First-class Contract)**:
   - Khi AST phát hiện script cần dependencies ngoài standard library (như `trimesh`, `scipy`), thông tin này chỉ nằm trong metadata JSON tĩnh, chưa được lưu thành trường dữ liệu chính thống trong `NodeDefinition` hay đẩy qua Message Bus để Runner tự động cài đặt.

---

## 2. Các Hạng Mục Đã Hoàn Thành (Completed Implementation)

### 2.1. Backend First-class Dependencies Contract & Persistence
1. **Value Object & Entity (`Automation.Pipeline`)**:
   - Tạo DTO `ScriptDependencyDto(string Module, string PackageName)`.
   - Thêm thuộc tính `public List<ScriptDependencyDto> Dependencies { get; set; } = new();` vào `NodeDefinition.cs` và cập nhật phương thức `Update(...)`.
   - Cấu hình EF Core `NodeDefinitionConfiguration.cs`: Map `Dependencies` thành cột `jsonb` trong PostgreSQL.
2. **Palette & Custom Nodes APIs**:
   - Cập nhật `GetNodePalette.cs`: Trả về `dependencies` cho từng item palette.
   - Cập nhật `CreateCustomNode.cs` và `BatchUpsertCustomNodes.cs`: Tiếp nhận và lưu `dependencies` khi người dùng nhập script hoặc import bundle.

### 2.2. Frontend Pre-flight Environment Readiness Gate (`RunPipelineModal.tsx`)
1. **Runner Online Status Check**:
   - Kiểm tra `selectedRunner.status === "Online"`. Nếu Offline, cảnh báo đỏ và khóa nút bấm.
2. **DCC & Python Runtime Compatibility Matrix**:
   - Quét đồ thị để tổng hợp danh sách Executors cần thiết: `blender`, `unreal`, `python`.
   - Đối chiếu với `selectedRunner.capabilities.environments`:
     - Kiểm tra phiên bản Blender, Unreal.
     - Hỗ trợ Native Python (`python` runtime).
3. **Dynamic Python Dependencies Checklist**:
   - Tự động trích xuất các thư viện yêu cầu từ Palette của toàn bộ node trên Canvas.
   - Hiển thị badge: *"Isolated sandbox (Zero host pollution via persistent cache)"*.
4. **Hard-block Gate & Adaptive Action Button**:
   - Khóa cứng nút "Execute Run" (`isDisabled = true`) nếu môi trường chưa sẵn sàng.
   - Nhãn nút thay đổi ngữ cảnh thông minh:
     - *"Select a Runner"* (chưa chọn runner).
     - *"Runner Offline"* (runner mất kết nối).
     - *"Environment Incomplete (Missing Blender/Unreal)"* (thiếu phần mềm).
     - *"Execute Run"* (tất cả đều xanh).

### 2.3. Phase 3B: Runner Dynamic Cache Discovery & Recursive Storage Cleaner (`runner/`)
1. **Dynamic Cache Discovery (`runner/src/storage/cache.rs` & `cleaner.rs`)**:
   - Mở rộng `StorageManager`: Thêm `cache_dir()` và `python_packages_dir()` (`cache/python-packages/`).
   - `StorageCleaner` tự động `read_dir` thư mục `cache/` quét mọi phân vùng, không còn hardcode cố định.
2. **Recursive Cleanup & Accurate Size Calculation**:
   - Hàm `get_path_size_recursive(&Path)` tính toán chính xác số bytes và item count của toàn bộ thư mục con trước khi xóa.
   - Dùng `remove_dir_all` để dọn sạch triệt để cả các thư mục con rác (`__pycache__` hay package modules) thay vì bị lỗi do `remove_file`.
3. **Per-Folder Retention Policy**:
   - Chế độ **Maintenance (`forgity-runner clean`)**: Xóa `temp/`, log cũ hơn 7 ngày, và tự động prune các thư mục `python-packages/<hash>` không được dùng tới quá 7 ngày.
   - Chế độ **Full Purge (`forgity-runner clean --all`)**: Xóa sạch toàn bộ assets, scripts, python-packages và temp.
   - Bổ sung unit test `test_cleaner_dynamic_cache_discovery_and_purge` trong Rust passed 100%.

### 2.4. Phase 3C: End-to-End Isolated Dynamic Dependencies Pipeline (Completed)
1. **Backend Message Dispatch Contract (`AgentContracts.cs` & `RunnerSegmentDispatcher.cs`)**:
   - `StepExecution` mang theo `dependencies: List<string>`.
   - `RunnerSegmentDispatcher.cs` tự động trích xuất `Dependencies` từ `NodeDefinition` và gán vào từng Step khi gửi qua RabbitMQ.
2. **Deterministic Specification Hasher & Pip Installer (`runner/src/storage/cache.rs` & `dispatcher.rs`)**:
   - Hàm `compute_dependencies_hash(&[String])`: Chuẩn hóa, lọc trùng, sắp xếp từ điển (Lexicographical sort) và tính SHA-256 (16 hex chars).
   - `StageDispatcher` kiểm tra `cache/python-packages/<hash>`:
     - Nếu đã có: Tái sử dụng ngay 0ms, không tốn mạng hay thời gian cài đặt.
     - Nếu chưa có: Tự động chạy `python -m pip install --target <pkg_dir> <deps>` một lần duy nhất.
3. **Unified Single Source of Truth via `task.json` & Subprocess Site Injection (`stage_runner_guest.py`)**:
   - Đường dẫn gói `site_packages_path` được ghi trực tiếp vào `task.json` (không làm ô nhiễm biến môi trường hệ điều hành).
   - `stage_runner_guest.py` nạp động vào runtime DCC bằng `site.addsitedir(site_packages_path)`, cho phép script import mọi thư viện bên ngoài an toàn tuyệt đối.

---

## 3. Ma Trận Đối Chiếu Trước & Sau (Before vs After)

| Tiêu chí | Trước khi làm | Sau khi hoàn thành |
| :--- | :--- | :--- |
| **Kiểm tra Runner trước khi chạy** | Không kiểm tra; cho phép gửi lệnh ngay cả khi Runner tắt. | Preflight Checklist kiểm tra Realtime: Status, Heartbeat, DCC Versions. |
| **Xử lý thiếu DCC / Python** | Treo vô hạn ở `WaitingForRunner`. | Khóa cứng nút bấm, hiển thị rõ phần mềm còn thiếu. |
| **Lưu trữ Dependencies** | Bị chôn vùi trong `metadata` JSON tự do. | Trường dữ liệu `Dependencies (jsonb)` chuẩn hóa trong `NodeDefinition`. |
| **Runner Cache Cleanup** | Hardcode 2 thư mục cố định; lỗi `remove_file` khi gặp subfolder/`__pycache__`. | Tự động dò quét toàn bộ `cache/`, dọn đệ quy `remove_dir_all`, prune `python-packages` theo tuổi. |
| **Isolated Package Delivery** | Chưa có; người dùng phải tự pip install vào DCC hoặc hệ thống. | Tự động tải vào `cache/python-packages/<hash>`, nạp sạch qua `task.json` & `site.addsitedir`. |
| **Trải nghiệm Trial User** | Dễ gặp lỗi, không rõ nguyên nhân vì sao graph không chạy. | Giao diện thông báo rõ ràng, an tâm tuyệt đối trước khi bấm Run. |

---

## 4. Kết Luận & Nghiệm Thu
Phase 3 (kết hợp cả Phase 3B và 3C) đã hoàn tất 100% mục tiêu:
- Frontend: Preflight Checklist, Environment Verification, Dynamic Dependencies preview, Hard-block Run button.
- Backend: First-class Dependencies contract trong DB, Palette, và Message Dispatcher.
- Runner: Dynamic Cache Discovery, Recursive Storage Cleaner, Deterministic Specification Hashing, Automated Pip Target Installer, and Unified `task.json` Site Injection.

