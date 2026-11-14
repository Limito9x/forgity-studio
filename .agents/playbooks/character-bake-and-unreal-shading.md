# Cẩm Nang Vận Hành & Khắc Phục Lỗi: Character DCC Bake & Unreal Engine 5 Shading Pipeline

> **Mục tiêu tài liệu**: Đúc kết toàn bộ cơ chế hoạt động tầng sâu (deep mental model), các "cạm bẫy" kinh điển (pitfalls) và cẩm nang xử lý dứt điểm khi đưa nhân vật 3D từ **DAZ Studio / Diffeomorphic -> Blender Headless Bake -> Unreal Engine 5**.
> **Đối tượng**: Developer, Technical Artist, và Agent làm việc trên pipeline nhân vật của Forgity Studio.

---

## 1. Sơ Đồ Toàn Cảnh Luồng Dữ Liệu Nhân Vật

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. DAZ Studio / DCC                                                         │
│    - Mesh Genesis 9 / Nhân vật                                              │
│    - Textures PBR gốc (OpenGL Y+, Multi-material slots)                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Import qua Diffeomorphic
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Blender (pipeline-scripts/blender/bake_mesh.py)                          │
│    - Shader Tree: Node Groups (Daz Pbr / Extended Principled)                │
│    - Headless UV Pinning: Tránh đụng độ tọa độ UV                           │
│    - Emission Routing: Bake BaseColor, Roughness (1 spp siêu tốc)           │
│    - DirectX Normal Flip: NumPy lật kênh Green (Y- cho UE5)                 │
│    - Pack Mode: "none" (file rời) hoặc "ORM" (R=AO, G=Roughness, B=Metal)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Export FBX (Face Smoothing + Triangulate)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Unreal Engine 5 Import (import_skeletal_mesh.py)                         │
│    - FBXNormalImportMethod: FBXNIM_IMPORT_NORMALS (Bảo tồn weighted normals)│
│    - Tangent Space: MikkTSpace tự động đồng bộ 100%                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Material Ingestion & Shading
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. UE5 Shading & Subsurface Profile (M_Skin, SP_Skin, M_EyeMoisture)        │
│    - Subsurface Profile: MFP Distance 0.4 - 0.6 cm (chống bầm đỏ cổ)         │
│    - Roughness Sweet Spot: 0.5 - 0.6 (da lì tự nhiên, không bóng sáp)       │
│    - Eye Moisture: RÚT BỎ Refraction, Opacity 0.05 (mắt long lanh)          │
│    - Virtual Shadow Maps: r.Shadow.Virtual.NormalBias 2.0 (khử răng cưa)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 1.1. Diffeomorphic Import Scale

- `pipeline-scripts/blender/diffeomorphic_import.py` configures Scene Metric with `scale_length = 0.01` and Diffeomorphic `GS.scale = 1.0` for the FBX to UE5 workflow.
- Do not pass `unit_scale` to `bpy.ops.daz.easy_import_daz`: DAZ Importer 5.2.0 does not expose this operator property.
- `useUnits` imports Face Units morphs, not measurement units. Preserve its preset value or the addon default.

### 1.2. Native Unreal Game Contracts Inspection (2026-11-06)

Provider authentication: character classifier checks `<PROVIDER>_API_KEY` before generic `AI_API_KEY`/`LLM_API_KEY` in each configured source. Warm DCC may read the installed default `%LOCALAPPDATA%/Forgity/runner.toml`, distinct from workspace `runner/runner.toml`; use `FORGITY_CONFIG` for an explicit path. Diagnosing OpenRouter 401 found different provider keys in those two files. Installed config now has a dedicated OpenRouter entry; actual Unreal Python + cached SDK verified Bearer header and `/key` HTTP 200. The configured free-model chat probe returned 429, so full inference is not verified. No secrets should be printed in diagnostics.

Compact AI output: asset/slot/texture references are request-local integer IDs. AI slot decisions use `{slot, material, bindings: {parameter_name: texture_id}}`; the request includes texture filenames and shader binding semantics without full file paths or empty metadata strings. For Groq Qwen models (`qwen/*`), `reasoning_effort="none"` disables `<think>` chain-of-thought overhead. Python restores exact names/paths from the original payload before existing manifest validation and missing-slot completion. The Unreal importer manifest and node input pins are unchanged. IDs are bounds-checked, including supplemental requests whose indices restart locally. No low max_tokens cap is imposed; republish `classify_character_manifest.py`.

AI slot omission: classifier makes at most one supplemental request containing only omitted material slots for otherwise correctly covered assets. It appends slot decisions without replacing existing asset/schema/property choices, then validates the complete manifest normally. Extra/duplicate slots are not repaired, and an incomplete or invalid supplement still fails. Truncated model output (`finish_reason=length`) is reported explicitly. Republish the classifier to enable this behavior.

Payload cleanup: FBX slots now expose only `texture_bindings`, not a duplicate `textures` list. Inspector materials expose `package_path` + `parameters` once; parameter names are dictionary keys. Schema fields no longer carry verbose `native_type` diagnostics. Classifier projects material semantics/sampler types for AI, keeps compression/sRGB/VT in the local contract for import, and serializes requests as compact JSON. Virtual sampler enum names with underscores retain correct NORMAL/MASKS/GRAYSCALE semantics. Republish inspector, exporter and classifier together; existing bound-texture metadata remains readable.

**Luồng hiện tại (06/11/2026, cập nhật scene/convention):**

```text
Diffeomorphic → merge materials / save local textures → inspect_scene → classify_mesh_types
  ├─ Body: body_meshes + bake_materials → bake_mesh → export_fbx (Single)
  └─ Wardrobe: wardrobe_items → prepare_wardrobe → export_map → export_fbx (Batch)
Export manifest + inspect_game_contracts.contracts → classify_character_manifest → Unreal importer
```

