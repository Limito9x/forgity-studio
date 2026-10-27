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

---

## 3. Ma Trận Đối Chiếu Trước & Sau (Before vs After)

| Tiêu chí | Trước khi làm | Sau khi hoàn thành |
| :--- | :--- | :--- |
| **Kiểm tra Runner trước khi chạy** | Không kiểm tra; cho phép gửi lệnh ngay cả khi Runner tắt. | Preflight Checklist kiểm tra Realtime: Status, Heartbeat, DCC Versions. |
| **Xử lý thiếu DCC / Python** | Treo vô hạn ở `WaitingForRunner`. | Khóa cứng nút bấm, hiển thị rõ phần mềm còn thiếu. |
| **Lưu trữ Dependencies** | Bị chôn vùi trong `metadata` JSON tự do. | Trường dữ liệu `Dependencies (jsonb)` chuẩn hóa trong `NodeDefinition`. |
| **Trải nghiệm Trial User** | Dễ gặp lỗi, không rõ nguyên nhân vì sao graph không chạy. | Giao diện thông báo rõ ràng, an tâm tuyệt đối trước khi bấm Run. |

---

## 4. Kế Hoạch Tiếp Nối (Phase 5: Runner Isolated Execution)

1. Bổ sung `Dependencies` vào message dispatch `StepExecution` qua RabbitMQ.
2. Nâng cấp Runner Rust để cài đặt isolated packages vào `%USERPROFILE%\.automation-runner\cache\python-packages\<hash>\` qua `pip install --target`.
3. Guest Runner (`stage_runner_guest.py`) tự động tiêm thư mục cache bằng `site.addsitedir()`.
