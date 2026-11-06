# BL-044: Unified Project Migrations & Package Transfer Hub

> **Mã công việc**: `BL-044`
> **Trạng thái**: `Pending` *(Kế hoạch kỹ thuật đề xuất ngày 05/11/2026)*
> **Ngày tạo**: 05/11/2026
> **Phạm vi**: 
> - `api/` (Module `Studio` / `Migration`: Engine Export/Import gói đa danh mục, Bảng `ProjectMigrationLogs`, DTOs)
> - `web/` (Trang `Project Migrations`, Multi-domain Export/Import Wizard, Scoped Header Adapter, History Table)
> - `packages/proto/` (Không ảnh hưởng, thuần HTTP/REST + JSON/Zip Streaming)

---

## 1. Tầm Nhìn & Mục Tiêu

Trong các nền tảng Studio và DCC chuyên nghiệp, việc chuyển giao dữ liệu (Project Migration / Asset Package Handover) giữa các môi trường (Dev ➔ Staging ➔ Production), giữa các Studio hoặc chia sẻ giữa các Artist trong nhóm là nhu cầu sống còn.

Hiện tại, việc import/export trong Forgity đang bị **phân mảnh và rời rạc**:
- Mục Pipelines có nút export/import pipeline riêng lẻ (`.json`).
- Mục Content có import manifest riêng.
- Repository có cơ chế sync riêng.
- Không có bức tranh tổng thể cho toàn bộ Project, không thể "đóng gói toàn bộ cấu hình dự án" chuyển sang máy khác, và hoàn toàn **thiếu lịch sử kiểm toán (Audit Trail / Migration History)** xem ai đã xuất/nhập gói gì, vào lúc nào, có lỗi gì không.

### Mục tiêu cốt lõi của BL-044:
1. **Trung tâm chuyển giao dự án duy nhất (Unified Migration Hub)**: Tạo một phân hệ chuẩn mực tại `Studio ➔ Project ➔ Migrations`.
2. **Export Wizard đa danh mục (Multi-Domain Checklist)**: Cho phép xuất chọn lọc hoặc trọn gói:
   - 🧩 **Pipelines**: Toàn bộ đồ thị, nodes, parameters, snapshot schema.
   - 🎭 **Content Anchors**: Cây neo nội dung nhân vật, trang phục, tags phân loại.
   - 📁 **Repositories**: Cấu hình workspace, root paths, ignore filters.
   - ⚙️ **Project Constants / Conventions**: Bảng quy ước `/Game/...`, master skeletons, material roots (`BL-043`).
3. **Format Đóng gói Chuẩn Hóa (`.forgity.pkg` / Gzip JSON Bundle)**:
   - Header metadata: Schema version, StudioId, ProjectSlug, ExportedAt, ExportedBy, Checksum SHA-256.
   - Payload: Các bundle độc lập theo từng Domain, hỗ trợ tham chiếu chéo (Cross-domain entity mapping).
4. **Contextual Scoped Header (Tái sử dụng mượt mà ở các trang con)**:
   - Khi người dùng bấm Export/Import tại các trang con (`Pipelines`, `Content`), giao diện sẽ tái sử dụng chính Dialog Migration chuẩn này nhưng tự động bật **Thanh Header Ngữ Cảnh** (VD: *Exporting from: Pipelines*), tự chọn sẵn domain đó và cho phép mở rộng sang các domain liên đới nếu muốn.
5. **Bảng Lịch Sử Kiểm Toán (Migration & Transfer Audit Log Table)**:
   - Lưu trữ toàn bộ nhật ký các phiên Export và Import: Người thực hiện, tên tệp, kích thước, các danh mục, tổng số item (Created / Updated / Skipped), trạng thái (`Success`, `Warning`, `Failed`), kèm khả năng **tải lại bản xuất cũ** hoặc **xem chi tiết diff/lỗi**.

---

