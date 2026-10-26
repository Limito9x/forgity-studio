# Kế hoạch Kỹ Thuật Chi Tiết: Refactor Luồng Archive / Soft Delete cho Pipeline

- **Ngày tạo**: 2026-10-08
- **Trạng thái**: Đã sẵn sàng thực thi (Ready for Implementation)
- **Phạm vi**: Backend (`Modules/Pipeline`), Database EF Core Migration, và Frontend (`web/src/features/pipelines`)

---

## 1. Bối cảnh & Nguyên Nhân Cần Refactor

### 1.1. Rủi ro của luồng Xóa Hiện Tại ([DeletePipeline.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/DeletePipeline.cs))
- **Hard Delete thô bạo Node & Edge**:
  ```csharp
  var nodes = await db.PipelineNodes.Where(x => x.PipelineId == command.Id).ToListAsync(ct);
  db.PipelineNodes.RemoveRange(nodes);

  var edges = await db.PipelineEdges.Where(x => x.PipelineId == command.Id).ToListAsync(ct);
  db.PipelineEdges.RemoveRange(edges);

  db.Pipelines.Remove(pipeline);
  ```
- **Cascade Delete toàn bộ Execution History**:
  Cấu hình `OnDelete(DeleteBehavior.Cascade)` trong `PipelineExecutionConfiguration.cs` khiến mọi lịch sử chạy (audit logs, telemetry, trạng thái output) bị xóa sạch khi xóa pipeline.
- **Mất liên kết Asset Links**: Việc xóa `PipelineNodes` kích hoạt `EntityDeletedInterceptor`, xóa sạch các liên kết file tham chiếu gắn trên node.

### 1.2. Giải pháp: Lớp Archive / Soft Delete + Partial Unique Index
- Chuyển thao tác xóa mặc định thành **Archive / Soft Delete** (`DeletedAt = UtcNow`).
- **Giữ nguyên 100% Nodes, Edges, Asset Links và Executions trong Database**.
- Áp dụng **PostgreSQL Partial Unique Index**: Chỉ bắt buộc duy nhất tên đối với các pipeline đang Active (`WHERE "DeletedAt" IS NULL`). Pipeline cũ bị xóa sẽ không chặn người dùng tạo pipeline mới cùng tên.

---

## 2. Thiết Kế Kiến Trúc & Xử Lý Edge Cases

### 2.1. Ma Trận Xử Lý Vòng Đời Pipeline (Lifecycle Matrix)

| Trạng thái / Hành động | Hành vi Hệ thống | Dữ liệu Nodes & Edges | Dữ liệu Executions |
| :--- | :--- | :--- | :--- |
| **Archive (Xóa mềm)** | Đặt `DeletedAt = UtcNow`. Ẩn khỏi màn hình Active & Canvas. | **Bảo tồn nguyên vẹn 100%** | **Bảo tồn nguyên vẹn 100%** |
| **Restore (Khôi phục)** | Đặt `DeletedAt = null`. Đưa về màn hình Active. | Sẵn sàng mở trên Canvas ngay | Liên kết lại như bình thường |
| **Purge (Xóa vĩnh viễn)** | Chỉ thực hiện từ thùng rác Trash. Hard delete toàn bộ. | Xóa sạch & unbind AssetLinks | Giữ nguyên (hoặc xóa sạch nếu chọn) |

### 2.2. Xử Lý Các Tình Huống Biên (Edge Cases)

1. **Edge Case 1: Pipeline đang được gọi làm SubPipeline trong Pipeline Active khác**:
   - *Kiểm tra*: Trước khi Archive, kiểm tra `db.PipelineNodes.AnyAsync(n => n.Kind == PipelineNodeKind.SubPipeline && n.RefId == pipeline.Id.ToString())`.
   - *Xử lý*: Trả về lỗi: *"Cannot archive pipeline '{Name}' because it is currently used as a SubPipeline in active pipeline(s). Please remove those nodes first."*
2. **Edge Case 2: Pipeline đang có Lượt chạy Đang Thực Thi (Running / Pending)**:
   - *Kiểm tra*: `db.PipelineExecutions.AnyAsync(e => e.PipelineId == id && (e.Status == Running || e.Status == Pending))`.
   - *Xử lý*: Trả về lỗi: *"Cannot archive pipeline '{Name}' while it has active executions. Please wait or cancel them first."*