- Inspect và classify là hai step riêng cùng Blender stage; metadata DAZ không còn là input của luồng này. `inspect_scene.scene_metadata` gồm object name chính xác, mesh datablock, parent/armature, polygon/vertex counts và material slots.
- `classify_mesh_types.raw_metadata` nhận `scene_metadata`; trả `body_meshes`, `wardrobe_items`, `bake_materials` (object name → list `{index, material_name, role}` với role `Head`/`Body`/`Preserve`). Validate tên và coverage theo scene, không fuzzy matching.
- Body đi thẳng vào bake; **prepare_wardrobe chỉ dành cho quần áo**, không join/rename body, mắt hay miệng. Wardrobe prepare trả tên sau join/rename qua `export_map` và `object_map`.
- Bake: nối `bake_materials` vào `material_roles`, `body_meshes` vào `target_objects`. Body export vẫn dùng toàn bộ `body_meshes`, kể cả mesh mắt/miệng được Preserve; không dùng `bake.applied_objects` vì output đó chỉ gồm mesh có phần đã bake.
- Inspector Unreal vẫn dùng native Material API và canonical `EdGraphPinType.export_text()` để giữ type/container chính xác. Scope tài nguyên chỉ từ `material_paths`/`pda_paths` được truyền vào.
- Input mới `allowed_tag_prefixes = ["Character", "System.Wardrobe.Slots"]`: match đúng nhánh (`Character` và `Character.*`, không khớp `CharacterExtra`). `[]` lấy tất cả tags từ `DefaultGameplayTags.ini`. Bỏ output `wardrobe_slots`/`slots_count`: inspector không tự đoán vai trò tag từ `.Slots.`.
- Classifier có input `convention_instructions` **dạng văn bản**, default hướng dẫn `Character.{character_name}`, `System.Wardrobe.Slots` và các field CharacterTag/SlotTag/ItemTag/DisplayName khi tồn tại. Chỉ format `{character_name}` rồi chèn vào mục PROJECT CONVENTIONS của system prompt cố định. Placeholder khác bị từ chối trước khi gọi AI.
- AI trả `character_tag` ở cấp root và điền `properties` theo schema; validator tự nhận diện các trường tag `character`/`item`/`slot` từ schema (tự điền `character_tag` vào trường character nếu AI lược bớt để tiết kiệm token). Character/item tags có thể mới; slot và tag khác phải thuộc inspected gameplay_tags. Validate cú pháp tag, character consistency, item identity uniqueness; không ép prefix Character.* trong validator. Importer đăng ký tag theo **kiểu field trong contract**, không theo hậu tố tên field.
- Destination cố định `/Game/Characters/Genesis9/<character>`; wardrobe trong `Outfits`, textures dùng chung `Textures`. Giữ `SKM_`/`DA_`. Legacy destination/prefix overrides không còn đổi đích này. Source export path có thể là `Characters/Genesis9/<character>/...` hoặc layout cũ `Characters/<character>/...`; nhận cả chữ thường. `Genesis9` không được coi là character name.
- Classifier không đoán skeleton; cấu hình `skeleton_path` ở Unreal importer. API key lấy từ process environment Runner inject, không dò runner.toml từ cwd/thư mục cha. JSON schema được sinh từ Pydantic model, dùng một đường JSON request/validation.
- Material `parameters: {}` vẫn hợp lệ cho shader cố định. AI chọn đúng schema từ contract, không suy role bằng Texture2D. Container fields không phải editable scalar fields.

**Publish/wiring:** Thêm node `inspect_scene`; publish lại mesh classifier, wardrobe prepare, bake, FBX export, game inspector, character classifier và wardrobe importer. Bỏ wire inspect DAZ trong luồng mới, nối lại các input như trên, chọn lại mode nếu graph dùng `head_and_body`. Giữ Unreal stage skeleton input. Không tự sửa pipeline lưu trên server.

Các ghi chú trước thay đổi dưới đây là lịch sử; cấu hình/luồng ở trên là hiện hành.

Schema pipeline correction (06/11/2026): UE 5.8 does not expose `EdGraphPinType.pin_category` and related properties to Python. Inspector now reads the canonical native `export_text()` serialization, preserving exact class/struct type and array/map/set container. The previous output silently contained `Unknown` for every Blueprint field. Classifier now exposes only `export_manifest`, `contracts`, `endpoint`, `model`: AI chooses `target_schema` from all inspected schemas using names, paths and fields; no Texture2D-based role inference or schema override pins. Validation rejects unknown types, non-contract schema/parameter/property choices, missing texture bindings and ambiguous scalar mesh bindings. Container fields stay out of AI scalar properties and automatic mesh/thumbnail binding. Verification: 25 focused tests, all three script harnesses, native commandlet read of both actual Blueprint schemas, real FBX metadata -> mocked AI decision -> importer dry-run. Full live AI/import not executed. Republish both inspector and classifier.

Schema pipeline correction (06/11/2026): UE 5.8 does not expose `EdGraphPinType.pin_category` and related properties to Python. Inspector now reads the canonical native `export_text()` serialization, preserving exact class/struct type and array/map/set container. The previous output silently contained `Unknown` for every Blueprint field. Classifier now exposes only `export_manifest`, `contracts`, `endpoint`, `model`: AI chooses `target_schema` from all inspected schemas using names, paths and fields; no Texture2D-based role inference or schema override pins. Validation rejects unknown types, non-contract schema/parameter/property choices, missing texture bindings and ambiguous scalar mesh bindings. Container fields stay out of AI scalar properties and automatic mesh/thumbnail binding. Verification: 25 focused tests, all three script harnesses, native commandlet read of both actual Blueprint schemas, real FBX metadata -> mocked AI decision -> importer dry-run. Full live AI/import not executed. Republish both inspector and classifier.

