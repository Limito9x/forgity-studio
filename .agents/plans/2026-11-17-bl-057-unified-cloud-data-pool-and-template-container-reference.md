# Kế Hoạch Kỹ Thuật: Unified Cloud Data Pool & Template Container Reference Layer (BL-057)

- **Mã Backlog**: `BL-057`
- **Ngày lập**: 17/11/2026
- **Trạng thái**: `Master Plan: Approved` — `Phase 0: MVP Plan sẵn sàng code`
- **Tài liệu kiến trúc nền tảng**:
  - [ADR-006: Local-First Script Authoring & Ephemeral Draft](file:///d:/FullStack/Automation/docs/adr/ADR-006-local-first-script-authoring-and-ephemeral-draft-lifecycle.md)
  - [ADR-007: Two-Tier Pipeline & Local SQLite Index](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md)
  - [BL-054: Local SQLite Relational Index & Declarative Contracts](file:///d:/FullStack/Automation/.agents/plans/2026-11-13-bl-054-local-sqlite-relational-index-and-declarative-contracts.md)
  - [BL-055: Cloud Immutable Template Registry Trimming](file:///d:/FullStack/Automation/.agents/plans/2026-11-14-bl-055-legacy-remnants-cleanup-and-cloud-registry-trimming.md)
- **Phạm vi tác động**: `crates/forgity-core/`, `app/src-tauri/`, `api/src/Modules/Pipeline/`, `api/src/Modules/Files/` (Contracts), `app/src/features/system/components/templates/`, `app/src/features/pipelines/`

---

## 1. Mục Tiêu Kiến Trúc

1. **Cloud Data Pool phẳng (Unified)** — `master` / `component` chỉ là metadata; `ProjectPipelineView` / `TemplatePackage` chỉ là **lớp view tham chiếu**.
2. **Một nguồn quét phụ thuộc duy nhất** — Rust `forgity-core` đọc Local Workspace, sinh `TemplateDependencyManifest`. Frontend chỉ hiển thị, không regex đoán.
3. **Ingest idempotent theo hash** — Phase 1 tạo/cập nhật Cloud Data (Pipeline + Version + Script + Contracts + Asset links); Phase 2 container chỉ **trỏ** tới ID/version đã ingest.
4. **Container bất biến khi publish** — publish tạo version container mới, không sửa dữ liệu đã phát hành.
5. **Asset là dữ liệu thật** — dùng `IAssetApi` của Files (SHA-256 + size + `PublicUrl`), không còn `sizeBytes` giả hay `prompt()`.

---

## 2. Bảng Đối Chiếu Trước & Sau

| Hướng mục | TRƯỚC (hiện trạng) | SAU (chuẩn hóa) |
| :--- | :--- | :--- |
| **1. Phạm vi Cloud Pipeline** | `CloudPipeline.ProjectId` bắt buộc; ingest dùng `Guid.Empty` để "vô chủ". | Bỏ ràng buộc Project (nullable), `PipelineKind` chỉ là metadata. `ProjectPipelineView` là lớp view duy nhất gắn project. |
| **2. Script Artifact** | `PipelineScriptArtifact` gắn cứng `PipelineVersionId`; ingest gán bừa `pipelineVersionMap.Values.First()` ⇒ `AcquireTemplateScript` 404. | `PipelineScripts` toàn cục content-addressed (`Key + Hash`) + `PipelineVersionScripts`. Không nhân bản source. |
| **3. Contracts & Constant** | Constant/Struct chỉ nằm trong `ContractsJson`, không có hash. | Giữ `ContractsJson` + thêm `ContractsHash`; container khai báo constant riêng (required/label/default) từ kết quả quét. |
| **4. Phát hiện phụ thuộc** | Builder regex `.py` + `constants.X`; bỏ sót component lồng & asset. | Rust duyệt **canonical graph từ snapshot** (`local:<script>`, `local:component:<slug>`, `local:constant:<KEY>`), asset theo path thật, phát hiện ref gãy, ghi `local_dependencies`. |
| **5. Asset** | Nhập tay bằng `prompt()`, `sizeBytes = 1MB`; không upload/link. | `RequestUpload → ConfirmUpload → IAssetApi.SyncLinks(owner = PipelineVersion/TemplatePackage)`; hash/size thật; dispatch trả `PublicUrl`. |
| **6. Tạo Container** | `CreateTemplateContainer` chỉ nhét ID vào JSON, không validate, update ghi đè. | `TemplatePackageMember` (FK) + validate tồn tại/quyền; manifest snapshot bất biến; publish tạo `VersionNumber` mới. |
| **7. Dispatch / Consume** | Chỉ đọc `PrimaryMasterVersion`, không merge component/asset. | Resolve toàn bộ members + scripts + contracts + asset URLs từ manifest container version. |
| **8. Builder UI** | UI tĩnh, gửi `masterVersionIds: []`, `scriptArtifactIds: []`. | Gọi scanner → cây phụ thuộc (master / component / constant `*` / scripts / assets), badge lỗi ref gãy, dữ liệu từ DTO thật. |

---

## 3. Phân Rã Phase

### Phase 0 — Rust Dependency Scanner (không đổi API/UI)

- **ADR**: `docs/adr/ADR-010-unified-cloud-data-pool-and-template-container-reference.md` (ADR-009 đã dùng).
- **Module mới**: `crates/forgity-core/src/template_manifest.rs`
  - `build_template_dependency_manifest(root_path, root_pipeline_paths, persist)`.
  - Graph lấy từ **SQLite snapshot** (chuẩn), YAML fallback/đối chiếu; `graphHash` = SHA-256 **canonical graph**; không ghi YAML.
  - Quét refs, asset thật, constants; trả `diagnostics[]`.
- **SQLite**: chỉ ghi `local_dependencies` (hiện chưa có INSERT — [workspace_db.rs:86](file:///d:/FullStack/Automation/crates/forgity-core/src/workspace_db.rs#L86)); **không** thêm cột `local_pipelines`.
- **Tauri command**: `scan_template_dependencies` ([lib.rs](file:///d:/FullStack/Automation/app/src-tauri/src/lib.rs)).
- **Nghiệm thu**: `cargo test -p forgity-core` xanh; test cả nhánh snapshot và YAML fallback.

### Phase 1 — Cloud Data Pool API (Unified)

- **Entity/Migration**:
  - `CloudPipeline`: bỏ ràng buộc Project, `Slug` unique toàn cục.
  - `PipelineVersion`: thêm `ContractsHash`.
  - `PipelineScript` (mới): `Key, Executor, ScriptHash, SourceCode, RequirementsJson` — unique `(Key, ScriptHash)`.
  - `PipelineVersionScript` (mới): `(PipelineVersionId, PipelineScriptId)`.
- **Endpoint** (`Features/CloudData/`):
  - `POST cloud-data/manifest/ingest` — payload `{ manifest, graphs: [{ slug, graphHash, dagBundleJson, contractsJson }] }`; `graphs` dựng từ **canonical snapshot** (cùng nguồn với `build_publish_bundle_json`), không đọc YAML. Trả map `slug → versionId`, `scriptKey → scriptId`.
  - `GET cloud-data/pipelines`, `GET cloud-data/pipelines/{versionId}`, `GET cloud-data/scripts/{scriptId}`.
- **Idempotent**: bỏ qua tạo version mới nếu `graphHash` đã tồn tại cho slug đó.
- **Sửa lỗi**: `IngestCloudPipelineData` gán script vào version "đại diện" ([line 135](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Pipelines/IngestCloudPipelineData.cs#L135)) → join table.
- **Nghiệm thu**: ingest 2 lần cùng manifest không sinh bản ghi trùng; script truy vấn đúng theo version.

### Phase 2 — Template Container Là Lớp Tham Chiếu

- **Entity**:
  - `TemplatePackageMember`: `TemplatePackageId, PipelineVersionId, Role, SortOrder`.
  - `TemplatePackage`: `VersionNumber`, `SupersedesId`, `ArchivedAt`, `TotalAssetBytes`; `ContainerManifestJson` là snapshot bất biến.
  - Asset bổ sung qua `IAssetApi` (owner `TemplatePackage`); asset của version kế thừa từ Phase 1.
- **Endpoint**:
  - `POST templates/containers` — validate ID tồn tại/quyền, persist members, sinh manifest, tính totals.
  - `GET templates/containers/{id}`, `POST templates/containers/{id}/publish` (tạo version mới).
- **Nghiệm thu**: guard ID không tồn tại/không thuộc quyền; publish 2 lần ⇒ 2 version, version cũ không đổi.

### Phase 3 — Frontend Builder & Admin

- Gọi Tauri `scan_template_dependencies` qua hook `useTemplateDependencyScan`, bỏ regex.
- Cây phụ thuộc bỏ-chọn được, badge diagnostics, nút "Re-scan".
- Asset: chọn file thật → upload/link → hiển thị size/hash thật.
- Hook bọc Orval, không `customInstance` thủ công.
- **Nghiệm thu**: `pnpm run typecheck` + `pnpm build`; E2E scan "daz to unreal" → ingest → container → admin list.

### Phase 4 — Dispatch & Runner Consumption (có thể tách BL-058)

- `DispatchCloudBundle` resolve members + scripts + assets từ manifest.
- Runner tải asset về `runner_state.db` cache (zero-RAM streaming).
- **Nghiệm thu**: chạy template 1 master + ≥1 component có asset bằng `forgity-runner run-bundle`.

---

## 4. Manifest MVP (Phase 0 output)

```jsonc
{
  "rootPath": "D:/...",
  "generatedAt": "2026-11-17T…",
  "persisted": true,
  "pipelines": [
    { "slug": "daz_to_unreal", "kind": "master", "relativePath": "pipelines/master/daz_to_unreal.pipeline.yaml",
      "graphSource": "snapshot", "graphHash": "…",
      "dependsOn": ["daz_to_blender", "fbx_to_unreal"], "scriptKeys": ["blender/save_scene"] }
  ],
  "scripts": [
    { "key": "blender/diffeomorphic_import", "executor": "blender", "contentHash": "…",
      "sourceCode": "…", "requirements": ["numpy"], "usedBy": ["daz_to_blender"] }
  ],
  "constants": [
    { "key": "CHARACTER_FOLDER", "dataType": "String", "scope": "General", "valueJson": "…", "usedBy": ["daz_to_blender"] }
  ],
  "assets": [
    { "name": "DazBodyUE5.py", "relativePath": "pipeline-scripts/presets/daz.easy_import_daz/DazBodyUE5.py",
      "sizeBytes": 1819, "hash": "…", "nodeId": "…", "inputKey": "preset_path" }
  ],
  "diagnostics": [{ "level": "warning", "code": "GRAPH_DIVERGED", "message": "…", "pipelineSlug": "daz_to_unreal" }],
  "totals": { "masterCount": 1, "componentCount": 4, "scriptCount": 12, "constantCount": 7,
              "assetCount": 3, "assetBytes": 48000, "errorCount": 0, "warningCount": 1 }
}
```

---

## 5. Quyết Định Đã Chốt

| # | Quyết định | Trạng thái |
| :--- | :--- | :--- |
| 1 | Script pool toàn cục content-addressed (`PipelineScript` + `PipelineVersionScripts`) | ✅ |
| 2 | Container bất biến khi publish (`VersionNumber` tăng, version cũ `ArchivedAt`) | ✅ |
| 3 | Asset qua `IAssetApi` + `AssetLink` của Files, không tạo bảng riêng trong Pipeline | ✅ |
| 4 | Bỏ `AcquireTemplateScript` legacy sau khi có `GET cloud-data/scripts/{id}` | ✅ |
| 5 | **Scan/hash dùng SQLite snapshot là chuẩn**; YAML chỉ fallback/đối chiếu (read-only) | ✅ |
| 6 | `graphHash` = SHA-256 **canonical graph**; **không ghi YAML**; **không thêm cột** vào `local_pipelines` | ✅ |

---

## 6. Rủi Ro & Giảm Thiểu

| Rủi ro | Giảm thiểu |
| :--- | :--- |
| Migration bỏ `CloudPipeline.ProjectId` ảnh hưởng dữ liệu cũ | Nới lỏng (nullable) trước, backfill `Scope='global'`, không drop cột trong Phase 1 |
| Asset path heuristic | Chỉ nhận path khai báo tường minh + file tồn tại thật; candidate nằm trong manifest để UI bỏ-chọn; `MISSING_ASSET` thay vì im lặng |
| Container versioning phình dữ liệu | Manifest chỉ chứa ID + hash + declarations; source/asset nằm ở Phase 1 |
| Orval chưa gen endpoint mới | Chạy `pnpm run gen:api` sau Phase 1/2 trước khi làm Phase 3 |
| `IAssetApi` xuyên module | Chỉ gọi qua Contracts + Wolverine handler, không reference `FilesDbContext` |

---

## 7. Thứ Tự Triển Khai

1. **Phase 0** — Rust scanner + ADR (nền, không phá vỡ gì).
2. **Phase 1** — Cloud Data Pool (đúng yêu cầu "xử lý tốt cloud data trước").
3. **Phase 2** — Container reference.
4. **Phase 3** — Builder UI theo sketch.
5. **Phase 4** — Dispatch/Consume (tách BL-058 nếu cần).

> **Review Gate**: Master Plan đã duyệt. Phase 0 đã chốt quyết định, chờ duyệt bắt đầu code.

---

## 8. Phase 0 — Implementation Plan (MVP)

### 8.1. Phạm Vi

| Trong phạm vi | Ngoài phạm vi |
| :--- | :--- |
| `crates/forgity-core/src/template_manifest.rs` (mới) | `api/` |
| `crates/forgity-core/src/workspace_db.rs` (+`replace_dependencies`, `load_dependencies`, `delete_dependencies`) | `app/src/` (frontend) |
| `crates/forgity-core/tests/template_manifest_tests.rs` (mới), `tempfile` dev-dep | Ingest cloud / `DispatchCloudBundle` |
| `crates/forgity-core/src/lib.rs` (+module) | Upload asset / Files module |
| `app/src-tauri/src/commands/template_manifest.rs` (mới) + đăng ký trong `commands/mod.rs`, `lib.rs` | EF Core migration, Orval |
| `docs/adr/ADR-010-*.md` (mới) | Đổi schema `workspace.db` |

### 8.2. Hợp Đồng

**DTO** (`#[serde(rename_all = "camelCase")]`):

| DTO | Trường |
| :--- | :--- |
| `ManifestPipeline` | `slug`, `kind`, `relativePath`, `graphSource` (`snapshot`/`yaml`), `graphHash`, `dependsOn`, `scriptKeys` |
| `ManifestScript` | `key`, `executor`, `contentHash`, `sourceCode`, `requirements`, `usedBy` |
| `ManifestConstant` | `key`, `dataType`, `scope`, `valueJson`, `usedBy` |
| `ManifestAsset` | `name`, `relativePath`, `sizeBytes`, `hash`, `nodeId?`, `inputKey?` |
| `ManifestDiagnostic` | `level`, `code`, `message`, `pipelineSlug?`, `nodeId?` |
| `ManifestTotals` | `masterCount`, `componentCount`, `scriptCount`, `constantCount`, `assetCount`, `assetBytes`, `errorCount`, `warningCount` |

**Tauri command**:

```rust
#[tauri::command]
pub fn scan_template_dependencies(
    root_path: String,
    root_pipeline_paths: Vec<String>,   // absolute path tới master/component được chọn
    persist: Option<bool>,              // default true nếu có .forgity/
) -> Result<TemplateDependencyManifest, String>
```

**SQLite** (không đổi schema): `local_dependencies(parent_kind='pipeline', parent_key=slug, dep_kind, dep_key)`
`dep_kind ∈ {component, script, constant, asset}`; ghi replace-theo-parent trong 1 transaction.

### 8.3. Thuật Toán

1. **Bối cảnh**: đọc `.forgity/workspace.json` (`scriptsDir` có thể là `"."` → normalize), mở `WorkspaceDb`.
2. **Script index**: `db.load_palette_json()` → `key → {executor, contentHash, sourceCode, fullPath, dependencies[]}`.
3. **Component index**: `discover_component_pipelines(root, Some(&db))` → `slug → (fullPath, relativePath)`.
4. **Constant index**: `load_contracts_file(root)` (dùng `contracts_path()`, **không hardcode**; file ở `<root>/contracts.yaml`) + `db.load_constants_json()`.
5. **Nạp graph** (mỗi pipeline, kể cả component):
   - `db.load_pipeline_snapshot(slug)` → parse JSON, `nodes` không rỗng ⇒ `graphSource = "snapshot"`.
   - Snapshot hỏng/rỗng ⇒ `warning: SNAPSHOT_PARSE_FAILED`, fallback YAML.
   - Không có snapshot ⇒ YAML, `info: SNAPSHOT_MISSING`.
   - Cả hai hỏng ⇒ `error: INVALID_PIPELINE_YAML`, bỏ pipeline.
   - YAML luôn được parse (read-only) để đối chiếu canonical hash; lỗi khi snapshot dùng được ⇒ `warning: YAML_PARSE_FAILED`.
6. **Canonical graph + hash**:
   - Node: `id`, `refId` (`tool` | `refId`), `parentId` (`stage` | `parentId`), `config` (`inputs` | `configValues` bỏ `_isBatch/_maxConcurrency/_iterablePin/_skipOnError`), batch flags.
   - Edge: YAML `from/to` dạng `"id.pin"` | snapshot `sourceNodeId/sourcePin → targetNodeId/targetPin`; thiếu pin ⇒ `out`/`in`.
   - Bỏ khỏi hash: `label`, `category`, `executor`, `position`, `size`, `metadata`, `name`, `parameters`.
   - Sort node/edge/config key ⇒ JSON ⇒ `graphHash = SHA-256`. Hash **trước** khi expand `${CONSTANT}`.
   - `snapshot` vs YAML khác hash ⇒ `warning: GRAPH_DIVERGED`.
7. **BFS refs** (trên canonical graph):
   - `local:component:<slug>` → enqueue (visited + cycle detection).
   - `local:constant:<KEY>` → kiểm tra constant index.
   - `local:<scriptKey>` → kiểm tra palette (`DANGLING_SCRIPT` nếu thiếu).
   - Builtin (`Start`, `Return`, `Sequence`, `Joint`, …) → bỏ qua.
8. **Scripts**: dedupe theo key, `sourceCode` rỗng ⇒ `warning: EMPTY_SOURCE_CODE`; `requirements` = `packageName` (fallback `module`).
9. **Constants**: quét `${KEY}` trong `config` + `constant.value`; thiếu ⇒ `warning: DANGLING_CONSTANT_REF`.
10. **Assets**: duyệt `config`; `metadata.sourcePath` đọc bù từ YAML nếu snapshot không giữ.
    - Bỏ qua `${...}` (`info: DEFERRED_PATH`), file `.yaml/.yml/.json`, và path trùng script được tham chiếu.
    - Resolve + canonicalize, **strip `\\?\`** của root và asset; thoát root ⇒ `error: PATH_ESCAPE`.
    - `is_file()` ⇒ `{name, relativePath '/', sizeBytes, hash, nodeId, inputKey}`; dedupe theo relativePath (lowercase trên Windows).
    - File trong root nhưng không tồn tại ⇒ `warning: MISSING_ASSET`. File > 64 MiB ⇒ `hash = ""`.
11. **Sort & totals** (master trước, slug; key/path tăng dần).
12. **Persist** `local_dependencies` nếu `persist != false` và `.forgity/` tồn tại; lỗi ⇒ `error: PERSIST_FAILED`.
13. **Return** manifest.

### 8.4. Diagnostics

| Code | Level | Ý nghĩa |
| :--- | :--- | :--- |
| `INVALID_PIPELINE_YAML` | error | Không có graph hợp lệ (snapshot hỏng **và** YAML hỏng) |
| `DANGLING_SCRIPT` | error | `local:<key>` không có trong palette |
| `MISSING_COMPONENT` | error | `local:component:<slug>` không tìm thấy |
| `DUPLICATE_PIPELINE_SLUG` | error | 2 file pipeline cùng slug (khác thư mục) |
| `PATH_ESCAPE` | error | Asset path ra ngoài workspace root |
| `PERSIST_FAILED` | error | Không ghi được `local_dependencies` |
| `GRAPH_DIVERGED` | warning | Snapshot khác YAML — canvas chưa save, đang dùng snapshot |
| `SNAPSHOT_PARSE_FAILED` | warning | `snapshot_json` hỏng/rỗng → fallback YAML |
| `YAML_PARSE_FAILED` | warning | YAML lỗi nhưng snapshot dùng được |
| `UNDEFINED_CONSTANT` | warning | `local:constant:<KEY>` không khai báo |
| `DANGLING_CONSTANT_REF` | warning | `${KEY}` không tồn tại |
| `MISSING_ASSET` | warning | Path trong root nhưng file không tồn tại |
| `EMPTY_SOURCE_CODE` | warning | Palette item thiếu source |
| `INVALID_NODE_TOOL` | warning | `tool`/`refId` không phải string/rỗng |
| `PALETTE_EMPTY` | warning | `workspace.db` chưa có script |
| `CYCLIC_COMPONENT` | warning | Component tham chiếu vòng (A→B→A), chỉ cảnh báo 1 lần |
| `SNAPSHOT_MISSING` | info | Chưa có snapshot, dùng YAML |
| `DEFERRED_PATH` | info | Path chứa `${...}`, bỏ qua |
| `WORKSPACE_NOT_INITIALIZED` | info | Không persist vì thiếu `.forgity/` |

### 8.5. Biên

| Case | Xử lý |
| :--- | :--- |
| Cycle component A→B→A | `visited` + `in_stack`; cảnh báo 1 lần, không treo |
| 2 pipeline cùng slug | `error: DUPLICATE_PIPELINE_SLUG` |
| Snapshot `edges` null | `edges = []` |
| Snapshot lệch YAML | Dùng snapshot + `GRAPH_DIVERGED` |
| Snapshot thiếu `sourcePath` | Đọc bù từ YAML |
| Path Windows `\` vs `/`, Unicode | `PathBuf` + `to_string_lossy`, xuất `/` |
| Preset `.py` trong `scriptsDir` | Vẫn là asset (không phải script được tham chiếu; `workspace.json` ignore `presets`) |

### 8.6. Test (MVP)

| # | Test | Kỳ vọng |
| :--- | :--- | :--- |
| 1 | `scans_master_and_transitive_components` | master + component lồng, `dependsOn` đúng |
| 2 | `prefers_snapshot_over_yaml` | script B trong snapshot thắng script A trong YAML; `graphSource=snapshot`; `GRAPH_DIVERGED` |
| 3 | `falls_back_to_yaml_when_snapshot_invalid` | `SNAPSHOT_PARSE_FAILED`, scan vẫn đủ dependency |
| 4 | `canonical_hash_stable_across_sources` | Cùng graph từ YAML/snapshot (khác toạ độ, label, thứ tự key) ⇒ cùng hash; đổi config ⇒ hash đổi |
| 5 | `detects_dangling_script_and_missing_component` | 2 error, scan vẫn trả manifest |
| 6 | `collects_constants_and_assets` | constant đúng; preset `.py` là asset; script được tham chiếu không nằm trong assets; hash/size đúng |
| 7 | `dedupes_shared_script_and_asset` | 1 entry, `usedBy` đủ 2 slug |
| 8 | `persists_dependencies_idempotently` | chạy 2 lần, row count không đổi |
| 9 | `never_writes_yaml` | mtime + nội dung `.yaml` không đổi |
| 10 | `rejects_path_escape` | `../../secret.txt` ⇒ `PATH_ESCAPE` |

**Lệnh**: `cargo test -p forgity-core` · `cargo build -p forgity-core` · `cargo check --manifest-path app/src-tauri/Cargo.toml`

### 8.7. Redlines

1. Không sửa `api/` và `app/src/` trong Phase 0.
2. Không regex trên `tool`/ref — chỉ prefix parsing.
3. Không quét ngoài root + component phát hiện được.
4. Không mutate palette/contracts/YAML; chỉ ghi `local_dependencies`.
5. Không ghi/đổi mtime bất kỳ `.yaml` nào (kể cả để hash).
6. Không `ALTER TABLE`/thêm cột vào `workspace.db`.
7. Không trả absolute path asset (chỉ `relativePath`); `rootPath` chỉ để debug.

### 8.8. Nghiệm Thu

1. Workspace thật `daz_to_unreal`: `masterCount=1`, `componentCount=4`, scripts có `sourceCode`, 3 asset preset (dedupe `BlenderUE5_8.py`), constants `CHARACTER_*`/`OUTFIT_*`/`PDA_PATHS`.
2. Sửa canvas không Save Draft: dependency/asset mới vẫn xuất hiện, `GRAPH_DIVERGED` có mặt, **mtime YAML không đổi**.
3. `local_dependencies` có row; chạy lại không nhân đôi; schema `local_pipelines` không đổi.
4. `cargo test -p forgity-core` xanh; `cargo check` Tauri xanh.

### 8.9. Sau Phase 0

- `BACKLOG.md`: BL-057 → `In Progress`.
- Phase 1: chốt `TemplateDependencyManifestDto` (C#) + `POST cloud-data/manifest/ingest` (plan riêng).
