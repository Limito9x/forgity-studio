# Kế Hoạch Chốt Deploy: Batch-First + Gọn Quy Trình DAZ → Blender → Unreal

> Ngày: 2026-10-06 | Trạng thái: Draft - chờ duyệt | Ngôn ngữ: Tiếng Việt
> Mục tiêu: "Hoàn tất" để deploy tìm user thử - tinh gọn script, hết chỗ dở ương, giữ nguyên Engine.
> Phạm vi: `workers/worker/scripts/pipeline/blender/*`, `workers/worker/scripts/pipeline/unreal/*`, `workers/worker/scripts/inspectors/*`, `api/.../Tools/Workspaces/UpdateResourceMetadataTool.cs` + docs wiring. Không đụng Engine core (`ExecPlanner`, `Dispatchers`, `stage_runner.py`, `ue_stage_runner.py`).

---

## 1. Bối Cảnh Hiện Tại (đã soi code 2026-10-06)

Pipeline chuẩn hiện tại:

```
DAZ (.duf) → diffeomorphic_import (Blender Stage) → [decimate?] → batch_export_fbx
  → Inspect (daz_inspector / blender_inspector) → BuildTagMapFromResource → resolve_material_manifest (Python Stage)
  → import_skeletal_mesh (Unreal Stage) → setup_asset_materials → register_appearance_datatable
```

Vấn đề user nêu:

1. Tham số single/batch lẫn lộn, non-tech khó hiểu nhưng vẫn phải batch-first.
2. Gắn tag cấp resource gượng ép. Metadata đã có `name` ánh xạ object name, nên gán luôn `loại` (body / cloth_type: top, short, bra...). Quần áo cần tinh chỉnh nhiều nhất, decimate để sau.
3. Muốn tự động hóa cloth: gán cloth_type ngay trong object name ở metadata DAZ.
4. Update metadata lằn nhằn: hiện `inspect → metadata_map` riêng, `export_fbx → exported_files` riêng, rồi dùng `UpdateResourceMetadataTool` nối tay. Muốn `export_fbx` tự gói metadata vào để đưa thẳng vào update.
5. `save_scene` chưa thông minh: đã save rồi thì save đè, save lần đầu không path thì báo lỗi thay vì rơi vào temp.

Code đã đọc:

- `blender/export_fbx.py:18` - single `main(output_path, target_objects, preset_path)` - OK single, không dở.
- `blender/batch_export_fbx.py:97` - batch `main(export_map: dict, output_dir, preset_path)` nhưng còn parse `str JSON + list "k:v"` ở dòng 122-140 - dở ương, cần xóa.
- `blender/decimate_mesh.py:5` - đã batch `main(target_objects: list, ratio)` - matching 4 tầng exact/normalized/substring/custom-prop - giữ, để sau mới chèn vào cloth.
- `blender/save_scene.py:6` - single `main(output_path: str)` - fallback temp khi path rác (dòng 16-19) - cần đổi thành smart.
- `blender/diffeomorphic_import.py:27` - single `main(input_path, preset_path, armature_name)` - sạch, giữ.
- `inspectors/daz/daz_inspector.py:118` - `main(root_path, relative_paths, input_path, paths, **kwargs)` + `_extract_path_strings` đệ quy - dở nhất, 5 alias path. CHỐT: chỉ `root_path + relative_paths: List[str]`, ra `metadata_map {rel_posix: json}` nối thẳng Tool.
- `inspectors/blender/blender_inspector.py` đã xóa (theo user). Thay bằng 2 file riêng: `inspect_unified_mesh.py:133` (1 combo → 1 FBX) + `inspect_separated_meshes.py:134` (từng mesh → từng FBX, hợp cloth). Cả 2 còn parse legacy `str comma-split + dict.keys()` cần xóa, chỉ nhận `List[str]`.
- `unreal/resolve_material_manifest.py:318` - `main(raw_manifest: dict|str, folder_path, output_path, **kwargs)` - parse file/str/dict + wrap pure path_map - dở, đã có plan riêng `unreal-batch-first-refactor.md`.
- `unreal/import_skeletal_mesh.py` + `setup_asset_materials.py` - đã có plan batch-first riêng, không lặp lại ở đây.
- `Tools/Workspaces/UpdateResourceMetadataTool.cs:12` - đã batch chuẩn `MetadataMap: Map + Repository?: EntityRef` - giữ nguyên, chỉ gọn đầu vào từ worker.

