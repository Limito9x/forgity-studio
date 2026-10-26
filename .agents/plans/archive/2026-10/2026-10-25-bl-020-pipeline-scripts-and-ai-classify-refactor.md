# Kế Hoạch Kỹ Thuật: Tinh Gọn Pipeline Scripts (Inspect, Export FBX, AI Classify) & Tích Hợp AI Mesh Role Classifier

- **Mã kế hoạch**: `BL-020`
- **Ngày lập**: 25/10/2026
- **Trạng thái**: `Completed *(25/10/2026)*`
- **Phạm vi tác động**: 
  - Pipeline Scripts: 
    - `workers/pipelines/ai/classify_mesh_types.py` (Mới: Phân tích vai trò Mesh & Cloth Type ở khâu đầu; fail-fast raise RuntimeError).
    - `workers/pipelines/ai/classify_material_manifest.py` (Tinh gọn pins, generic AI key, kế thừa cloth_type, fail-fast raise RuntimeError).
    - `workers/pipelines/inspectors/blender/inspect_unified_mesh.py` (FullPath cho textures).
    - `workers/pipelines/inspectors/blender/inspect_separated_meshes.py` (FullPath cho textures, nhận cloth_map, sinh export_map).
    - `workers/pipelines/blender/export_fbx.py` (Bỏ root_folder, chuẩn hóa key FullPath).
  - Schema Parsers & Tests: `api/tests/Automation.Pipeline.Tests/PythonScriptSchemaParserTests.cs`, toàn bộ 216 unit tests.
  - Sổ bộ Backlog: `BACKLOG.md`.

---

## 1. Bối Cảnh & Vấn Đề Cần Giải Quyết

1. **Rườm rà Relative Path & Folder Path trung gian**:
   - Khi chạy trên máy trạm (Workstation), các tài nguyên (mesh, texture) luôn có đường dẫn vật lý đầy đủ (`FullPath`).
   - Hai script inspect (`inspect_unified_mesh.py`, `inspect_separated_meshes.py`) hiện đang cố chuyển `abs_path` thành `rel_path` tương đối so với thư mục file `.blend`.
   - Hệ quả: Node downstream như `classify_material_manifest.py` phải nhận thêm chân pin `folder_path` để ghép ngược lại thành absolute path. Điều này làm rối Canvas và dễ gãy nếu artist tổ chức cây thư mục khác nhau.
2. **`export_fbx.py` ôm đồm tính toán `root_folder`**:
   - Script `export_fbx.py` có tham số `root_folder` để sinh 3 loại key (`rel_path`, `full_path`, `file_name`) trong `metadata_update_map`.
   - Với kiến trúc mới ở `BL-017` / `BL-018`, `UpdateResourceMetadataTool` đã nhận trực tiếp `Workstation` và tìm kiếm chuẩn xác theo `FullPath`, do đó tham số `root_folder` và logic đoán relative path trong script là hoàn toàn thừa thãi.
3. **`classify_material_manifest.py` lộ API Key & thiếu sự phân tách với vai trò Mesh**:
   - Chân pin `api_key` không nên xuất hiện trên Canvas (gây rủi ro bảo mật và bắt người dùng nhập tay).
   - Hàm đọc key hiện đang hardcode kiểm tra `GEMINI_API_KEY` và `OPENAI_API_KEY`. Cần mở rộng sang cơ chế **Generic AI Key** (ví dụ `AI_API_KEY`, `LLM_API_KEY`, hoặc `{PROVIDER}_API_KEY` bất kỳ như `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`).
   - Cần phân định 2 bài toán riêng biệt:
     - **Khâu 1 (Mesh Role / Cloth Type)**: Biết đâu là `body_mesh` để Bake, đâu là quần áo thuộc `cloth_type` gì (`Top`, `Bottom`...) để Batch Export FBX.
     - **Khâu 2 (Shader / Material Textures)**: Phân tích texture map nào cắm vào shader parameter nào (`BaseColorMap`, `NormalMap`...).
