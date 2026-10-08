# Plan: Chuẩn hoá Import Skeletal Mesh & Setup Asset Materials về Batch-First

> Ngày: 2026-10-05 | Tác giả: Build Agent | Trạng thái: Draft - chờ duyệt
> Scope: `workers/worker/scripts/pipeline/unreal/import_skeletal_mesh.py` + `setup_asset_materials.py` (+ wiring Engine nếu cần)
> Ngôn ngữ docs: Tiếng Việt

---

## 1. Bối cảnh

Pipeline `Fbx Body to Unreal` (ảnh user cung cấp): `Resolve Material Manifest (Python Stage) -> Import Skeletal Mesh (Unreal Stage) -> Setup Asset Materials (Unreal Stage)`.

- `Resolve Material Manifest` đã output batch map `objects: {Nova: {slots:[5]}}` + `manifest`.
- `Import Skeletal Mesh` nhận `Fbx Files` kiểu `Map<Text, File Path>` nhưng `_normalize_input_items` chấp nhận thêm `str` và `list`, kèm alias cũ `fbx_path` + `mesh_name`.
- `Setup Asset Materials` nhận `manifest` có thể là `dict | JSON string | file path`, `mesh_paths` có thể là `dict | str`, cộng `**kwargs` để hứng `destination_path` alias `destination_root`, đồng thời vừa trả `batch_results` vừa `objects_map` (trùng dữ liệu) + các alias `mesh_uasset_path`.

Hệ quả: 2 script cùng làm batch nhưng mỗi file 1 kiểu handle single/list/map/str, agent viết script mới cứ copy `if isinstance(..., dict) elif list elif str` + `**kwargs`, gây rối wiring trên Canvas (nhiều đầu ra không rõ dùng cái nào).

## 2. Vấn đề hiện tại (đã soi code)

### 2.1 `import_skeletal_mesh.py:173-301`
- `main(fbx_files: str|list|dict|None, fbx_path: str|None, mesh_name: str, ...)` + `_normalize_input_items` xử lý 3 branch.
- Duplicate logic `sanitize_asset_name`, `_clean_ue_path` copy giữa 2 file.
- Output vừa batch (`mesh_paths`, `all_mesh_paths`, `material_slots`) vừa single alias (`mesh_uasset_path`, `material_slot_names`) với 2 key trỏ cùng UAsset (`raw_name` + `clean_name`).
- `destination_path` default `/Game/Meshes` không infer từ mesh.

### 2.2 `setup_asset_materials.py:552-815`
- `main(manifest: dict|str, material_contracts: dict|str, mesh_paths: dict|str, mesh_uasset_path: str, **kwargs)` handle 5-6 alias.
- Parse `manifest` 3 dạng: dict sẵn / JSON string / file path. Tự suy `objects_dict` từ `slots` hoặc `ObjectsMap` flat.
- Parse `contracts_map` 3 dạng tương tự.
- `raw_textures` filter chỉ giữ ảnh, `map_slot_textures_to_parameters` hybrid 2-tier, `resolve_texture_preset` dual lookup.
- Output `batch_results + objects_map + created_instances + imported_textures + asset_name` — `batch_results` và `objects_map` chứa cùng `slot_bindings` chỉ khác format cho DataTable.
- `sanitize_asset_name`, `_clean_ue_path` trùng file kia.

### 2.3 Engine wiring
- `PythonScriptSchemaParser` quét `def main` signature để sinh `PinDefinition` -> pin `Fbx Files` đang là `Map<Text, File Path>` nhưng runtime vẫn chấp nhận `Text` single nhờ `_normalize`.
- `PinValueResolver` lazy pull không phân biệt single/batch, chỉ cần kiểu pin khớp source.

## 3. Mục tiêu

