# Kế Hoạch Kỹ Thuật: Import & Export Content Types (Schema) và Content Items (MVP Safe-Mode)

**Ngày lập**: 2026-10-09  
**Người đề xuất**: pair programming Agent & User  
**Trạng thái**: Chờ duyệt (Pending Review)  
**Phạm vi**: Backend (`api/src/Modules/Content`) & Frontend (`web/src/features/contentTypes`, `web/src/features/contentItems`)

---

## 1. Mục Tiêu & Nguyên Tắc Cốt Lõi (Core Principles)

1. **MVP Safe-Mode (Bảo vệ dung lượng lưu trữ hạ tầng)**:
   - Tạm ẩn / không bundle các file nhị phân đính kèm dung lượng lớn (Texture, Mesh, Video...) trong Content Items khi Import/Export.
   - Tập trung 100% vào **Pure JSON Metadata** (Text, Number, Date, Select, Boolean, Tags) $\rightarrow$ File xuất ra cực nhẹ (vài chục KB cho hàng nghìn bản ghi), tốc độ tức thì, không rủi ro cạn kiệt dung lượng đĩa cứng khi chưa có module quản lý Quota.
2. **Tương thích Đa Định Dạng (JSON & CSV)**:
   - **Content Types**: Định dạng `.content-types.json` để chia sẻ trọn vẹn khuôn mẫu bảng dữ liệu (Fields Config từ DynamicForms, DisplayConfig, Icon, Color...).
   - **Content Items**: Hỗ trợ cả `.items.json` (dữ liệu phân cấp) và `.items.csv` (chuẩn hóa bảng để mở bằng Excel/Google Sheets, cực kỳ thuận tiện cho đội ngũ Game Design / Artist nhập liệu hàng loạt).
3. **Phân định Rõ Ràng 2 Giai Đoạn**:
   - **Giai đoạn 2**: Content Types Schema Import & Export.
   - **Giai đoạn 3**: Content Items Batch Data Import & Export.

---

## 2. Kiến Trúc Hợp Đồng Dữ Liệu (Data Contracts)

### 2.1. Content Types Schema (`.content-types.json`)
```json
{
  "formatVersion": "1.0",
  "exportedAt": "2026-10-09T08:30:00Z",
  "totalTypes": 1,
  "contentTypes": [
    {
      "key": "character",
      "name": "Character",
      "displayName": "Nhân Vật",
      "description": "Quản lý nhân vật và chỉ số chiến đấu",
      "icon": "User",
      "color": "#8b5cf6",
      "sortOrder": 1,
      "displayConfig": {
        "mode": "grid",
        "titleField": "name",
        "thumbnailField": "avatar",
        "descriptionField": "bio"
      },
      "fieldsConfig": [
        { "name": "name", "label": "Tên Nhân Vật", "controlType": "text", "isRequired": true },
        { "name": "class", "label": "Hệ / Phái", "controlType": "select", "options": ["Warrior", "Mage", "Rogue"] },
        { "name": "level", "label": "Cấp Độ", "controlType": "number", "defaultValue": 1 },
        { "name": "bio", "label": "Tiểu Sử", "controlType": "textarea" }
      ]
    }
  ]
}
```

### 2.2. Content Items Data (`.items.json` & `.items.csv`)

#### Dạng JSON (`.items.json`):
```json
{
  "formatVersion": "1.0",
  "exportedAt": "2026-10-09T08:30:00Z",
  "contentTypeKey": "character",
  "totalItems": 2,
  "items": [
    {
      "name": "Aria Swiftblade",
      "values": {
        "name": "Aria Swiftblade",
        "class": "Rogue",
        "level": 45,
        "bio": "Sát thủ bóng đêm thuộc gia tộc Crimson"
      }
    },
    {
      "name": "Thorne Ironclad",
      "values": {
        "name": "Thorne Ironclad",
        "class": "Warrior",
        "level": 50,
        "bio": "Chiến binh tiên phong"
      }
    }
  ]
}
```

#### Dạng CSV (`.items.csv` - Tự động đối chiếu header với Field Keys):
```csv
Name,class,level,bio
Aria Swiftblade,Rogue,45,Sát thủ bóng đêm thuộc gia tộc Crimson
Thorne Ironclad,Warrior,50,Chiến binh tiên phong
```

---

## 3. Chi Tiết Thực Hiện: Giai Đoạn 2 (Content Types Schema)

### 3.1. Backend (`api/src/Modules/Content`)
1. **Endpoint `ExportContentTypes` (`GET /api/projects/{ProjectId:guid}/content-types/export`)**:
   - Query: `ProjectId` (Guid), `Keys` (string comma-separated hoặc list, tùy chọn để xuất toàn bộ hoặc lọc theo Key).
   - Handler:
     - Lấy danh sách `ContentType` theo `ProjectId`.
     - Với mỗi `ContentType`, gọi `ISchemaApi.GetActiveVersionWithDependenciesAsync("ContentType", item.Id.ToString(), ct)` để lấy `FieldsConfig` của DynamicForms.
     - Đóng gói DTO `ContentTypeExportPackageDto`.
2. **Endpoint `ImportContentTypes` (`POST /api/projects/{ProjectId:guid}/content-types/import`)**:
   - Command: `ProjectId`, `ConflictStrategy` (`Skip` / `Update`), `List<ContentTypeExportItemDto> ContentTypes`.
   - Handler với `[Transactional(typeof(ContentDbContext))]`:
     - Kiểm tra `Key` trong Project:
       - **Đã tồn tại & Skip**: Bỏ qua, đếm `SkippedCount`.
       - **Đã tồn tại & Update**: Cập nhật thông tin `ContentType` và gọi `ISchemaApi.UpsertSchemaAsync` để ghi đè trường form `FieldsConfig`.
       - **Chưa tồn tại**: Tạo mới `ContentType`, `db.ContentTypes.Add(...)`, sau đó gọi `ISchemaApi.UpsertSchemaAsync` để gán `FieldsConfig`.
     - Trả về `ContentTypeImportResultDto` (`Total`, `Imported`, `Updated`, `Skipped`, `Errors`).