4. **Quy tắc Fail-Fast tuyệt đối cho AI Tools (Không fallback, không hardcode detect)**:
   - Nếu đã giao nhiệm vụ cho AI, script phải làm đúng nhiệm vụ phân tích ngữ nghĩa bằng LLM.
   - Tuyệt đối không fallback regex hay heuristic đoán mò, không nuốt lỗi hay trả về rỗng im lặng.
   - Nếu thiếu thư viện `openai`, thiếu API Key, hoặc LLM API fail thì `raise RuntimeError` trực tiếp để pipeline runner bắt được và dừng luồng ngay tại chỗ.

---

## 2. Mục Tiêu Tinh Gọn & Thiết Kế Kiến Trúc Mới

### A. Công Cụ Mới: `classify_mesh_types.py` (Early Mesh & Cloth Discovery)
- **Vị trí**: `workers/pipelines/ai/classify_mesh_types.py` (Chạy bằng Python executor thông thường trên runner).
- **Đầu vào (Inputs)**:
  - `raw_metadata`: Cây JSON metadata thô (từ `daz_inspector`, Blender inspect, hoặc danh sách tên mesh).
  - `contracts` (Optional): Danh sách Appearance Slots của dự án (ví dụ `["Top", "Bottom", "Shoes", "Underwear", "Hair", "Body"]`).
  - `provider`: Mặc định `"gemini"`.
  - `model`: Mặc định `"gemini-2.5-flash"`.
- **Đầu ra (Outputs)**:
  - `body_mesh`: Tên mesh cơ thể chính (nếu có, cắm thẳng vào node Bake Mesh).
  - `cloth_map`: Dictionary ánh xạ `{ "Mesh_Name": "Cloth_Type" }`.
  - `clothes`: Danh sách tên các mesh trang phục.
  - `hair_meshes`: Danh sách tên các mesh tóc/râu.
- **Tác vụ**:
  - Tốn cực ít token (~50-100 token), phản hồi ~300ms, sử dụng Structured JSON Output.
  - Cung cấp dữ liệu định danh sớm cho khâu Bake Mesh và Batch Export FBX trong Blender.
  - Fail-fast: `raise RuntimeError` khi thiếu thư viện, thiếu key hoặc gọi LLM thất bại.

### B. Inspect Scripts (`inspect_unified_mesh.py` & `inspect_separated_meshes.py`)
- Trong hàm `extract_material_textures`:
  - Trả về trực tiếp danh sách `abs_path` (chuẩn hóa dấu gạch chéo `/`).
  - Loại bỏ hoàn toàn logic ép sang `rel_path`.
- **Nâng cấp đặc biệt cho `inspect_separated_meshes.py`**:
  - Hỗ trợ nhận `cloth_map` (hoặc `target_objects` dạng dictionary):
    - Tự động dùng keys của `cloth_map` làm danh sách mesh cần inspect.
    - Gói sẵn `cloth_type` và `asset_name` vào metadata của từng object trong `objects`.
    - Tự động sinh `export_map` (`{ "Mesh_Name": "{cloth_type}.fbx" }`) để cấp thẳng cho `batch_export_fbx`.
- Cấu trúc `manifest`:
  - Mỗi slot chứa danh sách `textures: ["D:/Repo/Characters/Eva/Textures/T_Body_D.png", ...]`.
  - Giữ nguyên mock fallback cho môi trường test bên ngoài Blender.

### C. Export FBX Script (`export_fbx.py`)
- Bỏ tham số `root_folder` khỏi chữ ký `def main(...)` để Canvas không sinh pin thừa.
- Chuẩn hóa `metadata_update_map`: sử dụng `clean_output` (FullPath tuyệt đối) làm key duy nhất.
- Đảm bảo `exported_fbx_path` và `exported_files` trả về danh sách FullPath sạch sẽ.

### D. AI Classify Material Manifest (`classify_material_manifest.py`)
- **Tinh gọn chữ ký `main(...)`**:
  ```python
  def main(
      raw_manifest: Union[Dict[str, Any], str],
      contracts: Optional[Union[Dict[str, Any], str]] = None,
      cloth_map: Optional[Union[Dict[str, str], str]] = None,
      provider: str = "gemini",
      model: str = "gemini-2.5-flash",
      **kwargs
  ) -> Dict[str, Any]:
  ```
  - Bỏ `folder_path` khỏi tham số của `main`: Canvas không còn pin `folder_path`.
  - Không khai báo `api_key` trong tham số `main`: Canvas không sinh pin `api_key`.
  - Nhận thêm `cloth_map` (từ Khâu 1) hoặc kế thừa `cloth_type` đã có trong `raw_manifest`.
