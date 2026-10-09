# Kế hoạch Kỹ Thuật: Hoàn Thiện Import/Export Node Library & Khắc Phục Lỗi Nối Dây Exec Trên Canvas

**Ngày lập**: 2026-10-09  
**Mục tiêu**: 
1. Khi Import gói Pipeline Bundle JSON, hệ thống **bắt buộc tạo và liên kết đầy đủ các Custom Node trong Node Library trước** (bao gồm file script Python vật lý trong Asset storage), sau đó mới tạo Pipeline và liên kết chính xác `RefId` vào các Node này.
2. Khắc phục triệt để lỗi **không nối được dây Exec** trên Pipeline Canvas do lệch tên Exec Pin giữa Backend/Frontend, giới hạn hardcode trong connection rules và fallback node rỗng khi thiếu definition.
3. Đảm bảo toàn bộ luồng ổn định, chuẩn bị sẵn sàng cho việc tự deploy dùng thử (self-hosted / internal use) trước khi bước vào giai đoạn trial.

---

## 1. Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis)

### Vấn đề 1: Import Package không tạo trước Custom Node hoàn chỉnh trong Node Library
1. **Lệch định dạng `RefId` khi Export**:
   - Khi kéo node từ Palette vào Canvas, node mang `refId` là `key` (chuỗi dạng `my-custom-node`).
   - Trong `ExportPipelineBundle.cs`, code đang dùng `Guid.TryParse(node.RefId, out var defGuid)` để tìm trong bảng `NodeDefinitions`. Khi `refId` là chuỗi key, hàm trả về `false` $\rightarrow$ Toàn bộ Custom Node bị bỏ sót, không được đóng gói vào `dependencies.customScripts`.
2. **Import chỉ insert bản ghi DB, thiếu file script vật lý**:
   - `ImportPipelinePackageHandler` hiện tại chỉ gọi `db.NodeDefinitions.Add(nodeDef)` mà **hoàn toàn không tải/upload script text vào Asset Storage (`IAssetApi`)**.
   - NodeDefinition không có `AssetLink` thuộc slot `CustomScript`, dẫn tới trạng thái "node rỗng / phantom node", Worker không thể tải script về thực thi, và giao diện Node Library thiếu thông tin file đính kèm.
3. **Lệch mapping `RefId` giữa Pipeline Nodes và NodeDefinition**:
   - Khi Import, handler dùng dictionary `customNodeKeyToId[script.Key] = newDefId`. Nhưng trong danh sách node của Pipeline, `node.RefId` lại đang là Guid cũ hoặc TempId $\rightarrow$ `TryGetValue` thất bại $\rightarrow$ Node trong Pipeline giữ nguyên Guid cũ không tồn tại trong DB mới.
4. **Thiếu Invalidation trên Frontend**:
   - Khi import xong, frontend chỉ invalidate query `pipelines` mà không invalidate `nodePalette` $\rightarrow$ Trình duyệt giữ cache cũ, người dùng vào Canvas hay Node Library không nhìn thấy node mới.

---

### Vấn đề 2: Nhiều chỗ không nối được dây Exec trên Canvas
1. **Quy tắc kiểm tra Exec Pin bị hardcode chuỗi hẹp (`isExecHandle`)**:
   - Trong `canvasUtils.ts`, `isExecHandle` chỉ chấp nhận đúng 4 giá trị: `exec_in`, `exec_out`, `loop_body`, `completed`.
   - Trong `useCanvasConnectionRules.ts`:
     ```ts
     const isSourceExec = isExecHandle(connection.sourceHandle);
     const isTargetExec = isExecHandle(connection.targetHandle);
     if (isSourceExec || isTargetExec) {
       if (!isSourceExec || !isTargetExec) return false;
       return true;
     }
     ```
     Nếu bất kỳ pin nào có tên/id khác (ví dụ `exec`, `Start`, `BeginExecute`, `true_branch`, `false_branch`, `next`, `done`) $\rightarrow$ một bên là `true`, một bên là `false` $\rightarrow$ **Validation từ chối kết nối ngay lập tức!**
2. **Không kiểm tra theo Schema (`pin.kind === PinKind.Exec`)**:
   - Thay vì tra cứu schema của Node để biết pin đó có phải là `Kind: Exec` hay không, code chỉ kiểm tra chuỗi ID qua `isExecHandle`.
