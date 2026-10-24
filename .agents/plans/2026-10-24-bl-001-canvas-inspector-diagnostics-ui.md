# Kế Hoạch Triển Khai `BL-001`: Canvas & Inspector Diagnostics UI (Phase 2C / R3 UI)

> **Ngày lập:** 24/10/2026
> **Mã Backlog:** [`BL-001`](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md)
> **Kế hoạch gốc liên quan:**
> - [2026-10-22-node-resolution-and-validation-lifecycle.md (R3 UI)](file:///d:/FullStack/Automation/.agents/plans/2026-10-22-node-resolution-and-validation-lifecycle.md)
> - [2026-10-23-contracts-validation-buildtime-runtime-architecture.md (Phase 2C)](file:///d:/FullStack/Automation/.agents/plans/2026-10-23-contracts-validation-buildtime-runtime-architecture.md)
> **Trạng thái:** ✅ Đã hoàn thành (24/10/2026)

---

## 1. Bối Cảnh & Mục Tiêu

Sau khi hoàn thành **Phase 1, 2A, 2B và Phase 3 (`BL-002`)**, phía Backend (`Automation.Pipeline`) đã có đầy đủ:
- **`IPipelineContractValidator`** & **`PipelineDiagnostic`** tại [`PipelineDiagnostic.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/Validation/PipelineDiagnostic.cs) với 2 mức độ (`Error`, `Warning`) và 8 mã chẩn đoán chuẩn hóa (`DagCycleDetected`, `MissingNodeDefinition`, `UnselectedStructSchema`, `UnresolvedRequiredPin`, `DanglingEdgePin`, `IncompatiblePinType`, `OrphanNode`, `UnconnectedReturnOutput`), kèm tọa độ chính xác (`NodeId`, `NodeLabel`, `PinId`, `EdgeId`).
- **`ITransientPipelineGraphFactory`** tại [`TransientPipelineGraphFactory.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Graph/TransientPipelineGraphFactory.cs) cho phép [`ValidatePipeline.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Features/Validation/ValidatePipeline.cs) kiểm tra trực tiếp bản nháp (`Nodes`, `Edges`, `Parameters`) đang vẽ trên Canvas mà không cần chờ lưu DB.

Tuy nhiên, trên **Frontend (`web/`)**:
1. Các model Orval trong `web/src/gen/model` (`ValidatePipelineQuery`, `ValidatePipelineResponse`, `NodePaletteItemDto`) chưa được chạy `gen:api` lại sau khi Backend bổ sung `Diagnostics`, draft snapshot và `HasDynamicPins`.
2. Nút **Validate** trên [`CanvasToolbar.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasToolbar.tsx) mới chỉ gửi `{ runtimeInputs: {} }` rỗng (bỏ qua trạng thái draft chưa lưu) và chỉ bắn `toast` chung chung, không lưu danh sách `PipelineDiagnostic` vào state.
3. [`NodeCard.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeCard.tsx), [`NodeHeader.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeHeader.tsx), [`PinRow.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/PinRow.tsx) và [`NodeConfigInspector.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/NodeConfigInspector.tsx) chưa hiển thị cảnh báo/lỗi Build-Time theo từng Node và từng Pin, cũng chưa có bảng tổng hợp lỗi giúp click-to-focus tới Node bị lỗi.

**Mục tiêu của `BL-001`:**
Khép kín vòng đời **Resolve $\rightarrow$ Validate $\rightarrow$ Inspect $\rightarrow$ Fix $\rightarrow$ Run** ngay trên Pipeline Canvas với độ chính xác 100% theo dữ liệu từ `IPipelineContractValidator`.

---

## 2. Bảng Đối Chiếu Trước & Sau (Before vs After Matrix)

| Hạng mục | Trước khi thực hiện (Before) | Sau khi thực hiện (After) |
| :--- | :--- | :--- |
| **1. Nguồn dữ liệu `Diagnostics` từ Backend & Orval Sync** | - `PipelineGraphDto` (trả về từ `GetPipelineGraph` và `SavePipelineGraph`) chưa đính kèm `Diagnostics`.<br>- `web/src/gen` chưa có type `PipelineDiagnostic`, `ValidatePipelineQuery` chưa có `nodes/edges/parameters`, `NodePaletteItemDto` chưa có `hasDynamicPins`. | - Bổ sung `IReadOnlyList<PipelineDiagnostic>? Diagnostics = null` vào [`PipelineGraphDto`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Features/Authoring/Dtos/PipelineDtos.cs#L141-L151) và tính toán tự động trong [`PipelineGraphDtoBuilder.BuildDtoAsync`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Graph/PipelineGraphDtoBuilder.cs#L39-L107).<br>- Chạy `pnpm --dir web run gen:api` để đồng bộ toàn bộ DTO và enum mới từ Backend sang `web/src/gen`. |
| **2. Quản lý trạng thái Validation & Độ tươi dữ liệu (`Freshness State`)** | - Không có state lưu trữ `diagnostics`.<br>- `handleValidate` chỉ gửi `{ runtimeInputs: {} }` nên kiểm tra nhầm bản cũ trong DB nếu draft chưa kịp lưu hoặc bị chặn lưu. | - Tạo hook [`usePipelineDiagnostics.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineDiagnostics.ts) quản lý:<br>  + `diagnostics`: danh sách `PipelineDiagnostic[]` mới nhất (khởi tạo từ `graph.diagnostics`, cập nhật sau mỗi lần `SavePipelineGraph` thành công hoặc khi bấm `Validate`).<br>  + `validationStatus`: `'unvalidated' \| 'validating' \| 'valid' \| 'invalid' \| 'stale'`. Khi người dùng sửa đổi `nodes`/`edges`/`parameters` (`isDirty === true`), trạng thái chuyển sang `'stale'` (không bao giờ báo "Valid" giả tạo trên đồ thị vừa bị sửa).<br>  + Lập chỉ mục O(1) `diagnosticsByNodeId` và `diagnosticsByPinKey` (`${nodeId}:${pinId}`) cung cấp qua [`PipelineFormScope.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/PipelineFormScope.tsx). |
| **3. Hiển thị trực quan trên `NodeCard`, `NodeHeader` & `PinRow`** | - `NodeCard` & `NodeHeader` chỉ hiển thị trạng thái Runtime (`running`, `succeeded`, `failed`).<br>- `PinInputRow` / `PinOutputRow` không hiển thị lỗi thiếu kết nối (`UnresolvedRequiredPin`), lệch kiểu (`IncompatiblePinType`) hay đứt dây (`DanglingEdgePin`). | - Khi `status === "idle"` (không đang chạy Runtime):<br>  + [`NodeCard.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeCard.tsx) & [`NodeHeader.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeHeader.tsx) tự động lấy `nodeId` qua `useNodeId()` của `@xyflow/react` và tra cứu `diagnosticsByNodeId`: hiển thị viền/badge đỏ nếu có `Error`, viền/badge vàng (amber) nếu chỉ có `Warning`, kèm banner tóm tắt lỗi cấp độ Node ở đáy card.<br>  + [`PinRow.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/PinRow.tsx) (`PinInputRow`, `PinOutputRow`) tra cứu `diagnosticsByPinKey`: tô nổi bật tên chân Pin + icon `AlertCircle` / `AlertTriangle` kèm `title` (tooltip) chứa thông điệp lỗi cụ thể của chân Pin đó. |
| **4. Bảng chi tiết trong `NodeConfigInspector` & `CanvasDiagnosticsPopover`** | - `NodeConfigInspector` không hiển thị danh sách lỗi/cảnh báo của Node đang chọn.<br>- Không có danh sách tổng hợp lỗi trên Canvas để nhảy nhanh tới Node bị lỗi. | - Trong [`NodeConfigInspector.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/NodeConfigInspector.tsx): Hiển thị khối **Node Diagnostics** ngay đầu Inspector của Node đang chọn, liệt kê từng lỗi/cảnh báo cấp Node và cấp Pin; đồng thời hiển thị dòng lỗi inline ngay dưới trường input tương ứng trong form.<br>- Trên [`CanvasToolbar.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasToolbar.tsx): Nút **Validate** hiển thị badge số lượng `Errors` / `Warnings` (hoặc chấm báo `stale`) kèm **Diagnostics Popover / Drawer** [`CanvasDiagnosticsPanel.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasDiagnosticsPanel.tsx). Click vào bất kỳ dòng lỗi nào sẽ tự động pan/zoom camera (`setCenter`) tới đúng Node đó và mở `NodeConfigInspector`. |
| **5. Chốt chặn Pre-Run (`RunPipelineModal`)** | - Nếu đồ thị có lỗi cấu hình hoặc lỗi cấu trúc, người dùng vẫn mở modal Run bình thường và chỉ nhận lỗi HTTP 422/400 dạng chuỗi thô khi bấm Run. | - Khi bấm **Run Pipeline** hoặc trong [`RunPipelineModal.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/dialogs/RunPipelineModal.tsx): Nếu đồ thị có `Error` chặn thực thi (ngoại trừ các `UnresolvedRequiredPin` sẽ được người dùng điền ngay trong form Runtime Inputs của Modal) hoặc khi API trả về HTTP 422 kèm `diagnostics`, cập nhật ngay `diagnostics` lên Canvas và cho phép click nhảy tới Node lỗi để sửa. |

---

## 3. Thiết Kế Chi Tiết Từng Phân Khu

### 3.1. Backend: Đính kèm `Diagnostics` vào `PipelineGraphDto` (Tự động hóa khi Load & Autosave)

1. **[`PipelineDtos.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Features/Authoring/Dtos/PipelineDtos.cs#L141-L151)**:
   - Thêm thuộc tính tùy chọn `IReadOnlyList<PipelineDiagnostic>? Diagnostics = null` vào cuối record `PipelineGraphDto`.
2. **[`PipelineGraphDtoBuilder.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Graph/PipelineGraphDtoBuilder.cs)**:
   - Inject `IPipelineContractValidator` vào constructor chính (và khởi tạo `new PipelineContractValidator(...)` trong constructor phụ phục vụ test).
   - Trong `BuildDtoAsync`, gọi `var validation = await _contractValidator.ValidateAsync(pipeline, null, ct);` (tận dụng cơ chế resolve đồng nhất) và truyền `Diagnostics: validation.Diagnostics` vào `PipelineGraphDto`.
   - Trong `HydrateFilesAsync`, giữ nguyên `graph with { Nodes = nodeDtos }` để bảo toàn `Diagnostics`.

> **Lợi ích kiến trúc:** Nhờ bước này, cả khi mở trang (`GetPipelineGraph`) lẫn sau mỗi nhịp **Autosave 600ms** (`SavePipelineGraph`), Frontend đều nhận được `Diagnostics` mới nhất từ Backend mà **không tốn thêm request phụ**! Còn khi `SavePipelineGraph` bị chặn bởi Structural Gate (ví dụ nối dây tạo chu trình hoặc lệch kiểu dữ liệu), hook trên Frontend sẽ tự động gọi `ValidatePipeline` kèm bản nháp (`BuildFromDraftSnapshot`) để lấy `Diagnostics` chi tiết về tô đỏ đúng Node/Pin vừa gây lỗi.

### 3.2. Đồng bộ Orval API Client (`web/src/gen`)

- Tuân thủ tuyệt đối [`rules/frontend.md` §2](file:///d:/FullStack/Automation/.agents/rules/frontend.md#L17-L22): Không sửa tay `web/src/gen`.
- Khi bắt đầu triển khai, kiểm tra/bật Backend API và chạy `pnpm --dir web run gen:api` để Orval tự động sinh:
  - `PipelineDiagnostic`, `PipelineDiagnosticSeverity`, `PipelineDiagnosticCode`
  - `PipelineGraphDto.diagnostics`
  - `ValidatePipelineQuery` (`nodes`, `edges`, `parameters`, `runtimeInputs`)
  - `ValidatePipelineResponse.diagnostics`
  - `NodePaletteItemDto.hasDynamicPins` & `isVolatile`
- Dọn bỏ ép kiểu tạm `((definition as any)?.hasDynamicPins ?? definition?.isDynamic)` tại [`PipelineNodeRouter.tsx:24`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/PipelineNodeRouter.tsx#L24) sang dùng trực tiếp `definition?.hasDynamicPins`.

### 3.3. Frontend Hook & Context: `usePipelineDiagnostics` & `PipelineFormScope`

1. **Tạo mới [`usePipelineDiagnostics.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineDiagnostics.ts)**:
   - Nhận đầu vào: `graph: ExtendedPipelineGraphDto`, `nodes: Node[]`, `edges: Edge[]`, `parameters: PipelineParameterDto[]`, `isDirty: boolean`, và `lastSavedDiagnostics?: PipelineDiagnostic[] | null` từ `usePipelineDraftState`.
   - Xây dựng hàm `buildDraftSnapshotPayload(nodes, edges, parameters)` (dùng chung logic ánh xạ `SavePipelineNodeItem` / `SavePipelineEdgeItem` với `usePipelineDraftState`) để gửi kèm vào `validateMutation.mutateAsync({ nodes, edges, parameters, runtimeInputs: {} })`.
   - Quản lý vòng đời trạng thái `validationStatus`:
     - Khởi tạo từ `graph.diagnostics`: nếu có `Error` $\rightarrow$ `'invalid'`, nếu không có `Error` $\rightarrow$ `'valid'`.
     - Khi `isDirty` chuyển sang `true` (người dùng đang gõ hoặc kéo dây chưa lưu xong) $\rightarrow$ đánh dấu `isStale = true` (`validationStatus = 'stale'`), đồng thời **tự động lọc bỏ các diagnostic của Node/Edge đã bị xóa** để không hiển thị bóng ma trên phần tử không còn tồn tại.
     - Khi `SavePipelineGraph` hoàn tất trả về `savedGraph.diagnostics` $\rightarrow$ cập nhật `diagnostics = savedGraph.diagnostics` và `isStale = false`.
     - Khi `SavePipelineGraph` trả về lỗi 400 (do Structural Gate chặn chu trình DAG / lệch kiểu Pin / đứt dây) $\rightarrow$ tự động gọi `validateDraft()` với snapshot hiện tại để lấy `diagnostics` cấu trúc từ `ValidatePipeline` và highlight ngay trên Canvas.
   - Cung cấp các cấu trúc tra cứu O(1) đã được `useMemo`:
     - `diagnosticsByNodeId: Map<string, PipelineDiagnostic[]>`
     - `diagnosticsByPinKey: Map<string, PipelineDiagnostic[]>` (key: `${nodeId}:${pinId.toLowerCase()}`)
     - `graphLevelDiagnostics: PipelineDiagnostic[]` (các diagnostic không gắn `nodeId` hoặc gắn với chu trình toàn đồ thị)
     - `errorCount: number`, `warningCount: number`
2. **Mở rộng [`PipelineFormScope.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/PipelineFormScope.tsx)**:
   - Bổ sung `diagnostics?: PipelineDiagnosticsScope` vào `PipelineFormScopeValue` và thêm hook tiện ích `useNodeDiagnostics(nodeId?: string | null)` để bất kỳ Node/Pin/Inspector nào cũng đọc được chẩn đoán của chính mình mà **không cần nhét `diagnostics` vào `node.data`** (giữ nguyên tính bất biến của React Flow `node.data` và không kích hoạt autosave lặp vô tận).

### 3.4. Hiển Thị Trực Quan Trên Canvas (`NodeCard`, `NodeHeader`, `PinRow`)

1. **[`NodeCard.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeCard.tsx)**:
   - Dùng `useNodeId()` từ `@xyflow/react` kết hợp `useNodeDiagnostics(nodeId)`.
   - Phân tách rõ rệt giữa **Runtime Execution Status** (`running | succeeded | failed`) và **Build-Time Diagnostics**:
     - Khi Node đang chạy hoặc vừa chạy xong (`status !== "idle"`), ưu tiên hiển thị trạng thái Runtime như hiện tại.
     - Khi `status === "idle"`:
       - Nếu Node có ít nhất 1 `Error`: viền `border-destructive/80 ring-1 ring-destructive/30` và hiển thị thanh banner gọn ở đáy card (nếu có lỗi cấp Node như `MissingNodeDefinition`, `UnselectedStructSchema`, `DagCycleDetected`).
       - Nếu Node chỉ có `Warning` (ví dụ `OrphanNode`, `UnconnectedReturnOutput`): viền `border-amber-500/70` và banner cảnh báo màu amber nhẹ.
2. **[`NodeHeader.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeHeader.tsx)**:
   - Khi `status === "idle"`, hiển thị badge/icon nhỏ góc phải header nếu Node có `Error` (icon `AlertCircle` đỏ + số lượng lỗi) hoặc `Warning` (icon `AlertTriangle` vàng + số lượng cảnh báo) kèm `title` liệt kê toàn bộ thông điệp chẩn đoán của Node.
3. **[`PinRow.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/PinRow.tsx) (`PinInputRow` & `PinOutputRow`)**:
   - Tra cứu chẩn đoán của chân Pin qua `(nodeId, pinId)`.
   - Nếu chân Pin có `Error` (`UnresolvedRequiredPin`, `IncompatiblePinType`, `DanglingEdgePin`):
     - Đổi màu viền `Handle` hoặc thêm vòng ring đỏ quanh `Handle`, hiển thị icon `AlertCircle` đỏ cạnh nhãn Pin, đổi màu nhãn sang `text-destructive` và gắn `title={pinDiagnostics.map(d => d.message).join('\n')}`.
   - Nếu chân Pin có `Warning` (`UnconnectedReturnOutput`):
     - Hiển thị icon `AlertTriangle` màu amber kèm tooltip thông báo.

### 3.5. Hiển Thị Chi Tiết Trên `NodeConfigInspector` & `CanvasToolbar` (`CanvasDiagnosticsPanel`)

1. **[`NodeConfigInspector.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/NodeConfigInspector.tsx)**:
   - Ở đầu phần thân `ScrollArea`, nếu Node đang chọn có `diagnostics`, hiển thị khối **Diagnostics Summary** (phân biệt rõ khung đỏ cho `Error` và khung vàng cho `Warning`, hiển thị mã `code`, `pinId` nếu có, và `message`).
   - Đối với từng trường trong `unwiredInputs` (hoặc `wiredInputs` nếu dây nối bị `IncompatiblePinType`), hiển thị dòng cảnh báo màu đỏ/vàng ngay bên dưới control đó để người dùng biết chính xác cần điền hoặc sửa trường nào.
2. **[`CanvasToolbar.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasToolbar.tsx) & [`CanvasDiagnosticsPanel.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasDiagnosticsPanel.tsx) (Mới)**:
   - Nâng cấp cụm nút **Validate** trên Toolbar:
     - Hiển thị trạng thái trực quan:
       - Đỏ (`X Errors`) nếu `errorCount > 0`
       - Vàng (`Y Warnings`) nếu `errorCount === 0 && warningCount > 0`
       - Xanh (`Valid`) nếu `errorCount === 0 && warningCount === 0` (kèm dấu chấm lửng/mờ nếu `isStale === true`)
     - Thêm nút mở **Diagnostics Panel** (Popover/Floating Panel neo dưới Toolbar) liệt kê toàn bộ `Errors` và `Warnings` của đồ thị, kèm nút **"Re-validate Draft"**.
     - Khi người dùng click vào một mục trong `CanvasDiagnosticsPanel`:
       - Nếu mục đó có `nodeId`, tự động gọi hàm `focusNode(nodeId)` (tính toán tọa độ thực của Node kể cả khi nằm trong `ScopeContainer`, gọi `setCenter` để pan/zoom mượt tới Node và gọi `setSelectedNodeId(nodeId)` để mở ngay `NodeConfigInspector`).

---

## 4. Danh Sách File Dự Kiến Sửa Đổi / Tạo Mới

### Backend (`api/`)
1. **[MODIFY]** [`PipelineDtos.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Features/Authoring/Dtos/PipelineDtos.cs) — Bổ sung `IReadOnlyList<PipelineDiagnostic>? Diagnostics = null` vào `PipelineGraphDto`.
2. **[MODIFY]** [`PipelineGraphDtoBuilder.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/BuildTime/Graph/PipelineGraphDtoBuilder.cs) — Tích hợp `IPipelineContractValidator` để trả về `Diagnostics` trong `BuildDtoAsync`.

### Авто-gen API (`web/src/gen/`)
3. **[REGENERATE]** Chạy `pnpm --dir web run gen:api` (cập nhật các model trong `web/src/gen/model/`).

### Frontend (`web/`)
4. **[CREATE]** [`usePipelineDiagnostics.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineDiagnostics.ts) — Hook quản lý state chẩn đoán, độ tươi dữ liệu (`stale`), lập chỉ mục theo Node/Pin, và gọi `ValidatePipeline` kèm draft snapshot.
5. **[MODIFY]** [`usePipelineDraftState.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineDraftState.ts) — Tách hàm helper `buildDraftSavePayload` để dùng chung cho cả Autosave và Validate Draft; truyền callback `onDiagnosticsUpdated` / `onSaveStructuralError` khi `SavePipelineGraph` trả kết quả.
6. **[MODIFY]** [`hooks/index.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/index.ts) — Export `usePipelineDiagnostics`.
7. **[MODIFY]** [`PipelineFormScope.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/PipelineFormScope.tsx) — Mở rộng context với thông tin `diagnostics` và export hook `useNodeDiagnostics`.
8. **[MODIFY]** [`NodeCard.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeCard.tsx) — Hiển thị viền và banner chẩn đoán Build-Time khi `status === "idle"`.
9. **[MODIFY]** [`NodeHeader.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/NodeHeader.tsx) — Hiển thị badge/icon số lượng `Error` / `Warning` trên đầu Node.
10. **[MODIFY]** [`PinRow.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/parts/PinRow.tsx) — Hiển thị trạng thái lỗi/cảnh báo trên từng chân `PinInputRow` và `PinOutputRow`.
11. **[MODIFY]** [`NodeConfigInspector.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/NodeConfigInspector.tsx) — Hiển thị danh sách Diagnostics của Node đang chọn ở đầu Inspector và inline dưới từng Pin.
12. **[CREATE]** [`CanvasDiagnosticsPanel.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasDiagnosticsPanel.tsx) — Bảng tổng hợp toàn bộ `Errors` & `Warnings` trên Canvas hỗ trợ click-to-focus tới Node lỗi.
13. **[MODIFY]** [`CanvasToolbar.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/CanvasToolbar.tsx) — Tích hợp nút Validate có badge số lượng lỗi/cảnh báo và đóng/mở `CanvasDiagnosticsPanel`.
14. **[MODIFY]** [`PipelineCanvas.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/PipelineCanvas.tsx) — Kết nối `usePipelineDiagnostics`, hàm `focusNode(nodeId)`, truyền vào `PipelineFormScopeProvider` và `CanvasToolbar`.
15. **[MODIFY]** [`PipelineNodeRouter.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/nodes/PipelineNodeRouter.tsx) — Sử dụng trực tiếp `definition?.hasDynamicPins` sau khi Orval đã sinh model mới.

---

## 5. Ranh Giới Đỏ (Redlines) & Edge Cases Cần Bảo Toàn

1. **Tuyệt đối không lưu `diagnostics` vào `node.data` của React Flow**:
   - Nếu ghi `diagnostics` vào `node.data`, React Flow sẽ coi Node bị thay đổi hoặc kích hoạt lại `useEffect` theo dõi `nodes` trong `usePipelineDraftState`, gây vòng lặp Autosave vô tận. Việc truyền qua `PipelineFormScope` + `useNodeId()` giúp cô lập hoàn toàn dữ liệu chẩn đoán khỏi dữ liệu lưu trữ của Node.
2. **Phân biệt rõ trạng thái `stale` khi người dùng đang chỉnh sửa**:
   - Ngay khi người dùng thay đổi cấu hình hoặc kéo/xóa dây (`isDirty === true`), kết quả kiểm tra cũ được đánh dấu `isStale = true`. Khi người dùng xóa một Node hoặc xóa một Pin, các diagnostic gắn với Node/Pin đã xóa được lọc bỏ tức thì trên UI để không gây nhiễu.
3. **Ưu tiên trạng thái Runtime khi đang thực thi (`isExecuting`)**:
   - Trong lúc Pipeline đang chạy hoặc người dùng đang xem lại lịch sử một phiên chạy (`live.activeExecutionId != null`), `NodeCard` và `NodeHeader` ưu tiên hiển thị trạng thái thực thi (`running`, `succeeded`, `failed`) để không làm rối màu sắc theo dõi tiến độ.
4. **Tuân thủ React Aria Shadcn Stack (`rules/frontend.md` §5)**:
   - Mọi `Button` từ `@/components/ui/button` sử dụng `onPress` và `isDisabled` (không dùng `onClick` hay `disabled` trên component `Button`).

---

## 6. Kế Hoạch Kiểm Thử & Nghiệm Thu (Verification Steps)

1. **Backend Unit & Integration Tests**:
   - Chạy `dotnet test api/tests/Automation.Pipeline.Tests/Automation.Pipeline.Tests.csproj -m:1` đảm bảo `PipelineGraphDtoBuilder` trả về `Diagnostics` chính xác và toàn bộ 191+ bài test xanh 100%.
2. **Orval Generation & TypeScript Check**:
   - Chạy `pnpm --dir web run gen:api`.
   - Chạy `pnpm --dir web run typecheck` và `pnpm --dir web build` đảm bảo 0 lỗi TypeScript và bundle thành công.
3. **Frontend Unit Tests (Vitest)**:
   - Bổ sung unit test cho logic gom nhóm/lọc chẩn đoán trong `usePipelineDiagnostics` và hiển thị chẩn đoán trên Node/Inspector.
   - Chạy `pnpm --dir web test -- --run`.
4. **Cập nhật Tài liệu & Backlog**:
   - Cập nhật [`.agents/playbooks/pipeline-canvas-sync.md`](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-canvas-sync.md) và đánh dấu `BL-001` là `Resolved` trong [`.agents/plans/BACKLOG.md`](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md) sau khi hoàn tất.