---

## 2. Nguyên Tắc Chung (áp cho mọi script)

Tuân thủ `.agents/rules/workers.md` + `.agents/rules/backend.md` + `.agents/rules/general.md`:

1. **Batch-First, Single là trường hợp riêng của Batch (n=1).** Signature chỉ nhận `Dict` / `List`. Không nhận `Union[str, List, Dict]`. Legacy convert chỉ nằm trong 1 hàm `_normalize_*` ở đầu file + log `[DEPRECATED]` 1 version rồi xóa.
2. **No `**kwargs` ở logic chính.** Signature tường minh để `PythonScriptSchemaParser` sinh pin đúng. Non-tech thấy `Map` khó hiểu thì giải quyết bằng UI (label, description, placeholder, preset ví dụ) chứ không bẻ engine về `Text` single.
3. **Normalize dòng đầu, loop thuần batch ở dưới.** Không `if isinstance` lồng trong loop.
4. **Output batch map + 1 alias single tối thiểu** (`first_*`, `count`) để canvas cũ không gãy.
5. **Fail fast, log rõ.** Thiếu input batch → return empty + warning, không silent về temp.
6. **Không đụng `stage_runner.py`, `ue_stage_runner.py`, contracts RabbitMQ.** Chỉ sửa script pipeline/inspector.

Quy ước đặt tên pin (tiếng Anh, vì UI & Code bắt tiếng Anh):

- Input batch: `export_map: Map<Text, Text>`, `fbx_files: Map<Text, File Path>`, `target_objects: Array<Text>`, `relative_paths: Array<File Path>`, `metadata_map: Map<Text, Text>`.
- Output batch: `export_map`, `manifest`, `exported_files`, `metadata_map`, `first_metadata`, `count`.

---

## 3. P1 — Rà Soát Batch-First Toàn Quy Trình (ưu tiên deploy)

### 3.1 `daz_inspector.py` — CHỐT: 2 tham số, ra Map relative cho Tool

Hiện: `root_path + relative_paths + input_path + paths + **kwargs{root, RootPath, RelativePaths, file_paths, items, resources}` + `_extract_path_strings` đệ quy + double-key `rel_key` và `rel_item` gốc.

Chốt (mạnh tay, friendly với scripter):

```python
def main(root_path: str = "", relative_paths: List[str] = []) -> dict:
    # returns {"metadata_map": {rel_posix: json_str}, "first_metadata": str, "count": int}
```

- Chỉ nhận `root_path: Text` + `relative_paths: Array<File Path>`. Không `input_path`, không `paths`, không `**kwargs`, không `Union[str, List, Dict]`.
- Xóa `_extract_path_strings` đệ quy JSON/resource-object. Nếu cần tương thích 1 version thì 1 helper `_to_rel_list` + log `[DEPRECATED]` rồi xóa.
- `metadata_map` key duy nhất `rel_posix` (`a/b/c.duf`, không leading slash, `/` chuẩn). Xóa branch dòng 215-216 lưu thêm key gốc gây double count.
- `count = len(metadata_map)` thật (hiện đang đếm double khi lưu 2 key).
- Output này nối thẳng `UpdateResourceMetadataTool.MetadataMap` (Map key relative + chọn `Repository` EntityRef ở Tool, worker không cần param Repository).
- Docstring ví dụ batch: `relative_paths=["Characters/Nova/Nova.duf", "Characters/Top/Top.duf"]`.

### 3.2 `blender_inspector.py` đã xóa — tách Unified vs Separated (CHỐT theo user)

File cũ `inspectors/blender/blender_inspector.py` đã xóa. Hiện có 2 file riêng, mỗi file 1 mode rõ ràng:

- `inspect_unified_mesh.py`: toàn bộ mesh là 1 combo → export 1 FBX luôn.
  Hiện: `main(target_objects: List[str] | str, asset_name="", clean_unused=True, textures_dir=None, output_manifest_path="") -> {"manifest": {...}}`.
  Chốt: chỉ nhận `target_objects: List[str]` (Array<Text>, rỗng = toàn scene), bỏ parse `str comma-split` ở dòng 202-205, bỏ `output_manifest_path` (ghi file là việc của Runner/Tool, không phải inspector). Output giữ `{"manifest": {...}, "asset_name": str, "slot_count": int}` — manifest này là đầu vào gợi ý cho `batch_export_fbx` ở mode unified (1 key duy nhất).

- `inspect_separated_meshes.py`: từng mesh riêng → export từng FBX, phù hợp cloth.
  Hiện: `main(target_objects: List[str] | str | Dict, ...) -> {"objects": {...}}` + parse 3 kiểu ở dòng 163-169.
  Chốt mạnh tay: chỉ nhận `target_objects: List[str]` (Array<Text>, rỗng = toàn bộ mesh trong scene). Xóa branch `str` + `dict.keys()`. Output giữ `{"objects": {name: {object_name, slot_count, slots[]}}, "count": int}` (thêm `count` cho đồng style). Key `objects` chính là nguồn sinh `export_map` cho `batch_export_fbx` ở mode separated (mỗi key 1 FBX).

Cả 2 file giữ `clean_unused_material_slots + extract_material_textures` nguyên (điểm mạnh, không gọn quá mà mất). Không thêm param Repository vào inspector — Repository là chọn ở `UpdateResourceMetadataTool` (EntityRef), inspector chỉ làm filesystem/scene.

### 3.3 `batch_export_fbx.py` — CHỐT: nhận inspect + gói sẵn Map cho Tool

Hiện dòng 122-140 parse `str JSON + list "k:v"` → dict. Output hiện chỉ có `export_map/manifest/total_exported/exported_files`, chưa có gì để nối thẳng vào Tool.

Chốt (đúng ý user: tận dụng đầu ra inspect, vừa xuất vừa gói Map):

```python
def main(
    export_map: Dict[str, str],
    output_dir: str = "",
    preset_path: str = "",
    source_metadata_map: Dict[str, str] = {},
) -> dict:
    # returns {
    #   "export_map": {object_target: local_path},
    #   "manifest": {object_target: {object, file_name, local_path, file_size, hash_sha256, matched_meshes, metadata}},
    #   "metadata_update_map": {rel_fbx: metadata_json},  # NEW: nối thẳng UpdateResourceMetadataTool.MetadataMap
    #   "total_exported": int,
    #   "exported_files": [...]
    # }
```

- `export_map` chỉ nhận `Dict[object_name -> fbx_file_name]`. Xóa toàn bộ `if isinstance(export_map, str/list)`. Nếu cần tương thích 1 version thì 1 helper `_normalize_export_map` + log `[DEPRECATED]` rồi xóa.
- `source_metadata_map` chính là `daz_inspector.metadata_map` (`{rel_duf: metadata_json}`). Key relative posix, value là JSON string. Không nhận `str JSON`, không `**kwargs`.
- Matching `object_target -> source metadata`: reuse `normalize_name` + `find_matching_meshes` logic, soi `metadata.objects[].name/label` chứa `object_target` (normalized substring). Tìm thấy thì `manifest[object_target]["metadata"]` = source json + chèn thêm `export:{file_name, matched_meshes}`. Không thấy thì `metadata = json({object, file_name})` + warning, không fail.
- `metadata_update_map` key = `rel_fbx` (file name posix, ví dụ `Eva_top_GND.fbx` hoặc `relative(output_path, output_dir)` nếu có subfolder). Value = metadata json string đã enrich. Map này nối 1 dây duy nhất vào `UpdateResourceMetadataTool.MetadataMap`, chọn `Repository` (EntityRef) ở Tool — worker không cần param Repository, giữ ranh giới Host/Guest.
- Giữ `find_matching_meshes` 4 tầng + `select_mesh_with_armature` nguyên.
- `export_fbx.py` single giữ nguyên cho case lẻ, không thêm metadata để khỏi rối. Docs ghi rõ: lẻ dùng `export_fbx`, batch/cloth dùng `batch_export_fbx`.