Classifier character defaults (06/11/2026): `character_name`, `character_tag`, and `destination_folder` are no longer exposed as input pins. Existing saved graph values remain readable through kwargs; `contracts.project` may also supply explicit metadata. Otherwise character identity comes from the supplied export path convention `.../Characters/<character>/...` across all entries, including outfits. No filesystem discovery or first-item/name-prefix guessing. Missing/mixed identities require correcting the export layout or explicit project metadata. Output defaults to `/Game/Characters/<character>`, and new identities use `Character.<character>`; importer registers character/item tags. Shader/schema/wardrobe-slot validation still applies.

Classifier accepts an explicit empty `materials[tag].parameters` object for materials with no texture overrides (for example, a fixed EyeMoisture shader). Missing/non-object parameter contracts remain invalid. AI must return `textures: []` for such materials; invented parameter names are still rejected. Importer already supports creating an instance with a parent and no texture overrides. This does not repair unfinished shader graphs: a placeholder material keeps its authored appearance. Republish `classify_character_manifest.py` to update the content-addressed script used by existing nodes.

`pipeline-scripts/unreal/inspect_game_contracts.py` thực thi trực tiếp bằng **Unreal Engine Python API** (`unreal.MaterialEditingLibrary`, `unreal.EditorAssetLibrary`) bên trong môi trường Unreal (không cần fallback binary scraping hay giả lập dry-run).

- **Đầu vào (Inputs)**:
  - `material_paths`: Danh sách đường dẫn thư mục hoặc file material dạng `/Game/...` (ví dụ `["/Game/Characters/Genesis9/Base/Materials"]`). Script sẽ tự động liệt kê đệ quy và trích xuất tất cả các Master Material `M_*` (bỏ qua Material Instances).
  - `pda_paths`: Danh sách đường dẫn thư mục hoặc file PrimaryDataAsset Blueprint dạng `/Game/...` (ví dụ `["/Game/Systems/Wardrobe/Schemas"]`). Script sử dụng reflection trực tiếp từ `UBlueprint` (`list_member_variable_names`, `get_member_variable_type`) để trích xuất đầy đủ kiểu dữ liệu các trường (`GameplayTag`, `SkeletalMesh`, `Texture2D`, `str`, v.v.).
- **DCC Stage Container Support**: Các custom Python scripts giờ đây được hỗ trợ thả/chạy trực tiếp bên trong các Stage DCC (Unreal Stage, Blender Stage) nhờ cập nhật bộ lọc `filterPalette` và cơ chế reparenting thông minh trên Pipeline Canvas (`onNodeDragStop`).
- **GameplayTags & Wardrobe Slots**: Được đọc trực tiếp từ `<ProjectConfigDir>/DefaultGameplayTags.ini` thông qua `unreal.Paths.project_config_dir()`.
- **Đầu ra (Outputs)**: Giữ nguyên cấu trúc hợp đồng chuẩn (`materials`, `schemas`, `skeletons: {}`, `gameplay_tags`, `wardrobe_slots`, `materials_count`, `schemas_count`, `slots_count`, `tags_count`, `summary`).

## 2. Bản Chất Kiến Trúc Shader DAZ / Diffeomorphic Trong Blender

### 2.1. Cấu trúc tổ chức vật liệu
- Diffeomorphic khi nhập nhân vật DAZ vào Blender **không dùng Principled BSDF phẳng ở tầng ngoài**.
- Thay vào đó, nó bọc toàn bộ logic trong một **Node Group** (thường mang tên `Daz Pbr Group` hoặc `Extended Principled Group`).
- **Vị trí cắm Texture thực tế:**
  - Các node `Image Texture` gốc nằm ở **tầng ngoài cùng (Root Level)** của `mat.node_tree`.
  - Chúng được nối vào các cổng input của Node Group: `"Base Color"`, `"Glossy Roughness"`, `"Roughness"`, `"Normal"`, `"Bump"`.

### 2.2. "Cái Bẫy" Roughness Đen Thui (Black Roughness Pitfall)
- **Hiện tượng**: Bake map Roughness xuất ra file ảnh đen thùi lùi `(0, 0, 0)`, làm nhân vật khi vào Unreal Engine bị bóng nhẫy như gương/tượng sáp.
- **Cơ chế lỗi**:
  - Nếu thuật toán tìm kiếm lặn sâu vào bên trong lõi Node Group để tìm `Principled BSDF`, ở bên trong lõi cổng `Roughness` không có texture nối trực tiếp mà mang giá trị mặc định là **`0.0`**.
  - Đồng thời, Blender **cấm tuyệt đối nối dây chéo giữa các node tree khác nhau** (`links.new(internal_socket, root_emit_node)` sẽ crash).
- **Quy tắc giải quyết chuẩn trong `bake_mesh.py`**:
  1. **Ưu tiên quét tầng ngoài cùng (Root Level)** nơi Texture thực tế được cắm vào Node Group.
  2. **Mở rộng từ khóa nhận diện**: Hỗ trợ `"Glossy Roughness"`, `"Glossiness"`, `"Specular Roughness"`, `"Rough"`.
  3. **Proxy Node nếu lặn sâu**: Nếu bắt buộc lấy từ texture bên trong group, tạo một node `ShaderNodeTexImage` tạm thời ở root tree trỏ cùng file `image` để tránh lỗi cross-tree.
  4. **Fail-safe Guardrail**: Nếu Roughness đọc ra $\le 0.01$, lập tức chặn đứng và fallback về giá trị da người chuẩn (`0.5`), không bao giờ để xuất ra ảnh đen `0.0`.

