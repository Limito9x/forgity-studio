# Kế Hoạch Kỹ Thuật (`BL-035`): Multi-Content Resource Linking, Table Unification & Query Filtering

> **Ngày lập kế hoạch**: 01/11/2026  
> **Mã Backlog**: `BL-035`  
> **Trạng thái**: Resolved (Đã hoàn thành & nghiệm thu)  
> **Phạm vi**: `Automation.Content.Contracts`, `Automation.Content`, `Automation.Repository.Shared`, `Automation.Repository`, `web/src/features/repositories`

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật (Problem Statement)

Sau khi triển khai thành công `BL-031` (Đảo ngược phụ thuộc Inverted Asset Graph & Content Anchor Tree):
1. **Quan hệ thực tế giữa Resource và Content là $N - N$ (Nhiều - Nhiều)**:
   - Một file Resource vật lý (ví dụ `Boots_Combat_01.fbx`, `T_Skin_Base_Head_D.png`, `Anim_Walk_Forward.fbx`) có thể được dùng chung cho vô số nhân vật/content: vừa là giày của **Eva**, vừa là giày của **Mia**, vừa là giày của **NPC_Guard**.
2. **Điểm nghẽn ở API Query & DTO hiện tại**:
   - Trong `GetRepositoryResources.cs`, backend đang lấy `links?.FirstOrDefault()`, chỉ trả về `ContentId`, `ContentName`, `ContentTypeName` đơn lẻ của thằng đầu tiên.
   - Giao diện bảng Resources trên Web chia thành 2 cột: `Content Type` và `Linked Content`.
   - **Hậu quả**:
     - Người dùng bị ảo tưởng rằng file chỉ thuộc về 1 nhân vật duy nhất.
     - Khi 1 file được gắn cho 2+ Content, các Content phía sau bị "tàng hình", người dùng tưởng nhầm là chưa gán.
     - Chưa có bộ lọc nhanh để tìm các file **"Mồ côi" (Unassigned)** chưa được gán Content để xử lý hàng loạt.

---

## 2. Thiết Kế Kiến Trúc & Luồng Dữ Liệu (Before vs After)

```
[TRƯỚC (Before) - Quan hệ 1-1 giả lập]
  ResourceItem ────────> [ links.FirstOrDefault() ] 
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
         Cột "Content Type"               Cột "Linked Content"
         (Chỉ hiện 1 loại)                (Chỉ hiện 1 tên)

[SAU (After) - Quan hệ N-N chuẩn xác BL-035]
  ResourceItem ────────> [ Tất cả anchor links của Resource ]
                                  │
                                  ▼
                Cột duy nhất "Linked Contents"
  ┌──────────────────────────────────────────────────────────────┐
  │ 👤 Eva (outfit/boots)  +2 khác ▾                             │
  │   └── Popover: 👤 Eva (outfit/boots)                         │
  │                👤 Mia (outfit/boots)                         │
  │                🛡️ NPC_Guard (clothing/feet)                  │
  └──────────────────────────────────────────────────────────────┘
```

---

## 3. Lộ Trình Triển Khai Chi Tiết (Phased Execution)

### Phase 1: Backend DTOs, Content API Extension & Query Filtering
1. **Mở rộng `IContentApi` & `ContentApiService`**:
   - Bổ sung phương thức `GetAllLinkedResourceIdsInProjectAsync(Guid projectId, CancellationToken ct = default)`: Lấy nhanh danh sách tất cả `TargetId` loại `Resource` trong project (phục vụ lọc Unassigned).
2. **Nâng cấp DTO trong `Automation.Repository.Shared.Dtos`**:
   - Định nghĩa DTO con:
     ```csharp
     public record ResourceLinkedAnchorDto(
         Guid ContentItemId,
         string ContentItemName,
         string? ContentTypeName,
         string? ContentTypeColor,
         string? ContentTypeIcon,
         string AnchorPath
     );
     ```
   - Bổ sung `IReadOnlyList<ResourceLinkedAnchorDto>? LinkedAnchors = null` vào `WorkspaceResourceDto` (vẫn giữ các trường cũ từ `links.FirstOrDefault()` để bảo đảm tương thích ngược 100%).
3. **Cập nhật Query & Handler trong `GetRepositoryResources.cs`**:
   - Thêm query parameters: `Guid? ContentId = null`, `bool? IsLinked = null`.
   - Xử lý lọc:
     - Nếu có `ContentId`: Lọc `r.Id` nằm trong danh sách resource của Content đó.
     - Nếu `IsLinked == false`: Lọc `r.Id` KHÔNG nằm trong danh sách linked resources (tìm file Unassigned).
     - Nếu `IsLinked == true`: Lọc `r.Id` CÓ nằm trong danh sách linked resources.
   - Enriched Data: Map toàn bộ `links` của từng resource thành `LinkedAnchors`.
4. **Kiểm thử tự động**: Viết Unit Tests kiểm tra tính chính xác của bộ lọc và mapping mảng `LinkedAnchors`.

---

### Phase 2: Frontend Table Unification & Multi-Content Popover
1. **Tạo Component `LinkedContentsCell.tsx`**:
   - **Trường hợp 0 link (`Unassigned`)**: Nút mờ `[ + Assign ]` mở nhanh drawer gán Content.
   - **Trường hợp 1 link**: Badge hiển thị `ContentTypeIcon`, màu sắc `ContentTypeColor`, `ContentItemName` và tag nhỏ `AnchorPath`.
   - **Trường hợp $\ge 2$ links**: Hiển thị Badge chính + Interactive Badge `+X khác ▾`. Khi click, mở Popover liệt kê toàn bộ danh sách Content & Anchor Path kèm nút Unlink cho từng link cụ thể.
2. **Tái cấu trúc bảng [`useRepositoryResourceTable.tsx`](file:///d:/FullStack/Automation/web/src/features/repositories/hooks/useRepositoryResourceTable.tsx)**:
   - Loại bỏ cột `contentTypeName`.
   - Thay thế cột `contentName` bằng cột hợp nhất **`Linked Contents`** sử dụng `LinkedContentsCell`.
   - Tiết kiệm bề ngang, giúp bảng thoáng đãng và hiển thị nhiều thông tin kỹ thuật hơn.

---

### Phase 3: Frontend Assignment Filter (Tối Ưu Trải Nghiệm Tìm Kiếm)
1. **Bổ sung Filter Pills / Dropdown trên Toolbar Resource Table**:
   - Bộ lọc trạng thái gán: `All` | `Assigned` | `Unassigned`.
   - Khi chọn `Unassigned`: Bảng lập tức chỉ hiển thị các file vừa đồng bộ từ ổ cứng lên mà chưa được đưa vào Content Anchor Tree, giúp Technical Artist dễ dàng chọn hàng loạt và bấm gán!
2. **Xác thực toàn diện**:
   - Kiểm tra `pnpm --filter web typecheck` và `cd web && pnpm build`.
   - Kiểm tra tương thích ngược khi mở chi tiết Resource.

---

## 4. Kế Hoạch Đảm Bảo An Toàn & Tương Thích Ngược (Safety & Rollback)
- **Database**: Bảng `ResourceItems` vốn đã không còn chứa `ContentId` nên **không cần chạy migration DB**.
- **API Contracts**: Các trường `ContentId`, `ContentName`, `ContentTypeName`, `AnchorPath` cũ trên `WorkspaceResourceDto` vẫn được giữ nguyên và tự động gán từ link đầu tiên, đảm bảo bất kỳ mã nguồn nào đang dùng trường cũ đều không bị ảnh hưởng.

