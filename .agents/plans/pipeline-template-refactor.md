# Kế hoạch triển khai: Kiến trúc Strategy/Adapter (Local/Cloud), Workspace Capabilities, File Pin Cloud Asset & Dọn Legacy

## Mục tiêu & Bức tranh kiến trúc tổng thể

Đồng bộ luồng dữ liệu Cloud và Local qua lớp **Client Strategy / Adapter**, nhưng phân định rõ vòng đời: Cloud lưu template/version/artifact; người dùng fork template thành workspace độc lập trên desktop; workspace registry trong AppData chỉ lập chỉ mục các workspace, không lưu graph hay dữ liệu workspace. Preview đọc template Cloud; mọi chỉnh sửa, constants và execution diễn ra trên workspace local sau fork. Palette mang source reference có kiểu cho từng node; runner cùng desktop resolve script template ở thời điểm chạy. Pipeline/template graph không chứa runner selection.

```
[Cloud Template/Version/Artifacts] ──▶ [Preview + Fork]
                                              │
                              setup: create local workspace,
                              stage template assets, remap references
                                              ▼
                         [Local Workspace] ◀── [Workspace Registry]
                                │                 (index only)
                                ▼
                    [contract + source-aware palette + graph]
                                │
                    [Workspace Canvas + Local Constants]
                                │ Run (desktop-local)
                                ▼
                   [Runner resolves template scripts in RAM]
```

---

## Cần bạn review

> [!IMPORTANT]
> **Migration xóa bảng legacy**: Bước dọn `PipelineScriptArtifacts` sẽ sinh EF Core Migration `DropLegacyPipelineScriptArtifacts`. Sau khi chạy migration, bảng cũ sẽ bị drop (dữ liệu đã chuyển sang `PipelineScripts` + `PipelineVersionScripts`).

---

## Thay đổi đề xuất

### 1. Dọn Legacy Backend (`api/src/Modules/Pipeline/Automation.Pipeline`)

#### [MODIFY] `Domain/Entities/CloudPipelineEntities.cs` & `Infrastructure/Persistence/PipelineDbContext.cs`

- Xóa `PipelineScriptArtifact`, `PipelineVersion.ScriptArtifacts`, và `DbSet<PipelineScriptArtifact>`.

#### [DELETE] `Features/Templates/AcquireTemplateScript.cs` & `Features/Pipelines/IngestCloudPipelineData.cs`

- Xóa endpoint legacy `AcquireTemplateScript` (đã thay bằng `GET cloud-data/scripts/{scriptId}`) và `IngestCloudPipelineData` (đã thay bằng `POST cloud-data/manifest/ingest`).

#### [NEW] EF Core Migration: `DropLegacyPipelineScriptArtifacts`

---

### 2. Lớp Dữ liệu Cloud (`Database` + `Backend wrap` + `File Pin Asset`)

#### [MODIFY] `Features/Templates/GetTemplateContainerById.cs` & `GetMyLibraryItem.cs`

- Bổ sung `JsonDocument? PaletteNodesJson` (từ `ContainerManifestJson.paletteNodes`) vào `TemplateContainerDetailDto` và `TemplateLibraryItemDto` để Cloud Adapter có đủ `palette` trả xuống cho Canvas.

#### [MODIFY] `app/src/features/system/components/templates/TemplateContainerBuilder.tsx`

- Khi đóng gói container:
  1. Kết hợp draft-node contracts từ Tauri `load_local_palette` với builtin/constant/component contracts từ `load_workspace_node_contracts`, lọc các node thực sự có mặt trong graph và gửi vào `paletteNodesJson` của `CreateTemplateContainer`. Mỗi entry giữ `sourceRef` có discriminator và version/hash; palette không chứa source code hay ổ đĩa giả định.
  2. Chỉ các file được tác giả xác định rõ là **template asset** mới được upload lên Cloud Files và đưa vào asset manifest của template. File pin do người dùng cung cấp không tự động trở thành tài sản phân phối của template. Graph lưu asset identity/reference ổn định, không lưu URL transport.

---

### 3. Client Strategy / Adapter & `PipelineWorkspaceContext` (source độc lập với capabilities)

#### [MODIFY] `context/PipelineWorkspaceContext.tsx`

- Chuẩn hóa `source: "local" | "cloud"` và contract capabilities độc lập: `canEditGraph`, `canSaveDraft`, `canSaveSnapshot`, `canRun`.
- Workspace contract chỉ mang dữ liệu/capability cần cho graph/canvas. Không đưa runner list, loading state hoặc runner identity vào graph workspace contract.
- Canvas/Inspector khóa thao tác theo capability tương ứng; không coi Cloud mặc định là read-only hoặc Local mặc định là edit.
- Chuẩn hóa **`CloudPipelineStorageAdapter`** và **`LocalPipelineStorageAdapter`** theo `source`; thao tác chưa được adapter hỗ trợ phải trả lỗi rõ ràng, không giả lập lưu thành công.
- `Workspace Registry` là chỉ mục local nhẹ (workspace ID, tên/vị trí, trạng thái và template/version nguồn); graph, constants và assets thuộc workspace storage, không thuộc registry.

