# Kế Hoạch Kỹ Thuật (BL-031): Cây Điểm Neo (Content Anchor Tree), Đảo Ngược Phụ Thuộc & Smart Link Theo Quy Ước Dấu `_`

- **Ngày khởi tạo**: 31/10/2026
- **Mã Backlog**: `BL-031`
- **Trạng thái**: Chờ phê duyệt (Pending Review Gate)
- **Mục tiêu**:
  1. Đảo ngược chiều phụ thuộc (Inversion of Control): Tháo bỏ `ContentId` khỏi `ResourceItem`, chuyển quyền sở hữu liên kết về `ContentItem` thông qua bảng `ContentAnchorLink` (`AnchorPath`, `TargetType`, `TargetId`). Mô hình tối giản: toàn bộ cây ngữ cảnh được đại diện bằng đường dẫn ảo `AnchorPath` duy nhất (loại bỏ khái niệm `Slot` thừa thãi).
  2. Chuẩn hóa tên món đồ thành **PascalCase** (`BrzUsBra`, `IridessaHair`) để dấu gạch dưới `_` trở thành **ký tự phân cấp điểm neo tuyệt đối 100%** (Zero Heuristics).
  3. Tích hợp **Smart Link** trực tiếp vào `SyncLocalChangeToRepositoryTool` thông qua một chân cấu hình tùy chọn `ContentType` duy nhất, loại bỏ hoàn toàn việc phải nối node `AssignResourcesToContent` hay cắt chuỗi thủ công trên Canvas.
  4. Cung cấp cơ chế **Migration 2 chiều (Up & Down Rollback)** đảm bảo Zero Data Loss.

---

## 1. Bảng Đối Chiếu Trước & Sau Thực Hiện (Before vs After Matrix)

| Hạng mục Kiến trúc | TRƯỚC KHI THỰC HIỆN (Hiện trạng) | SAU KHI THỰC HIỆN (Chuẩn hóa BL-031) |
| :--- | :--- | :--- |
| **Chiều phụ thuộc (Dependency)** | `ResourceItem` giữ khóa ngoại `Guid? ContentId`. Module vật lý (`Repository`) bị dính chặt vào nghiệp vụ (`Content`). | `ResourceItem` hoàn toàn độc lập, thuần túy quản lý file vật lý. `ContentItem` sở hữu danh sách `ContentAnchorLink`. |
| **Quan hệ & Chia sẻ file** | Quan hệ `1 Resource -> 1 Content` cứng nhắc. Không thể dùng chung 1 file tóc/vũ khí cho 2 nhân vật. | Quan hệ `N-N` qua Điểm Neo. Nhiều `ContentItem` có thể cùng neo tới 1 `ResourceItem` hoặc trỏ sang `Sub-Content` khác. |
| **Cấu trúc bên trong Content** | Phẳng lì (Flat Soup): 20 files `.duf`, `.blend`, `.fbx` cùng trỏ vào `Eva` mà không biết file nào là gốc, file nào thuộc `Outfit1`. | Phân cấp dạng **Cây Điểm Neo (`AnchorPath`)**: `root/Eva.blend`, `Outfit1/BrzUsBra`, `Outfit1/IridessaHair`... |
| **Quy ước đặt tên (Naming)** | Dấu `_` bị dùng lẫn lộn giữa prefix (`Eva_Outfit1_`) và khoảng trắng tên đồ (`BRZ_US_Bra`) $\rightarrow$ buộc phải đoán mò. | Tên món đồ gom thành **PascalCase** (`BrzUsBra`). Dấu `_` là ký tự phân cấp toán học 100%: `Content_Anchor_Leaf.ext`. |
| **Trải nghiệm trên Canvas** | Phải nối `BreakStruct` $\rightarrow$ `SplitString("_")` $\rightarrow$ `GetElement(0)` $\rightarrow$ `AssignResourcesToContentTool`. | Chọn `ContentType = Character` ngay trên node **`SyncLocalChangeToRepository`** $\rightarrow$ tự động tìm/tạo Content và đóng đinh vào đúng nhánh neo! |
| **BreakStruct (Resource)** | Phơi bày `ContentId`, `ContentName`, `ContentType` gây nhiễu loạn ngữ nghĩa. | Gỡ bỏ các chân Content khỏi `ResourceStructDefinition`, giữ `Resource` gọn sạch đúng bản chất tệp vật lý. |

---

## 2. Quy Tắc Toán Học Của Bộ Phân Giải `AnchorConventionParser` (Tối Giản Hóa - Zero Heuristics)

Khi một tệp có tên `FileName` (đã bỏ phần mở rộng `.ext` thành `stem`) được đồng bộ kèm `ContentType`:
- Cắt chuỗi theo dấu `_`: `tokens = stem.Split('_', StringSplitOptions.RemoveEmptyEntries)`