3. **Start Node và Scope Container Handles**:
   - `StartPipelineNodeView` có thể render output handle là `exec_out` trong khi graph cũ hoặc imported edge lại lưu là `Start` hoặc `exec`.
   - `ScopeContainerNode` hiện tại đã bỏ các handle `exec_in`/`exec_out` (chỉ còn pin `runner`), nhưng trong `useCanvasConnectionRules` vẫn còn sót rule yêu cầu kết nối stage-to-stage qua `exec_in`/`exec_out`.
4. **Hiệu ứng domino từ Vấn đề 1**:
   - Khi Custom Node chưa được import đúng vào DB, `PipelineGraphDtoBuilder` rơi vào nhánh fallback rỗng (không có inputs/outputs chuẩn) $\rightarrow$ Các edge cũ trỏ vào pin bị mất handle trên giao diện $\rightarrow$ Người dùng thấy dây bị đứt hoặc không cắm lại được.

---

## 2. Kế Hoạch Triển Khai Chi Tiết (Action Items Cho Ngày Mai)

### Scope 1: Backend - Hoàn Thiện Export & Import Custom Node Library

#### 1.1. Chuẩn hóa Export (`ExportPipelineBundle.cs`)
- **Thu thập Custom Nodes toàn diện**:
  - Quét `graphDto.Nodes.Where(n => n.Kind == PipelineNodeKind.Custom)`.
  - Tra cứu `NodeDefinition` theo cả 2 tiêu chí: `nd.Id.ToString() == node.RefId` HOẶC `nd.Key == node.RefId`.
  - Trong DTO của Node (`PipelinePackageNodeDto`), bổ sung thuộc tính `CustomScriptKey: def.Key` để đảm bảo độc lập tuyệt đối với GUID cũ.
- **Trích xuất Script Content**:
  - Đảm bảo toàn bộ nội dung file Python `.py` được đọc và đóng gói đầy đủ vào `dependencies.customScripts[i].scriptContent`.

#### 1.2. Tạo và Liên kết Node Library hoàn chỉnh khi Import (`ImportPipelinePackage.cs`)
- **Bước 1: Upsert NodeDefinition & Upload Script File qua `IAssetApi`**:
  - Duyệt `package.Dependencies.CustomScripts`:
  - Nếu script chưa tồn tại trong project:
    1. Tạo entity `NodeDefinition` với đầy đủ: `Key`, `Name`, `Label`, `Executor`, `Inputs`, `Outputs`, `Status = Published`.
    2. Upload nội dung `scriptContent` tạo Asset file mới trong Module Files (hoặc tái sử dụng Asset có cùng SHA-256 hash).
    3. Gọi `IAssetApi.ReplaceSingleLinkAsync` với owner `(nameof(NodeDefinition), nodeDef.Id.ToString(), PipelineAssetSlots.CustomScript)` để gắn kết script vật lý vào Node.
    4. Cập nhật `nodeDef.ContentHash` và lưu DB.
- **Bước 2: Remap `RefId` trong Pipeline Nodes**:
  - Khi duyệt các node của Pipeline:
    - Nếu `n.Kind == PipelineNodeKind.Custom`:
      - Tra cứu theo `n.CustomScriptKey` hoặc `n.RefId`.
      - Gán `refId = targetNodeDef.Id.ToString()` (chuẩn hóa về ID mới trong DB hiện tại).
      - Đảm bảo khi `PipelineGraphDtoBuilder` load graph, node sẽ tìm thấy đúng definition 100%.

---

### Scope 2: Frontend & Backend - Chuẩn Hóa Toàn Diện Hệ Thống Exec Edge

#### 2.1. Cải tiến Connection Rules trên Canvas (`useCanvasConnectionRules.ts` & `canvasUtils.ts`)
- **Kiểm tra Exec Pin dựa trên Data Schema thay vì chuỗi cứng**:
  - Viết helper `getNodePin(node, handleId, isInput)` tra cứu trong `node.data.inputs` hoặc `node.data.outputs`.
  - Hàm `isHandleExec`:
    ```ts
    const pin = getNodePin(node, handleId, isInput);
    return pin ? isExecPin(pin) : isExecHandle(handleId);
    ```
  - Cập nhật `isExecHandle` hỗ trợ thêm các alias phổ biến: `exec`, `exec_in`, `exec_out`, `loop_body`, `completed`, `true`, `false`, `then`, `else`, `start`, `done`.