#### [NEW] `features/pipelines/hooks/useCloudTemplateWorkspace.ts` (Preview Cloud Template)

- Hook này chỉ phục vụ Preview: đọc manifest/version, contract, palette và graph từ Cloud; không tạo workspace chạy trực tiếp từ template Cloud.
- Hành động **Use Template / Create Workspace** fork một snapshot template thành workspace local, đăng ký workspace trong Workspace Registry, tải template-owned assets vào workspace `/assets`, rồi mở workspace bằng `LocalPipelineStorageAdapter`.

#### [MODIFY] `pages/templates/TemplatePreviewPage.tsx` & luồng My Library / Workspace

- Preview Cloud chỉ đọc và không chạy. Add to My Library chỉ tạo membership/favorite.
- Thay Cloud Template Workbench có run bằng thao tác fork/create local workspace; canvas chỉnh sửa và run thuộc workspace local. Capability được khai báo tường minh, không suy ra từ `source`.

---

### 4. Sửa dứt điểm Graph Rendering & loại bỏ ScopeContainer legacy

#### [DELETE/MODIFY] `ScopeContainer` legacy paths

- Xóa `components/canvas/ScopeContainerNode.tsx` và node type/registration liên quan.
- Gỡ các nhánh `scopeContainer`/stage grouping khỏi connection rules, graph-to-DSL conversion, local graph load/save mapping, graph diagnostics/serialization và run dialog.
- Bỏ Runner pin/binding trên graph. Không thay bằng runner field khác trong pipeline/template DTO.

#### [MODIFY] `nodeDefinitions.ts` & `nodes/PipelineNodeRouter.tsx`

- `nodeView(kind, definition, refId?)`: nhận diện thẳng `refId?.startsWith("local:constant:")` là Pure `"Constant"` (không cần phụ thuộc local palette mới thoát `Missing Definition`).

#### [MODIFY] `adapters/templateGraphAdapter.ts`

- Chuẩn hóa `Start` / `Return` pins và `edges`: dùng pin ID contract làm handle ID; label hiển thị lấy từ parameter metadata; không dùng label/GUID heuristic để thay ID.

#### [MODIFY] `components/canvas/hooks/usePipelineDraftState.ts`

- Đồng bộ `setParameters(...)` trong `useEffect` khi `graph.id` thay đổi (sửa lỗi giữ nhầm pin `Start`/`Return` khi chuyển Master ↔ Component).
- Tách quyền chỉnh sửa khỏi lưu: `canEditGraph` khóa chỉnh sửa; `canSaveDraft` điều khiển auto-save/flush độc lập.

#### [MODIFY] `components/canvas/NodeConfigInspector.tsx` & `components/canvas/PipelineCanvas.tsx`

- Đọc capabilities thống nhất từ `PipelineWorkspaceContext`:
  - **Node Inspector**: Khi `canEditGraph` không được cấp, khóa input trong `FormRenderer`, ẩn nút xóa/clear file (`x`), đổi `StructSelector`/`ModeSelector` sang chỉ đọc.
  - **Canvas Action**: Khi `canEditGraph` không được cấp, khóa nối dây (`onConnect`), thêm/xóa node và undo/redo; `canSaveDraft` điều khiển auto-save/flush riêng. Giữ pan/zoom + click node để inspect.

---

## Implementation Plan Phase 2 — Hiệu chỉnh phạm vi (Review Gate)

> Trạng thái: đã được người dùng yêu cầu tiếp tục. Một phần thay đổi Phase 2 đã có trong worktree; phần còn lại tiếp tục theo phạm vi dưới đây.

### Ma trận trước/sau

| Hạng mục | Trước | Sau |
|---|---|---|
| Workspace permissions | `readOnly` bị suy ra khi không có `canSaveDraft`; source và behavior bị trộn. | `source` chỉ mô tả Local/Cloud; `canEditGraph`, `canSaveDraft`, `canSaveSnapshot`, `canRun` được khai báo riêng và gate đúng thao tác tương ứng. |
| Palette khi đóng gói | `load_workspace_node_contracts` không chứa draft script nodes; raw contracts cũng chưa bảo đảm `refId`/`name`/`kind`. | Hợp nhất local draft scripts từ `load_local_palette` với built-in/constant/component contracts, chuẩn hóa thành `NodePaletteItemDto`, rồi chỉ gửi các refId graph đang dùng. |
| File pins | Local path là chuỗi và UI phải đoán từ hình dạng chuỗi; giá trị cloud có thể bị trộn `assetId`, `assetLinkId` hoặc URL transport. API dispatch trả graph bundle nguyên dạng, chưa xác minh asset resolution end-to-end. | Giữ `File` là kiểu dữ liệu semantic của pin; discriminator nằm trong value contract để tách local path và Files asset. Draft upload và asset đã link là hai trạng thái riêng; graph không chứa URL tải xuống. |

### Files trong phạm vi