### 3.2. Frontend (`web/src/features/contentTypes`)
1. **Hook `useContentTypesExportImport.ts`**:
   - Hàm `exportContentTypes`: Gọi API, tạo Blob và tải file `[ProjectName]_content_types.json`.
   - Mutation `importContentTypes`: Nhận file/payload, invalidate cache `["contentTypes", projectId]`.
2. **Dialog `ImportContentTypeDialog.tsx`**:
   - Kéo thả file JSON.
   - Bảng xem trước: Hiển thị danh sách Type (Key, Tên hiển thị, Icon/Color, Số lượng trường `fieldsConfig`).
   - Lựa chọn `ConflictStrategy`: *Skip existing* hoặc *Update schema*.
3. **Tích hợp vào `ContentTypePage.tsx`**:
   - Thêm nút **Export All** và **Import Schema** trên thanh công cụ của `ResourcePageShell`.

---

## 4. Chi Tiết Thực Hiện: Giai Đoạn 3 (Content Items Batch Data)

### 4.1. Backend (`api/src/Modules/Content`)
1. **Endpoint `ExportContentItems` (`GET /api/projects/{ProjectId:guid}/content-items/export`)**:
   - Query: `ProjectId` (Guid), `ContentTypeKey` (string, bắt buộc), `Format` (`json` / `csv`).
   - Handler:
     - Truy vấn tất cả `ContentItem` theo `ProjectId` và `ContentTypeId`.
     - Lấy `Values` từ `ISchemaApi.GetMultipleDataAsync`.
     - Nếu `Format == "json"`: Trả về DTO `ContentItemExportPackageDto`.
     - Nếu `Format == "csv"`:
       - Lấy `FieldsConfig` của ContentType.
       - Tạo các header cột (`Name`, `field_1`, `field_2`...).
       - Format các dòng dữ liệu dạng CSV, xử lý dấu phẩy / quotes an toàn.
       - Trả về file tải trực tiếp `File(bytes, "text/csv", $"{typeKey}_items.csv")`.
2. **Endpoint `ImportContentItems` (`POST /api/projects/{ProjectId:guid}/content-items/import`)**:
   - Command: `ProjectId`, `ContentTypeKey`, `ConflictStrategy` (`CreateNew`, `Skip`, `Update`), `Format` (`json` / `csv`), `string? CsvContent`, `List<ContentItemImportItemDto>? Items`.
   - Handler:
     - Nếu `Format == "csv"`: Parse nội dung CSV theo danh sách header của schema.
     - Lặp qua từng item:
       - Tra cứu item theo `Name` trong ContentType:
         - `CreateNew`: Luôn tạo bản ghi mới `new ContentItem(contentTypeId, projectId, name)`.
         - `Skip`: Nếu trùng tên thì bỏ qua.
         - `Update`: Cập nhật lại bản ghi cũ, gọi `schemaApi.SaveDataAsync` để cập nhật `Values`.
     - Trả về `ContentItemImportResultDto` (`Total`, `Imported`, `Updated`, `Skipped`, `Errors`).

### 4.2. Frontend (`web/src/features/contentItems`)
1. **Hook `useContentItemsExportImport.ts`**:
   - `exportContentItems(projectId, typeKey, format: 'json' | 'csv')`.
   - `importContentItems(projectId, typeKey, payload)`.
   - `downloadSampleCsvTemplate(projectId, typeKey)`: Tự sinh file CSV mẫu có sẵn các header cột từ `FieldsConfig` của ContentType để user chỉ việc điền dữ liệu.
2. **Dialog `ImportContentItemDialog.tsx`**:
   - Kéo thả file `.json` hoặc `.csv`.
   - Parse client-side và hiển thị preview 5 dòng đầu tiên.
   - Nút *"Download Sample CSV Template"* giúp người dùng không bao giờ nhập sai tên cột.
   - Chọn Conflict Strategy: *Create New*, *Skip Existing*, *Update Existing*.
3. **Tích hợp vào `ContentItemPage.tsx`**:
   - Bổ sung menu Dropdown Export (JSON / CSV) và nút Import cạnh nút `Add Content Item`.

---

## 5. Quy Trình Kiểm Thử & Nghiệm Thu (Acceptance Criteria)

| Bước kiểm tra | Thao tác thực hiện | Kết quả mong đợi |
| :--- | :--- | :--- |
| **1. Export Content Types** | Chọn Export Schema tại ContentTypePage | Tải về file `.content-types.json` chứa đầy đủ `displayConfig` và các `fieldsConfig`. |
| **2. Import Content Types** | Tạo project mới hoặc xóa ContentType, upload file vừa tải | ContentType được tái tạo nguyên vẹn, vào Form Builder thấy toàn bộ các controls đúng 100%. |
| **3. Export Content Items (CSV)** | Chọn Export CSV tại bảng Content Items | File `.csv` tải về mở bằng Excel/Notepad có đúng các cột theo fields của ContentType. |
| **4. Import Content Items (CSV)** | Điền thêm 5 dòng mới vào file CSV và upload import | 5 bản ghi mới lập tức hiển thị trên bảng, các giá trị hiển thị chuẩn xác ở cả Card View và Table View. |
| **5. An toàn dung lượng** | Kiểm tra các trường file/asset trong items | Không bundle asset nhị phân, dữ liệu truyền đi 100% gọn nhẹ và an toàn. |