- **Loại bỏ quy tắc cũ không còn phù hợp với Scope Container**:
  - Cập nhật quy tắc nối ScopeContainer: chỉ giữ lại kết nối dữ liệu vào pin `runner`, không chặn các action node bên trong nối dây exec với nhau.

#### 2.2. Chuẩn hóa Pin Handles trên các Node Views
- **`StartPipelineNodeView.tsx`**:
  - Đảm bảo output Exec Handle luôn có `id="exec_out"` kèm fallback alias nếu cần.
- **`ActionToolNodeView.tsx` & `DynamicToolNodeView.tsx` & `FlowControlNodeView.tsx`**:
  - Đảm bảo các `Handle` của Exec outputs render đúng `id` khớp với schema của tool/script (ví dụ: `exec_out`, `loop_body`, `completed`).

#### 2.3. Edge Pin Normalization khi tải Graph (`usePipelineDraftState.ts`)
- Khi chuyển đổi `graph.edges` sang ReactFlow `Edge`:
  - Thêm bước làm sạch/chuẩn hóa (alias mapping):
    - Nếu `e.sourcePin` là `"Start"` hoặc `"exec"` trỏ từ Start Node $\rightarrow$ Tự động chuẩn hóa về `"exec_out"`.
    - Nếu `e.targetPin` là `"exec"` trỏ vào Action Node $\rightarrow$ Tự động chuẩn hóa về `"exec_in"`.

#### 2.4. Invalidate Cache đầy đủ sau khi Import (`usePipelineExportImport.ts`)
- Khi import thành công:
  - Invalidate cả `getGetPipelinesQueryKey({ projectId, isArchived: false })`.
  - Invalidate `getGetNodePaletteQueryKey({ projectId })`.
  - Invalidate query danh sách Node Definitions (`["nodeDefinitions", projectId]`).

---

### Scope 3: Kiểm Thử E2E & Kịch Bản Nghiệm Thu

1. **Kịch bản 1: Export Pipeline chứa Custom Script Node**:
   - Tạo 1 Custom Script trong Node Library (`test_bake.py`, có 1 input String, 1 output File).
   - Thêm vào Canvas Pipeline A, nối dây Start $\rightarrow$ Custom Node $\rightarrow$ Return.
   - Bấm Export $\rightarrow$ Kiểm tra file JSON có:
     - `dependencies.customScripts`: chứa `test_bake.py` và nội dung Python text.
     - `pipelines[0].graph.nodes`: custom node có `customScriptKey`.
2. **Kịch bản 2: Import sang Project / Database mới (Fresh Import)**:
   - Mở một Project mới hoàn toàn chưa có script nào trong Node Library.
   - Import file JSON vừa xuất.
   - **Kiểm tra**:
     - Vào menu **Node Library**: Thấy ngay node `test_bake` đã được tạo, có file `.py` đính kèm, bấm View Script thấy nội dung code.
     - Mở **Pipeline Canvas**: Node hiển thị đầy đủ icon, nhãn, pins inputs/outputs.
3. **Kịch bản 3: Thử nghiệm nối dây Exec**:
   - Thử kéo dây từ Start $\rightarrow$ Custom Node $\rightarrow$ Loop (ForEach) $\rightarrow$ Action Node.
   - Thử nối dây từ output `loop_body` và `completed`.
   - Xác nhận: Dây cắm ngọt ngào, không bị từ chối, lưu và reload lại trang dây vẫn giữ nguyên vẹn.
4. **Kịch bản 4: Sẵn sàng Self-Deployment**:
   - Build sạch Backend (`dotnet build Automation.sln`).
   - Type-check Frontend (`pnpm tsc -b`).
   - Chạy thử nghiệm toàn bộ luồng với Docker / môi trường local trước khi bàn giao trial.

---

## 3. Tiến Độ Triển Khai Thực Tế
- **Scope 1 (Backend - Export & Import Custom Node Library)**: ĐÃ HOÀN THÀNH 100%. (Batch-First, CAS deduplication, AssetLink integration, key remapping).
- **Scope 2 (Frontend & Canvas - Chuẩn Hóa Dây Exec)**: ĐÃ HOÀN THÀNH 100%. (Schema-driven check, alias expansion, edge pin normalization, 0 error tsc).
- **Scope 3 (Kiểm Thử E2E & Sẵn Sàng Deploy)**: Chuẩn bị kiểm thử thực tế.
