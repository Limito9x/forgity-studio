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

### 3.3. Định dạng Normal Map (`normal_format` rõ nghĩa thay cho `flip_normal_y`)
- Trước đây cờ boolean `flip_normal_y` gây mơ hồ cho người dùng ("lật từ đâu sang đâu?").
- Đã chuyển thành Select Dropdown rõ nghĩa: **`normal_format`**:
  - **`"directx"`** *(Mặc định cho Unreal Engine 5)*: Tự động đảo kênh Green ($Y-$) qua NumPy. Khi đưa vào UE5, **không được tick thêm `Flip Green Channel` một lần nữa**.
  - **`"opengl"`**: Giữ nguyên chuẩn OpenGL ($Y+$) cho Unity, Blender, Maya.

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

