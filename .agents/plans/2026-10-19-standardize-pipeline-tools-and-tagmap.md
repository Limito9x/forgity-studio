# Kế Hoạch Kỹ Thuật: Chuẩn Hóa Server Pipeline Tools, Tái Cấu Trúc TagMap Batch-First, Thanh Lọc Node Library & Định Hướng AI Script Node

- **Ngày tạo:** 19/10/2026
- **Trạng thái:** Sẵn sàng thực hiện (Ready for Execution)
- **Mức độ ưu tiên:** Cao (High - Trực tiếp nâng cấp trải nghiệm E2E Pipeline & Batch-First)
- **Tài liệu liên quan:** 
  - [Pipeline Engine Playbook](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-engine.md)
  - [Script Node Guidelines](file:///d:/FullStack/Automation/docs/pipelines/SCRIPT_NODE_GUIDELINES.md)
  - [Trial User Readiness Backlog](file:///d:/FullStack/Automation/.agents/plans/2026-10-17-trial-user-readiness-backlog.md)

---

## 1. Bối Cảnh & Dữ Liệu Thực Nghiệm (Data-Driven Discovery)

Ngày 18/10/2026, thông qua script quét trực tiếp database PostgreSQL (`Forgity`) trên toàn bộ **18 Pipelines đang hoạt động** ([scripts/scratch/scan_pipeline_nodes.py](file:///d:/FullStack/Automation/scripts/scratch/scan_pipeline_nodes.py)), hệ thống ghi nhận số liệu thực tế:

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
   - **Trường `id` (GUID) trong Tag Map hoàn toàn vô dụng:** Cấu trúc `{ "id": "01a10ae8-...", "name": "Skin", "path": "Materials.Skin" }` mang theo database GUID vô nghĩa đối với các engine 3D (Unreal/Blender), gây phình to payload JSON và làm rối log Python.
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
   - Mở rộng Input nhận linh hoạt: **`Repository`** (EntityRef/GUID) + **`RelativePaths`** (Array<string>), tự động fallback nếu truyền `Target` (Resource GUIDs).
   - **Tinh giản triệt để Tag Data:** Loại bỏ vĩnh viễn trường `id` (GUID) trong mảng `tags`, chỉ giữ danh sách chuỗi Tag Name / Tag Path gọn nhẹ (`tags: ["Eyelash_Normal"]`).
2. **Thanh lọc Server Built-in Tools & Mô Tả Kỹ Thuật:**
   - Loại bỏ hoặc ẩn 23 zombie tools khỏi Node Library và Canvas Context Menu.
   - Bổ sung property `Description` vào `NodePaletteItemDto` và khai báo mô tả kỹ thuật chuẩn chỉnh cho 12 Server Tools cốt lõi còn lại.
3. **Đồng bộ Frontend & Hỗ trợ Secret Pin:**
   - Cập nhật `simulateTagMap.ts` sang key `relative_path` và tag strings sạch sẽ.
   - Hỗ trợ loại chân pin mật khẩu/khóa (`{"type": "password"}` hoặc `{"isSecret": true}`) để che giấu API keys/credentials trên Canvas.
4. **Kiểm thử E2E:** Đảm bảo toàn bộ 18 active pipelines (đặc biệt là *Fbx Body to Unreal*, *Daz Body To Blender*, *Inspect Daz*) tiếp tục hoạt động trơn tru.
5. **Định hướng AI-First (Next Step):** Thay vì xây dựng abstraction C# cồng kềnh, triển khai Node AI bằng Custom Python Script Node chuyên biệt (`ai_material_mapper.py` dùng Gemini Flash / Local Ollama), đưa thẳng raw metadata thành Unreal Material Manifest không cần qua bước gắn tag thủ công.

---

## 3. Kế Hoạch Triển Khai Chi Tiết (3-Phase Layer Breakdown)

### Phase 1: Toàn diện C# Backend Layer (TagMap + Dọn Tools + Description)
- [x] **1.1. Chuẩn hóa `BuildTagMapFromResourceTool.cs`:**
  - Input Pins: Bổ sung `Repository` (EntityRef/GUID) và `RelativePaths` (mảng string). Giữ `Target` (Resource GUIDs) làm fallback tương thích ngược.
  - Xử lý Batch: Nếu có `Repository` + `RelativePaths`, gọi `workspaceApi.ResolveResourceVersionIdsByPathsAsync` để lấy `resourceVersionIds`.
  - Output Key: Đổi key `objectsMap[key]` sang POSIX `item.RelativePath.Replace('\\', '/')`.
  - Tinh giản Tags: Trong `assetPathMap[path]["tags"]`, loại bỏ `id` GUID, chỉ lưu mảng chuỗi `[tag.TagName]` hoặc `[tag.TagPath]`.
- [x] **1.2. Thanh lọc 23 Zombie Tools:**
  - Gỡ bỏ `ForEachLoopTool` khỏi `Tools/Utility/` (hoặc đánh dấu ẩn khỏi Palette).
  - Loại bỏ / ẩn 10 tools Map lắt vặt và các tools không dùng khỏi danh sách trả về của [GetNodePalette.cs](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Nodes/GetNodePalette.cs).
- [x] **1.3. Bổ sung `Description` cho Built-in Tools:**
  - Bổ sung property `string? Description = null` vào `NodePaletteItemDto`.
  - Viết thuộc tính `public override string? Description => "..."` kỹ thuật, rõ ràng cho 12 Server Tools cốt lõi: `FormatString`, `GetRepositoryInfo`, `UpdateResourceMetadata`, `MakeArray`, `GetRelativePath`, `BreakStruct`, `BuildTagMapFromResource`, `GetTagValueFromResource`, `GetResourceRelativePaths`, `AssignResourcesToContent`, `SyncLocalChangeToRepository`, `LookupContentMap`.
- [x] **1.4. Build & Verify Backend:**
  - Chạy `dotnet build api/Automation.sln` đạt 0 lỗi compile.
  - Dựng bộ 3 test cases chuyên biệt trong [BuildTagMapFromResourceToolTests.cs](file:///d:/FullStack/Automation/api/tests/Automation.Pipeline.Tests/BuildTagMapFromResourceToolTests.cs) (Batch-First, POSIX key, Clean tags, Backward compatibility) đạt 100% Passed.

### Phase 2: Toàn diện Frontend & UX Layer (Simulate + Node Library + Secret Input)
- [ ] **2.1. Cập nhật `simulateTagMap.ts`:**
  - Đồng bộ key theo `relative_path` và mảng tags dạng chuỗi sạch sẽ.
- [ ] **2.2. Kiểm tra hiển thị `NodeLibraryTable` & `ContextMenuPalette`:**
  - Kiểm tra bảng Node Library tab "Built-in Core Tools" hiển thị đầy đủ cột `Description`.
  - Danh sách node trên Palette Canvas tự động biến mất 23 zombie tools, trở nên gọn gàng, chuyên nghiệp.
- [ ] **2.3. Hỗ trợ Secret Pin trên Canvas Inspector:**
  - Khi một Input Pin có metadata `{"type": "password"}` hoặc `{"isSecret": true}` (ví dụ API key), hiển thị Input dạng masked password có icon toggle ẩn/hiện mắt.
- [ ] **2.4. Build & Verify Frontend:**
  - Chạy `pnpm tsc --noEmit` đạt 0 lỗi typecheck.

### Phase 3: Kiểm Thử E2E, Verify Pipelines & Nghiệm Thu
- [ ] **3.1. Quét lại Database bằng script:**
  - Chạy lại [scripts/scratch/scan_pipeline_nodes.py](file:///d:/FullStack/Automation/scripts/scratch/scan_pipeline_nodes.py) verify không còn node mồ côi nào bị gãy tham chiếu.
- [ ] **3.2. Test chạy thử nghiệm Pipeline thực tế:**
  - Chạy thử Pipeline *Fbx Body to Unreal* hoặc *Inspect Daz* để kiểm chứng backward compatibility và tốc độ thực thi.
- [ ] **3.3. Cập nhật tài liệu Master Index:**
  - Đăng ký và cập nhật trạng thái trong [.agents/AGENTS.md](file:///d:/FullStack/Automation/.agents/AGENTS.md) và [PIPELINE_PIN_SYSTEM.md](file:///d:/FullStack/Automation/docs/backend/PIPELINE_PIN_SYSTEM.md).

---

## 4. Định Hướng AI-First Script Node (Bước Tiếp Theo Sau Khi Hoàn Thành Plan Này)

Sau khi dọn dẹp sạch sẽ lõi Tooling:
1. **Tạo Custom Python Script Node: `ai_material_mapper.py`:**
   - Nhận đầu vào: `metadata` (raw json từ Inspector) + `material_contracts` (từ `LookupContentMap`).
   - Gọi Gemini 2.0 Flash (hoặc Local Ollama) với Structured Output Pydantic Schema.
   - Nhả thẳng ra `manifest` cho `setup_asset_materials.py` của Unreal 5 mà không cần người dùng gắn bất kỳ Gameplay Tag nào.
2. **Cung cấp 2 lựa chọn cho người dùng:**
   - **Luồng Truyền Thống / Offline:** `BuildTagMap` -> `resolve_material_manifest.py`.
   - **Luồng AI-First (1-Click):** Raw Metadata -> `ai_material_mapper.py` -> Unreal Engine.