3. **Edge Case 3: Xung đột Tên khi Khôi Phục (Restore Name Conflict)**:
   - *Tình huống*: Pipeline `Render-Pass` bị xóa hôm qua. Hôm nay ai đó đã tạo mới 1 pipeline `Render-Pass` khác.
   - *Xử lý*: Khi bấm Restore, hệ thống kiểm tra nếu tên bị trùng trong đống Active, tự động đổi tên thành `Render-Pass (Restored)` (nếu vẫn trùng thì thêm `(Restored 2)`), đảm bảo không vi phạm Partial Unique Index.
4. **Edge Case 4: Canvas Autosave khi Pipeline đã bị Archive**:
   - Khi pipeline đã bị Archive, lệnh `SavePipelineGraph` sẽ không tìm thấy pipeline (do Global Query Filter `DeletedAt == null`), tự động trả về 404, ngăn chặn việc vẽ đè lên pipeline trong thùng rác.

---

## 3. Kế Hoạch Triển Khai Từng Bước (Step-by-Step Implementation)

### Bước 1: Cập Nhật Entity & Interface Backend (`api/`)
- **File**: `api/src/Modules/Pipeline/Automation.Pipeline/Domain/Entities/Pipeline.cs`
  - Thêm kế thừa `ISoftDelete`:
    ```csharp
    public class Pipeline : AuditableEntity, ISoftDelete
    {
        public bool IsDeleted => DeletedAt.HasValue;
        public DateTimeOffset? DeletedAt { get; set; }
        public string? DeletedBy { get; set; }
        
        public void Archive(string? user = null)
        {
            DeletedAt = DateTimeOffset.UtcNow;
            DeletedBy = user;
            UpdatedAt = DateTimeOffset.UtcNow;
        }

        public void Restore(string? newName = null)
        {
            if (!string.IsNullOrWhiteSpace(newName))
            {
                Name = newName.Trim();
            }
            DeletedAt = null;
            DeletedBy = null;
            UpdatedAt = DateTimeOffset.UtcNow;
        }
    }
    ```

### Bước 2: Cấu Hình EF Core & Tạo Migration
- **File**: `api/src/Modules/Pipeline/Automation.Pipeline/Infrastructure/Persistence/Configurations/PipelineConfiguration.cs`
  - Cập nhật Partial Unique Index:
    ```csharp
    builder.HasIndex(x => new { x.ProjectId, x.Name })
        .IsUnique()
        .HasFilter("\"DeletedAt\" IS NULL");
    ```
- **File**: `api/src/Modules/Pipeline/Automation.Pipeline/Infrastructure/Persistence/Configurations/PipelineExecutionConfiguration.cs`
  - Đổi cascade nguy hiểm sang an toàn:
    ```csharp
    builder
        .HasOne(x => x.Pipeline)
        .WithMany()
        .HasForeignKey(x => x.PipelineId)
        .OnDelete(DeleteBehavior.Restrict);
    ```
- **Chạy lệnh Migration**:
  - `.\cli migration add AddPipelineSoftDeleteAndPartialIndex -m Pipeline`
  - `.\cli migration apply -m Pipeline`

### Bước 3: Refactor & Bổ Sung Các Slice Tính Năng
1. **Refactor `DeletePipeline.cs` thành Luồng Archive**:
   - Bỏ toàn bộ lệnh xóa Nodes và Edges.
   - Kiểm tra ràng buộc SubPipeline & Active Executions.
   - Gọi `pipeline.Archive()`. Lưu DB và trả về kết quả thành công.
2. **Tạo Slice Mới `RestorePipeline.cs`**:
   - Request: `POST /api/pipelines/{id}/restore`.
   - Query: Dùng `.IgnoreQueryFilters()` để lấy pipeline trong thùng rác.
   - Xử lý xung đột tên tự động: Thêm hậu tố ` - Restored` nếu cần.
   - Gọi `pipeline.Restore()`. Lưu DB.
3. **Tạo Slice Mới `PurgePipeline.cs`**:
   - Request: `DELETE /api/pipelines/{id}/purge`.
   - Query: Chỉ cho phép xóa nếu `DeletedAt != null`.
   - Xóa cứng: Nodes, Edges, và Pipeline.
4. **Cập nhật `GetPipelines.cs`**:
   - Query request thêm: `public bool IsArchived { get; set; } = false;`
   - Nếu `IsArchived == true`: Query dùng `.IgnoreQueryFilters().Where(x => x.DeletedAt != null)`.

