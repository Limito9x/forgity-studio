# Kế Hoạch Triển Khai: Tinh Gọn Struct Resource (BL-016) & Tool SyncLocalChangeToRepository (BL-017)

> **Ngày lập:** 25/10/2026  
> **Mục tiêu:** 
> 1. (BL-016) Loại bỏ chân pin nội bộ `ResourceVersionId` khỏi Struct `Resource` trên `BreakStruct` để tránh rườm rà và nhầm lẫn khi nối dây.
> 2. (BL-017) Tinh gọn các chân pin đầu vào của `SyncLocalChangeToRepositoryTool` theo triết lý Workstation-First (chỉ giữ `Workstation` + `Paths`), loại bỏ các chân pin thừa `Repository`, `Runner`, `Notes`.

---

## 1. Chi Tiết Thay Đổi

### Giai đoạn 1: BL-016 - Loại bỏ `ResourceVersionId` khỏi `ResourceStructDefinition.cs`
- File: [ResourceStructDefinition.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/StructRegistry/Definitions/ResourceStructDefinition.cs)
- Xóa `ResourceVersionId` khỏi `OutputPins`.
- Xóa `ResourceVersionId` khỏi `SampleJson`.
- Giữ logic nạp `ResourceVersionId` trong `ResolveAsync` trả về dictionary để bảo toàn tương thích ngược cho các service gọi nội bộ nếu có.

### Giai đoạn 2: BL-017 - Tinh gọn chân pin `SyncLocalChangeToRepositoryTool.cs`
- File: [SyncLocalChangeToRepositoryTool.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/Tools/Workspaces/SyncLocalChangeToRepositoryTool.cs)
- Tinh gọn `Inputs`:
  - `Workstation`: PrimitiveType = `EntityRef`, StructType = `WellKnownStructTypes.Workstation`, `IsRequired = true`.
  - `RelativePaths`: Label = `"Paths"`, PrimitiveType = `String`, Cardinality = `Array`, `IsRequired = true`.
  - Bỏ khai báo pin `Repository`, `Runner`, `Notes`.
- Trong `ExecuteAsync`:
  - Giữ lại logic fallback đọc `Repository`/`Runner`/`Notes` nếu tồn tại trong input dictionary (để các pipeline cũ không bị crash).
  - Gán giá trị mặc định cho `Notes` là `"Sync from Pipeline"` nếu không được truyền.

### Giai đoạn 3: Kiểm thử và Cập nhật Backlog
- Thêm test case vào `WorkstationAndResourceFilterToolsTests.cs` kiểm tra:
  - `ResourceStructDefinition.OutputPins` không còn chứa `ResourceVersionId`.
  - `SyncLocalChangeToRepositoryTool.Inputs` chỉ chứa 2 pin `Workstation` và `RelativePaths`.
- Chạy toàn bộ test `Automation.Pipeline.Tests`.
- Cập nhật [BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md) chuyển trạng thái **BL-016** và **BL-017** sang `Resolved`.