| Số lượng Token | Công thức mẫu | `ContentName` | `AnchorPath` (Toàn bộ đường dẫn cây) | Ví dụ thực tế (`FileName` $\rightarrow$ Kết quả) |
| :--- | :--- | :--- | :--- | :--- |
| **`1 token`** | `{Content}.ext` | `tokens[0]` | `"root/" + FileName` | `Eva.duf` $\rightarrow$ Content: `Eva`, AnchorPath: `root/Eva.duf` |
| **`2 tokens`** | `{Content}_{Anchor}.ext` | `tokens[0]` | `tokens[1] + "/" + FileName` | `Eva_Outfit1.blend` $\rightarrow$ Content: `Eva`, AnchorPath: `Outfit1/Eva_Outfit1.blend` |
| **`>= 3 tokens`** | `{Content}_{Anchor...}_{Leaf}.ext` | `tokens[0]` | `Join("/", tokens[1..])` | `Eva_Outfit1_BrzUsBra.fbx` $\rightarrow$ Content: `Eva`, AnchorPath: `Outfit1/BrzUsBra` |
| **`>= 4 tokens`** | `{Content}_{Folder}_{Sub}_{Leaf}.ext` | `tokens[0]` | `Join("/", tokens[1..])` | `Eva_Outfits_Summer_SilkDress.fbx` $\rightarrow$ Content: `Eva`, AnchorPath: `Outfits/Summer/SilkDress` |

> [!TIP]
> **Mô hình Tối Giản (Minimalist Path-Only)**:
> Không cần cột `Slot` riêng lẻ. Bản thân `AnchorPath` chính là đường dẫn ảo (Virtual Path) đại diện cho vị trí của node trên Cây Content, tương tự cấu trúc thư mục file system.
> - Thư mục cha: Lấy chuỗi trước dấu `/` cuối cùng (`Outfit1`).
> - Tên lá (Node Name): Lấy phần tử cuối cùng (`BrzUsBra`).

---

## 3. Lộ Trình Triển Khai Phân Phase (Master Roadmap)

### Phase 0: Sao Lưu An Toàn Dữ Liệu (Pre-Migration DB Backup Gate) - [x] HOÀN TẤT
- **Mục tiêu**: Đóng băng và tạo snapshot dữ liệu PostgreSQL hiện tại trước khi can thiệp cấu trúc bảng.
- **Kết quả thực thi**:
  - Đã chạy `.\scripts\backup-db.ps1 -Container "forgity-db-prod" -Format dump`.
  - Snapshot file: `backups/forgity_Forgity_20261031_075244.dump` (0.3 MB).
  - Bản ghi đối chiếu: 103 resources tổng thể, **92 resources gắn với `ContentId = Eva`**, 22 content items.