- [TemplateContainerBuilder.tsx](../../app/src/features/system/components/templates/TemplateContainerBuilder.tsx): fail-fast khi snapshot/contract không hợp lệ, hợp nhất palette node contracts, upload/remap file pins, gửi `paletteNodesJson`.
- [useLocalConstantsQuery.ts](../../app/src/features/pipelines/hooks/workspace/useLocalConstantsQuery.ts): helper đọc và chuẩn hóa hai nguồn local palette contract.
- [PipelineWorkspaceContext.tsx](../../app/src/features/pipelines/context/PipelineWorkspaceContext.tsx), [pipelineWorkspaceContract.ts](../../app/src/features/pipelines/types/pipelineWorkspaceContract.ts), [useCloudTemplateWorkspace.ts](../../app/src/features/pipelines/hooks/useCloudTemplateWorkspace.ts): workspace contract thống nhất, capability không phụ thuộc source.
- [PipelineCanvas.tsx](../../app/src/features/pipelines/components/canvas/PipelineCanvas.tsx), [CanvasToolbar.tsx](../../app/src/features/pipelines/components/canvas/CanvasToolbar.tsx), [usePipelineDraftState.ts](../../app/src/features/pipelines/components/canvas/hooks/usePipelineDraftState.ts): gate graph edit, draft autosave và run độc lập.
- [TemplatePreviewPage.tsx](../../app/src/features/pipelines/pages/templates/TemplatePreviewPage.tsx) và [TemplateWorkbenchPage.tsx](../../app/src/features/pipelines/pages/templates/TemplateWorkbenchPage.tsx): capability tường minh theo mục đích từng view.
- [usePipelines.ts](../../app/src/features/pipelines/hooks/usePipelines.ts): bỏ export còn sót của endpoint legacy đã bị Orval loại.
- Đồng bộ tài liệu tại [pipeline-canvas-sync.md](../playbooks/pipeline-canvas-sync.md) và [AGENTS.md](../AGENTS.md).

### Contracts và redlines

- `paletteNodesJson` là danh sách contract chuẩn có `refId`, `name`, `kind`, pins và `sourceRef` có kiểu (ví dụ `builtin`, `workspace`, `template`); template reference pin `templateId`, `versionId`, `scriptKey` và content hash. Palette không mang source code.
- `source` không cấp hoặc thu hồi quyền. Preview Cloud chỉ đọc; local workspace sau fork là nơi chỉnh sửa, cấu hình constants và run.
- Template version là snapshot bất biến. Add to My Library chỉ là membership; fork tạo workspace độc lập và lưu provenance tới template/version, không tạo profile values theo library item.
- Template-owned assets được tải ở bước setup/fork vào workspace `/assets`. Graph giữ workspace-relative asset reference; resolver chỉ đổi sang path vật lý khi chuẩn bị chạy. Không yêu cầu Cloud Files resolver ở mỗi lần run.
- **Contract file pin:** Giữ pin `File` (không đổi thành Text). Phân biệt file local/user input với template-owned asset. Template manifest giữ asset identity/hash và metadata; sau fork, workspace graph lưu workspace-relative asset reference trỏ tới file đã stage trong `/assets`. Path tuyệt đối chỉ được resolve ở local execution boundary, không trở thành giá trị portable của template.
- **Redline publish/setup/run:** Chỉ asset được đánh dấu rõ là template-owned mới được publish và tải về khi fork; file pin người dùng không tự động bị publish. Setup xác minh hash, lưu asset trong workspace `/assets`, remap graph references và fail-fast nếu tải/kiểm tra thất bại. Run không tải lại template assets nếu workspace đã được setup.
- **Tương thích dữ liệu cũ:** Bare string ở File pin chỉ được xem là local trong workspace legacy; khi đóng gói chỉ chuyển thành template asset nếu người dùng xác nhận/đánh dấu rõ, không suy đoán từ URL. Object chỉ có `url`/`publicUrl` phải bị từ chối hoặc yêu cầu relink, không dùng làm nguồn chân lý.
- Contract backend hiện biểu diễn persisted `{ assetLinkId }` và upload draft `{ assetId, originalName }` trong [PipelineFileParameter.cs](../../api/src/Modules/Pipeline/Automation.Pipeline/Domain/ValueObjects/PipelineFileParameter.cs); vì vậy cần xác minh JSONB/save/import/dispatch có chấp nhận discriminator mới hay cần adapter/versioning trước khi chọn phạm vi triển khai. Không coi thay đổi TypeScript đơn lẻ là đủ.
- Không sửa `app/src/gen`; client đã được regenerate. Không thêm cloud dispatch/run endpoint. Thay đổi Runner (nếu cần) chỉ phục vụ resolve script template theo sourceRef/hash và nạp trong bộ nhớ; không tạo remote scheduling.
- Upload Assets xảy ra trước bước ingest/create; nếu bước sau thất bại, asset có thể chưa được gắn vào template. Retry dựa trên hash hiện có; cơ chế dọn orphan nằm ngoài phạm vi này.

