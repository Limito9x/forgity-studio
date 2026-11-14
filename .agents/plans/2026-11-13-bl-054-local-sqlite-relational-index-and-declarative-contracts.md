# Kế Hoạch Kỹ Thuật: Local SQLite Relational Index (`runner_state.db` & `workspace.db`), Declarative `contracts.yaml` & Auto-Scan Hydration (BL-054)

- **Mã Backlog**: `BL-054`
- **Ngày lập**: 13/11/2026
- **Trạng thái**: `Proposed / Pending Review`
- **Tài liệu kiến trúc nền tảng**: [ADR-007](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md), [BL-053](file:///d:/FullStack/Automation/.agents/plans/2026-11-12-bl-053-pipeline-engine-de-shackling-component-pipes-and-rust-dag-scheduler.md)
- **Phạm vi tác động**:
  - **Phase 1 (`runner/`)**: `runner/Cargo.toml`, `runner/src/storage/` (`db.rs`, `cache.rs`, `cleaner.rs`, `downloader.rs`, xóa `lock.rs`), `runner/src/core/python_packages.rs`
  - **Phase 2 (`web/src-tauri/` & `web/`)**: `web/src-tauri/Cargo.toml`, `web/src-tauri/src/commands/` (`workspace_db.rs`, `contracts.rs`, `workspace.rs`, `analyzer.rs`, `pipeline.rs`), `web/src/features/pipelines/hooks/workspace/`

---

## 1. Bảng Đối Chiếu Trước & Sau Thực Hiện (Before vs After Matrix)

| Hạng mục Kiến trúc | TRƯỚC (Hiện trạng & Điểm nghẽn) | SAU (Kiến trúc Chuẩn hóa theo ADR-007) |
| :--- | :--- | :--- |
| **1. Quản lý Cache & Lock tại Rust Runner (`runner/src/storage/`)** | - Dùng `.storage.lock` (`lock.rs`) thủ công.<br/>- `find_cached_asset` phải quét tuần tự toàn bộ thư mục `cache/assets/` (`read_dir` O(N)).<br/>- `cleaner.rs` dựa vào `mtime` của thư mục trên Windows (vốn không cập nhật khi đọc cache hit), dẫn đến xóa nhầm cache đang dùng thường xuyên. | - Tích hợp **SQLite WAL (`runner_state.db`)** qua `rusqlite` (`bundled`), xóa bỏ hoàn toàn `lock.rs` và `.storage.lock`.<br/>- Tra cứu `cached_assets`, `cached_scripts`, `cached_python_envs` qua Primary Key / Index trong `0.05ms` (O(1)).<br/>- Tự động cập nhật `last_accessed_at` và `hit_count` mỗi lần cache hit, giúp `forgity-runner clean` dọn rác chính xác theo LRU. |
| **2. Lưu trữ Catalog tại Local Workspace (`.forgity/*.json`)** | - Lưu rời rạc vào 3 file JSON: `.forgity/local_palette.json`, `local_structs.json`, `constants.json`.<br/>- Mỗi lần lưu phải serialize và ghi đè toàn bộ file.<br/>- Không có bảng quan hệ (Foreign Key / Dependencies) và không lưu `remote_id` / `published_hash` để phục vụ Publish trọn gói lên Cloud. | - Hợp nhất vào **SQLite WAL (`.forgity/workspace.db`)** gồm 5 bảng chuẩn hóa: `local_constants`, `local_structs`, `local_scripts`, `local_pipelines`, `local_dependencies`.<br/>- Có sẵn các cột `remote_id`, `content_hash`, `published_hash` khớp 1:1 với lộ trình Publish Bundle lên Server PostgreSQL. |
| **3. Tính Di Động (Portability) & Hỗ trợ CLI / AI MCP** | - `Structs` và `Constants` nằm khuất trong thư mục ẩn `.forgity/*.json` cùng với cache `local_palette.json`.<br/>- Khi đóng gói thư mục code sang máy khác hoặc cho AI đọc, thiếu một file hợp đồng khai báo chuẩn ở thư mục gốc. | - Chuẩn hóa 1 file khai báo **`contracts.yaml`** tại thư mục gốc Workspace chứa: `constants`, `structs`, và `script_overrides`.<br/>- `Node Palette` là dữ liệu phái sinh 100% trong SQLite: khi sang máy mới, chỉ cần chạy **Scan** (`*.py` + `*.pipeline.yaml` + `contracts.yaml`) là tự động dựng lại toàn bộ `.forgity/workspace.db`! |
| **4. Cơ chế Tinh chỉnh (User Overrides) khi Auto-Scan** | - Mỗi lần bấm Scan Python AST, kết quả mới có nguy cơ ghi đè mất các tinh chỉnh thủ công (label, default value, constant binding, struct type) của người dùng. | - Áp dụng **Single-Pass Override Merge**: Lúc Scan, đọc AST từ `*.py` rồi trộn (merge) với `script_overrides` trong `contracts.yaml` ngay trên RAM trước khi ghi vào bảng `local_scripts` của SQLite (không cần thêm cột thừa trong DB). |

---

## 2. Đặc Tả Chi Tiết Phase 1: Nâng Cấp Lưu Trữ `forgity-runner` Sang SQLite WAL (`runner_state.db`)

### 2.1. Danh sách File Tạo Mới / Sửa Đổi / Xóa Bỏ
1. **[SỬA]** [runner/Cargo.toml](file:///d:/FullStack/Automation/runner/Cargo.toml):
   - Thêm dependency `rusqlite = { version = "0.32", features = ["bundled"] }`.
2. **[TẠO MỚI]** [runner/src/storage/db.rs](file:///d:/FullStack/Automation/runner/src/storage/db.rs):
   - Quản lý kết nối SQLite tại `<base_dir>/runner_state.db`.
   - Khởi tạo pragmas: `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;`.
   - Khởi tạo Schema 3 bảng:
     - `cached_assets (sha256 TEXT PRIMARY KEY, extension TEXT, file_name TEXT NOT NULL, disk_path TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, last_accessed_at INTEGER NOT NULL, hit_count INTEGER NOT NULL DEFAULT 1)`
     - `cached_scripts (sha256 TEXT PRIMARY KEY, disk_path TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, last_accessed_at INTEGER NOT NULL, hit_count INTEGER NOT NULL DEFAULT 1)`
     - `cached_python_envs (env_key TEXT PRIMARY KEY, executor TEXT NOT NULL, python_runtime TEXT NOT NULL, requirements_json TEXT NOT NULL, site_packages_path TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_accessed_at INTEGER NOT NULL)`
   - Cung cấp các hàm CRUD nguyên tử: `upsert_asset`, `get_and_touch_asset`, `upsert_script`, `get_and_touch_script`, `upsert_python_env`, `touch_python_env`, `remove_entry`, `clear_all_cache_records`.
3. **[SỬA]** [runner/src/storage/cache.rs](file:///d:/FullStack/Automation/runner/src/storage/cache.rs):
   - Tích hợp `RunnerStateDb` vào `StorageManager`.
   - `find_cached_asset(sha256)`: Truy vấn O(1) từ bảng `cached_assets`, kiểm tra file tồn tại trên đĩa và cập nhật `last_accessed_at` + `hit_count`. Nếu chưa có trong DB nhưng có sẵn file trên đĩa (dữ liệu cũ trước khi nâng cấp), tự động backfill vào `runner_state.db`.
   - `find_cached_script(sha256)` & `save_script(...)` & `commit_asset(...)`: Đồng bộ nguyên tử với `runner_state.db`.
4. **[SỬA]** [runner/src/core/python_packages.rs](file:///d:/FullStack/Automation/runner/src/core/python_packages.rs):
   - Khi reuse hoặc cài mới thành công môi trường Python (`prepare`), gọi `storage.record_python_env(...)` / `storage.touch_python_env(...)` để cập nhật `cached_python_envs` trong `runner_state.db`.
5. **[SỬA]** [runner/src/storage/cleaner.rs](file:///d:/FullStack/Automation/runner/src/storage/cleaner.rs):
   - Khi dọn rác (`clean`), đồng bộ xóa các bản ghi tương ứng trong `runner_state.db` và xóa file `.storage.lock` cũ nếu còn sót lại trên đĩa.
6. **[XÓA]** [runner/src/storage/lock.rs](file:///d:/FullStack/Automation/runner/src/storage/lock.rs) & cập nhật [runner/src/storage/mod.rs](file:///d:/FullStack/Automation/runner/src/storage/mod.rs):
   - Loại bỏ module `lock` không còn sử dụng.
7. **[SỬA]** [.agents/playbooks/runner-runtime.md](file:///d:/FullStack/Automation/.agents/playbooks/runner-runtime.md):
   - Cập nhật tài liệu mục 3 & 4 phản ánh kiến trúc `runner_state.db` (SQLite WAL).

---

## 3. Đặc Tả Chi Tiết Phase 2: Local Workspace SQLite (`.forgity/workspace.db`), `contracts.yaml` & Auto-Scan Hydration

### 3.1. Thiết Kế File Khai Báo `contracts.yaml` (Portable Source of Truth)
Đặt tại `<rootPath>/contracts.yaml` (nằm ở gốc Workspace cùng cấp với `pipelines/` và `pipeline-scripts/`):

```yaml
version: 1
constants:
  - key: "UNREAL_CONTENT_ROOT"
    value: "/Game/Characters/Genesis9"
    dataType: "Path"
    scope: "Unreal"
    description: "Thư mục đích trong Unreal"
structs:
  - slug: "character_bake_item"
    displayName: "Character Bake Item"
    description: "Hợp đồng dữ liệu nhân vật"
    fields:
      - name: "duf_path"
        label: "Duf Path"
        type: "Asset"
        cardinality: "Single"
scriptOverrides:
  "blender/export_fbx":
    label: "Blender FBX Exporter"
    inputs:
      export_mode:
        defaultValue: "Batch"
```

### 3.2. Thiết Kế Schema `.forgity/workspace.db` (SQLite WAL)
1. **`local_constants`**:
   - `key TEXT PRIMARY KEY`, `id TEXT NOT NULL`, `value_json TEXT NOT NULL`, `data_type TEXT NOT NULL`, `scope TEXT NOT NULL`, `unreal_path TEXT`, `description TEXT`, `content_hash TEXT NOT NULL`, `remote_id TEXT`, `published_hash TEXT`, `updated_at TEXT NOT NULL`
2. **`local_structs`**:
   - `slug TEXT PRIMARY KEY`, `display_name TEXT NOT NULL`, `description TEXT`, `fields_json TEXT NOT NULL`, `source_kind TEXT NOT NULL`, `content_hash TEXT NOT NULL`, `remote_id TEXT`, `published_hash TEXT`, `updated_at TEXT NOT NULL`
3. **`local_scripts`**:
   - `key TEXT PRIMARY KEY`, `file_name TEXT NOT NULL`, `full_path TEXT NOT NULL`, `folder_root TEXT NOT NULL`, `suggested_name TEXT NOT NULL`, `suggested_label TEXT NOT NULL`, `executor TEXT NOT NULL`, `description TEXT`, `content_hash TEXT NOT NULL`, `source_code TEXT NOT NULL`, `inputs_json TEXT NOT NULL`, `outputs_json TEXT NOT NULL`, `detected_structs_json TEXT NOT NULL`, `dependencies_json TEXT NOT NULL`, `remote_id TEXT`, `published_hash TEXT`, `last_synced_at TEXT NOT NULL`
4. **`local_pipelines`**:
   - `slug TEXT PRIMARY KEY`, `file_name TEXT NOT NULL`, `relative_path TEXT NOT NULL`, `full_path TEXT NOT NULL`, `pipeline_kind TEXT NOT NULL`, `executor TEXT`, `inputs_json TEXT NOT NULL`, `outputs_json TEXT NOT NULL`, `content_hash TEXT NOT NULL`, `last_modified_ms INTEGER NOT NULL`, `remote_id TEXT`, `published_hash TEXT`
5. **`local_dependencies`**:
   - `parent_kind TEXT NOT NULL`, `parent_key TEXT NOT NULL`, `dep_kind TEXT NOT NULL`, `dep_key TEXT NOT NULL`, `PRIMARY KEY (parent_kind, parent_key, dep_kind, dep_key)`

### 3.3. Danh sách File Tạo Mới / Sửa Đổi ở Phase 2
1. **[SỬA]** [web/src-tauri/Cargo.toml](file:///d:/FullStack/Automation/web/src-tauri/Cargo.toml):
   - Thêm `rusqlite = { version = "0.32", features = ["bundled"] }`, `serde_yaml = "0.9"`, `hex = "0.4"`.
2. **[TẠO MỚI]** [web/src-tauri/src/commands/contracts.rs](file:///d:/FullStack/Automation/web/src-tauri/src/commands/contracts.rs):
   - Định nghĩa cấu trúc `WorkspaceContractsFile` (`version`, `constants`, `structs`, `script_overrides`).
   - Hỗ trợ đọc/ghi `<rootPath>/contracts.yaml` và hàm trộn `apply_script_overrides(analyzed_script, overrides)` ngay trong RAM.
3. **[TẠO MỚI]** [web/src-tauri/src/commands/workspace_db.rs](file:///d:/FullStack/Automation/web/src-tauri/src/commands/workspace_db.rs):
   - Quản lý kết nối SQLite `.forgity/workspace.db` (WAL mode).
   - **Auto-Migration**: Khi mở workspace lần đầu, nếu `.forgity/workspace.db` trống mà phát hiện còn file `.forgity/local_palette.json`, `local_structs.json`, `constants.json` cũ, tự động nạp toàn bộ dữ liệu cũ vào `workspace.db` + xuất `contracts.yaml`, sau đó đổi tên các file `.json` cũ thành `.json.bak` (Zero Data Loss).
   - Tự động tính toán và cập nhật bảng `local_dependencies` mỗi khi lưu Script hoặc Pipeline.
4. **[SỬA]** [web/src-tauri/src/commands/workspace.rs](file:///d:/FullStack/Automation/web/src-tauri/src/commands/workspace.rs):
   - Chuyển toàn bộ các Tauri commands `open_or_init_workspace_root`, `load_local_palette`, `save_local_palette`, `load_local_structs`, `save_local_structs`, `load_local_constants`, `save_local_constants` sang đọc/ghi từ `workspace.db` và đồng bộ `contracts.yaml`.
   - Thêm command `save_local_script_override` để khi user sửa thông tin pin/node trên UI, phần override được lưu vào `contracts.yaml` và cập nhật lại `workspace.db`.
5. **[SỬA]** [web/src-tauri/src/commands/analyzer.rs](file:///d:/FullStack/Automation/web/src-tauri/src/commands/analyzer.rs) & [web/src-tauri/src/commands/pipeline.rs](file:///d:/FullStack/Automation/web/src-tauri/src/commands/pipeline.rs):
   - Khi `analyze_local_scripts_native` chạy: đọc `contracts.yaml`, áp `scriptOverrides` ngay trên RAM cho từng script trước khi trả về và đồng bộ vào `workspace.db`.
   - Khi `scan_local_pipeline_drafts` / `save_local_pipeline_draft` chạy: đồng bộ metadata (`slug`, `pipeline_kind`, `executor`, `content_hash`) và quan hệ phụ thuộc vào bảng `local_pipelines` & `local_dependencies` trong `workspace.db`.

---

## 4. Ranh Giới Đỏ (Redlines) & Xử Lý Edge Cases

1. **Zero Data Loss khi nâng cấp**:
   - Mọi workspace hiện tại đang có `.forgity/local_palette.json`, `.forgity/local_structs.json`, `.forgity/constants.json` phải được tự động migrate sang `.forgity/workspace.db` và `contracts.yaml` ngay lần đầu mở, không làm mất bất kỳ Constant, Struct hay Script nào đã quét.
2. **Giữ nguyên Contract Tauri IPC với Frontend**:
   - Các hooks hiện tại trên Frontend (`useLocalPaletteQuery`, `useLocalConstantsQuery`, `useLocalPipelinesQuery`) vẫn hoạt động trơn tru không bị gãy chữ ký trả về, đồng thời được hưởng lợi tức thì từ nền tảng SQLite + `contracts.yaml`.
3. **Không sửa `stage_runner_guest.py`**:
   - Tuân thủ tuyệt đối quy tắc không chạm vào Guest Runner Python.

---

## 5. Tiêu Chí Nghiệm Thu & Kiểm Thử (Verification Plan)

1. **Phase 1 (`runner/`)**:
   - Chạy `cargo check` và `cargo test` trong thư mục `runner/` đạt **0 errors**, bao gồm unit tests kiểm thử `RunnerStateDb` (WAL mode, `upsert_asset`, `get_and_touch_asset`, auto-backfill từ đĩa và `StorageCleaner` dọn cache + xóa bản ghi SQLite).
2. **Phase 2 (`web/src-tauri/` & `web/`)**:
   - Chạy `cargo check` và `cargo test` trong `web/src-tauri/` đạt **0 errors**, bao gồm unit tests kiểm thử:
     - Auto-migration từ `.forgity/*.json` sang `workspace.db` + `contracts.yaml`.
     - Single-pass merge giữa AST `*.py` và `scriptOverrides` trong `contracts.yaml`.
     - Khả năng xóa `.forgity/workspace.db` và tái tạo lại 100% dữ liệu từ `*.py` + `*.pipeline.yaml` + `contracts.yaml`.
   - Chạy `pnpm --dir web tsc --noEmit` đạt **0 errors**.

