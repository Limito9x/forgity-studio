# Kế Hoạch Kỹ Thuật: Cảnh Báo Xóa Stage Container & Nâng Cấp Tool Assign Resources To Content

## 1. Bối Cảnh & Vấn Đề (Context & Motivation)

1. **Rủi ro mất dữ liệu trên Canvas khi xóa Stage Container**:
   - Hiện tại, khi người dùng click vào Stage Container (`ScopeContainerNode`), node này được chọn. Nếu người dùng vô tình bấm phím `Delete` hoặc `Backspace` (ví dụ định xóa một edge hoặc một node khác), React Flow sẽ kích hoạt xóa Stage và kéo theo xóa sạch toàn bộ các node con bên trong mà không hề có bất kỳ cảnh báo xác nhận nào.
   - Nút thùng rác trên Header của Stage Container cũng xóa ngay lập tức khi click.
   - **Yêu cầu**: Bổ sung hộp thoại cảnh báo xác nhận (Confirmation Dialog) trước khi xóa bất kỳ Stage Container nào, liệt kê rõ số lượng node con bên trong sẽ bị ảnh hưởng.

2. **Hạn chế của Tool `Assign Resources to Content`**:
   - Hiện tại, `AssignResourcesToContentTool` chỉ nhận một input cứng là `ContentId` (yêu cầu người dùng phải tự tìm và chọn trước một ContentItem có sẵn).
   - Trong các luồng tự động hóa 3D thực tế (ví dụ: Blender export nhân vật `Eva`, Unreal import vũ khí `Sword_01`), người dùng muốn:
     - Chọn `ContentType` (ví dụ: `Character`, `Prop`, `Environment`...).
     - Nhập hoặc cắm dây `ContentName` (ví dụ: cắm từ chân `BaseName` của `Break Struct (Resource)`).
     - Có cờ chọn `CreateIfNotExists` (mặc định `true`): Nếu Content đã có thì gán vào; nếu chưa có thì tự động tạo mới `ContentItem` rồi gán vào.
     - Đồng thời vẫn giữ `ContentId` tùy chọn để tương thích ngược.

---

## 2. Thiết Kế Kỹ Thuật Chi Tiết

### Phần 1: Canvas Stage Delete Confirmation Dialog

#### A. Giao Diện & Trạng Thái (`web/`)
- Tạo component `DeleteStageConfirmDialog.tsx` sử dụng `BaseDialog`:
  - Tiêu đề: **Delete Stage Scope**
  - Nội dung: *"Are you sure you want to delete stage **'{stageName}'**? This will permanently delete the stage container and **{childCount} node(s)** inside it. This action cannot be undone."*
  - Nút: **Cancel** (outline) và **Delete Stage** (destructive red).
- Quản lý trạng thái xóa trong `usePipelineDraftState.ts` / `PipelineCanvas.tsx`:
  - Thêm state `pendingStageDelete: { stageId: string; stageName: string; childCount: number; resolve: (confirmed: boolean) => void } | null`.
- Tích hợp 2 luồng kích hoạt:
  1. **Phím Delete / Backspace**: Cấu hình `onBeforeDelete` trên `<ReactFlow ... />`:
     - Nếu trong danh sách node muốn xóa có chứa `n.type === "scopeContainer"`:
     - Tạm dừng (trả về Promise), đếm số child node có `parentId === stage.id`.
     - Hiển thị Dialog xác nhận. Nếu bấm Cancel -> `resolve(false)`. Nếu bấm Confirm -> `resolve(true)`.
  2. **Click Icon Thùng Rác trên Header Stage**:
     - Trong `ScopeContainerNode.tsx` hoặc qua event `pipeline:delete-stage`:
     - Kích hoạt cùng modal xác nhận trước khi gọi `handleStageDelete`.

---

### Phần 2: Nâng Cấp Tool `Assign Resources to Content`

#### A. Backend Content API (`Automation.Content`)
- Trong `IContentApi.cs`:
  ```csharp
  Task<Result<ContentSummaryDto>> GetOrCreateContentItemAsync(
      Guid projectId,
      string contentTypeKeyOrName,
      string contentItemName,
      bool createIfNotExists,
      CancellationToken ct = default
  );
  ```