### Nghiệm thu

- Frontend typecheck và production build thành công; `git diff --check` sạch.
- Thủ công: publish template có node template-source và template-owned File asset; fork thành workspace, xác nhận asset được tải vào `/assets` và graph reference được remap; xác nhận Preview không edit/run, còn workspace local có thể cấu hình và chạy.
- Không có test tự động hiện hữu cho Pipeline Canvas/workspace contract; build là kiểm tra tự động hiện có, asset publish/run cần môi trường API + desktop runner.

## Implementation Plan phần còn lại — Bỏ ScopeContainer legacy, Graph Fidelity & Local Execution (Review Gate)

> Trạng thái: người dùng yêu cầu tiếp tục thực hiện theo phạm vi này. Phần này gỡ legacy `ScopeContainer` và runner selection khỏi pipeline/template; Runner vẫn được gọi ở desktop execution boundary để bảo đảm chạy trên cùng máy. Không thay đổi binary/protocol của Runner và không bao gồm migration backend.

### Ma trận trước/sau

| Hạng mục | Trước | Sau |
|---|---|---|
| Constant node rendering | Node dựa vào palette definition để nhận view Constant; graph cũ/thiếu palette dễ rơi vào `Missing`. | `local:constant:` nhận diện được view Constant trực tiếp từ graph refId; definition nếu có vẫn cung cấp metadata/pins/value. |
| Start/Return template graph | Graph adapter có thể dùng GUID/pin ID không khớp Handle hoặc label khai báo ở parameters chưa được dùng. | Adapter chuẩn hóa pin ID, label và endpoint edge theo cùng một key; không tự đoán nếu hợp đồng nguồn mâu thuẫn. |
| Component palette contract | Master palette có thể thiếu/stale pins vì contract không được sinh lại từ Input/Output trong workspace snapshot; sửa parameters không nhất thiết làm đổi graph hash. | Palette Component được dựng từ contract parameters của snapshot đã lưu; contract rỗng xóa pins cũ; canonical graph hash bao gồm parameters để thay đổi I/O được nhận diện khi ingest. |
| Đổi pipeline trong cùng Canvas | Nodes/edges được đồng bộ theo graph ID; parameters có nguy cơ còn state pipeline trước. | Khi graph ID đổi, parameters cũng được đồng bộ từ graph mới, bỏ Variable như quy ước hiện tại và reset dirty state cần thiết. |
| ScopeContainer/runner binding | `ScopeContainer` còn dấu vết ở UI/serialization/validation nhưng không phải execution primitive; dialog còn cơ chế chọn Runner riêng. | Gỡ ScopeContainer khỏi graph hiện hành; khi đọc graph cũ, chỉ bỏ wrapper/edge của wrapper, giữ executable nodes và các edge giữa chúng. Runner selection được xử lý ở execution boundary, không ở graph. |
| Workspace context | Contract workspace chứa `runners`/`isLoadingRunners`, trộn graph state với danh sách runtime machine. | Gỡ runner fields khỏi workspace contract. Runner connectivity/identity chỉ được resolve ở execution service/desktop boundary, không chảy xuống graph/node contract. |
| Runner modeling còn sót | DSL còn `runner: "local"`; run options có `preferredRunnerId`; parameter/capsule và Form registry còn `Runner` pin selector. | Xóa runner identity/pin khỏi DSL output, run options và pipeline parameter UI/registry. Tại execution boundary chỉ xác nhận desktop-local runner sẵn sàng; không cho chọn runner khác. |
| Template lifecycle và execution | Template Workbench có thể vừa đại diện Cloud graph vừa dispatch/run, khiến Cloud source, workspace và execution bị trộn. | Cloud chỉ preview/lưu template; fork tạo local workspace. Run chỉ chạy graph của local workspace qua desktop runner; không có cloud dispatch path. |
| Palette source | Palette pins/contracts có thể render node nhưng chưa đủ thông tin xác định chính xác script source/version. | Mỗi palette entry mang typed `sourceRef`; fork giữ nguyên provenance, runner dùng sourceRef/hash để resolve script. |
| Workspace index và assets | Chưa có ranh giới rõ giữa chỉ mục workspace, dữ liệu workspace và asset gắn với template. | AppData chỉ giữ registry/index; mỗi workspace sở hữu graph/constants/assets. Fork tải template-owned assets vào `/assets` và remap graph sang workspace-relative references. |
| Inspector/capabilities | Canvas cấm thao tác đồ thị theo quyền, nhưng cần xác nhận mọi editor control trong Inspector đều nhận cùng quyền chỉnh sửa. | `canEditGraph` là nguồn gate duy nhất cho config, rename, delete, file clear/upload, struct/mode selectors; inspect vẫn hoạt động. |
| Snapshot capability | `canSaveSnapshot` có trong contract nhưng chưa có callback/UI operation được nối tại Canvas. | Không hiển thị hoặc gọi snapshot action nếu chưa có operation; chỉ gate action bằng `canSaveSnapshot` khi có storage callback thực sự. Không giả lập chức năng snapshot. |

