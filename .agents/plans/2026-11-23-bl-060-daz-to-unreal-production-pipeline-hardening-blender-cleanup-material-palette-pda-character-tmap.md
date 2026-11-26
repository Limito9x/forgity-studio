# BL-060: DAZ-to-Unreal Production Pipeline Hardening (Blender Cleanup, Material Palette & PDA Character TMap)

- **Mã Backlog:** `BL-060`
- **Ngày tạo:** `2026-11-23`
- **Trạng thái:** `In Progress` *(Phase 1 đã hoàn thành)*
- **Phạm vi (Scope):** `pipeline-scripts/blender/`, `pipeline-scripts/ai/`, `pipeline-scripts/unreal/`, Unreal Starter Template Content

---

## 1. Bối Cảnh & Mục Tiêu

Nền tảng Forgity Studio Desktop (Tauri, SQLite, Two-Tier Component/Master Pipeline, Resident Warm DCC, Unified Cloud Data Pool) đã ổn định. Giai đoạn này tập trung **gia cố chất lượng script nghiệp vụ DAZ → Blender → Unreal Engine 5** để đạt độ tin cậy cao khi publish cho người dùng thật:

- **Tốc độ & Batching:** Loại bỏ vòng lặp tuần tự chậm chạp trong Unreal import và Cycles bake.
- **Chống sập do LLM:** Tự xử lý deterministically các lỗi nhỏ của AI classifier thay vì crash cả batch.
- **Xử lý triệt để các "bẫy" kinh điển của DAZ3D:** Mesh ẩn/xí ngầu (dForce/Rigid helper), Emitter Cap trắng tinh của tóc, tóc tách nhiều mảnh (`Base` + `Ponytail`), và đồ cứng (`Glasses`, `Earring`…) không ăn `SetLeaderPoseComponent`.
- **Chuẩn hóa Palette & Schema phía Unreal:** Đủ Master Material cốt lõi (`M_Glass`, `M_PBR_Prop` cho nhựa/kim loại) và tự động điền `TMap` (`SlotTag → MaterialSlot`) trên `PDA_Character` khi Body có quần áo mặc định.

---

## 2. Giới Hạn Phạm Vi (In-Scope / Out-of-Scope)

- **In-Scope:**
  - Bộ script trong `pipeline-scripts/blender/` (`inspect_scene.py`, `prepare_wardrobe.py`, `bake_mesh.py`).
  - Bộ script AI & Unreal (`classify_character_manifest.py`, `inspect_game_contracts.py`, `import_character_wardrobe.py`, `setup_starter_template.py`).
  - Quy chuẩn Master Material Library & DataAsset schema trong Unreal Project Template.
- **Out-of-Scope:**
  - Không thay đổi kiến trúc Rust Runner, Tauri Desktop, hay Backend API (ADR-011).
  - Không thêm cờ/pin thừa vụn vặt vào các script (tuân thủ nghiêm Pin Hygiene Rule).

---

## 3. Lộ Trình Triển Khai Theo Phase