### 3.4 `decimate_mesh.py` — giữ, chưa chèn vào cloth

Đã batch `target_objects: list`. Không đổi logic `COLLAPSE + remove SUBSURF` ở Phase deploy. Ghi chú trong docs: cloth pipeline sau sẽ chèn `decimate` sau `diffeomorphic_import`, trước `batch_export_fbx`, với `ratio` preset theo cloth_type (ví dụ Top 0.6, Hair 0.4). Không implement auto-ratio ở plan này.

### 3.5 Non-tech khó hiểu Map thì làm sao?

Không bẻ về Text. Giải pháp UI (web, không thuộc plan worker này nhưng ghi để sau làm):

- Inspector description ví dụ sẵn `{"Genesis8Female_Top": "Eva_top_GND.fbx"}`.
- Nút `Add Row` key-value editor thay vì gõ JSON tay (đã có `FormKeyValue`).
- Preset template pipeline mẫu `DAZ Cloth Batch (2 items)` để user clone.

---

## 4. P2 — Tag Resource vs Metadata `name` + `cloth_type` (quần áo)

### 4.1 Vấn đề

Hiện `resolve_material_manifest.py:112-119` lấy `cloth_type` duy nhất từ `resource_tags` chứa `ClothType.*`. Gắn tag cấp resource cho từng file quần áo gượng ép, mỗi lần thêm đồ mới phải gắn tay trong TagPanel.

Trong khi metadata (cả `daz_inspector` và `blender_inspector`) đã có `objects[].name / label` ánh xạ 1-1 với object trong scene.

### 4.2 Thiết kế: gán loại ngay trong metadata

Mở rộng metadata object với 2 trường mới (optional, không breaking):

```python
# daz_inspector.inspect_single_duf + blender_inspector.extract_object_info
{
  "name": "Genesis8Female_Top",
  "label": "Top",
  "type": "Mesh Asset",
  "cloth_type": "Top",      # NEW: Top | Bottom | Bra | Panty | Hair | Shoes | Body | ...
  "body_part": "torso",     # NEW optional: torso | legs | head | feet | ...
}
```

Quy tắc infer (không đoán bừa, thứ tự ưu tiên):

1. Explicit từ object name: `Top|Bra|Panty|Short|Pants|Skirt|Dress|Hair|Shoes|Body` (case-insensitive substring, chuẩn hóa `normalize_name` như `batch_export_fbx`).
2. Từ DAZ label / material name nếu có.
3. Fallback `""` (không gán `Generic` để tránh nhiễu downstream).

`resolve_material_manifest._resolve_single_object` đổi thứ tự lấy `cloth_type`:

```
metadata.objects[].cloth_type → resource_tags ClothType.* → "" 
```

Và trả thêm ở output object:

```python
{"asset_name": ..., "cloth_type": "Top", "body_part": "torso", ...}
```

`body` có thể không cần thiết (như user nói) → để `cloth_type="Body"` cho figure chính, downstream bỏ qua khi bind material nếu muốn.

### 4.3 Tự động hóa cloth bằng object name (hướng tối ưu)

User đề xuất: gán cloth_type lên object name ngay tại metadata DAZ file. Đồng ý, triển khai theo convention:

- Trong Daz Studio đặt tên node: `Top_GND`, `Panty_GND`, `Hair_Noki` → inspector giữ nguyên `name`, `cloth_type` infer từ prefix trước `_`.
- `batch_export_fbx.export_map` dùng chính prefix này làm key: `{"Genesis8Female_Top": "Eva_top_GND.fbx"}` → `find_matching_meshes` đã hỗ trợ normalized/substring nên không cần đổi tên trong Blender.
- `decimate` sau này chỉ cần `target_objects = [k for k,v in metadata if v.cloth_type in ("Top","Panty",...)]` + ratio theo bảng, không cần user chọn tay.