1. Thống nhất 1 style duy nhất **Batch-First**: input luôn là `Dict`, output luôn là batch map + 1 alias single tối thiểu để không gãy pipeline cũ.
2. Xóa toàn bộ nhánh `str|list|file path` và `**kwargs` ở logic chính, chỉ giữ 1 hàm `_normalize_*` duy nhất ở đầu file để chuyển legacy -> dict (và log warning).
3. Giảm 50% code trùng: tách helper chung `unreal_common.py` (`sanitize_asset_name`, `_clean_ue_path`, `_get_file_hash`).
4. Rõ ràng canvas: mỗi node chỉ còn 3-4 pin chính, xóa pin alias legacy khỏi Inspector.
5. Không đổi Engine (chỉ đổi signature Python để parser sinh pin đúng).

## 4. Ngoài phạm vi (Non-Goals)

- Không đổi logic Interchange vs `AssetImportTask` fallback.
- Không đổi `TEXTURE_PRESET_PACKAGES`, `bind_materials_to_mesh`, `create_single_mic`.
- Không đổi `resolve_material_manifest.py` (đã ổn với `ObjectsMap`).
- Không migration DB tự động cho pipeline cũ (chỉ hướng dẫn thủ công).

## 5. Thiết kế đề xuất

### 5.1 Contract chuẩn mới

#### Import Skeletal Mesh
```python
def main(
    fbx_files: Dict[str, str],  # BẮT BUỘC: {"Nova": "D:/.../Nova.fbx", "Top": "D:/.../Top.fbx"}
    destination_path: str = "/Game/Meshes",
    skeleton_path: str = "",
    pipeline_preset_path: str = "",
) -> Dict[str, Any]:
    # Returns:
    # {
    #   "mesh_paths": {"Nova": "/Game/Meshes/Nova", ...}, # Dùng chính - nối vào Setup
    #   "all_mesh_paths": ["/Game/Meshes/Nova", ...],     # Dùng chính
    #   "material_slots": {"Nova": ["Skin", "Eye", ...]}, # Dùng chính
    #   "mesh_uasset_path": "/Game/Meshes/Nova",          # Alias single - giữ compat
    # }
```

- Xóa `fbx_path`, `mesh_name`, `**kwargs`.
- `_normalize_fbx_files(raw) -> Dict[str,str]`: nếu nhận `str|list` thì convert + `print("[DEPRECATED] Fbx Files should be Map, got ... converting")` rồi tiếp tục batch.

#### Setup Asset Materials
```python
def main(
    manifest: Dict[str, Any],  # BẮT BUỘC: {"objects": {"Nova": {"slots": [...]}}} hoặc ObjectsMap flat
    material_contracts: Dict[str, Any] = {}, # {"Skin": {"master_material_path": "/Game/...", "texture_map": {...}}}
    destination_root: str = "/Game/Assets",
    mesh_paths: Dict[str, str] = {}, # {"Nova": "/Game/Meshes/Nova"}
) -> Dict[str, Any]:
    # Returns:
    # {
    #   "objects_map": {"Nova": {"skeletal_mesh": "/Game/...", "material_slots": {...}}}, # Dùng chính - nối DataTable
    #   "batch_results": [...],           # Debug chi tiết
    #   "created_instances": [...],       # Debug
    #   "imported_textures": [...],       # Debug
    # }
```

- Xóa `mesh_uasset_path: str`, `destination_path` alias, `**kwargs`, xóa nhánh `isinstance(manifest, str) + isfile`.
- Giữ 1 hàm `_normalize_manifest(manifest) -> objects_dict` để hỗ trợ cả `{"objects":...}` và flat `{"Nova": {"slots":...}}`, nhưng không còn `json.loads(file)` .
- `material_contracts` chỉ nhận `dict`, không còn parse JSON string.

### 5.2 Helper chung

Tạo `workers/worker/scripts/pipeline/unreal/_unreal_common.py`:
```python
def sanitize_asset_name(name: str) -> str: ...
def clean_ue_path(path: str) -> str: ...
def get_file_hash(path: str) -> str: ...
IMAGE_EXTS = (".png", ".jpg", ...)
```
2 file import từ đây, xóa duplicate.