### Phase 1: Core Performance, Multi-Character & LLM Resilience *(✅ Đã hoàn thành)*
- [x] **[classify_character_manifest.py](file:///d:/FullStack/Automation/pipeline-scripts/ai/classify_character_manifest.py):**
  - Hỗ trợ phân loại **multi-character** trong cùng 1 batch (`group_entries_by_character`), gọi LLM song song qua `ThreadPoolExecutor`.
  - Tự xử lý an toàn các lỗi vặt LLM: chấp nhận GameplayTag mới hợp lệ cú pháp (để Unreal tự đăng ký vào `DefaultGameplayTags.ini`), bỏ qua parameter/property thừa không tồn tại trên Master Material/Schema kèm warning.
- [x] **[import_character_wardrobe.py](file:///d:/FullStack/Automation/pipeline-scripts/unreal/import_character_wardrobe.py):**
  - Refactor từ tuần tự sang **6 pha quét ngang (Phase-by-Phase Batching)**: Tags (1 pass) → Body FBX (1 `import_asset_tasks`) → Wardrobe FBX (1 `import_asset_tasks`) → Textures & Thumbnails (1 `import_asset_tasks`, deduped) → MI/Slots/DA (cache MasterMaterial & Schema UClass, bỏ save lẻ) → 1 lần `save_loaded_assets`.
  - Fix lỗi UE 5.5+ không tạo PhysicsAsset cho Body bằng cách tạm tắt `Interchange.FeatureFlags.Import.FBX 0` trong lúc `import_asset_tasks` (restore trong `finally`) và gom toàn bộ `imported_object_paths` vào `dirty_assets`.
- [x] **[bake_mesh.py](file:///d:/FullStack/Automation/pipeline-scripts/blender/bake_mesh.py):**
  - Bật `use_persistent_data`, tắt `use_auto_tile`, hạ `margin = 16`, tạm ẩn `hide_render = True` mọi object khác khi bake.
  - Gộp multi-target bake pass (`bake_channel_multi`) → `head_and_body` chỉ còn 3 pass Cycles thay vì 6.
  - Thay `img.pixels[:]` + `.tolist()` bằng `foreach_get` / `foreach_set` NumPy buffer; lưu PNG `compression = 0`, `RGB`.

---

### Phase 2: Unreal Foundation ("Lót Đường" Palette & PDA Schema) *(Pending — User chuẩn bị bên Unreal)*
- [ ] **Hoàn thiện 6 Master Materials cốt lõi** trong Unreal Project Template:
  1. `M_Skin` *(Subsurface)* — Da người / mặt.
  2. `M_Eye` — Mắt / Cornea / Iris.
  3. `M_Hair` *(Masked)* — Tóc & Visual Scalp Cap (`BaseColor`, `Opacity`, `Normal`, `Roughness`).
  4. `M_Cloth` *(Opaque/Masked)* — Vải, quần áo, da, giày.
  5. `M_PBR_Prop` *(Opaque)* — Nhựa, kim loại, gọng kính, phụ kiện cứng (`BaseColor`, `Normal`, `Roughness`, `Metallic` + scalar fallback).
  6. `M_Glass` *(Translucent)* — Tròng kính râm, pha lê, kính trong suốt (`BaseColor`, `Opacity`, `Roughness`, `Refraction`).
  *(Có thể bổ sung hàm UE Python trong `setup_starter_template.py` để tự tạo sẵn `M_PBR_Prop` / `M_Glass` bằng `MaterialEditingLibrary` nếu cần).*
- [ ] **Chốt cấu trúc `TMap` trên `PDA_Character`:**
  - Xác định tên field, `key_type` (VD: `GameplayTag` — `SlotTag`) và `value_type` (VD: `Name` hoặc `Array<Name>` — Material Slot Index/Name cần ẩn trên Body khi mặc đồ).

---

### Phase 3: Blender DAZ Cleanup & Rigid Prop Rigging *(Pending)*
- [ ] **Lọc mesh ẩn & helper rác ([inspect_scene.py](file:///d:/FullStack/Automation/pipeline-scripts/blender/inspect_scene.py)):**
  - Loại bỏ tự động các mesh có `hide_viewport == True` hoặc `hide_render == True` từ DAZ (chặn mũ trắng bị ẩn mắt & helper hình xí ngầu/dForce proxy).
  - Lọc các mesh proxy không có UV / dạng gizmo ít đỉnh không mang dữ liệu hiển thị.
- [ ] **Gom cụm tóc & Xóa Emitter Cap ([inspect_scene.py](file:///d:/FullStack/Automation/pipeline-scripts/blender/inspect_scene.py), [prepare_wardrobe.py](file:///d:/FullStack/Automation/pipeline-scripts/blender/prepare_wardrobe.py)):**
  - Trong cùng 1 outfit scene, gom toàn bộ sub-mesh thuộc role `Hair` (VD: `Base` + `Ponytail` + `Bangs`) thành **1 item Hair duy nhất** trước khi `bpy.ops.object.join()`.
  - Trên mesh `Hair`, kiểm tra từng material slot `Cap/Scalp`:
    - Nếu `Alpha` không nối texture và `Alpha <= 0.05` (hoặc trắng tinh không texture) → **xóa polygon + slot** (Emitter Cap tàng hình của DAZ).
    - Nếu `Alpha` có nối texture → **giữ nguyên** (Visual Scalp Cap chuẩn game).
- [ ] **Auto-Weight 100% cho đồ cứng ([prepare_wardrobe.py](file:///d:/FullStack/Automation/pipeline-scripts/blender/prepare_wardrobe.py)):**
  - Phát hiện wearable không có vertex weights hoặc đang `parent_type == 'BONE'` (kính râm, khuyên tai, mũ cứng…).
  - Bake transform tương đối theo Body Armature, tạo vertex group theo `parent_bone` (hoặc xương gần nhất như `head`) với weight `1.0` cho toàn bộ vertices + gắn `Armature` modifier → sang Unreal dùng chung 1 luồng `SetLeaderPoseComponent` không cần Socket/StaticMesh riêng.

---

### Phase 4: Unreal + AI `TMap` Contract Ingestion *(Pending — sau Phase 2)*
- [ ] **[inspect_game_contracts.py](file:///d:/FullStack/Automation/pipeline-scripts/unreal/inspect_game_contracts.py):**
  - Mở rộng parser cho `ContainerType=Map` để xuất thêm `key_type` và `value_type` (không chỉ `container: "map"`).
- [ ] **[classify_character_manifest.py](file:///d:/FullStack/Automation/pipeline-scripts/ai/classify_character_manifest.py):**
  - Với item `Body`, cho phép AI điền các field `TMap` hợp lệ trên `PDA_Character` (ánh xạ `SlotTag → MaterialSlot` dựa trên đúng danh sách `slots` của Body trong manifest).
- [ ] **[import_character_wardrobe.py](file:///d:/FullStack/Automation/pipeline-scripts/unreal/import_character_wardrobe.py):**
  - Hỗ trợ ghi `TMap` (`GameplayTag → Name/String/Array`) vào `create_and_populate_data_asset()`, tự đăng ký mọi GameplayTag key qua `ensure_gameplay_tags()`.

---

## 4. Tiêu Chí Nghiệm Thu (Definition of Done)

1. Kéo đồng thời nhiều nhân vật (`Laura`, `Roxy`) + nhiều outfit vào 1 lần chạy → phân loại song song, import 6 pha, không crash vì tag mới hay parameter thừa.
2. Không còn mesh hình xí ngầu, không còn mũ trắng SkullCap lộ trên đầu, tóc đa mảnh gom gọn thành 1 `SKM_*` + 1 `DA_*`, kính/khuyên tai ăn `SetLeaderPoseComponent` 100%.
3. `PDA_Character` tự động có đủ ánh xạ `SlotTag → MaterialSlot` và các prop kính/nhựa/kim loại map đúng vào `M_Glass` / `M_PBR_Prop`.
4. Toàn bộ script pass `py_compile`, unit tests (`pipeline-scripts/tests/`), và publish lại lên Cloud Template sạch sẽ.