### 2.3. "Cái Bẫy" Da Cháy Đen (Diffeomorphic SSS Mix Pitfall)
- **Hiện tượng**: Nhân vật da trắng tự nhiên sau khi bake BaseColor xuất ra file ảnh bị nâu đen sẫm / socola cháy (`R=0.41, G=0.22, B=0.20`), render thumbnail hoặc đưa vào UE5 trông như "người da đen".
- **Cơ chế lỗi**:
  - Khi Diffeomorphic import nhân vật DAZ, cổng `Base Color` của `Principled BSDF` không cắm trực tiếp vào texture Diffuse gốc (`_D_100x.jpg`), mà đi qua một node `Mix (Factor=0.85)`.
  - Cổng A của Mix là texture Diffuse thật, nhưng cổng B là texture Subsurface (`_SSS_100x.jpg`) đã bị đi qua node `Gamma = 3.5` (làm tối đen lại $x^{3.5}$).
  - Với Factor 0.85, 85% giá trị màu xuất ra bị nuốt bởi màu SSS tối đen (vì trong Cycles họ dựa vào Subsurface Scattering để bù sáng). Khi bake EMIT từ Base Color, file ảnh BaseColor bị cháy đen.
- **Quy tắc giải quyết chuẩn trong `bake_mesh.py`**:
  - Khi bake map `diffuse`, nếu upstream socket nối vào node `MIX` / `MIX_RGB`, tự động dò ngược vào **Cổng A** (`Color1` / `A`) để lấy đúng node texture Diffuse/Albedo gốc. Bỏ qua hoàn toàn cổng SSS/Gamma 3.5 để bảo toàn 100% màu da nguyên bản cho UE5 Subsurface Profile.

---

## 3. Cẩm Nang Headless Bake (`bake_mesh.py`)

### 3.1. Tốc độ: Emission Routing vs Raytraced Ambient Occlusion (AO)
- **Bản chất Emission Routing**: Biến kênh màu/độ nhám thành vật phát sáng (`ShaderNodeEmission`) $\rightarrow$ Cycles chỉ cần bắn **đúng 1 tia (1 sample/pixel)** là lấy được 100% giá trị tuyệt đối. Thời gian bake chỉ mất **1 - 2 giây/map**.
- **Cạm bẫy Ambient Occlusion (AO)**:
  - AO là tính toán che khuất bằng tia Raytracing thực sự. Chạy 32 samples trên lưới 86,000 tam giác sẽ ngốn **85% tổng thời gian bake** (từ 5s kéo dài lên 1 phút).
  - **Kinh nghiệm đồ họa**: Unreal Engine 5 đã có Lumen và GTAO xử lý bóng tiếp xúc thời gian thực cực mạnh. **Không nên bake AO tĩnh vào da nhân vật**, vì nó sẽ làm hốc mắt, cánh mũi, nách bị đen cố định bất kể hướng đèn chiếu.
  - **Thiết lập chuẩn**: Để kênh AO trong file ORM tự điền giá trị `1.0` (trắng tinh) qua NumPy. Chỉ bake AO khi làm đồ vật môi trường tĩnh (Props/Environments).

### 3.2. Đóng gói kênh (Channel Packing: `pack_mode` - Data-Driven SSOT)
- Toàn bộ các định dạng đóng gói hiện được quản lý tập trung trong bảng cấu hình `CHANNEL_PACK_PRESETS`:
  - **`none` (Mặc định khuyên dùng cho Character Shader)**:
    - Xuất ra các file độc lập: `..._BaseColor.png`, `..._Roughness.png` (ảnh xám 1 kênh), `..._Normal.png`.
    - Giúp việc cắm vào Material trong Unreal Engine trực quan, cắm chân nào cũng đúng.
  - **`ORM` (Unreal Engine 5 Standard)**: R=AO (`1.0`), G=**Roughness**, B=Metallic (`0.0`).
  - **`ORMA` (Unreal Engine 5 with Opacity)**: R=AO, G=Roughness, B=Metallic, A=Alpha.
  - **`RMA` / `MRA`**: Dành cho các pipeline engine tùy biến khác.
  - **`UNITY_MASK`**: Dành cho Unity HDRP/URP (R=Metal, G=AO, B=Detail, A=Smoothness [tự động invert Roughness]).
- **Xóa bỏ cờ dư thừa**: Cờ `bake_orm` cũ đã được loại bỏ khỏi giao diện pin chính để tránh xung đột kép (vẫn hỗ trợ ngầm qua `kwargs` nếu có graph cũ gọi tới).

### 3.3. Định dạng Pháp tuyến: Chuẩn hóa OpenGL ($Y+$) DCC & Tự động Đảo Kênh Green ($Y-$) trong UE5

- **Nguyên lý phối hợp chuẩn công nghiệp**:
  - **Trong Blender DCC (`bake_mesh.py`)**: Mặc định xuất Normal Map theo chuẩn **OpenGL ($Y+$)** (`normal_format="opengl"`).
    - *Lý do*: Blender Viewport (Eevee/Cycles/Workbench) hiển thị chuẩn OpenGL. Nếu nướng trực tiếp DirectX ($Y-$) vào texture rồi gán lại vào Blender Material, kênh Y bị ngược làm các lỗ chân lông (pores lõm) bị biến thành nốt mụn lồi (convex bumps), kết hợp với thiếu SSS tạo cảm giác mặt rỗ hạt gai sần sùi ("rổ rổ").
    - Đồng thời, khi tái tạo vật liệu sau bake (`build_single_baked_material`), đối với các slot da người (`genesis`, `skin`, `body`, `face`, `head`), script tự động đặt `Subsurface Weight = 0.5`, `Subsurface Scale = 0.05`, và `Normal Map Strength = 0.5` để da mịn màng, tự nhiên ngay trong Blender.
  - **Trong Unreal Engine (`setup_asset_materials.py`)**:
    - Khi texture thuộc nhóm `TC_NORMALMAP`, script Unreal tự động bật cờ cấu hình uasset:
      ```python
      tex_asset.set_editor_property("b_flip_green_channel", True)
      ```
    - *Ưu điểm tuyệt đối*: Texture nạp vào giữ nguyên bản gốc không bị suy hao chất lượng khi lưu trữ hay tái sử dụng qua Unity/Blender, trong khi Unreal Engine tự động lật kênh Y ở tầng hardware sampler mà không tốn chi phí runtime.