### Phase 1: PascalCase Naming, Domain `ContentAnchorLink`, Migration 2 Chiều & `IContentApi` - [x] HOÀN TẤT
1. **Chuẩn hóa PascalCase trong Blender & Unreal Scripts**:
   - Cập nhật [`pipeline-scripts/blender/batch_export_fbx.py`](file:///d:/FullStack/Automation/pipeline-scripts/blender/batch_export_fbx.py): Hàm `clean_asset_name()` chuyển `"BRZ US Bra Mesh"` thành `"BrzUsBra"`, `"Iridessa Hair Genesis 9"` thành `"IridessaHair"`. Đã test 100% regex PascalCase.
2. **Thiết kế Entity `ContentAnchorLink` trong `Automation.Content`**:
   - Tạo enum [`ContentLinkTargetType.cs`](file:///d:/FullStack/Automation/api/src/Modules/Content/Automation.Content/Domain/Enums/ContentLinkTargetType.cs): `Resource = 0`, `ContentItem = 1`, `Asset = 2`.
   - Tạo entity [`ContentAnchorLink.cs`](file:///d:/FullStack/Automation/api/src/Modules/Content/Automation.Content/Domain/Entities/ContentAnchorLink.cs) với `AnchorPath`, `TargetType`, `TargetId`.
   - Đăng ký `ContentAnchorLinkConfiguration.cs` và `ContentDbContext.cs`.
3. **Xây dựng `AnchorConventionParser` & Triển khai `IContentApi`**:
   - Tạo [`AnchorConventionParser.cs`](file:///d:/FullStack/Automation/api/src/Modules/Content/Automation.Content.Contracts/AnchorConventionParser.cs).
   - Đã viết unit test `AnchorConventionParserTests.cs` (13/13 test cases passed).
   - Mở rộng [`IContentApi.cs`](file:///d:/FullStack/Automation/api/src/Modules/Content/Automation.Content.Contracts/IContentApi.cs) & hoàn tất triển khai trong [`ContentApiService.cs`](file:///d:/FullStack/Automation/api/src/Modules/Content/Automation.Content/Infrastructure/Services/ContentApiService.cs).
4. **Tạo EF Core Migration & Script Chuyển Đổi 2 Chiều (Up / Down)**:
   - Migration `20261031011517_AddContentAnchorLinks.cs` đã áp dụng thành công lên DB.
   - Dữ liệu 92 resources đã được tự động chuyển thành công sang 92 records trong `content."ContentAnchorLinks"`.
   - Toàn bộ unit tests `Automation.Pipeline.Tests` (205 tests) đã passed 100%.

---

### Phase 2: Tích Hợp Smart Link Vào `SyncLocalChangeToRepositoryTool` & Tháo Bỏ `Resource.ContentId` - [ ] CHỜ PHÊ DUYỆT (Review Gate)
1. **Nâng cấp [`SyncLocalChangeToRepositoryTool.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/Tools/Workspaces/SyncLocalChangeToRepositoryTool.cs)**:
   - Tiêm thêm `IContentApi contentApi`.
   - Bổ sung chân input tùy chọn (Optional Pin):
     - `Id = "ContentType"`, `Label = "Auto-Link Content Type (Optional)"`, `Metadata = """{"type": "entity-select", "properties": {"entity": "ContentType"}}"""`.
   - Ngay sau khi đồng bộ danh sách tệp vào `Repository` thành công, nếu `ContentType` có giá trị:
     - Tự động gọi `contentApi.SmartLinkResourcesByConventionAsync(...)` để bóc tách tên file theo dấu `_`, tự động tìm/tạo `ContentItem` (VD: `Eva`) và gắn vào đúng `AnchorPath` (VD: `"Outfit1/BrzUsBra"`).
2. **Tháo bỏ `ContentId` khỏi `Automation.Repository` & `ResourceStructDefinition`**:
   - Cập nhật [`GetRepositoryResources.cs`](file:///d:/FullStack/Automation/api/src/Modules/Repository/Automation.Repository/Features/Resources/GetRepositoryResources.cs): Lấy thông tin liên kết Content & `AnchorPath` từ `contentApi.GetResourceAnchorLinksAsync(...)` thay vì đọc cột `r.ContentId`.
   - Cập nhật [`AssignResourcesContent.cs`](file:///d:/FullStack/Automation/api/src/Modules/Repository/Automation.Repository/Features/Resources/AssignResourcesContent.cs): Chuyển sang gọi `contentApi.AssignResourcesToAnchorAsync(...)` và `UnlinkResourcesAsync(...)`.
   - Gỡ bỏ `ContentId`, `ContentName`, `ContentType` khỏi [`ResourceStructDefinition.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/StructRegistry/Definitions/ResourceStructDefinition.cs).
   - Xóa bỏ cột `ContentId` khỏi [`ResourceItem.cs`](file:///d:/FullStack/Automation/api/src/Modules/Repository/Automation.Repository/Domain/Entities/ResourceItem.cs) và tạo migration cho `RepositoryDbContext`.
   - Tinh gọn hoặc đánh dấu Obsolete đối với `AssignResourcesToContentTool` (hỗ trợ backward compatibility tự động gọi sang `IContentApi`).

---

### Phase 3: Nâng Cấp Giao Diện Frontend (Anchor Badges & Content Anchor Tree Outliner)
1. **Endpoint Xem Cây Điểm Neo của Content**:
   - Tạo endpoint `GET /api/content-items/{id}/anchor-tree` trả về cây phân cấp các điểm neo (`root`, `Outfit1`...) kèm thông tin Resource/Target tại mỗi chốt.
2. **Cập nhật [`RepositoryResourceTable.tsx`](file:///d:/FullStack/Automation/web/src/features/repositories/components/RepositoryResourceTable.tsx) & [`AssignContentSidePanel.tsx`](file:///d:/FullStack/Automation/web/src/features/repositories/components/drawers/AssignContentSidePanel.tsx)**:
   - Hiển thị huy hiệu liên kết kèm nhánh điểm neo: `Eva › Outfit1 › BrzUsBra`.
   - Trong `AssignContentSidePanel`: Cho phép nhập `AnchorPath` tùy chọn hoặc để trống để tự động suy diễn theo dấu `_`.
3. **Xây dựng `ContentAnchorTreeOutliner.tsx`**:
   - Hiển thị cây thư mục điểm neo trực quan khi mở chi tiết một `ContentItem`.

---

## 4. Tiêu Chí Nghiệm Thu & Kiểm Thử (Verification Plan)

1. **Blender Export Test**:
   - Chạy `batch_export_fbx.py` trên `Eva_Outfit1.blend` $\rightarrow$ xác nhận xuất ra `Eva_Outfit1_BrzUsBra.fbx`, `Eva_Outfit1_BrzUsPanties.fbx`, `Eva_Outfit1_IridessaHair.fbx`.
2. **Unit Tests (`.NET xUnit`)**:
   - Kiểm thử `AnchorConventionParser` với các trường hợp 1, 2, 3, 4 tokens.
   - Kiểm thử `SyncLocalChangeToRepositoryTool` khi có `ContentType = "Character"` tự động tạo `ContentItem("Eva")` và gắn 3 file vào nhánh `Outfit1`.
   - Cập nhật và chạy pass toàn bộ test trong `Automation.Pipeline.Tests`.
3. **Database Migration Verification**:
   - Áp dụng migration `ContentDbContext` và `RepositoryDbContext`, kiểm tra bảo toàn dữ liệu 100%.