- **Hệ thống phân giải Generic AI Key (`resolve_api_key`)**:
  - Ưu tiên 1: Provider-specific: `f"{provider.upper()}_API_KEY"` (e.g. `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`).
  - Ưu tiên 2: Generic AI Keys: `AI_API_KEY`, `LLM_API_KEY`, `FORGITY_AI_KEY`.
  - Ưu tiên 3: Đọc từ bảng `[env]` trong `runner.toml` (`%LOCALAPPDATA%\Forgity\runner.toml` hoặc `./runner.toml`).
  - Hỗ trợ chạy local không cần key nếu là `ollama` hoặc endpoint localhost.
- **Fail-fast**: `raise RuntimeError` nếu thiếu thư viện, thiếu key hoặc gọi LLM thất bại.
- **Xử lý Textures & Làm Giàu Manifest**:
  - Do `raw_manifest` từ upstream đã là `FullPath`, bỏ các đoạn code chắp nối `folder_path + file_path` và `folder_path + tex_p_str`.
  - Gán chuẩn xác `cloth_type` từ `cloth_map` vào từng object trong manifest cuối cùng, giúp `register_appearance_datatable.py` của Unreal Engine đọc được ngay mà không cần đoán mò.

---

## 3. Các Bước Triển Khai (Execution Phases)

- [x] **Phase 1: Tạo công cụ `classify_mesh_types.py` (Early Mesh & Cloth Discovery)**
  - Viết script `workers/pipelines/ai/classify_mesh_types.py`.
  - Hỗ trợ phân tích `body_mesh`, `cloth_map`, `clothes`, `hair_meshes`.
  - Tích hợp hàm giải quyết generic AI key `resolve_api_key`.
  - Fail-fast không dùng fallback heuristic regex, `raise RuntimeError` trực tiếp.
- [x] **Phase 2: Cập nhật 2 script Inspect của Blender**
  - Chỉnh sửa `workers/pipelines/inspectors/blender/inspect_unified_mesh.py` xuất `abs_path` cho textures.
  - Chỉnh sửa `workers/pipelines/inspectors/blender/inspect_separated_meshes.py` xuất `abs_path` cho textures.
  - Nâng cấp `inspect_separated_meshes.py` hỗ trợ nhận `cloth_map` (hoặc `target_objects` dạng map), gắn sẵn `cloth_type` vào metadata của từng object và sinh `export_map` cho batch export FBX.
- [x] **Phase 3: Cập nhật script `export_fbx.py`**
  - Loại bỏ `root_folder` khỏi chữ ký hàm `main(...)`.
  - Chuẩn hóa `metadata_update_map` với key là `clean_output` (FullPath).
- [x] **Phase 4: Tinh gọn và Generic hóa `classify_material_manifest.py`**
  - Nâng cấp `resolve_api_key` hỗ trợ danh sách generic env keys và provider-dynamic keys.
  - Loại bỏ `folder_path` và `api_key` khỏi chữ ký hàm `main(...)`.
  - Nhận `cloth_map` và kế thừa `cloth_type` để làm giàu manifest cho Unreal Engine.
  - Bỏ nối chuỗi `folder_path`, chuyển toàn bộ sang fail-fast `raise RuntimeError`.
- [x] **Phase 5: Kiểm thử và xác thực hệ thống**
  - Chạy `dotnet test` cho `PythonScriptSchemaParserTests` để đảm bảo AST pin scanner nhận đúng schema mới của cả các script cũ lẫn script mới.
  - Chạy toàn bộ 216 unit tests của `Automation.Pipeline.Tests` (Passed 216/216).
  - Chạy `pnpm tsc --noEmit` ở `web/` (Pass không có lỗi).
- [x] **Phase 6: Cập nhật tài liệu & Sổ bộ Backlog**
  - Đánh dấu hoàn thành kế hoạch `BL-020`.
  - Cập nhật chi tiết trong `BACKLOG.md`.