### 5.3 Quy ước code style (áp dụng cho cả 2 file)

1. **Normalize ngay dòng đầu**: `fbx_map = _normalize_fbx_files(fbx_files)` rồi logic chỉ làm `for name, path in fbx_map.items()`.
2. **Batch loop thuần**: không `if not HAS_UNREAL: dry-run` lồng trong loop mà tách `if not HAS_UNREAL: return _dry_run(...)`.
3. **Output batch + alias**: luôn `mesh_paths[raw]=path; mesh_paths[clean]=path` giữ compat nhưng không thêm key mới.
4. **Fail fast**: `if not fbx_map: return empty` với warning rõ ràng, không silent.
5. **No **kwargs**: signature tường minh, parser sinh pin chính xác.

## 6. Chi tiết thay đổi từng file

### 6.1 `import_skeletal_mesh.py`

- [ ] Xóa `fbx_path`, `mesh_name` khỏi `main`.
- [ ] Thay `_normalize_input_items` bằng `_normalize_fbx_files(raw: Any) -> Dict[str,str]` (handle `dict|list|str` chỉ để warning + convert).
- [ ] Sửa `main` chỉ nhận `Dict[str,str]`, loop batch thuần.
- [ ] Import helper từ `_unreal_common`.
- [ ] Giữ `import_with_interchange` + `import_with_fbx_fallback` nguyên.
- [ ] Chuẩn hóa return: `mesh_paths`, `all_mesh_paths`, `material_slots`, `mesh_uasset_path` (first).
- [ ] Update docstring tiếng Việt + example `{"Nova": "D:/.../Nova.fbx"}`.

### 6.2 `setup_asset_materials.py`

- [ ] Xóa `mesh_uasset_path`, `**kwargs`, `destination_path` alias, nhánh `isinstance(..., str)`.
- [ ] Thay bằng `manifest: Dict`, `material_contracts: Dict`, `mesh_paths: Dict[str,str]`.
- [ ] Viết `_normalize_manifest(manifest) -> Dict[str, Any] objects_dict` hỗ trợ 2 dạng batch (có `objects` hoặc flat).
- [ ] Viết `_normalize_mesh_map(mesh_paths) -> Dict[str,str]` (xóa `if isinstance(..., str)`).
- [ ] Import helper từ `_unreal_common`.
- [ ] Giữ `map_slot_textures_to_parameters`, `resolve_texture_preset`, `bind_materials_to_mesh` nguyên.
- [ ] Chuẩn hóa return giữ `objects_map` làm primary, `batch_results` là debug.
- [ ] Auto-infer `destination_root` từ `mesh_paths` giữ nguyên (dòng 617).

### 6.3 File mới `workers/worker/scripts/pipeline/unreal/_unreal_common.py`

- [ ] Tạo file, move 3 hàm chung, thêm `__all__`.

### 6.4 (Optional) Cập nhật ví dụ pipeline

- [ ] Cập nhật `docs/workers/WORKER_ARCHITECTURE.md` hoặc `docs/backend/PIPELINE_PIN_SYSTEM.md` ví dụ nối `Fbx Files: Map` thay vì `Text`.

## 7. Tương thích ngược (Migration)

- Pipeline cũ đang gõ literal `D:/.../Nova.fbx` (single Text) vào `Fbx Files` sẽ vẫn chạy nhờ `_normalize_fbx_files` convert + warning, nhưng UI sẽ hiển thị validation hint "Nên dùng Map".
- Pipeline cũ nối `manifest` dạng JSON string sẽ fail - cần user sửa thành nối `Objects Map` dict từ `Resolve Material Manifest`. Ghi log rõ `Expected manifest dict, got str - please connect Objects Map output`.
- Output `mesh_uasset_path` vẫn giữ để `Setup` cũ nối single không gãy, nhưng khuyến nghị chuyển sang `mesh_paths`.