## 2. Kiến Trúc Luồng Dữ Liệu (Mental Model & Architecture)

```mermaid
flowchart TD
    subgraph UI ["Frontend (Tauri / React 19)"]
        Hub["Project Migrations Hub Page\n(/projects/:id/migrations)"]
        ScopedSub["Sub-feature Context\n(Pipelines / Content Pages)"]
        Wizard["Unified Migration Wizard Dialog\n(Checklist: Pipelines, Content, Repos, Constants)"]
        HistTable["Migration History & Audit Log Table\n(Status, Diff preview, Download Package)"]
    end

    subgraph API ["Backend .NET 10 Modular Monolith"]
        Controller["ProjectMigrationEndpoints\n(Export, Import, GetHistory, Download)"]
        Orchestrator["ProjectMigrationOrchestrator\n(Gathers domain exporters / importers)"]
        DB[("PostgreSQL\nTable: ProjectMigrationLogs")]
    end

    subgraph Domains ["Domain Providers (IProjectMigrationProvider)"]
        PipeProv["PipelineMigrationProvider"]
        ContProv["ContentMigrationProvider"]
        RepoProv["RepositoryMigrationProvider"]
        ConstProv["ConstantsMigrationProvider"]
    end

    Hub -->|Open Full Wizard| Wizard
    ScopedSub -->|Open with Scoped Header| Wizard
    Hub --> HistTable

    Wizard -->|POST /export| Controller
    Wizard -->|POST /import (Multipart)| Controller
    HistTable -->|GET /history| Controller

    Controller --> Orchestrator
    Orchestrator --> DB
    Orchestrator <-->|Collect / Ingest| Domains
    PipeProv <-->|Graph & Snapshots| Orchestrator
    ContProv <-->|Anchor Trees & Tags| Orchestrator
    RepoProv <-->|Configs & Filters| Orchestrator
    ConstProv <-->|Project SSOT| Orchestrator
```

---

## 3. Thiết Kế Chi Tiết

### 3.1. Hợp đồng Bundle (`.forgity.pkg`)

Một gói migration bundle là một file JSON (nén `gzip` với phần mở rộng `.forgity.pkg` hoặc `.json` khi debug):

```json
{
  "manifest": {
    "packageFormatVersion": "1.0",
    "generator": "Forgity Studio v2026.11",
    "exportedAt": "2026-11-05T23:30:00Z",
    "sourceStudio": "MyStudio",
    "sourceProject": {
      "name": "TemplateProject",
      "slug": "template-project"
    },
    "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "domains": ["pipelines", "content", "constants"]
  },
  "domains": {
    "constants": {
      "items": [
        { "key": "material_folders", "values": ["/Game/Characters/Genesis9/Base/Materials"] },
        { "key": "master_skeleton", "values": ["/Game/Characters/Genesis9/Base/Meshes/G9_Feminine_Skeleton"] }
      ]
    },
    "pipelines": {
      "items": [
        {
          "name": "Fbx To Unreal Wardrobe Ingestion",
          "slug": "fbx-to-unreal-wardrobe-ingestion",
          "description": "Bake and ingest outfit meshes",
          "graphData": { "nodes": [], "edges": [], "parameters": [] }
        }
      ]
    },
    "content": {
      "items": [
        {
          "anchorPath": "outfits/dress",
          "targetType": "WardrobeItem",
          "tags": ["Character.Eva", "System.Wardrobe.Slots.Dress"]
        }
      ]
    },
    "repositories": {
      "items": []
    }
  }
}
```

---

### 3.2. Bảng Cơ Sở Dữ Liệu: `ProjectMigrationLogs`

Trong module `Studio` (hoặc module `Migration`), bổ sung entity `ProjectMigrationLog`:

```csharp
namespace Automation.Studio.Domain.Entities;

public enum MigrationType { Export = 0, Import = 1 }
public enum MigrationStatus { Pending = 0, Success = 1, PartialSuccess = 2, Failed = 3 }

public class ProjectMigrationLog : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Guid StudioId { get; set; }
    public Guid UserId { get; set; }
    public string UserDisplayName { get; set; } = string.Empty;

    public MigrationType Type { get; set; }
    public MigrationStatus Status { get; set; }
    public string PackageFileName { get; set; } = string.Empty;
    public long PackageSizeBytes { get; set; }
    public string PackageChecksumSha256 { get; set; } = string.Empty;

    /// <summary>
    /// Danh mục được chọn: ["pipelines", "content", "repositories", "constants"]
    /// </summary>
    public List<string> SelectedDomains { get; set; } = [];

    /// <summary>
    /// Thống kê kết quả: { "pipelines": { "created": 2, "updated": 0, "skipped": 0 }, ... }
    /// </summary>
    public Dictionary<string, DomainMigrationResultSummary> DomainSummaries { get; set; } = [];

    public string? ErrorMessage { get; set; }
    public string? StoragePath { get; set; } // Nếu lưu trữ file package để cho phép tải lại
}

public record DomainMigrationResultSummary(int Total, int Created, int Updated, int Skipped, List<string> Warnings);
```

---

### 3.3. Backend Provider Interface (`IProjectMigrationProvider`)

Sử dụng **Strategy / Provider Pattern** để các module (`Pipeline`, `Content`, `Repository`) độc lập, tự đóng gói và tự xử lý import mà không phụ thuộc chéo:

```csharp
public interface IProjectMigrationProvider
{
    string DomainKey { get; } // "pipelines", "content", "repositories", "constants"
    string DisplayLabel { get; }
    int SortOrder { get; }

    Task<object> ExportDomainAsync(Guid projectId, CancellationToken ct);
    Task<DomainMigrationResultSummary> ImportDomainAsync(
        Guid projectId, 
        JsonElement domainData, 
        ConflictResolutionStrategy strategy, 
        CancellationToken ct
    );
}
```

---

### 3.4. Giao Diện Người Dùng (Frontend UX)

#### 1. Trang trung tâm: `Project Migrations` (`web/src/features/projects/migrations/ProjectMigrationsPage.tsx`)
- **Top Actions**:
  - Nút **"Export Package"**: Mở Export Wizard dialog.
  - Nút **"Import Package"**: Mở Import Wizard dialog.
- **Bảng `Migration History Table`**:
  - Cột: `Type` (Huy hiệu xanh: Export, tím: Import), `Package Name`, `Domains` (Badges: Pipelines, Content...), `Items Count` (Created/Updated/Skipped), `Author`, `Executed At`, `Status`.
  - Cột Actions: Xem chi tiết báo cáo (Audit Details Dialog) · Tải lại gói (`.forgity.pkg` đối với bản export).

#### 2. Export / Import Wizard Dialog (`UnifiedMigrationWizardDialog.tsx`)
- **Checklist đa danh mục thông minh**:
  - [x] 🧩 **Pipelines & Workflows** *(4 pipelines selected)*
  - [x] 🎭 **Content Anchors & Tags** *(12 character anchors)*
  - [ ] 📁 **Repository Workspaces** *(Unchecked)*
  - [x] ⚙️ **Project Constants & Conventions** *(3 /Game mappings)*
- **Thanh Header Ngữ Cảnh (Scoped Header Bar)** khi gọi từ trang con:
  - Khi mở từ `/projects/:id/pipelines`, dialog hiện thanh header màu xanh dịu:
    ```
    ┌────────────────────────────────────────────────────────────────────────┐
    │ 💡 Exporting from: Pipelines & Automation Workflows                    │
    │ Pipelines domain is pre-selected. Check other domains to bundle them.  │
    └────────────────────────────────────────────────────────────────────────┘
    ```