### 3.4. Chế độ Nướng Nhân vật (`bake_mode`, hiện hành)

- `body_only` mặc định: giữ material/texture Head gốc, chỉ bake các slot role Body.
- `all_in_one`: Head + Body vào một atlas trên từng mesh đích. Không tự join các body object riêng.
- Preserve giữ nguyên material và UV; mesh mắt/miệng riêng không tham gia bake. Nếu cùng mesh có slot Preserve, bản sao tạm chỉ chứa polygon cần bake để tránh ghi các mặt Preserve vào atlas.
- Bỏ `head_and_body`; giá trị cũ phải được chọn lại, không tự đổi mode.
- Không phân nhóm bằng keyword tên material trong baker; mapping index/name/role phải khớp scene trước khi sửa UV.
- UV bake copy từ source, chỉ pack nhóm cần bake; UV0 xuất kết hợp tọa độ bake và tọa độ source ở các mặt giữ nguyên. Các UV maps nguồn có tên được giữ lại cho material còn tham chiếu chúng.
- Bake chỉ hỗ trợ active output nối tới root Principled (có thể qua reroute). Shader mix/group chưa hỗ trợ phải được chuyển sang FBX-compatible Principled trước; script báo rõ material thay vì âm thầm lấy Principled đầu tiên.
- FBX exporter luôn inspect lại slot có polygon, truy ngược active Material Output qua node groups/group inputs/reroute. Loại node rời và inactive output, giữ nhiều binding của cùng image. `source_manifest.slots` không được ghi đè scene; chỉ giữ thông tin ngữ nghĩa như cloth_type.
- Mouth Cavity vẫn có thể dùng `Thelona_HeadD` gốc dù Head đã bake: texture được giữ nếu có đường nối thực tới shader; không xóa theo tên file.

---

## 4. Cẩm Nang Xuất Nhập FBX & Bảo Toàn Pháp Tuyến (Normals)

### 4.1. Thiết lập Geometry khi Export FBX từ Blender

| Thuộc tính | Giá trị tối ưu | Lý do kỹ thuật |
| :--- | :--- | :--- |
| **Smoothing** | **`Face`** | Xuất đúng Smoothing Groups cho UE5, tránh cảnh báo lỗi mesh gãy cạnh. |
| **Triangulate Faces** | **Tích chọn `[x]`** | **Rất quan trọng!** Tránh xung đột cách chia tam giác giữa Blender và Unreal làm vặn xoắn Normal Map $90^\circ$. |
| **Tangent Space** | **Bỏ chọn `[ ]`** | Để Unreal Engine tự tính Tangent Space bằng thuật toán chuẩn MikkTSpace. |
| **Apply Modifiers** | Bỏ chọn nếu có Shape Keys / Armature | Tránh làm phẳng morph targets khuôn mặt. |

### 4.2. Thiết lập Import FBX trong Unreal Engine (`import_skeletal_mesh.py`)
- **Tuyệt đối KHÔNG dùng**: `FBXNIM_COMPUTE_NORMALS`. Nó vứt bỏ toàn bộ smoothing gốc và weighted normals của khuôn mặt, sinh ra rãnh đen nứt dọc theo mép cắt UV (UV seams).
- **BẮT BUỘC dùng**: `FBXNIM_IMPORT_NORMALS`. Bảo tồn 100% vector pháp tuyến của mô hình gốc từ DCC tool.

---

## 5. Cẩm Nang Unreal Engine 5 Shading & Subsurface Profile

### 5.1. Bí ẩn: Tại sao cửa sổ Preview (SKM, IK Retargeter) bị răng cưa dither mà vào Game (Play) lại mượt?
- **Nguyên nhân**:
  - Các cửa sổ chỉnh sửa nhân vật (Persona Preview Scene) **bị tắt/giảm thuật toán khử răng cưa thời gian (TSR/TAA)** để giữ FPS cao khi nạp animation.
  - Đồng thời góc đèn chiếu mặc định quét một góc xiên $85^\circ$ (Grazing angle), làm Virtual Shadow Maps (VSM) sinh ra lỗi **Shadow Terminator** lởm chởm theo hình tam giác của mesh.
  - Khi ra Level thật: Ánh sáng nảy từ môi trường (Lumen GI) và bộ khử răng cưa TSR tự động làm nhòa các hạt dither, tạo bóng mềm mượt.
- **Khắc phục ngay trong Editor / Retargeter**:
  Gõ console command:
  ```
  r.Shadow.Virtual.NormalBias 2.0
  ```
  *(Đẩy bóng ảo lệch khỏi mặt phẳng tam giác một khoảng micro-offset, triệt tiêu ngay răng cưa).*

### 5.2. Cân chỉnh Subsurface Profile (`SP_Skin`) chuẩn Metahuman

```
[Mặt Trời / Đèn Chính]
         │
         ▼
┌─────────────────────────┐  ◄── Specular (0.35) + Roughness (0.5 - 0.6)
│   Lớp Biểu Bì Ngoài     │      (Tạo độ lì tự nhiên, không bóng nhờn)
├─────────────────────────┤
│   Lớp Mỡ & Mao Mạch     │  ◄── Mean Free Path Distance: 0.4 - 0.6 cm
│   (Tán xạ dưới da - SSS)│      Mean Free Path Color: Đỏ cam ấm (0.7, 0.35, 0.22)
└─────────────────────────┘      (Tạo quầng đỏ tự nhiên ở tai/mũi, không bầm cổ)
```

- **`Mean Free Path Distance`**:
  - Không để quá mỏng (`0.1 cm`): Da trông như đất sét/nhựa cứng.
  - Không để quá dày (`> 1.2 cm`): Da ở cổ và ngực bị loang một quầng đỏ máu bầm rộng khi có bóng cằm đổ xuống.
  - **Ngưỡng chuẩn**: **`0.4` – `0.6 cm`**.
