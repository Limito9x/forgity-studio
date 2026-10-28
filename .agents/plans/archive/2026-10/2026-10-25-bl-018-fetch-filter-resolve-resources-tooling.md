# Kế Hoạch Kỹ Thuật: Chuẩn Hóa Bộ Công Cụ Xử Lý Tài Nguyên (Fetch ➔ Filter ➔ Resolve)

- **Mã kế hoạch**: `BL-018`
- **Ngày lập**: 25/10/2026
- **Trạng thái**: `Completed`
- **Phạm vi tác động**: Backend (`Automation.Pipeline/Contracts/Tools/Workspaces`), Tests (`Automation.Pipeline.Tests`), Kế hoạch Backlog (`BACKLOG.md`).

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật

1. **Sự nhầm lẫn vai trò của `FilterResourcesTool`**:
   - Ý định kiến trúc ban đầu là nhận một tập hợp `Resources` trong đồ thị DAG và lọc trong bộ nhớ (In-memory filter) theo định dạng/từ khóa để lấy `First` hoặc `All`.
   - Tuy nhiên, hiện trạng lại nhảy thẳng xuống database gọi `IRepositoryApi.QueryResourcesAsync`, biến nó thành công cụ truy vấn CSDL (Database Fetcher), đồng thời xuất ra `FullPath` (Single) cho item đầu tiên, gây lẫn lộn giữa tầng truy vấn và xử lý luồng dữ liệu.
2. **`GetResourceRelativePathsTool` lỗi thời & chắp vá**:
   - Trước khi có Struct `Workstation`, hệ thống chỉ biết `RelativePath` nên phải xuất relative path để script Python tự `os.path.join(folder_path, relative_path)`.
   - Hiện nay, hệ thống đã biết rõ workstation và mount path vật lý. Việc chỉ lấy relative path rồi bắt UE5 / Blender đoán đường dẫn là thừa thãi và dễ sinh lỗi.
   - Các trường như `FileNames`, `BaseNames`, hay alias và map key cũ không cần thiết khi dữ liệu đã được làm sạch.

---

## 2. Mục Tiêu & Kiến Trúc 3 Bước Chuẩn Hóa

Phân định rạch ròi 3 công cụ độc lập theo đúng nguyên lý Single Responsibility:

```
[Workstation]
      │
      ▼
┌─────────────────────────────────┐
│ 1. QueryWorkstationResources   │ ➔ Truy vấn CSDL, nạp Resources vào DAG & EntityStore
└────────────────┬────────────────┘
                 │ Resources[]
                 ▼
┌─────────────────────────────────┐
│ 2. FilterResources (In-Memory)  │ ➔ Lọc đuôi file (.fbx), từ khóa trong RAM
└────────────────┬────────────────┘
                 │ Filtered[] hoặc First
                 ▼
┌─────────────────────────────────┐
│ 3. ResolveResources             │ ➔ Bóc tách FullPaths[], RelativePaths[], MetadataMap
└────────────────┬────────────────┘
                 │ FullPaths[]
                 ▼
   [UE5 / Blender Stage Runner]
```

---

## 3. Chi Tiết Kỹ Thuật Của 3 Công Cụ

### Tool 1: `QueryWorkstationResourcesTool` (Database Fetcher)
- **Key**: `QueryWorkstationResources`
- **Label**: `Query Workstation Resources`
- **Category**: `Workspaces`
- **Inputs**:
  - `Workstation` (`PinPrimitiveType.EntityRef`, `StructType: Workstation`, `Cardinality.Single`, `IsRequired = true`): Workstation đích chứa repository và runner.
  - `Extension` (`PinPrimitiveType.String`, `Cardinality.Single`, `DefaultValue = ""`): Lọc sơ bộ đuôi file lúc query CSDL.
  - `Keyword` (`PinPrimitiveType.String`, `Cardinality.Single`, `DefaultValue = ""`): Lọc sơ bộ từ khóa.
  - `Limit` (`PinPrimitiveType.Number`, `Cardinality.Single`, `DefaultValue = 100`): Giới hạn số lượng.
- **Outputs**:
  - `Resources` (`PinPrimitiveType.EntityRef`, `StructType: Resource`, `Cardinality.Array`): Toàn bộ mảng Resource refs.
  - `Count` (`PinPrimitiveType.Number`, `Cardinality.Single`): Tổng số resource tìm thấy.