- Trong `ContentApiService.cs`:
  - Tìm `ContentType` theo `Key`, `Name` hoặc `DisplayName` trong cùng `ProjectId`.
  - Tìm `ContentItem` theo `Name` hoặc slug `Key` trong `ContentType` đó.
  - Nếu đã tồn tại -> Trả về `ContentSummaryDto` của item đó.
  - Nếu chưa tồn tại và `createIfNotExists == true` -> Tạo mới `ContentItem`, lưu DB và trả về `ContentSummaryDto`.
  - Nếu chưa tồn tại và `createIfNotExists == false` -> Trả về lỗi rõ ràng: *"Content item '{name}' does not exist in type '{type}' and 'Create If Not Exists' is disabled."*

#### B. Nâng Cấp `AssignResourcesToContentTool.cs` (`Automation.Pipeline`)
- **Inputs**:
  1. `ContentType` (String, Optional): Target ContentType (e.g. `Character`, `Prop`). Cho phép chọn từ dropdown danh sách ContentType trên Canvas.
  2. `ContentName` (String, Optional): Tên của Content (hỗ trợ cắm từ `BaseName` hoặc nhập tay).
  3. `CreateIfNotExists` (Boolean, Default `true`): Cờ tự động tạo mới nếu chưa tồn tại.
  4. `ContentId` (EntityRef, Optional): Direct Content ID (tương thích ngược).
  5. `Resources` (EntityRef Array, Required): Danh sách Resource IDs gán vào.
- **Outputs**:
  1. `ContentId` (EntityRef): ID của ContentItem (vừa tìm thấy hoặc vừa tạo mới).
  2. `ContentName` (String): Tên của ContentItem.
  3. `ContentType` (String): Tên loại Content.
  4. `ResourceIds` (EntityRef Array): Danh sách Resource IDs đã gán.
  5. `AssignedCount` (Number): Số lượng resource gán thành công.
  6. `Success` (Boolean): Trạng thái hoàn thành.
- **Logic thực thi**:
  - Tự động lấy `ProjectId` từ `context.ProjectId` (fallback sang `Pipeline.ProjectId` từ DB).
  - Nếu `ContentId` có giá trị -> Dùng trực tiếp `ContentId`.
  - Nếu `ContentId` trống -> Gọi `contentApi.GetOrCreateContentItemAsync(projectId, contentType, contentName, createIfNotExists, ct)` để lấy `ContentId`.
  - Gọi `workspaceApi.AssignResourceToContentAsync(contentId, resourceGuids, ct)`.

#### C. Cấu Hình Form Scope & Canvas UI (`web/`)
- Đảm bảo `pinToFieldDefinition.ts` nhận diện:
  - Pin `ContentType`: Render dropdown chọn ContentType từ API.
  - Pin `CreateIfNotExists`: Render checkbox boolean (mặc định checked `true`).
  - Pin `ContentName`: Render text input (hoặc nối dây input pin).

---

## 3. Kế Hoạch Triển Khai & Kết Quả (Execution Status: 100% COMPLETED)

- [x] **Bước 1**: Backend - Bổ sung `GetOrCreateContentItemAsync` vào `IContentApi` & `ContentApiService` (hỗ trợ tìm hoặc tự sinh item theo type + name, đảm bảo slug uniqueness).
- [x] **Bước 2**: Backend - Nâng cấp `AssignResourcesToContentTool.cs`:
  - Thêm Pins: `ContentType` (EntityRef ContentType), `ContentName` (String), `CreateIfNotExists` (Boolean default true).
  - Outputs mở rộng: `ContentId`, `ContentName`, `ContentType`, `ResourceIds`, `AssignedCount`, `Success`.
- [x] **Bước 3**: Backend Build Verification - Build `Automation.Pipeline` thành công `0 Error`.
- [x] **Bước 4**: Frontend - Tạo `DeleteStageConfirmDialog.tsx` sử dụng `BaseDialog`, đếm chính xác số child nodes bên trong và cảnh báo rủi ro xóa.
- [x] **Bước 5**: Frontend - Tích hợp `onBeforeDelete` trên `<ReactFlow>` và cập nhật listener `pipeline:delete-stage` để hiển thị xác nhận trước khi xóa, chống vô tình mất stage khi click nhầm hoặc ấn phím Delete/Backspace.
- [x] **Bước 6**: Frontend Typecheck & Build Verification - `pnpm typecheck` và `pnpm build` pass `100% (0 Error)`.