Ghi vào docs convention 1 bảng `Object Name → cloth_type` để team/non-tech theo. Không ép rename file `.duf`, chỉ chuẩn hóa `name` trong scene.

### 4.4 Để sau (không làm ở deploy)

- Khâu `decimate` tự động theo nhận diện tốt (thuật toán nhận diện mesh dày/mỏng).
- Auto gợi ý `ratio` theo poly count (`face_count` đã có trong `blender_inspector`).
- UI picker cloth_type trong TagPanel.

---

## 5. P3 — Gộp Inspect → Export → Update Metadata (CHỐT theo user: 1 dây)

### 5.1 Hiện trạng lằn nhằn

```
daz_inspect (metadata_map {rel_duf: json}) ──┐
                                            ├→ UpdateResourceMetadataTool(MetadataMap, Repository) → Success/UpdatedCount
batch_export (exported_files) ──────────────┘  (user nối tay 2 dây + chọn Repository)
```

Mỗi lần inspect xong export xong phải nhớ nối 2 output vào tool, dễ quên, dễ sai key. Đặc biệt với cloth (separated, N mesh) thì nối tay N lần là cực hình.

### 5.2 Thiết kế CHỐT: export vừa xuất vừa gói Map

Không đổi `UpdateResourceMetadataTool` (đã batch chuẩn `MetadataMap: Map + Repository: EntityRef`). Đổi duy nhất `batch_export_fbx` nhận thêm `source_metadata_map` và trả thêm `metadata_update_map` (chi tiết signature ở §3.3, không lặp lại ở đây):

```
daz_inspect.metadata_map ──→ batch_export.source_metadata_map
                                  │
                                  ├→ export_map (local paths, cho downstream import Unreal)
                                  └→ metadata_update_map {rel_fbx: metadata_json} ──→ UpdateResourceMetadataTool.MetadataMap (+ chọn Repository ở Tool)
```

- Worker chỉ nhận `Map` (key relative), không nhận `str JSON`, không `**kwargs`. Repository là chọn ở Tool bằng EntityRef picker — worker không cần param `repository_id`, giữ ranh giới Host/Guest, giữ transaction ở backend.
- `metadata_update_map` key = `rel_fbx` posix để Tool resolve qua `ResolveResourceVersionIdsByPathsAsync` (đã hỗ trợ ở `UpdateResourceMetadataTool.cs:129-136`). Value là metadata JSON đã enrich `export:{file_name, matched_meshes}`.
- Nếu `source_metadata_map` rỗng → export thuần, `metadata_update_map = {}`, pipeline vẫn xanh.
- `inspect_unified_mesh` (1 combo) → `export_map` 1 key → `metadata_update_map` 1 entry. `inspect_separated_meshes` (cloth) → N keys → N entries. Cùng 1 wiring, không phân biệt mode ở Tool.
- Log: `[batch_export_fbx] Built metadata_update_map with N entries from M source`.

### 5.3 Migration

- Pipeline cũ nối `inspect.metadata_map → UpdateTool` vẫn chạy (tool không đổi) — nhưng khuyến nghị chuyển sang dây mới để khỏi nối tay.
- Pipeline mới chỉ cần 2 dây: `inspect.metadata_map → export.source_metadata_map`, `export.metadata_update_map → UpdateTool.MetadataMap` (+ chọn Repository 1 lần ở Tool).
- `PythonScriptSchemaParser` sinh pin đúng vì signature tường minh: `export_map: Dict → Map`, `source_metadata_map: Dict → Map`, `output_dir/preset_path: str → Single`. Không cần sửa parser.

---

## 6. P4 — `save_scene` Thông Minh

Hiện `save_scene.py:16-19`: path rác → fallback temp `saved_scene.blend` silent. Khó phát hiện ghi nhầm chỗ.

Đổi thành:

```python
def main(output_path: str = "") -> dict:
    # 1. Nếu output_path có → clean .blend, makedirs, save đè (overwrite).
    # 2. Nếu output_path rỗng:
    #    a. Nếu bpy.data.filepath đã có (đã save trước đó) → save đè vào đó (bpy.ops.wm.save_mainfile).
    #    b. Nếu bpy.data.filepath rỗng (scene mới chưa save lần nào) → raise ValueError("...") để Engine báo lỗi, không fallback temp.
    # returns {"saved_path": ..., "file_size": ..., "is_overwrite": bool}
```

Chi tiết:

- `is_overwrite = (output_path == "" and bpy.data.filepath != "") or (output_path == bpy.data.filepath)`.
- Xóa nhánh `clean_check → tempdir`. Chỉ giữ temp khi `bpy.app.tempdir` được truyền explicit (hiếm).
- Giữ `orphans_purge x3` và `.blend` extension fix (dòng 22-26).
- Log: `[save_scene] Overwriting 'D:/.../Eva.blend'` vs `[save_scene] Saved new scene to '...'`.

Test: mở Blender rỗng → chạy save không path → phải fail rõ; mở file đã save → chạy save không path → đè đúng file.

---

## 7. Lộ Trình Thực Hiện (đề xuất 3 bước để kịp deploy)

**Bước 1 — Worker batch-first (không đụng Engine):**
1. `daz_inspector.py` về `main(root_path, relative_paths: List[str])` + ra `metadata_map {rel: json}` (P1 chốt).
2. `inspect_unified_mesh.py` + `inspect_separated_meshes.py` về `target_objects: List[str]`, bỏ `output_manifest_path` (P1 chốt).
3. `batch_export_fbx.py` chỉ nhận `Dict` + thêm `source_metadata_map → metadata_update_map` (P1+P3 chốt, làm cùng lúc cho khỏi sửa 2 lần).
4. `save_scene.py` smart overwrite (P4).
5. Metadata `cloth_type/body_part` infer + `resolve_material_manifest` ưu tiên metadata (P2, chỉ thêm field, không xóa `ClothType.*` cũ).

**Bước 2 — Test 1 pipeline thật:**
- DAZ `Nova.duf` → import → export 1 Top + 1 Body → inspect batch → manifest → import Unreal → setup. Verify `cloth_type` đi từ metadata tới manifest tới MIC name.
- Test save lần 2 không path (đè) + save scene mới không path (báo lỗi).

**Bước 3 — Docs + mẫu:**
- Cập nhật `docs/workers/WORKER_ARCHITECTURE.md` 1 đoạn batch-first + convention object name.
- Lưu 1 pipeline mẫu `DAZ Cloth Batch Template` để user clone, khỏi gõ Map tay.

Decimate auto + UI picker để sau deploy (ghi backlog, không block).

---

## 8. Tiêu Chí Nghiệm Thu

- [ ] Không còn `**kwargs` ở `daz_inspector`, `blender_inspector`, `batch_export_fbx` main signature.
- [ ] `batch_export_fbx` chỉ nhận `Dict`, legacy convert có warning.
- [ ] `save_scene` không path: đã có filepath thì đè, chưa có thì lỗi rõ, không rơi temp silent.
- [ ] `batch_export_fbx.metadata_update_map` nối thẳng vào `UpdateResourceMetadataTool` chạy xanh.
- [ ] Metadata có `cloth_type`, manifest giữ `cloth_type` từ metadata ưu tiên hơn tag resource.
- [ ] Pipeline DAZ → Unreal chạy end-to-end 1 lần không sửa tay giữa chừng.
- [ ] Không sửa `stage_runner.py`, `ue_stage_runner.py`, contracts, Engine C#.

---

### Ghi Chú

- Plan này bổ sung cho `.agents/plans/unreal-batch-first-refactor.md`, không thay thế. Làm song song được vì khác file.
- Nếu duyệt, Build Agent làm theo thứ tự P1 → P4 → P3 → P2 để deploy nhanh nhất (P2 có thể tách sau mà vẫn deploy được).
