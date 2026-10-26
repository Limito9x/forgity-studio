# Kế Hoạch Kỹ Thuật: Chuẩn Hóa 2 Mode (EntityRef vs Key) Cho Content Tools & Sửa Semantics ResourceStructDefinition

- **Mã kế hoạch**: `BL-019`
- **Ngày lập**: 25/10/2026
- **Trạng thái**: `Completed`
- **Phạm vi tác động**: Backend Contracts (`Automation.Pipeline/Contracts/Tools/Workspaces`, `Automation.Pipeline/Contracts/Tools/Content`, `Automation.Pipeline/Contracts/StructRegistry/Definitions`), Unit Tests (`Automation.Pipeline.Tests`), Kế hoạch Backlog (`BACKLOG.md`).

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật

1. **Lệch pha Semantics trong `ResourceStructDefinition.cs` (Break Struct của Resource)**:
   - Chân pin `ContentId` hiện đang khai báo `StructType = WellKnownStructTypes.ContentType`.
   - Về mặt bản chất: Một tài nguyên (Resource) được gán vào một **thực thể nội dung cụ thể (`ContentItem`)**, chứ không phải gán vào một loại danh mục (`ContentType`). Việc khai báo sai này khiến các dây nối vào `ContentItem` bị hệ thống Type Checker chặn.
2. **Xung đột kiểu dữ liệu & thiếu linh hoạt trong `AssignResourcesToContentTool`**:
   - Chân pin `ContentType` hiện khai báo `PrimitiveType = EntityRef`, trong khi quy trình tự động hóa DCC thường lấy `ContentType` dạng `String` (ví dụ `"Character"`, `"Hair"`). Điều này gây lỗi Type Mismatch khi nối dây từ chuỗi text vào.
   - Hiện tại các chân pin `ContentId`, `ContentType`, `ContentName`, `CreateIfNotExists` đang cùng xuất hiện đồng thời trên Canvas, gây rối rắm và khó hiểu.
3. **`LookupContentMapTool` thiếu khả năng nhận trực tiếp EntityRef**:
   - Hiện tại chỉ nhận `Keys` (Array<String>) và `ContentType` (String). Nếu người dùng đã có sẵn mảng `ContentItem` EntityRef trong đồ thị, họ không có cách nào cắm trực tiếp vào để bóc tách schema values và texture maps.

---

## 2. Mục Tiêu Chuẩn Hóa: Mô Hình 2 Mode (Dual-Mode Pattern)

Thông qua cơ chế `ResolvePins(configValues)` và `NodeCapabilities`, cho phép người dùng lựa chọn Mode trong Node Inspector để Canvas tự động thích ứng:

### A. `AssignResourcesToContentTool`
- **Mode `ByName` (Quy ước đặt tên & Auto-create - Mặc định)**:
  - Phù hợp với luồng xuất file tự động từ Blender / DCC theo quy tắc tên.
  - Inputs:
    - `ContentType` (`PinPrimitiveType.String`, Bắt buộc).
    - `ContentName` (`PinPrimitiveType.String`, Bắt buộc - e.g. lấy từ BaseName hoặc FormatString).
    - `CreateIfNotExists` (`PinPrimitiveType.Boolean`, Mặc định `true`).
    - `Resources` (`Array<EntityRef>`, `StructType: Resource`, Bắt buộc).
- **Mode `ByEntityRef` (Asset-First)**:
  - Phù hợp khi đã có sẵn Asset trong Content Hub.
  - Inputs (Chỉ đúng 2 chân pin sạch sẽ):
    - `ContentItem` (`PinPrimitiveType.EntityRef`, `StructType: ContentItem`, Bắt buộc).
    - `Resources` (`Array<EntityRef>`, `StructType: Resource`, Bắt buộc).
- **Outputs (Chung)**:
  - `ContentId` (`EntityRef: ContentItem`), `ContentName` (`String`), `ContentType` (`String`), `ResourceIds` (`Array<EntityRef: Resource>`), `AssignedCount` (`Number`), `Success` (`Boolean`).

### B. `LookupContentMapTool`
- **Root Category**: Giữ `ContentType` (String / EntityRef dropdown) làm gốc phân loại schema.
- **Mode `ByKey` (Text/Tags - Mặc định)**:
  - Inputs: `ContentType` (Root) + `Keys` (`Array<String>`).
- **Mode `ByEntityRef` (Direct Content Items)**:
  - Inputs: `ContentType` (Root) + `ContentItems` (`Array<EntityRef: ContentItem>`).
- **Outputs (Chung)**:
  - `ContentMap` (`Map<String, Object>`), `MissingKeys` (`Array<String>`), `ContentIds` (`Array<EntityRef>`).

### C. `ResourceStructDefinition.cs`
- Đổi `ContentId` sang `StructType: WellKnownStructTypes.ContentItem`.
- Giữ nguyên `ContentName` (String) và `ContentType` (String).

---

## 3. Các Bước Triển Khai (Execution Phases)

- [x] **Phase 1: Sửa semantics trong `ResourceStructDefinition.cs`**
  - Cập nhật chân `ContentId` có `StructType = WellKnownStructTypes.ContentItem`.
  - Cập nhật SampleJson và logic `ResolveAsync`.
- [x] **Phase 2: Nâng cấp `AssignResourcesToContentTool.cs` sang Dual-Mode**
  - Thêm `HasDynamicPins => true` và khai báo `Capabilities.SchemaConfigKeys = ["Mode"]`.
  - Triển khai `ResolvePins` phân tách 2 bộ input pins theo `ByName` vs `ByEntityRef`.
  - Cập nhật `ExecuteAsync` bảo đảm hỗ trợ mượt mà cả 2 mode và trích xuất ContentType linh hoạt.
- [x] **Phase 3: Nâng cấp `LookupContentMapTool.cs` sang Dual-Mode**
  - Thêm `HasDynamicPins => true` và khai báo `Capabilities.SchemaConfigKeys = ["Mode", "ContentType"]`.
  - Triển khai `ResolvePins` phân tách inputs theo `ByKey` vs `ByEntityRef`.
  - Cập nhật `ExecuteAsync` để load schema data từ mảng `ContentItems` trực tiếp hoặc theo `Keys`.
- [x] **Phase 4: Viết bộ Unit Tests toàn diện**
  - Tạo `AssignResourcesToContentToolTests.cs` (test cả 2 Mode `ByName` và `ByEntityRef`).
  - Tạo `LookupContentMapToolTests.cs` (test cả 2 Mode `ByKey` và `ByEntityRef`).
  - Kiểm thử `ResourceStructDefinition` và toàn bộ 214 pipeline tests.
- [x] **Phase 5: Kiểm tra toàn diện & Cập nhật Backlog**
  - Chạy `dotnet test` toàn bộ solution (214 passed, 0 failed).
  - Chạy `pnpm tsc --noEmit` ở `web/` (Pass, exit 0).
  - Rebuild solution bằng `build-dotnet.ps1` (0 error, 14 warnings).
  - Cập nhật trạng thái `BL-019` trong `BACKLOG.md`.
