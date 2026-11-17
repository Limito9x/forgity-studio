# Architecture Decision Record (ADR): Unified Cloud Data Pool & Template Container Reference Layer

- **Mã tài liệu**: ADR-010
- **Trạng thái**: `Accepted` (Phase 0 đã triển khai)
- **Ngày quyết định**: 2026-11-17
- **Phạm vi**: `crates/forgity-core/` (dependency scanner), `app/src-tauri/` (command), định hướng `api/` cho Phase 1/2.
- **Kế thừa & Mở rộng**: [ADR-006](file:///d:/FullStack/Automation/docs/adr/ADR-006-local-first-script-authoring-and-ephemeral-draft-lifecycle.md), [ADR-007](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md), [BL-057](file:///d:/FullStack/Automation/.agents/plans/2026-11-17-bl-057-unified-cloud-data-pool-and-template-container-reference.md)

> Ghi chú số hiệu: ADR-009 đã được dùng cho `ADR-009-removal-of-repository-and-tag-modules.md`, nên quyết định này mang số **ADR-010**.

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Luồng publish template có 3 đứt gãy:

1. **Phát hiện phụ thuộc nằm ở Frontend bằng regex** (`TemplateContainerBuilder.tsx` quét `.py` + `constants.X`): bỏ sót component lồng, asset; kết quả không tái sử dụng được cho local run hay cloud ingest.
2. **Cloud data bị ràng buộc Project** (`CloudPipeline.ProjectId` bắt buộc, ingest dùng `Guid.Empty` để "vô chủ") và script artifact gắn cứng 1 `PipelineVersionId` (ingest gán bừa vào version đầu tiên) ⇒ `AcquireTemplateScript` trả 404 với hầu hết version.
3. **Container chỉ nhét ID vào `ContainerManifestJson`**, không validate quyền sở hữu/tồn tại, không cộng size, update ghi đè; asset nhập tay bằng `prompt()` với `sizeBytes` giả.

Bảng `local_dependencies` đã có sẵn trong `workspace.db` nhưng **chưa từng có INSERT**, nên chưa có nguồn sự thật nào cho đồ thị phụ thuộc.

Thêm vào đó, sau ADR-007, **SQLite snapshot là nguồn dữ liệu chính** của pipeline khi chạy local. YAML chỉ là bản draft xuất ra đĩa, có thể trễ hơn canvas. Vì vậy scanner phải lấy **snapshot làm canonical graph**, không phải YAML.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **A — Tiếp tục quét regex ở Frontend rồi gửi danh sách ID lên Cloud**
   - Không phát hiện component lồng/asset; UI và Cloud có hai nguồn sự thật; sai lệch không có diagnostics.
2. **B — Quét YAML bằng Rust, không persist**
   - Đọc phải bản draft có thể cũ hơn canvas; mỗi lần mở Builder phải quét lại; Cloud ingest vẫn không có dữ liệu chuẩn hóa.
3. **C — Rust Scanner đọc snapshot SQLite (canonical) + đối chiếu YAML read-only, persist `local_dependencies` (được chọn)**
   - Một nguồn quét duy nhất cho preview UI (Phase 3) và ingest Cloud (Phase 1).
   - Snapshot là trạng thái thật của canvas; YAML chỉ dùng để đối chiếu canonical hash và bổ sung `metadata.sourcePath`.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Scanner đặt trong `forgity-core`, không đặt trong Tauri command

- Module `crates/forgity-core/src/template_manifest.rs` chứa toàn bộ thuật toán; Tauri chỉ là adapter mỏng (`scan_template_dependencies`).
- Runner/CLI/Phase 1 ingest dùng lại được mà không phụ thuộc Tauri.

### 3.2. Snapshot là canonical graph, YAML là bản đối chiếu read-only

| Tình huống | Hành vi |
| :--- | :--- |
| Snapshot parse được, `nodes` không rỗng | Dùng snapshot; `graphSource = "snapshot"` |
| Snapshot + YAML cùng tồn tại, hash khác nhau | Dùng snapshot + `warning: GRAPH_DIVERGED` |
| Snapshot hỏng/rỗng | Fallback YAML + `warning: SNAPSHOT_PARSE_FAILED` |
| Chưa có snapshot | Dùng YAML + `info: SNAPSHOT_MISSING` |
| Snapshot dùng được nhưng YAML lỗi/không có | Dùng snapshot + `warning: YAML_PARSE_FAILED` |
| Cả hai đều hỏng | `error: INVALID_PIPELINE_YAML`, bỏ pipeline |

Redline: **không ghi, không touch mtime bất kỳ file `.yaml` nào**.

### 3.3. Canonical graph + `graphHash`

Node canonical:
- `id`, `refId` (`tool` | `refId`), `parentId` (`stage` | `parentId`).
- `config` = `inputs` (YAML) hoặc `configValues` (snapshot) **sau khi bỏ** `_isBatch/_maxConcurrency/_iterablePin/_skipOnError`.
- Batch flags chuẩn hóa thành `isBatch`, `maxConcurrency`, `iterablePin`, `skipOnError`.

Edge canonical:
- YAML: `from`/`to` dạng `"id.pin"`.
- Snapshot: `sourceNodeId/sourcePin → targetNodeId/targetPin`; thiếu pin ⇒ `out`/`in`.
- Thiếu pin trong YAML ⇒ `out`/`in`.

Bỏ khỏi hash: `label`, `category`, `executor`, `position`, `size`, `metadata`, `name`, `parameters`.

`graphHash` = SHA-256 của JSON canonical đã sort node/edge/config key. **Hash trước khi expand `${CONSTANT}`** để việc đổi giá trị constant không làm graph "diverged" giả.

### 3.4. Phân loại tham chiếu bằng prefix, tuyệt đối không regex

| Prefix | Loại | Kiểm tra |
| :--- | :--- | :--- |
| `local:component:<slug>` | Component Pipe | `discover_component_pipelines()` + BFS đệ quy |
| `local:constant:<KEY>` | Constant | `contracts.yaml` + `local_constants` |
| `local:<scriptKey>` | Script | `local_scripts` (palette) |
| Khác (`Start`, `Return`, `Sequence`, `Joint`, …) | Builtin | Bỏ qua |

Node ref đọc theo thứ tự `refId` → `tool` (snapshot) / `tool` → `refId` (YAML).

### 3.5. Asset chỉ nhận path khai báo tường minh

- Quét `config` đệ quy + `metadata.sourcePath` (đọc bù từ YAML nếu snapshot không giữ).
- Loại path chứa `${...}` (`DEFERRED_PATH`), path cấu hình `.yaml/.yml/.json`, và path trùng `fullPath` của script **được tham chiếu**.
- Canonicalize rồi **strip prefix verbatim `\\?\`** của cả root và asset trước khi so khớp, nếu không mọi asset trên Windows sẽ bị coi là `PATH_ESCAPE`.
- Hash SHA-256 streaming (buffer 64 KiB); file > 64 MiB ⇒ `hash = ""` (không thêm field trạng thái).
- Dedupe theo `relativePath` lowercase trên Windows; file trong root nhưng không tồn tại ⇒ `MISSING_ASSET`.

### 3.6. Persist theo cơ chế replace-per-parent

- `WorkspaceDb::replace_dependencies(parents, rows)` chạy trong `unchecked_transaction()`: `DELETE` theo từng parent rồi `INSERT OR IGNORE`.
- `dep_kind ∈ {component, script, constant, asset}` (không có `struct`).
- Chỉ persist khi `<root>/.forgity/` tồn tại; ngược lại `persisted = false` + `info: WORKSPACE_NOT_INITIALIZED`.
- Lỗi DB ⇒ `error: PERSIST_FAILED` nhưng manifest vẫn trả về.

### 3.7. Diagnostics thay vì im lặng

Error: `INVALID_PIPELINE_YAML`, `DANGLING_SCRIPT`, `MISSING_COMPONENT`, `DUPLICATE_PIPELINE_SLUG`, `PATH_ESCAPE`, `PERSIST_FAILED`.

Warning: `GRAPH_DIVERGED`, `SNAPSHOT_PARSE_FAILED`, `YAML_PARSE_FAILED`, `UNDEFINED_CONSTANT`, `DANGLING_CONSTANT_REF`, `MISSING_ASSET`, `EMPTY_SOURCE_CODE`, `INVALID_NODE_TOOL`, `PALETTE_EMPTY`, `CYCLIC_COMPONENT`.

Info: `SNAPSHOT_MISSING`, `DEFERRED_PATH`, `WORKSPACE_NOT_INITIALIZED`.

### 3.8. Hệ quả cho Phase 1/2 (chưa triển khai trong ADR này)

- `POST cloud-data/manifest/ingest` nhận chính manifest này (DTO C# tương ứng) để tạo/cập nhật Cloud Data Pool phẳng, idempotent theo hash.
- Container chỉ **trỏ** tới các `PipelineVersionId` đã ingest; manifest container là snapshot bất biến khi publish.

---

## 4. Hệ Quả (Consequences)

**Tích cực**

- Một nguồn sự thật duy nhất cho phụ thuộc template; xóa bỏ regex đoán ở Frontend.
- Quét đúng cả khi canvas **chưa Save Draft** (snapshot mới hơn YAML), có `GRAPH_DIVERGED` cảnh báo.
- `local_dependencies` cuối cùng có dữ liệu, phục vụ dọn rác/xóa pipeline và hiển thị cây phụ thuộc.
- Diagnostics hiển thị được ref gãy thay vì publish im lặng.

**Đánh đổi**

- Scanner phải hash file thật (giới hạn 64 MiB/asset để tránh chậm).
- Manifest chứa `sourceCode` nên payload lớn hơn danh sách ID; chấp nhận được vì đây là payload ingest một lần (Phase 1), preview UI có thể bỏ qua trường này.
- Canonical hash phụ thuộc vào việc snapshot và YAML serialize config giống nhau về kiểu; khác biệt kiểu (ví dụ số vs chuỗi) sẽ báo `GRAPH_DIVERGED` (đúng ý nghĩa cảnh báo).

---

## 5. Kiểm Chứng (Verification)

| Hạng mục | Kết quả |
| :--- | :--- |
| `cargo test -p forgity-core` | 20 unit test + 10 integration test xanh |
| `cargo check --manifest-path app/src-tauri/Cargo.toml` | Xanh, không warning |
| Workspace thật `pipelines/master/daz_to_unreal.pipeline.yaml` | `masterCount=1`, `componentCount=4`, `scriptCount=11` (source không rỗng), `assetCount=3` (hash thật, dedupe `BlenderUE5_8.py`), `constantCount=10`, `errorCount=0`, `warningCount=0`, tất cả `graphSource=snapshot` |
| Idempotency | Chạy scan 2 lần ⇒ số row `local_dependencies` không đổi |
| Determinism | Cùng graph từ YAML/snapshot (khác label/toạ độ/thứ tự key) ⇒ cùng `graphHash` |
| Không mutate | Nội dung + mtime `.yaml` không đổi sau scan |

---

## 6. Redlines

1. Không dùng regex để nhận diện ref/dependency — chỉ prefix parsing.
2. Không mutate palette, contracts, pipeline YAML — chỉ ghi `local_dependencies`.
3. Không trả absolute path của asset ra ngoài (chỉ `relativePath`).
4. Không `ALTER TABLE`/thêm cột vào `workspace.db`.
5. Không tạo reference module `Files/API` từ Rust core.
