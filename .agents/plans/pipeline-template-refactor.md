# Kế hoạch triển khai: Kiến trúc Strategy/Adapter (Local/Cloud), Read-Only Behavior, File Pin Cloud Asset & Dọn Legacy

## Mục tiêu & Bức tranh kiến trúc tổng thể

Đồng bộ toàn bộ luồng dữ liệu từ 2 nguồn (Cloud DB / Local Workspace) qua một lớp **Client Strategy / Adapter** thống nhất, cung cấp đủ **`contract` + `palette` + `graph`** vào **`pipelineHook` / `PipelineWorkspaceContext`**, và điều khiển nhất quán **`behavior: edit | read-only`** xuống cả 3 vùng UI (**Node Inspector**, **Canvas Action**, **Input/Output**).

```
[Database] ──(Backend .NET wrap)──┐
                                  ├──▶ [Client Strategy / Adapter (Local | Cloud)]
[Local Workspace] ─(Tauri wrap)───┘              │
                                                 ▼  (contract + palette + graph)
                                    [pipelineHook + PipelineWorkspaceContext]
                                                 │
                                    behavior: (edit | read-only)
                                      ├──▶ Node Inspector (sửa/xóa vs chỉ đọc)
                                      ├──▶ Canvas Action (kéo nối/xóa/save vs pan/zoom/inspect)
                                      └──▶ Input / Output (Start/Return, File local vs Cloud Asset)
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
  1. Gọi Tauri `load_workspace_node_contracts` lấy `NodePaletteItemDto[]` của các node đang dùng trong template, gửi vào `paletteNodesJson` của `CreateTemplateContainer`.
  2. Quét các pin kiểu `File`/`FilePath` trong `configValues` đang trỏ path local (`D:/...`) → upload lên Cloud Files (`requestUpload` → PUT file → `confirmUpload`) và remap `configValues[pinId]` thành `{ assetId, fileName, publicUrl }` (hiển thị đúng tên file `DazClothUE5.py`).

---

### 3. Client Strategy / Adapter & `PipelineWorkspaceContext` (`edit | read-only` behavior)

#### [MODIFY] `context/PipelineWorkspaceContext.tsx`

- Thêm `isReadOnly: boolean` (hoặc `accessMode: "edit" | "read-only"`) vào `PipelineWorkspaceContextValue`.
- Chuẩn hóa **`CloudPipelineStorageAdapter`** (`mode: "cloud"`, `saveDraft` là no-op an toàn ở chế độ `read-only`) và **`LocalPipelineStorageAdapter`** (`mode: "local"`, `edit`).

#### [NEW] `features/pipelines/hooks/useCloudTemplateWorkspace.ts` (`pipelineHook` cho Cloud Template)

- Hook adapter cho Cloud Template (tương đương bộ hook của `LocalWorkspacePage`):
  - Nhận `members`, `paletteNodesJson`, `selectedVersionId` → trả về thống nhất **`{ contract, palette, graph, storage, isReadOnly: true }`**.
  - Lazy-load `graph` theo `selectedVersionId` qua `GET cloud-data/pipelines/{versionId}` (`staleTime: Infinity`).

#### [MODIFY] `pages/templates/TemplatePreviewPage.tsx` & `pages/templates/TemplateWorkbenchPage.tsx`

- Bọc `<PipelineWorkspaceProvider mode="cloud" isReadOnly={true} storage={cloudStorage} paletteItems={palette} structCatalogue={contract} ...>` quanh `<PipelineCanvas />` thay vì render trần không có Provider.

---

### 4. Sửa dứt điểm 3 lớp Behavior & Graph Rendering

#### [MODIFY] `nodeDefinitions.ts` & `nodes/PipelineNodeRouter.tsx`

- `nodeView(kind, definition, refId?)`: nhận diện thẳng `refId?.startsWith("local:constant:")` là Pure `"Constant"` (không cần phụ thuộc local palette mới thoát `Missing Definition`).

#### [MODIFY] `adapters/templateGraphAdapter.ts`

- Chuẩn hóa `Start` / `Return` pins và `edges`: map `label` của pin từ `rp.parameters` (`param.label || param.key`) thay vì để lộ GUID (`37f8cd52-...`); chuẩn hóa `sourcePin`/`targetPin` khớp với `<Handle id="..." />` trên node để dây data cắm đủ.

#### [MODIFY] `components/canvas/hooks/usePipelineDraftState.ts`

- Đồng bộ `setParameters(...)` trong `useEffect` khi `graph.id` thay đổi (sửa lỗi giữ nhầm pin `Start`/`Return` khi chuyển Master ↔ Component).
- Kiểm tra `!isReadOnly && typeof storageRef.current?.saveDraft === "function"` trước khi flush draft.

#### [MODIFY] `components/canvas/NodeConfigInspector.tsx` & `components/canvas/PipelineCanvas.tsx`

- Đọc `isReadOnly` thống nhất từ `PipelineWorkspaceContext` (hoặc prop):
  - **Node Inspector**: Khi `isReadOnly`, khóa toàn bộ input trong `FormRenderer`, ẩn nút xóa/clear file (`x`), đổi `StructSelector`/`ModeSelector` sang chỉ đọc.
  - **Canvas Action**: Khi `isReadOnly`, khóa nối dây (`onConnect`), thêm/xóa node, undo/redo và auto-save; giữ pan/zoom + click node để inspect.

---

## Kế hoạch kiểm thử (Verification Plan)

### Tự động

1. `dotnet build api/src/Modules/Pipeline/Automation.Pipeline/Automation.Pipeline.csproj` — 0 errors.
2. `pnpm --dir app gen:api` (sau khi bạn restart API) — đồng bộ DTO `paletteNodesJson` và xóa hooks legacy.
3. `pnpm --dir app build` (`tsc -b && vite build`) — 0 errors.

### Thủ công

1. Publish lại template từ **Admin > Templates Admin**: kiểm tra file pin local được upload & remap đúng tên file.
2. Mở **Templates > Preview** và **My Library > Workbench**:
   - Không còn `Missing Definition` (cả Tool và Constant).
   - `Start` & `Return` hiển thị tên pin chuẩn (không còn GUID) và toàn bộ dây data cắm đủ.
   - Chuyển Master ↔ Component mượt mà.
   - Node Inspector khóa chỉnh sửa và ẩn nút xóa file ở chế độ `read-only`.
