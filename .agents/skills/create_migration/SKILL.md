---
name: create_migration
description: Hướng dẫn cách tạo và áp dụng Entity Framework Core Migration cho một module cụ thể bằng .\cli hoặc dotnet ef.
---

# Hướng Dẫn Tạo Và Áp Dụng Migration

Dự án Modular Monolith sử dụng nhiều DbContext khác nhau cho mỗi Module. Dự án đã trang bị script tự động hóa tại `api/cli.ps1` để đơn giản hóa thao tác.

---

## Cách 1: Sử dụng Script CLI của Dự Án (Khuyên dùng - Recommended ⭐)

Mở terminal tại thư mục `api/` và sử dụng lệnh rút gọn thông minh:

### 1. Tạo Migration mới cho Module
```powershell
.\cli add-migration <ModuleName> <MigrationName>
```
* **Cơ chế**: Script tự động quét file `*DbContext.cs` trong `src/Modules/<ModuleName>`, tự điền `--context`, `--project`, `--startup-project` và `--output-dir Infrastructure/Persistence/Migrations`.
* **Ví dụ**:
  ```powershell
  .\cli add-migration Studio RenameAgentIdToRunnerIdInProjectExecutorConfig
  ```

### 2. Áp dụng Migration vào Database
* Cập nhật cho 1 module cụ thể:
  ```powershell
  .\cli update-db <ModuleName>
  # Ví dụ: .\cli update-db Studio
  ```
* Hoặc cập nhật cho tất cả các modules trong hệ thống:
  ```powershell
  .\cli update-db
  ```

---

## Cách 2: Sử dụng Lệnh Gốc `dotnet ef` (Khi cần tùy biến hoặc trong CI/CD)

Nếu cần truyền thêm các tham số đặc biệt của EF Core, sử dụng lệnh gốc tại thư mục `api/`:

### 1. Lệnh Tạo Migration
```powershell
dotnet ef migrations add <TênMigration> `
  --project src/Modules/<TênModule>/Automation.<TênModule>/Automation.<TênModule>.csproj `
  --startup-project src/Automation.Api/Automation.Api.csproj `
  --context <TênModule>DbContext `
  --output-dir Infrastructure/Persistence/Migrations
```

### 2. Cập Nhật Database
```powershell
dotnet ef database update `
  --project src/Modules/<TênModule>/Automation.<TênModule>/Automation.<TênModule>.csproj `
  --startup-project src/Automation.Api/Automation.Api.csproj `
  --context <TênModule>DbContext
```

---

### Lưu ý:
- Luôn đảm bảo dự án biên dịch thành công (`dotnet build`) trước khi tạo migration.
- Tuyệt đối không xóa tay các file migration cũ đã apply lên database production/staging mà phải tạo migration mới để roll-forward.