- **`Mean Free Path Color`**: Đỏ cam ấm (`R: 0.7, G: 0.35, B: 0.22`).
- **`Roughness`**: **`0.5` – `0.6`** (Ngưỡng vàng chống bóng sáp).
- **`Specular`**: **`0.35`** (Phù hợp IOR 1.4 của da người).

### 5.3. Bí ẩn Eye Moisture: "Scalability Medium bình thường, lên High lại bị dị/mắt đục?"
- **Cạm bẫy**: Nối dây `Refraction: 1.333` vào shader `M_EyeMoisture`.
- **Cơ chế**:
  - Ở mức `Medium`: Engine tắt hoàn toàn Screen-space Refraction (`r.RefractionQuality = 0`), nên mắt bình thường.
  - Ở mức `High / Epic`: Engine bật khúc xạ. Lớp vỏ mỏng của EyeMoisture hoạt động như một thấu kính lồi dày, bẻ cong con ngươi phía sau khiến mắt bị phóng đại dị hợm hoặc vệt trắng đục cắt ngang tròng mắt.
- **Thiết lập chuẩn AAA cho Eye Moisture**:
  1. **RÚT BỎ HOÀN TOÀN CỔNG `Refraction` (để trống)**.
  2. **`Opacity`**: Hạ xuống rất thấp, chỉ từ **`0.05` đến `0.1`**.
  3. **`Roughness`**: `0.02` (cực bóng để bắt điểm sáng đốm trắng Catchlight).
  4. **`Specular`**: `1.0`.
  5. **`Blend Mode`**: `Translucent`, **`Lighting Mode`**: `Surface TranslucencyVolume` hoặc `Surface ForwardShading`.
  - 👉 *Kết quả: Con ngươi trong suốt sáng rõ, mắt long lanh có hồn 100%!*

---

## 6. Bảng Tra Cứu Sự Cố Nhanh (Quick Troubleshooting Cheat-Sheet)

| Dấu hiệu nhận biết | Nguyên nhân gốc rễ | Cách khắc phục ngay |
| :--- | :--- | :--- |
| **Da bóng loáng như gương, bôi dầu** | File Roughness bake ra bị đen thui `(0.0)`. | Chạy lại `bake_mesh.py` bản mới; nâng Roughness lên $\ge 0.5$. |
| **Cổ và ngực bị quầng đỏ như vết bầm** | `Mean Free Path Distance` quá lớn ($> 1.2\text{ cm}$). | Hạ MFP Distance trong `SP_Skin` xuống `0.4 - 0.6 cm`. |
| **Răng cưa zíc-zắc ở ranh giới bóng** | Virtual Shadow Maps terminator trên mesh hữu cơ. | Gõ `r.Shadow.Virtual.NormalBias 2.0` hoặc tăng `Shadow Bias` trên đèn. |
| **Đường may UV bị rãnh đen / nứt khối** | Import FBX bị ép `COMPUTE_NORMALS`. | Đổi sang `FBXNIM_IMPORT_NORMALS` trong `import_skeletal_mesh.py`. |
| **Khối lồi/lõm bị ngược chiều sâu** | Chưa lật kênh Green (DirectX vs OpenGL). | Đảm bảo `flip_normal_y = True` khi bake trong Blender. |
| **Mắt bị đục trắng, con ngươi bị méo mó** | Cắm `Refraction: 1.333` trên lớp EyeMoisture. | Rút dây `Refraction` ra; giảm `Opacity` xuống `0.05 - 0.1`. |
| **Mesh vào UE bị vặn xoắn nếp gấp tam giác** | Export FBX từ Blender chưa Triangulate. | Bật `Triangulate Faces [x]` khi xuất FBX từ Blender. |
| **Setup Material bị rỗng `created_instances`** | Thiếu `master_material_path` từ khâu Inspect/Classify. | Dùng `classify_material_manifest.py` bản mới đã tự động nhúng path vào manifest. |



---

## Ghi chú sự cố 29/10/2026 — Bake ra BaseColor/Roughness đen (đã kiểm chứng bằng Blender thật)

Cấu trúc node thật của Diffeomorphic (Dual Lobe), đọc từ `Eva.blend`:

```
TEX_IMAGE (D) -> Mix/Gamma -> Principled BSDF.Base Color      (root tree)
TEX_IMAGE (GR) -> Math     -> DAZ Dual Lobe PBR.Roughness 1   (root tree, group lái Material Output)
TEX_IMAGE (NM) -> Normal Map -> Principled.Normal + Dual Lobe.Normal
Principled BSDF.Roughness = 0.0 (KHÔNG dùng — roughness thật nằm ở Roughness 1/2 của Dual Lobe)
Principled BSDF -> DAZ Dual Lobe PBR.BSDF -> Material Output.Surface
```

Bài học (`setup_emission_routing` trong `bake_mesh.py`):

1. **Không quét ảnh theo tên file khi graph đã có link.** `prepare_bake_targets` tạo node `__ModernBake_Target__` chứa ảnh `Bake_<stem>_BaseColor` *trước* bước routing → máy quét tên khớp chữ "basecolor" và nối chính ảnh đích vào emission → feedback ra ảnh đen. Mọi node/ảnh có tiền tố `__ModernBake_` / `Bake_` phải bị loại trừ (`_is_bake_artifact`).
2. **Socket ứng viên = Principled BSDF + group lái Material Output**, ưu tiên socket đã nối dây; khớp tên chính xác (không so substring — "Roughness 1" từng bị khớp nhầm mà không được ưu tiên đúng).
3. **Nối thẳng socket upstream trong cùng tree** (giữ nguyên Mix/Gamma/Math tint của DAZ), chỉ tạo proxy texture khi nguồn nằm trong group khác.
4. **Normal giữ kỹ thuật Cycles `NORMAL`**. Thumbnail normal da DAZ trông "phẳng tím" là bình thường vì chi tiết lỗ chân lông rất mảnh — đừng kết luận lỗi chỉ nhìn thumbnail; kiểm tra bằng std của pixel.
5. Mỗi kênh in ra một dòng log `[bake_mesh:emit] <mat> [<map>] <- <nguồn>` — đọc log stage trong `%LOCALAPPDATA%\Forgity\logs\stage_*.log` trước khi đoán.