### Các scope/task và thứ tự

1. **[Hoàn tất] Gỡ ScopeContainer end-to-end trong frontend** — xóa [ScopeContainerNode.tsx](../../app/src/features/pipelines/components/canvas/ScopeContainerNode.tsx); gỡ stage/runner-edge rules, validator/diagnostics payload và mapping khỏi graph load/save. YAML/snapshot legacy bỏ wrapper/edge nối wrapper, bỏ stage metadata và giữ executable nodes cùng edges giữa các node; serializer mới không phát sinh `stage`. Tách biệt layout legacy này khỏi execution.
2. **[Hoàn tất] Loại runner và capsule-creation khỏi parameter UI** — gỡ callback `onSpawnCapsule`/`onSpawnAction` vốn đang là no-op, nút Capsule và các kind `Variable`/`Runner`/`Repository`/`Workspace`/`Context` khỏi prop contract. Bỏ Variables tab UI và runner/repository capsule styling; giữ `PipelineParameterKind` ở DTO để đọc tương thích dữ liệu cũ.
3. **[Hoàn tất một phần] Đưa execution về desktop hiện tại** — [RunPipelineModal.tsx](../../app/src/features/pipelines/dialogs/RunPipelineModal.tsx) không chọn runner và không inject `Runner`/`runner`/`targetRunnerId`; mọi run đi qua local storage adapter tới desktop boundary. Bỏ Template Workbench cloud dispatch: run chỉ từ workspace local sau fork. Readiness/khả dụng của daemon do execution boundary báo lỗi; chưa có kiểm thử Tauri end-to-end. API `machineKey` (nếu còn cần cho membership/quota) không tham gia execution routing.
4. **[Hoàn tất] Thu gọn workspace contract** — gỡ `runners` và `isLoadingRunners` khỏi [pipelineWorkspaceContract.ts](../../app/src/features/pipelines/types/pipelineWorkspaceContract.ts), workspace hooks/pages và [PipelineEditorPage.tsx](../../app/src/features/pipelines/pages/PipelineEditorPage.tsx). Không xóa runner service dùng cho khu vực khác của ứng dụng.
5. **[Hoàn tất] Loại runner metadata khỏi DSL/run options** — bỏ `runner?: string` và trường output `runner: "local"` trong [pipelineDslConverter.ts](../../app/src/features/pipelines/utils/pipelineDslConverter.ts); bỏ `preferredRunnerId` khỏi [pipelineStorageAdapter.ts](../../app/src/features/pipelines/adapters/pipelineStorageAdapter.ts). Parser bỏ qua `runner`/`stage` cũ; serializer mới không phát sinh chúng.
6. **Đơn giản hóa Template Run** — Preview tải template từ Cloud nhưng không chạy; thao tác Use Template fork thành workspace local rồi điều hướng thẳng tới workspace. Run dùng local graph/constants/assets, gửi execution snapshot cùng toàn bộ palette snapshot/source references tới desktop runner; không gọi `DispatchCloudBundle`, không lấy constant profile từ API và không theo dõi một cloud-dispatched run.
7. **Constant fallback** — sửa [nodeDefinitions.ts](../../app/src/features/pipelines/nodeDefinitions.ts) và [PipelineNodeRouter.tsx](../../app/src/features/pipelines/components/canvas/nodes/PipelineNodeRouter.tsx) để truyền `refId` vào resolver và nhận diện `local:constant:` mà không cần palette definition.
8. **Template graph pins/edges** — sửa [templateGraphAdapter.ts](../../app/src/features/pipelines/adapters/templateGraphAdapter.ts) sau khi xác định chính xác shape `rootPipeline.parameters`, Start/Return pin IDs và edge references. Ưu tiên ID định danh contract; label chỉ dùng để hiển thị. Không dùng label thay pin ID hoặc heuristic GUID matching.
9. **Graph switch state** — sửa [usePipelineDraftState.ts](../../app/src/features/pipelines/components/canvas/hooks/usePipelineDraftState.ts) để thay parameters đồng bộ khi graph ID đổi, và kiểm tra reset dirty/selection/timer không làm flush draft của graph mới vào graph cũ.
10. **Inspector capability audit** — rà [NodeConfigInspector.tsx](../../app/src/features/pipelines/components/canvas/NodeConfigInspector.tsx), các child selectors/forms, và file control [AssetPinUpload.tsx](../../app/src/features/pipelines/components/canvas/AssetPinUpload.tsx). Truyền `isDisabled`/disabled theo chuẩn component hiện tại; không cho clear/upload/change value khi `canEditGraph=false`, vẫn cho xem và inspect.
11. **Snapshot boundary** — sửa [PipelineCanvas.tsx](../../app/src/features/pipelines/components/canvas/PipelineCanvas.tsx) và [CanvasToolbar.tsx](../../app/src/features/pipelines/components/canvas/CanvasToolbar.tsx) chỉ khi tìm được snapshot operation thực tế. Nếu chưa có operation trong scope hiện tại, ghi rõ `canSaveSnapshot` chưa được consume và để nó không tạo UI/action giả; tạo API/storage snapshot là scope riêng cần plan/duyệt riêng.
12. **Focused tests** — thêm test Constant fallback trong [nodeDefinitions.test.mts](../../app/tests/nodeDefinitions.test.mts); thêm test cho adapter pin/edge, graph-switch parameters, gỡ ScopeContainer DSL/validation, source không điều khiển execution target, và không inject runner inputs. Không mock component behavior thay cho kiểm thử contract; mọi case phải fail trước thay đổi.
13. **[Hoàn tất trong lượt này] Component contract refresh và ingest identity** — sinh pins của Component từ `parameters` trong workspace snapshot đã lưu, cho phép contract rỗng xóa pins stale, và đưa `parameters` vào canonical graph hash để thay đổi Input/Output không bị coi là graph cũ. Regression tests bao phủ palette regeneration/clear và hash thay đổi theo parameter contract.