- **Xử lý Xung đột khi Import (Conflict Strategy)**:
  - Radio options:
    - ⚪ **Skip Existing**: Giữ nguyên tài nguyên hiện tại, chỉ thêm mới.
    - 🔘 **Overwrite Existing (Recommended)**: Cập nhật đè lên entity có cùng slug/key.
    - ⚪ **Duplicate / Rename**: Tự sinh tên mới `[Name] (Imported)`.

---

## 4. Kế Hoạch Triển Khai Từng Giai Đoạn (Phased Roadmap)

| Giai đoạn | Nội dung công việc | Kiểm tra & Nghiệm thu |
| :--- | :--- | :--- |
| **Phase 1: Backend Architecture & Entity** | 1. Tạo migration DB cho bảng `ProjectMigrationLogs`.<br/>2. Định nghĩa interface `IProjectMigrationProvider` và `ProjectMigrationOrchestrator`.<br/>3. Triển khai provider đầu tiên: `PipelineMigrationProvider` (tái sử dụng engine graph JSONB từ `BL-039`) và `ConstantsMigrationProvider`. | `dotnet test` + kiểm tra lưu vết migration log trong DB. |
| **Phase 2: Export & Import API Endpoints** | 1. Endpoint `POST /api/projects/{id}/migrations/export`: Stream file bundle `.forgity.pkg`.<br/>2. Endpoint `POST /api/projects/{id}/migrations/import`: Đọc file bundle, dispatch qua các providers, ghi log kết quả.<br/>3. Endpoint `GET /api/projects/{id}/migrations/history`: Trả về danh sách phân trang audit log. | Gọi API qua Swagger / CLI, kiểm tra gói xuất ra JSON hợp lệ. |
| **Phase 3: Frontend Central Hub & History Table** | 1. Thêm tab/mục **Migrations** trong Project Shell.<br/>2. Xây dựng `ProjectMigrationsPage` với bảng `MigrationHistoryTable`.<br/>3. Xây dựng Dialog xem chi tiết log (Summary popover: số lượng tạo/sửa/bỏ qua, warnings). | Hiển thị bảng lịch sử mượt mà với TanStack Query. |
| **Phase 4: Export/Import Wizard & Scoped Header** | 1. Hoàn thiện `UnifiedMigrationWizardDialog` với checklist đa danh mục.<br/>2. Bổ sung chế độ Scoped Header khi bấm Export/Import từ trang `Pipelines` và `Content`.<br/>3. Kiểm thử trọn vẹn luồng: Export từ Project A ➔ Import sang Project B không lỗi. | Chuyển giao trọn vẹn Pipeline + Constants giữa 2 Project. |

---

## 5. Rủi Ro Kỹ Thuật & Giải Pháp Phòng Vệ

1. **Entity ID Mismatch khi sang Studio/Project khác**:
   - *Rủi ro*: Import Pipeline sang Project khác nhưng các tham chiếu `ProjectId` hoặc `RepositoryId` bên trong pin vẫn giữ GUID cũ dẫn đến gãy liên kết.
   - *Phòng vệ*: Bundle lưu trữ theo **Semantic Key / Slug** (ví dụ `RepositoryName`, `ContentAnchorPath`) thay vì hardcode GUID. Khi Import, hệ thống map động lại GUID mới của Target Project.
2. **Kích thước gói quá lớn nếu kèm File nhị phân**:
   - *Nguyên tắc*: Gói `.forgity.pkg` **chỉ chứa cấu trúc metadata logic (JSON)**, tuyệt đối không nhúng file nhị phân nặng hàng GB (`.uasset`, `.fbx`). File vật lý vẫn do Storage / CAS (`ADR-003`) và Runner phụ trách. Nhờ đó gói migration cực kỳ nhẹ (chỉ vài trăm KB), xuất nhập trong 1 giây.
3. **Phân quyền thực hiện Migration**:
   - Chỉ Project Owner, Studio Admin hoặc người có quyền `P.Project.Manage` mới được phép thực hiện Import/Export để bảo vệ an toàn dữ liệu.