Cách kiểm chứng nhanh không cần chạy pipeline: chạy `blender -b Eva.blend --python <test>.py` gọi `bake_mesh.main(..., resolution=512, output_dir=<tạm>)` rồi in mean/std pixel của từng ảnh.

---

## 7. Cẩm Nang Modular Outfit & Unreal Data Asset Registration (PDA_WardrobeItem & PDA_CharacterProfile)

> **Cập nhật 30/10/2026**: Chuẩn hóa toàn diện quy trình Modular Wardrobe từ Blender $\rightarrow$ AI Semantic Ingestion $\rightarrow$ Unreal Engine 5.

### 7.1. Quy ước đặt tên sạch & Bảo toàn Metadata (Blender `batch_export_fbx.py`)
- **Tên file & Asset**: Tự động lược bỏ hậu tố rác của Blender/DAZ (`Mesh`, `Genesis 9`, `Shape`, `.001`), áp dụng tiền tố outfit:
  - Công thức: `{Prefix}_{CleanAssetName}.fbx`
  - Ví dụ: `Eva_Outfit1_BRZ_US_Bra.fbx`, `Eva_Outfit1_BRZ_US_Panties.fbx`, `Eva_Outfit1_Iridessa_Hair.fbx`.
- **Thư mục xuất**: Nằm ngay cùng cấp thư mục với file `.blend` (ví dụ `Characters/Eva/outfits/Eva_Outfit1/`), chống đè lộn xộn textures khi quản lý nhiều outfits.
- **Bảo toàn Manifest**: Lưu giữ nguyên vẹn `clean_asset_name`, `source_object_name`, `cloth_type` (như `Inner_Top`, `Inner_Bottom`, `Hair`), `file_path`, và `slot_bindings`.

### 7.2. AI Semantic Ingestion (`classify_mesh_types.py` & `classify_material_manifest.py`)
- **Endpoint linh hoạt**: Hỗ trợ alias `"groq"`, `"gemini"`, `"ollama"` hoặc URL Local LLM trực tiếp (`http://localhost:11434/v1`, LM Studio). Bỏ qua yêu cầu API key đối với môi trường cục bộ (`is_local = True`).
- **Prompt Injection (`notes`)**: Phơi chân pin `notes` trên Canvas để người dùng truyền chỉ dẫn vật liệu đặc biệt (ví dụ: *"đồ lót cotton, chất liệu ren mỏng"*).
- **GameplayTags Awareness (`tags_ini_path`)**: Tự động đọc danh sách tags hợp lệ từ `Config/DefaultGameplayTags.ini` để AI gán chính xác `System.Wardrobe.Slots.*` thay vì đoán mò.

### 7.3. Đăng ký DataAsset trong Unreal Engine (`register_wardrobe_data_assets.py`)
- **Thay thế hoàn toàn DataTable**: Sử dụng trực tiếp kiến trúc `PrimaryDataAsset` + `GameplayTags` của Unreal Engine 5:
  - Schema: `/Game/Systems/Wardrobe/Schemas/PDA_WardrobeItem`
  - Profile Schema: `/Game/Systems/Characters/Schemas/PDA_CharacterProfile`
- **Tự động đồng bộ GameplayTags**:
  - Quét danh sách tags cần thiết (`Character.Eva`, `System.Wardrobe.Slots.*`, `Character.Eva.Outfits.*`).
  - Tự động bổ sung dòng `+GameplayTagList=(Tag="...",DevComment="")` vào `Config/DefaultGameplayTags.ini` nếu chưa có.
  - Vận hành idempotent 100% (không bao giờ sinh dòng trùng lặp).
- **Tạo và liên kết DataAssets**:
  - `PDA_WardrobeItem`: Gán `CharacterTag`, `SlotTag`, `ItemTag`, và `ItemMesh` (SoftObjectPtr).
  - `PDA_CharacterProfile`: Tự động nạp `ItemTag` mới vào mảng `IntialItems` và gán `BodyMesh` nếu phát hiện mesh thân nhân vật (`cloth_type == "Body"`).
- **Hỗ trợ Dry-Run**: Cho phép kiểm thử hoàn chỉnh trên Worker bên ngoài UE5 mà không gây lỗi import `unreal`. Dọn đường chuẩn bị cho Cây Điểm Neo (**`BL-031`**).

---

## 8. Mental Model Cốt Lõi: Contract-Driven Semantic Bridge (Blender DCC <-> Unreal Engine 5)

> **Cập nhật 03/11/2026**: Giải quyết triệt để sự cố vật liệu nhân vật / modular outfit bị đen hoặc trơn vàng mặc định khi vào Unreal Engine.

### 8.1. Bản chất hai "ốc đảo" & Cầu nối Ngữ nghĩa (Semantic Bridge)
1. **Ốc đảo 1: Blender DCC Metadata (Nguyên liệu thô thực tế)**
   - Lưu trữ tại bảng `ResourceVersions.Metadata` (từ bước Inspect FBX / Blender).
   - Chứa chính xác danh sách các slot vật liệu và các kết nối thực tế:
     - `path`: Đường dẫn vật lý đến file texture (`.../outfits/Laura_Casual1/../textures/Normal.png`).
     - `target_socket`: Cổng socket trong shader node Blender (`Principled BSDF.Base Color`, `Principled BSDF.Normal`, `Principled BSDF.Alpha`, `Principled BSDF.Roughness`, v.v.).
     - `via_node`: Node chuyển tiếp (ví dụ `Normal Map`, `Direct`).
     - `colorspace`: Không gian màu thực tế (`sRGB`, `Non-Color`).