### Contracts, assumptions và redlines

- Constant fallback chỉ tác động view selection; không tái tạo palette metadata còn thiếu, không bịa resolved constant value.
- Start/Return pin ID phải giữ ổn định giữa parameter, node handle và edge. Nếu backend bundle không cung cấp mapping xác định thì dừng tại lỗi/graph diagnostics, không đoán bằng label hoặc GUID.
- Graph ID đổi cần cô lập autosave: timer của graph A không được save graph B hoặc flush dữ liệu sai ID. Dirty state của graph mới khởi tạo sạch theo graph mới.
- Read-only ở đây là `canEditGraph=false`; các callback thao tác bị vô hiệu hóa cả ở UI lẫn handler, không chỉ ẩn control.
- Pipeline/Template graph không chứa runner identity, runner ref/pin hay yêu cầu chọn machine. Runner cùng desktop là policy của execution boundary. Runner resolve template scripts theo sourceRef/version/hash và nạp source vào bộ nhớ lúc chạy; không lưu script vào workspace hoặc persistent script cache. Đây là thay đổi so với cache-on-disk hiện tại và cần xác minh khả năng in-memory loading/import.
- `PipelineParameterKind.Variable` vẫn có thể xuất hiện trong DTO cũ nhưng Parameter Panel không còn tab/capsule creation cho nó; `onSpawnCapsule`/`onSpawnAction` trước đây không thực hiện hành động nào.
- `ScopeContainer` không thuộc execution model hiện tại. Tương thích legacy chỉ bỏ wrapper/layout và các edge nối wrapper; giữ nguyên nodes thực thi và các edge node-to-node.
- Không triển khai snapshot backend/API, không đổi API schema/package, không áp dụng migration, không regenerate Orval. Nếu API hiện buộc machine key để quota/dispatch thì giữ nó ở request boundary, tuyệt đối không ghi vào graph/runtime pin.

### Nghiệm thu và validation

- Targeted test cho node view fallback, adapter pin/edge/graph-switch, Component palette regeneration/clear, ingest graph hash khi parameter contract đổi, graph validation/serialization sau khi bỏ ScopeContainer và runner-neutral runtime input; `pnpm --dir app typecheck`, `pnpm --dir app build`, `cargo test --manifest-path crates/forgity-core/Cargo.toml --lib`, `git diff --check`.
- Manual Preview/Fork/Workspace: Preview không có Run; fork tạo workspace riêng và registry chỉ ghi index; template assets được stage/remap; workspace local cấu hình constants, palette source-aware và chạy trên daemon cục bộ không cần chọn runner.
- Snapshot chỉ nghiệm thu khi có operation thật trong scope; nếu không, báo rõ chưa hỗ trợ thay vì giả định hoàn thành.
- Kiểm chứng publish → fork/setup → desktop execution cần Cloud API và desktop runner khả dụng; xác nhận asset được stage trước run và script template chỉ được resolve/nạp trong bộ nhớ lúc run.
- Migration Phase 1 và lỗi compile test backend được theo dõi thành hạng mục riêng, không block frontend graph-fidelity nếu không phát sinh phụ thuộc. File asset execution resolution vẫn chưa được chứng minh end-to-end; không coi việc giữ `File` pin là bằng chứng resolver đã có.

## Kế hoạch kiểm thử (Verification Plan)

### Tự động

1. `dotnet build api/src/Modules/Pipeline/Automation.Pipeline/Automation.Pipeline.csproj` — 0 errors.
2. Orval client đã được regenerate; giữ nguyên `app/src/gen` và chỉ regenerate lại khi OpenAPI/backend thay đổi.
3. `pnpm --dir app build` (`tsc -b && vite build`) — đã đạt 0 errors sau các thay đổi workspace hiện tại.

### Thủ công