- **Xử lý**: Gọi `IRepositoryApi.QueryResourcesAsync`, lưu properties đầy đủ (`ResourceId`, `FileName`, `Extension`, `RelativePath`, `FullPath`, `MountPath`, `RepositoryId`, `RunnerId`, `Metadata`) vào `IExecutionEntityStore`.

### Tool 2: `FilterResourcesTool` (In-Memory Collection Filter)
- **Key**: `FilterResources`
- **Label**: `Filter Resources`
- **Category**: `Workspaces`
- **Inputs**:
  - `Resources` (`PinPrimitiveType.EntityRef`, `StructType: Resource`, `Cardinality.Array`, `IsRequired = true`): Mảng resource đầu vào.
  - `Extension` (`PinPrimitiveType.String`, `Cardinality.Single`, `DefaultValue = ""`): Đuôi tệp cần lọc (ví dụ `.fbx`, `.blend`).
  - `Keyword` (`PinPrimitiveType.String`, `Cardinality.Single`, `DefaultValue = ""`): Từ khóa tên file hoặc đường dẫn.
- **Outputs**:
  - `First` (`PinPrimitiveType.EntityRef`, `StructType: Resource`, `Cardinality.Single`): Phần tử đầu tiên thỏa mãn điều kiện lọc.
  - `Filtered` (`PinPrimitiveType.EntityRef`, `StructType: Resource`, `Cardinality.Array`): Toàn bộ các phần tử thỏa mãn.
  - `Count` (`PinPrimitiveType.Number`, `Cardinality.Single`): Số lượng phần tử thỏa mãn.
- **Xử lý**: Lọc thuần túy trong RAM thông qua `IExecutionEntityStore` (Zero I/O, deterministic).

### Tool 3: `ResolveResourcesTool` (Thay thế hoàn toàn `GetResourceRelativePathsTool`)
- **Key**: `ResolveResources`
- **Label**: `Resolve Resources`
- **Category**: `Workspaces`
- **Inputs**:
  - `Resources` (`PinPrimitiveType.EntityRef`, `StructType: Resource`, `Cardinality.Array`, `IsRequired = true`).
  - `Workstation` (`PinPrimitiveType.EntityRef`, `StructType: Workstation`, `Cardinality.Single`, `IsRequired = false`).
- **Outputs**:
  - `FullPaths` (`PinPrimitiveType.String`, `Cardinality.Array`, `IsRequired = true`): Mảng đường dẫn vật lý tuyệt đối trên ổ cứng runner (chuẩn hóa `/`).
  - `RelativePaths` (`PinPrimitiveType.String`, `Cardinality.Array`, `IsRequired = false`): Mảng đường dẫn tương đối POSIX.
  - `MetadataMap` (`PinPrimitiveType.String`, `Cardinality.Map`, `IsRequired = false`): Map metadata với **key duy nhất là FullPath**.
  - `Count` (`PinPrimitiveType.Number`, `Cardinality.Single`).
- **Xử lý**: Đọc từ cache `IExecutionEntityStore`, fallback prefetch từ DB nếu thiếu, dựng FullPath từ Workstation `RootPath` nếu chưa có.

---

## 4. Các Bước Thực Hiện (Execution Phases)

- [x] **Phase 1**: Tạo `QueryWorkstationResourcesTool.cs` trong `Contracts/Tools/Workspaces/`.
- [x] **Phase 2**: Tái cấu trúc `FilterResourcesTool.cs` thành bộ lọc In-Memory (`Resources[]` ➔ `First`, `Filtered[]`, `Count`).
- [x] **Phase 3**: Xóa `GetResourceRelativePathsTool.cs` và thay bằng `ResolveResourcesTool.cs` (không giữ alias, không fileNames/baseNames, map key duy nhất là FullPath).
- [x] **Phase 4**: Cập nhật `PinContractScannerTests.cs` và chuyển đổi bộ test `GetResourceRelativePathsToolTests.cs` thành `ResolveResourcesToolTests.cs`, cập nhật `WorkstationAndResourceFilterToolsTests.cs`.
- [x] **Phase 5**: Chạy toàn bộ test suite .NET đảm bảo 100% pass và cập nhật `BACKLOG.md`.