2. **Ốc đảo 2: Unreal Engine Game Contracts (Đề bài chân lý của Game)**
   - Quét trực tiếp từ Master Materials trong dự án game (`M_Master_Cloth`, `M_Master_Hair`, `M_Master_Skin`, `M_Master_Eye`).
   - Định nghĩa chính xác tên tham số shader mà Material Instance cần ghi đè (`BaseColorMap`, `NormalMap`, `ORMMap`, `OpacityMap`, v.v.) kèm yêu cầu Virtual Texture (`vt`) và nén (`TC_NORMALMAP`, `TC_MASKS`, `TC_GRAYSCALE`).
3. **Cầu nối AI (`classify_character_manifest.py`)**:
   - AI đóng vai trò là "người giải đề": nhận đề bài (Game Contracts) và nguyên liệu thô (Blender Inspection Metadata).
   - Nhờ luật **Deterministic Texture Binding Rule**, AI biết chính xác:
     - `Principled BSDF.Base Color` / `Color` $\rightarrow$ gán vào `BaseColorMap`.
     - `Principled BSDF.Normal` / via `Normal Map` $\rightarrow$ gán vào `NormalMap`.
     - `Principled BSDF.Alpha` $\rightarrow$ gán vào `OpacityMap`.
     - `Principled BSDF.Metallic` / `Roughness` $\rightarrow$ gán vào `ORMMap`.
   - Kết hợp đối chiếu ngược (Deterministic Fallback Reconciliation): Nếu AI bỏ sót bất kỳ texture nào từ `texture_bindings`, hệ thống tự động bù đắp 100%, đảm bảo không bao giờ có Material Instance bị rỗng texture.
4. **Bộ máy Ingestion Unreal (`import_character_wardrobe.py`)**:
   - Chuẩn hóa đường dẫn file với `os.path.normpath()`, giải quyết các bước nhảy thư mục cha (`../textures/`).
   - Tự động map tên parameter linh hoạt theo hợp đồng Master Material.
   - Thiết lập chuẩn xác nén ảnh và sRGB (`srgb=False` cho Normal, Opacity/Alpha, ORM/Roughness để tránh sai lệch kênh tuyến tính).
   - Override tham số trên `MaterialInstanceConstant` và liên kết trực tiếp vào Skeletal Mesh (`SKM_*`).




### 8.2. Quy chuẩn Đồng bộ GameplayTags (`FGameplayTag` Dictionary Validation)
1. **Bản chất `FGameplayTag` trong Unreal Engine**:
   - `FGameplayTag` không phải string tự do. Nó là struct ánh xạ vào từ điển tập trung `UGameplayTagsManager`.
   - Nếu tag chưa được đăng ký trong cấu hình dự án, Unreal sẽ coi là invalid và tự động đưa về `FGameplayTag::EmptyTag` (`None` trên UI).
2. **Quy chuẩn ghi Section trong `Config/DefaultGameplayTags.ini`**:
   - Section hợp lệ duy nhất trong Unreal Engine 5 là `[/Script/GameplayTags.GameplayTagsSettings]`.
   - Tuyệt đối không dùng section cũ `[/Script/GameplayTags.GameplayTagsList]`.
3. **Danh mục Phân loại Slot chuẩn (`System.Wardrobe.Slots.*`)**:
   - Các slot tag phải khớp với danh mục được cấp phép (`Categories = "System.Wardrobe.Slots"`): `Top`, `Bottom`, `Dress`, `OnePiece`, `Inner_Top`, `Inner_Bottom`, `Hair`, `Shoes`, `Socks`, `Gloves`, `Hat`, `Eyebrows`, `Body`.
   - Script AI `classify_character_manifest.py` luôn sử dụng danh mục slot hợp lệ này, tránh tự ý sinh tag không có trong từ điển.
4. **Khởi tạo và Gán Tag trong Unreal Python**:
   - Khởi tạo qua `unreal.GameplayTag(tag_name=unreal.Name(tag_str))` hoặc `tag.import_text(tag_str)`.
   - Script kiểm tra read-back (`da_asset.get_editor_property()`) để cảnh báo tức thì nếu tag bị Unreal reject thành `None`.


### 8.3. Mental Model Head vs Body Baking & Channel Packing Optimization
1. **Head vs Body Baking**:
   - **Head (Khuôn mặt, tai, cổ)**: Giữ nguyên Texture gốc của DAZ, cắm trực tiếp vào shader `M_Skin_Head` trong Unreal Engine. Tuyệt đối không re-bake để bảo toàn độ nét cận cảnh (Texel Density) và tránh lỗi lệch viền cổ (Neck Seam).
   - **Body (Torso, Arms, Legs, Nails)**: Gom UV và bake (BaseColor, Normal, Roughness) thành 1 bộ map `Body_*` thống nhất để giảm Draw Call (từ 4-5 material slots xuống còn 1).
2. **Channel Packing (`pack_mode`) Mặc định**:
   - `bake_mesh.py` mặc định `pack_mode = "none"` để chỉ xuất các map độc lập (`*_BaseColor.png`, `*_Roughness.png`, `*_Normal.png`), không tự tiện sinh ra file `*_ORM.png` rác khi dự án game không dùng ORM.
   - `import_character_wardrobe.py`: Phân biệt rành mạch giữa kênh đơn sắc `Roughness` và texture 3 kênh `ORM`, ưu tiên match đúng parameter rời (`Skin_Roughness`, `Cloth_Roughness`) để vật liệu trong Unreal không bị sai lệch kênh ánh sáng.
