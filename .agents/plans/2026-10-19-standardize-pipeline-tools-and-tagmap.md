# Kế Hoạch Kỹ Thuật: Chuẩn Hóa Server Pipeline Tools, Tái Cấu Trúc TagMap Batch-First & Thanh Lọc Node Library

- **Ngày tạo:** 19/10/2026
- **Trạng thái:** Sẵn sàng thực hiện (Ready for Execution)
- **Mức độ ưu tiên:** Cao (High - Trực tiếp nâng cấp trải nghiệm E2E Pipeline & Batch-First)
- **Tài liệu liên quan:** 
  - [Pipeline Engine Playbook](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-engine.md)
  - [Script Node Guidelines](file:///d:/FullStack/Automation/docs/pipelines/SCRIPT_NODE_GUIDELINES.md)
  - [Trial User Readiness Backlog](file:///d:/FullStack/Automation/.agents/plans/2026-10-17-trial-user-readiness-backlog.md)

---

## 1. Bối Cảnh & Dữ Liệu Thực Nghiệm (Data-Driven Discovery)

Ngày 18/10/2026, thông qua script quét trực tiếp database PostgreSQL (`Forgity`) trên toàn bộ **18 Pipelines đang hoạt động** ([scripts/scan_pipeline_nodes.py](file:///d:/FullStack/Automation/scripts/scan_pipeline_nodes.py)), hệ thống ghi nhận số liệu thực tế:

```
- Tổng số Server Built-in Tools  : 35 tools
  + Đang được sử dụng thực tế    : 12 tools (34%)
  + Hoàn toàn KHÔNG DÙNG (0 use) : 23 tools (66%)
- Tổng số Custom Python Scripts  : 17 scripts
  + Đang được sử dụng thực tế    : 11 scripts
  + Không gắn vào pipeline nào   : 6 scripts
```

### Các vấn đề cốt lõi cần giải quyết:
1. **`BuildTagMapFromResource` đang bị lệch chuẩn Batch-First:**
   - **Key của Map là `assetName`:** Dòng 241 `objectsMap[assetName] = assetObj;` lấy tên hiển thị hoặc tên file không có extension (ví dụ `"Eva"`). Gây nguy cơ trùng lặp (collision) nếu repo có nhiều file cùng tên ở các thư mục khác nhau. Technical Artist (TA) trong Python script lại phải bóc `item["relative_path"]` ra để ráp path.
   - **Đầu vào ép nhận Resource GUIDs:** Input pin `Target` chỉ nhận `List<Guid>` của `Resource`. Nhưng trên Canvas thực tế, khi Repository Trigger chạy hoặc user chọn batch, dữ liệu đầu vào có sẵn là **`RepositoryId`** và **`List<RelativePath>`**. Ép nhận Resource GUIDs khiến đồ thị phải dùng thêm node trung gian không cần thiết.
   - **Tag cấp Resource không có đất diễn:** `ResourceTags` (nhãn chung cấp file) thực tế không phát huy tác dụng so với việc phân loại qua thư mục hoặc Subpath Tags (vật liệu, slot, texture).
2. **"Spaghetti Node Hell" do lạm dụng tool vụn vặt (Over-granularity):**
   - Có tới **10 tool Map lắt vặt** (`ZipToMap`, `RemapKeys`, `SetMapItem`, `GetMapItem`, `GetMapKeys`, `GetMapValues`, `MergeMaps`, `MakeMap`, `GetArrayItem`, `GetCollectionCount`) **hoàn toàn có 0 lượt sử dụng** trong 18 pipeline!
   - Người dùng chỉ dùng duy nhất `MakeArray` để gom mảng. Mọi phép biến đổi Map sâu thực tế đều được viết trong Python Script Node với 1 dòng code thay vì nối 5-6 node rối rắm.
3. **Cạm bẫy vòng lặp `ForEachLoopTool`:**
   - `ForEachLoopTool` thực chất chỉ trả về mock dummy (`Item = ""`, `Index = 0`), chưa hề có engine vòng lặp trong DAG.
   - Quan trọng hơn: Trong mô hình **Batch-First**, vòng lặp phải chạy bên trong Subprocess Python của Runner (chỉ tốn vài ms), tuyệt đối không để vòng lặp ở Canvas vì sẽ khởi động Blender/Unreal 50 lần gây treo máy.

### Danh mục 23 Server Tools bỏ hoang (0 usages trong DB) khảo sát từ `scan_pipeline_nodes.py`:
- **Nhóm Map/Collection vụn vặt (10 tools):** `MakeMapTool`, `GetMapItemTool`, `SetMapItemTool`, `GetMapKeysTool`, `GetMapValuesTool`, `MergeMapsTool`, `ZipToMapTool`, `RemapKeysTool`, `GetArrayItemTool`, `GetCollectionCountTool`.
- **Nhóm Flow Control ảo/chưa khả thi (4 tools):** `ForEachLoopTool`, `BranchTool`, `SwitchTool`, `SelectTool`.
- **Nhóm Array Query dư thừa (4 tools):** `FilterArrayTool`, `SortArrayTool`, `SliceArrayTool`, `AggregateTool`.
- **Nhóm State/Variable không dùng (2 tools):** `GetVariableTool`, `SetVariableTool`.
- **Nhóm Tag dư thừa (3 tools):** `AssignTagTool`, `InspectModelTool` (đã thay bằng dynamic worker inspection), `GetTagValueFromInspectionTool` (đã merge vào `GetTagValueFromResourceTool`).


---

## 2. Mục Tiêu Kỹ Thuật (Objectives)

1. **Chuẩn hóa `BuildTagMapFromResourceTool`:**
   - Key của `ObjectsMap` đổi thành **`RelativePath`** (chuẩn hóa POSIX `/`, ví dụ `"Characters/Eva/Eva.fbx"`).
   - Mở rộng Input nhận linh hoạt: **`Repository`** (EntityRef/GUID) + **`RelativePaths`** (Array<string>), tự động fallback nếu truyền `Resources`.
   - Tối giản hóa dữ liệu bên trong từng asset item: `{ relative_path, tag_map, path_map, resource_id }`.
2. **Đồng bộ Frontend & Nâng cấp trải nghiệm cho Technical Artist:**
   - Cập nhật `simulateTagMap.ts` để đồng bộ đúng định dạng mới.
   - Thêm nút/tab **"Python Snippet"** ngay trong modal `TagMapPreviewDialog` để TA xem sẵn 3 dòng code mẫu Python đọc map.
3. **Thanh lọc Server Built-in Tools (Dọn sạch 23 Zombie Tools):**
   - Ẩn hoặc loại bỏ các tool 0-usage gây nhiễu (`ForEach`, 10 tools Map lắt vặt).
   - Viết đầy đủ `Description` kỹ thuật rõ ràng cho 12+ Server Tools cốt lõi còn lại.
4. **Kiểm thử E2E:** Đảm bảo toàn bộ 18 active pipelines (đặc biệt là *Fbx Body to Unreal*, *Daz Body To Blender*, *Inspect Daz*) tiếp tục hoạt động trơn tru.

---

## 3. Kế Hoạch Triển Khai Chi Tiết (Phase Breakdown)

### Phase 1: Tái cấu trúc & Chuẩn hóa `BuildTagMapFromResourceTool` (Backend)
- [ ] **1.1. Cập nhật Input Pins của `BuildTagMapFromResourceInputs`:**
  - Thêm `RepositoryId` / `Repository` (EntityRef hoặc GUID).
  - Thêm `RelativePaths` (Array<string>, tùy chọn: nếu có thì filter đúng các path này, nếu không thì lấy toàn bộ active resources trong Repo).
  - Giữ `Target` (Resource Array) làm fallback để tương thích ngược 100% với các pipeline cũ.
- [ ] **1.2. Chuẩn hóa Output Pin `ObjectsMap`:**
  - Chuyển `objectsMap[key]` sang dùng POSIX `RelativePath` (ví dụ: `Characters/Eva/Eva.fbx`).
  - Lược bỏ các trường thừa không dùng, tinh gọn payload JSON gửi qua gRPC/RabbitMQ sang Runner.
- [ ] **1.3. Cập nhật Unit/Integration Tests:**
  - Viết/cập nhật test case kiểm tra việc build tag map bằng cả `Repository + RelativePaths` lẫn `Resource GUIDs`.

### Phase 2: Đồng bộ Frontend & Bổ sung "Python Snippet" cho Technical Artist
- [ ] **2.1. Cập nhật `simulateTagMap.ts`:**
  - Sửa `objects_map` để key là `relative_path` thay vì `assetName`.
- [ ] **2.2. Thêm "Python Snippet" vào `TagMapPreviewDialog.tsx`:**
  - Bổ sung toggle hoặc button `Python Snippet` bên cạnh `Visual Mapping` và `Raw JSON`.
  - Hiển thị đoạn code Python mẫu sẵn sàng copy:
    ```python
    # Example: How to read ObjectsMap in your Python/Blender/Unreal Node
    for rel_path, data in inputs["ObjectsMap"].items():
        tag_map = data.get("tag_map", {})
        diffuse_path = tag_map.get("Diffuse")
        print(f"Processing {rel_path} -> Diffuse: {diffuse_path}")
    ```
- [ ] **2.3. Tooltip chân Pin trên Canvas:**
  - Cập nhật tooltip của chân pin `ObjectsMap` để người dùng rê chuột là hiểu ngay định dạng map.

### Phase 3: Thanh lọc Server Tools & Viết Description Chuẩn Hóa
- [ ] **3.1. Phân loại và ẩn bớt Zombie Tools:**
  - Gỡ bỏ `ForEachLoopTool` khỏi danh sách Server Tools (tránh người dùng hiểu nhầm canvas có loop).
  - Ẩn hoặc gom bớt 10 tool Map lắt vặt (`ZipToMap`, `RemapKeys`, `SetMapItem`...).
  - Giữ lại các tool thực sự cần: `FormatString`, `GetRepositoryInfo`, `UpdateResourceMetadata`, `MakeArray`, `GetRelativePath`, `BreakStruct`, `BuildTagMapFromResource`, `GetTagValueFromResource`, `GetResourceRelativePaths`, `AssignResourcesToContent`, `SyncLocalChangeToRepository`, `LookupContentMap`.
- [ ] **3.2. Bổ sung `Description` hoàn chỉnh cho tất cả Server Tools còn lại:**
  - Cập nhật thuộc tính `public override string? Description => "..."` cho từng class tool trong `api/.../Tools/`.
  - Giúp bảng Node Library tab "Server Built-in Tools" hiển thị cột Description rõ ràng, chuyên nghiệp.

### Phase 4: Kiểm Thử E2E & Nghiệm Thu
- [ ] **4.1. Chạy lại script `scan_pipeline_nodes.py`:**
  - Đảm bảo không có pipeline nào bị lỗi reference gãy node.
- [ ] **4.2. Chạy thử nghiệm Pipeline E2E:**
  - Chạy thử Pipeline *Fbx Body to Unreal* hoặc *Inspect Daz* với `BuildTagMap` đã chuẩn hóa.
- [ ] **4.3. Typecheck & Build:**
  - `dotnet build api/Automation.sln` đạt 0 lỗi.
  - `pnpm tsc --noEmit` phía Frontend đạt 0 lỗi.

---

## 4. Master Index Checklist
Sau khi hoàn thành kế hoạch này, cần cập nhật:
- Master Index tại [AGENTS.md](file:///d:/FullStack/Automation/.agents/AGENTS.md).
- Cập nhật tài liệu [PIPELINE_PIN_SYSTEM.md](file:///d:/FullStack/Automation/docs/backend/PIPELINE_PIN_SYSTEM.md).