1. Publish template từ **Admin > Templates Admin**, mở **Templates > Preview**, rồi fork thành workspace local: xác nhận template-owned assets được tải vào workspace `/assets` và File pin được remap sang workspace-relative reference. Chạy workspace trên desktop để xác minh runner resolve script template vào RAM và asset local đúng.
2. Mở **Templates > Preview** và workspace vừa fork:
   - Không còn `Missing Definition` (cả Tool và Constant).
   - `Start` & `Return` hiển thị tên pin chuẩn (không còn GUID) và toàn bộ dây data cắm đủ.
   - Chuyển Master ↔ Component mượt mà.
   - Preview không có thao tác sửa/run; workspace local cho phép cấu hình constants và chạy.
   - Node Inspector khóa chỉnh sửa và ẩn thao tác file khi ở chế độ `read-only`.

## Phase draft: Template Fork, Workspace Registry & Local Run (chờ user duyệt)

**Trạng thái:** Chưa sửa code cho phase này. Cập nhật theo mô hình đã thống nhất: Cloud là kho template/version/artifact; AppData chỉ lập chỉ mục workspace; template phải được fork thành workspace local trước khi cấu hình hoặc chạy.
**Cổng phạm vi:** Phase này thay thế hướng “Cloud Template Workbench + local profile theo Library Item + DispatchCloudBundle”. Add to My Library chỉ là membership; không tạo profile constant mới, không dispatch template từ Cloud tới runner.

### Đối chiếu trước/sau

| Hạng mục | Trước | Sau |
|---|---|---|
| Workspace catalog | Chưa tách rõ index của các workspace khỏi nội dung workspace. | AppData giữ registry/index nhẹ (ID, tên, vị trí, template/version nguồn); graph, constants và assets ở workspace storage. |
| Sử dụng template | My Library/Workbench có thể giữ Cloud graph và đồng thời cấu hình/chạy nó. | Preview Cloud chỉ đọc; Use Template tạo bản fork độc lập thành workspace local rồi mở workspace đó. |
| Add to My Library | Luồng hiện tại tạo membership và có thể tạo API `ConstantProfile` rỗng. | Chỉ tạo membership/favorite; không tạo hoặc lưu profile values. |
| Palette/source | Palette contract có thể mô tả pins nhưng không xác định đủ nguồn script. | Mỗi node có typed `sourceRef` với template/version/script/hash hoặc nguồn local/builtin; không chứa source code hay đường dẫn ổ đĩa giả định. |
| Template assets | File reference trên graph có thể còn gắn với Cloud identity/URL hoặc local path từ máy người publish. | Khi fork, chỉ template-owned assets được tải vào workspace `/assets`; graph được remap sang workspace-relative asset references. |
| Constant setup | Có đề xuất profile riêng theo Library Item và API `ConstantProfile` cho runtime. | Constants được cấu hình trong Local Constants của workspace; không copy source values lúc publish/fork và không lưu profile trùng theo template. |
| Run template | Cloud Workbench có đường dispatch/run riêng, gắn graph Cloud với runner runtime. | Run chỉ trên workspace local qua runner cùng desktop; runner resolve script template theo `sourceRef` và nạp trong bộ nhớ tại thời điểm chạy. |

### Hợp đồng và hành vi dự kiến

- **Workspace Registry** chỉ lưu chỉ mục cần để tìm/mở workspace: workspace ID, tên, vị trí/storage identity, trạng thái và template/version nguồn. Không lưu graph, constants, palette đầy đủ hay asset bytes.
- **Fork** dùng một template version bất biến để tạo workspace độc lập: copy graph, node contracts/palette snapshot và constant declarations; lưu provenance tới template/version. Thay đổi template trên Cloud không tự cập nhật workspace đã fork.
- **Palette entry** giữ `refId`, `name`, `kind`, pins/metadata và typed `sourceRef`. Template source tối thiểu định danh `templateId`, `versionId`, `scriptKey`, content hash; workspace/builtin source có discriminator riêng. Không dùng chuỗi prefix/path heuristic làm nguồn chân lý.
- **Template assets** phải được khai báo tường minh trong manifest. Khi fork, tải các asset này vào thư mục `/assets` của workspace, xác minh hash và remap graph values sang workspace-relative references. Resolver đổi reference thành path vật lý chỉ tại local execution boundary. File pin do người dùng cung cấp không tự động trở thành template asset.
- **Constants** giữ schema/dependency expression trong Template Constant Contract, không giữ `valueJson` nguồn. Sau fork, người dùng cấu hình giá trị bằng Local Constants của workspace; thiếu required key hoặc dependency lỗi thì không chạy. Không tạo profile theo Library Item và không gửi values lên API.
- **Run** chỉ khả dụng từ local workspace. App gửi execution snapshot cùng toàn bộ palette snapshot/source references tới runner local; runner nhận biết node template qua `sourceRef`, tải artifact đúng version/hash vào RAM, xác minh hash và lập mapping node reference → script trước khi execute. Không ghi source script vào workspace hay persistent script cache.
- Cloud tiếp tục phục vụ template metadata, version/artifact và membership; không khởi tạo cloud execution, không chọn/định tuyến runner, không dùng `DispatchCloudBundle` cho luồng này.
- API `ConstantProfile` cũ được giữ tương thích dữ liệu/API nếu cần, nhưng flow mới không tạo, đọc hoặc migrate profile values đó.