## 8. Ảnh hưởng Engine & PinDefinition

- `PythonScriptSchemaParser.BuildPinDefinition` sẽ sinh pin `fbx_files: Map<Text, File Path>` chính xác sau khi bỏ `str|list` union, không cần sửa parser.
- `PinValueResolver` tự động pull `Map` từ upstream `Dict` output, không đổi.
- Không đổi `RunnerSegmentDispatcher` hay `StageTaskMessage`.

## 9. Kế hoạch kiểm thử

1. **Dry-run local**: `HAS_UNREAL=False` chạy `python -m workers.worker.scripts.pipeline.unreal.import_skeletal_mesh` với `fbx_files={"Nova": "D:/tmp/Nova.fbx"}` -> check `mesh_paths`.
2. **Case legacy**: truyền `fbx_files="D:/tmp/Nova.fbx"` và `fbx_files=["D:/a.fbx","D:/b.fbx"]` -> check warning + convert đúng.
3. **Unreal Stage** trên Runner có UE 5.8 + `first3D.uproject`: chạy pipeline `Fbx Body to Unreal` với `Nova.fbx` (5 slots như log `6c74d547`) -> verify `Import` ra 1 mesh, `Setup` ra 1 object + 5 MICs + bind success.
4. **Batch 2 meshes**: `{"Nova": ".../Nova.fbx", "Body": ".../Body.fbx"}` -> verify `all_mesh_paths` length 2, `objects_map` 2 keys.
5. **Canvas wiring**: kiểm tra Inspector chỉ hiện 4 pin mới, dây cũ `Fbx Files: Text` tự chuyển thành `Map` sau re-parse.

## 10. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Pipeline cũ dùng `fbx_path` alias gãy | Giữ `_normalize` fallback + log warning 1 version, xóa hẳn ở version sau |
| User nhập `manifest` là file path string | Log lỗi rõ + docs hướng dẫn nối `Objects Map` |
| Trùng `sanitize` behavior đổi | Giữ nguyên impl cũ trong `_unreal_common`, copy y chang |
| Parser không nhận `Dict[str,str]` | Test `PythonScriptSchemaParser` với `typing.Dict` trước khi merge |

## 11. Lộ trình thực hiện

1. **Phase 1 - Code**: tạo `_unreal_common.py`, refactor 2 file theo §6, giữ fallback warning.
2. **Phase 2 - Test**: dry-run + 1 pipeline thực tế trên Runner `first3D`.
3. **Phase 3 - Docs**: cập nhật ví dụ wiring trong `docs/workers/WORKER_ARCHITECTURE.md` (1 đoạn ngắn, giữ tiếng Việt).
4. **Phase 4 - Cleanup (sau 1 release)**: xóa hẳn nhánh `str|list` trong `_normalize`, xóa `mesh_uasset_path` alias nếu không còn pipeline nào dùng.

## 12. Tiêu chí nghiệm thu (Acceptance)

- [ ] `import_skeletal_mesh.main` chỉ nhận `Dict[str,str]`, không còn `fbx_path|mesh_name`.
- [ ] `setup_asset_materials.main` chỉ nhận `Dict` cho `manifest` và `mesh_paths`, không còn `str|file path|**kwargs`.
- [ ] 2 file import helper từ `_unreal_common`, không duplicate.
- [ ] Dry-run và Unreal run đều pass với input `{"Nova": ".../Nova.fbx"}`.
- [ ] Canvas Inspector hiển thị đúng 4 pin chính, không còn pin legacy.
- [ ] Không đổi Engine code.

---

### Ghi chú triển khai

- Ưu tiên giữ warning thay vì fail cứng ở Phase 1 để không block pipeline đang chạy.
- Nếu duyệt, Build Agent sẽ thực hiện Phase 1+2 trong 1 PR, Phase 3 docs riêng.