### Bước 4: Tái Cấu Trúc Frontend (`web/`)
1. **API Hooks (`usePipelines.ts`)**:
   - Cập nhật `usePipelines(projectId, isArchived)` hỗ trợ tham số `isArchived`.
   - Thêm hook `useArchivePipelineMutation` (thay thế delete cũ).
   - Thêm hook `useRestorePipelineMutation`.
   - Thêm hook `usePurgePipelineMutation`.
2. **Giao Diện Danh Sách (`PipelineListPage.tsx`)**:
   - Thêm Tab Filter trên Header:
     - Tab **Active** (hiển thị số lượng pipeline đang hoạt động).
     - Tab **Trash / Archived** (hiển thị số lượng pipeline đã lưu trữ).
   - Khi ở Tab **Active**:
     - Nút xóa đổi thành: **Archive Pipeline** kèm dialog giải thích rõ: *"Pipeline will be moved to Trash. Its canvas graph, nodes, edges, and execution history are preserved intact."*
   - Khi ở Tab **Trash**:
     - Thẻ card hiển thị nhãn `Archived on {Date}`.
     - Cung cấp nút **Restore** (icon `RotateCcw`) để khôi phục về Active.
     - Cung cấp nút **Delete Permanently** (icon `Trash2`, màu đỏ) để purge vĩnh viễn với confirm dialog cảnh báo nguy hiểm.

---

## 4. Danh Sách Tệp Can Thiệp (File Manifest)

| Tệp | Hành Động | Trách Nhiệm |
| :--- | :--- | :--- |
| `api/.../Domain/Entities/Pipeline.cs` | **Modify** | Kế thừa `ISoftDelete`, thêm `Archive()`, `Restore()`. |
| `api/.../Configurations/PipelineConfiguration.cs` | **Modify** | Cấu hình Partial Unique Index `\"DeletedAt\" IS NULL`. |
| `api/.../Configurations/PipelineExecutionConfiguration.cs` | **Modify** | Chuyển `OnDelete` sang `Restrict`. |
| `api/.../Features/Pipelines/DeletePipeline.cs` | **Refactor** | Luồng Archive an toàn, không xóa Node/Edge. |
| `api/.../Features/Pipelines/RestorePipeline.cs` | **Create** | Endpoint khôi phục pipeline từ thùng rác. |
| `api/.../Features/Pipelines/PurgePipeline.cs` | **Create** | Endpoint xóa vĩnh viễn pipeline khỏi thùng rác. |
| `api/.../Features/Pipelines/GetPipelines.cs` | **Modify** | Hỗ trợ lọc danh sách theo `IsArchived`. |
| `web/.../hooks/usePipelines.ts` | **Modify** | Thêm mutations `Restore`, `Purge`, cập nhật query `isArchived`. |
| `web/.../pages/PipelineListPage.tsx` | **Modify** | Bổ sung Tab Active / Trash, nút Restore & Permanent Delete. |

---

## 5. Kịch Bản Kiểm Thử & Nghiệm Thu (Acceptance Criteria)

- [ ] **Bảo toàn Node & Edge khi Xóa mềm**:
  - Tạo 1 pipeline có 5 Nodes, 4 Edges và 2 file đính kèm.
  - Bấm Archive pipeline.
  - Kiểm tra DB: Bảng `Pipelines` có `DeletedAt != null`, nhưng 5 dòng `PipelineNodes` và 4 dòng `PipelineEdges` vẫn còn nguyên 100%.
- [ ] **Partial Unique Index**:
  - Pipeline cũ `Bake-Mesh` bị xóa (`DeletedAt != null`).
  - Tạo pipeline mới cũng tên `Bake-Mesh` trong cùng Project -> **Thành công 100%**.
  - Tạo thêm 1 pipeline nữa tên `Bake-Mesh` -> **Báo lỗi trùng tên chính xác**.
- [ ] **Khôi phục (Restore)**:
  - Bấm Restore pipeline cũ từ Trash -> Trở lại danh sách Active, mở Canvas ra thấy toàn bộ đồ thị nguyên vẹn.
- [ ] **Bảo vệ Lịch sử Chạy**:
  - Pipeline có lịch sử chạy -> Archive pipeline -> Lịch sử chạy vẫn được bảo tồn và đọc bình thường.
- [x] **Biên dịch**:
  - Backend: `dotnet build Automation.sln` sạch sẽ (0 lỗi).
  - Frontend: `pnpm tsc -b` 0 lỗi.