### Các scope/task và thứ tự dự kiến

1. **Template manifest/palette provenance** — bổ sung và validate `sourceRef` có discriminator, immutable template version, script key và hash; palette chứa contracts/reference, không chứa source code.
2. **Workspace Registry** — bổ sung CRUD chỉ mục local trong AppData/Tauri; registry không trở thành nơi lưu nội dung workspace.
3. **Fork template thành workspace** — lấy snapshot graph/contracts/constants declarations; tạo workspace local mới, lưu origin template/version và mở workspace bằng `LocalPipelineStorageAdapter`.
4. **Stage template assets** — tải asset manifest đã khai báo vào workspace `/assets`, verify hash, remap File pin references trong graph và xử lý retry/lỗi rõ ràng.
5. **Local Constants** — bỏ local template profile theo Library Item; cấu hình required/base values trong workspace Local Constants và resolve dependency expression tại local run preparation.
6. **Đơn giản hóa run path** — Preview Cloud không có Run; workspace sau fork gọi local execution boundary. Bỏ Cloud Workbench dispatch, API profile lookup và cloud run tracking khỏi template execution flow.
7. **Runner script resolution** — runner nhận palette/source refs, tải template script đúng hash vào RAM, lập node-to-script index và fail-fast khi artifact/auth/hash/import không hợp lệ. Không persist script vào ổ đĩa; cần xác minh tương thích với Python module/import và requirements trước khi chốt chi tiết loader.
8. **Focused tests** — registry chỉ lưu index; fork tạo workspace tách biệt; asset download/hash/remap; palette source provenance; constant resolution; runner mapping/source integrity; không phát sinh cloud dispatch.

### File dự kiến sửa

- [TemplateContainerBuilder.tsx](D:/FullStack/Automation/app/src/features/system/components/templates/TemplateContainerBuilder.tsx), [TemplateDtoModels.cs](D:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Templates/TemplateDtoModels.cs), [CreateTemplateContainer.cs](D:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Features/Templates/CreateTemplateContainer.cs): publish schema, palette source references và template asset manifest; loại source values.
- [TemplatePreviewPage.tsx](D:/FullStack/Automation/app/src/features/pipelines/pages/templates/TemplatePreviewPage.tsx), [TemplateWorkbenchPage.tsx](D:/FullStack/Automation/app/src/features/pipelines/pages/templates/TemplateWorkbenchPage.tsx), [templateGraphAdapter.ts](D:/FullStack/Automation/app/src/features/pipelines/adapters/templateGraphAdapter.ts): Preview/fork flow và materialize local graph/source-aware palette; Template Workbench không còn giữ Cloud graph hay execution path, được chuyển thành workspace-local route hoặc bỏ khi workspace page đảm nhiệm luồng này.
- [workspace_db.rs](D:/FullStack/Automation/crates/forgity-core/src/workspace_db.rs), [workspace.rs](D:/FullStack/Automation/app/src-tauri/src/commands/workspace.rs), [lib.rs](D:/FullStack/Automation/app/src-tauri/src/lib.rs): Workspace Registry index và local workspace setup/fork commands; không lưu graph/assets trong registry.
- Local Constants UI/storage và template asset resolver: dùng workspace-local values, stage assets, remap relative references; không thêm profile theo Library Item.
- `runner/src/` script resolution/loading path: resolve immutable template artifact refs, verify hash, load source in-memory và tạo node-to-script index; chi tiết file phụ thuộc trace implementation trước khi thực thi phase.
- API template membership/artifact endpoints hiện có được rà soát để giữ vai trò storage/catalog; không thêm cloud dispatch/run endpoint.

### Redlines và nghiệm thu

- Không lưu workspace graph/data/assets trong AppData registry; registry chỉ index. Không để local absolute paths hoặc secret values lọt vào template manifest.
- Không tự động đóng gói mọi file pin: chỉ template-owned assets được tác giả khai báo mới được publish/fork; user input files không bị upload hay ghi đè.
- Không lưu script template vào workspace hay persistent runner cache. Verify hash trước khi execute; thiếu artifact, sai version/hash, thiếu required constant hoặc asset setup lỗi phải dừng với lỗi tường minh.
- Không có API ConstantProfile value mới trong flow Add to My Library/fork/run; không có `DispatchCloudBundle` hay cloud scheduling trong template execution.
- Manual: publish template → add to library → fork workspace → xác nhận registry chỉ có metadata index, graph/palette/values nằm ở workspace → template assets nằm trong `/assets` và graph references đã remap → cấu hình Local Constants → run trên daemon cùng desktop, xác minh template script được nạp trong bộ nhớ.
- Chạy `pnpm --dir app run typecheck`, `pnpm --dir app run build`, focused Rust/backend tests theo phần thực sự đổi và `git diff --check`; kiểm thử runner in-memory loading bao gồm module/import/requirements edge cases trước khi chốt yêu cầu “không lưu script trên ổ đĩa”.
