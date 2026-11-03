# Kế Hoạch Kỹ Thuật: Topology-Aware Contract Resolution, Xử Lý File Unbound (BL-005), Cảnh Báo Runner & Làm Sạch DB Cho Trial User

> **Ngày lập**: 24/10/2026  
> **Cập nhật lần 2**: Chuẩn hóa `BreakStruct` chỉ có chân `Target`, loại bỏ hoàn toàn chân nối `StructType`, tái cấu trúc Target Entity Picker theo Strategy/Registry Pattern (Tuyệt đối không dùng thác `if-else`).  
> **Phạm vi**: `Automation.Pipeline` (Backend) & `web/src/features/pipelines` (Frontend)  
> **Trạng thái**: `Proposed` (Chờ phê duyệt)

---

## 1. Bối Cảnh & Các Quyết Sách Kiến Trúc Cốt Lõi

Qua trao đổi và khảo sát mã nguồn, chúng ta thống nhất 4 quyết sách kiến trúc:

1. **`BreakStruct` chỉ có duy nhất 1 Data Pin là `Target`**:
   - `StructType` là **Type Argument (`<T>`) / Schema Configuration**, hoàn toàn **KHÔNG PHẢI** là Data Pin nhận dây tín hiệu.
   - Trước đây việc đưa `StructType` vào `BreakStructTool.Inputs` khiến Canvas vẽ ra chân nối `Struct Type * Text`, gây hiểu lầm cho người dùng.
   - **Quyết sách**: `BreakStructTool.Inputs` **chỉ chứa duy nhất chân `Target` (`PinPrimitiveType.EntityRef`)**. Loại bỏ hoàn toàn `StructType` khỏi danh sách Data Pin. `StructType` được quản lý thuần túy là `SchemaConfigKey` trong `configValues["StructType"]` và điều khiển qua Inspector hoặc tự suy luận khi cắm dây.

2. **Cơ chế xử lý Target Instance: Tuyệt đối KHÔNG dùng thác `if-else` vô hạn**:
   - Khi không có dây cắm vào `Target`, người dùng cấu hình tĩnh qua Inspector.
   - Hiện tại file `EntityPinSelect.tsx` đang mắc lỗi kiến trúc: một chuỗi dài các biến cờ `isResource`, `isRepository`, `isRunner`, `isContentType`, `isContentItem`, `isTag` cùng thác `if-else` để chọn options/component.
   - **Quyết sách**: Áp dụng triệt để **Strategy Pattern & Registry Pattern** (theo chuẩn [docs/frontend/patterns/design_patterns_catalog.md](file:///d:/FullStack/Automation/docs/frontend/patterns/design_patterns_catalog.md)). Mỗi Struct Type có một Strategy/Picker độc lập được đăng ký vào `ENTITY_PICKER_REGISTRY`. Khi thêm entity mới, chỉ cần thêm 1 entry vào Registry mà không sửa đổi file trung tâm, triệt tiêu 100% thác `if-else`.

3. **Topology-Aware Contract Resolution tại Backend & Đồng bộ Frontend**:
   - `NodeContractResolutionContext` nhận `pipeline.Edges`.
   - `PipelineNodeContractResolver` chạy 2-pass: Pass 1 resolve node tĩnh; Pass 2 duyệt Edges cắm vào `Target` của `BreakStruct` để tự động suy luận `StructType = sourcePin.StructType` và bung toàn bộ Output Pins của Struct ra ngay tại Design-Time mà không cần bất kỳ instance cụ thể nào.
   - Frontend `usePipelineDraftState.ts` đồng bộ `response.inputs` và `response.outputs` sau Autosave; `useCanvasConnectionRules.ts` cập nhật optimistic tức thì (0ms delay) khi cắm dây vào `Target`.

4. **Khắc phục các điểm gãy còn lại cho Trial User**:
   - **Cảnh báo Runner**: `RunPipelineModal.tsx` kiểm tra nếu pipeline cần DCC Stage mà Runner đang Offline thì hiện Banner cảnh báo rõ ràng.
   - **BL-005 (File Unbound)**: `PipelineContractValidator` bắt lỗi file unbound, `AssetPinUpload.tsx` có nút "Relink / Upload" nổi bật.
   - **Làm sạch DB & Bỏ Fallback Legacy**: Gỡ bỏ `PinPrimitiveTypeJsonConverter.cs`, cung cấp SQL script chuẩn để dọn sạch DB server.

---

## 2. Chi Tiết 4 Phân Khu Thực Thi (Phases)

### Phase 1: Chuẩn Hóa `BreakStruct`, Topology-Aware Resolution & Pluggable Target Picker (`BL-008`)

#### 1.1. Backend (`Automation.Pipeline`)
- **[MODIFY] [`BreakStructTool.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/Tools/Deconstruct/BreakStructTool.cs)**:
  - Cập nhật `Inputs` mặc định (khi chưa có `StructType`): **CHỈ CÓ DUY NHẤT** chân `Target`:
    - `Id = "Target"`, `Label = "Target"`, `PrimitiveType = PinPrimitiveType.EntityRef`, `StructType = null` (Wildcard EntityRef), `Cardinality = PinCardinality.Single`, `IsRequired = true`.
    - **Xóa bỏ hoàn toàn pin `StructType` khỏi `Inputs`** (cả trước và sau khi resolve). `StructType` chỉ lưu trong `Capabilities.SchemaConfigKeys` và `configValues["StructType"]`.
  - Cập nhật hàm `ResolvePins`:
    - Khi có `structType`: `Inputs` trả về duy nhất 1 chân `Target`: `{ Id = "Target", Label = $"Target ({structType})", PrimitiveType = PinPrimitiveType.EntityRef, StructType = structType, IsRequired = true }`.
    - `Outputs`: trả về `sDef.OutputPins`.
- **[MODIFY] [`NodeContractResolutionContext.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/NodeContract/NodeContractResolutionContext.cs)**:
  - Thêm thuộc tính `public IReadOnlyList<PipelineEdge> Edges { get; }` (mặc định `[]`).
- **[MODIFY] [`PipelineNodeContractResolver.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/NodeContract/PipelineNodeContractResolver.cs)**:
  - Trong `BuildContextAsync`: Truyền `pipeline.Edges.ToList()` vào `NodeContractResolutionContext`.
  - Trong `ResolveAllNodes(nodes, context)`: Nâng cấp thành **2-Pass Topology-Aware Resolution**:
    - **Pass 1**: Phân giải từng node độc lập theo cấu hình nội tại.
    - **Pass 2 (Upstream Struct Type Propagation)**: Quét các node đa hình (`InspectorMode == "StructSelector"` / `BreakStruct` / `CastToStruct`) có `configValues["StructType"]` đang trống:
      - Quét `context.Edges` tìm edge nối vào chân `"Target"` của node đó.
      - Tra cứu contract của node nguồn và lấy `sourcePin`.
      - Nếu `sourcePin?.StructType` hợp lệ trong `structRegistry`:
        - Tự động suy luận `inferredStructType = sourcePin.StructType`.
        - Cập nhật `effectiveConfig["StructType"] = inferredStructType` và resolve lại node đó (bung đầy đủ `Target (inferredStructType)` và danh sách member outputs).
- **[MODIFY] [`PipelineContractValidator.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/Validation/PipelineContractValidator.cs)**:
  - Cho phép chân `EntityRef` wildcard (`StructType == null`) nhận kết nối từ bất kỳ chân `EntityRef` nào.

#### 1.2. Frontend (`web/src/features/pipelines`)
- **[MODIFY/REFACTOR] [`EntityPinSelect.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/EntityPinSelect.tsx)**:
  - **Triệt tiêu 100% thác `if-else`**:
  - Tách các logic query/options thành các Strategy độc lập hoặc Map Registry:
    ```typescript
    // Định nghĩa Picker Strategy Map: O(1) Lookup
    const ENTITY_PICKER_STRATEGIES: Record<string, ComponentType<EntityPickerProps>> = {
      Resource: ResourceWorkstationSelect,
      Runner: RunnerPickerStrategy,
      Repository: RepositoryPickerStrategy,
      ContentType: ContentTypePickerStrategy,
      ContentItem: ContentItemPickerStrategy,
      Tag: TagPickerStrategy,
    };
    ```
  - `EntityPinSelect` trở thành một Component mỏng (Dispatcher): tra cứu strategy theo `target || entityType || "Resource"`. Nếu không có strategy đặc thù, fallback về một `GenericEntityCombobox` an toàn mà không chứa bất kỳ câu lệnh `if-else` lồng nhau nào.
- **[MODIFY] [`usePipelineDraftState.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/usePipelineDraftState.ts)**:
  - Sau khi `SavePipelineGraph` thành công (dòng 574–600):
    - Cập nhật `inputs: (response.inputs as PinDefinition[]) ?? data.inputs` và `outputs: (response.outputs as PinDefinition[]) ?? data.outputs`.
    - Đồng bộ `config.StructType = response.configValues?.StructType ?? config.StructType`.
  - Tại `handleUpdateConfig`: Khi `StructType` thay đổi, cập nhật optimistic `inputs` và `outputs` từ `structCatalogue` ngay trên client (0ms delay).
- **[MODIFY] [`useCanvasConnectionRules.ts`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/hooks/useCanvasConnectionRules.ts)**:
  - Khi nối dây vào node `BreakStruct` (chân `Target`):
    - Đọc `sourcePin.structType`.
    - Cập nhật ngay `configValues.StructType = sourcePin.structType`, đổi nhãn chân thành `Target (${sourcePin.structType})`, và bung ngay các chân outputs từ `structCatalogue` trên state local.

---

### Phase 2: Cảnh Báo Trạng Thái Runner Khi Chạy (`RunPipelineModal.tsx`)

- **[MODIFY] [`RunPipelineModal.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/dialogs/RunPipelineModal.tsx)**:
  - Kiểm tra xem đồ thị có chứa Stage/Node yêu cầu DCC Executor ngoài (`requiresExternalRunner`) hay không.
  - Hiển thị khối **Target Execution Runner** trong Modal:
    - Danh sách Runner với Badge trạng thái trực tuyến (`Online` xanh lá / `Offline` cam-đỏ).
    - Banner cảnh báo nếu Runner đang chọn bị Offline, ngăn việc bấm Run bị treo `WaitingForRunner`.

---

### Phase 3: Hoàn Thiện Xử Lý File Unbound Sau Import (`BL-005`)

- **[MODIFY] [`PipelineContractValidator.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Contracts/Validation/PipelineContractValidator.cs)**:
  - Bắt chính xác object `{ status: "unbound" }`: không tính là `hasConfigValue = true`; phát sinh Diagnostic rõ ràng (`Error` nếu `IsRequired`, `Warning` nếu optional): *"File '{OriginalFileName}' on pin '{PinLabel}' is unbound. Please upload a replacement file."*
- **[MODIFY] [`AssetPinUpload.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/AssetPinUpload.tsx)**:
  - Thiết kế lại trạng thái `isUnbound`: hiển thị tên file gốc và nút hành động nổi bật **"Relink / Upload"** để tải file bù vào ngay trên Inspector.

---

### Phase 4: Xóa Fallback Legacy & Cung Cấp Script SQL Làm Sạch DB Trên Server

- **[DELETE] [`PinPrimitiveTypeJsonConverter.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Domain/Enums/PinPrimitiveTypeJsonConverter.cs)** & **[MODIFY] [`PinEnum.cs`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Domain/Enums/PinEnum.cs)**:
  - Xóa bỏ converter tương thích ngược, giữ enum `PinPrimitiveType` thuần khiết 100%.
- **[NEW] [`scripts/sql/cleanup_pipeline_server_db.sql`](file:///d:/FullStack/Automation/scripts/sql/cleanup_pipeline_server_db.sql)**:
  - Tạo sẵn script SQL để chạy trên DataGrip/Server:
    1. Truncate các bảng Execution cũ: `TRUNCATE TABLE pipeline."StageExecutions", pipeline."PipelineExecutions" CASCADE;`
    2. Chuẩn hóa chuỗi JSON `"PrimitiveType": "Path"` và `3` cũ sang `"String"` trong `NodeDefinitions` và `Pipelines`.

---

## 3. Kế Hoạch Kiểm Thử & Nghiệm Thu (Verification Plan)

1. **Automated Unit Tests (`dotnet test api/tests/Automation.Pipeline.Tests`)**:
   - Test `BreakStructTool` chỉ có duy nhất chân `Target`, không có chân `StructType`.
   - Test Topology-Aware Struct Inference: Node `Start` (Output `EntityRef`, `StructType = "Resource"`) nối dây sang `BreakStruct` (Config rỗng). Backend resolve ra `StructType = "Resource"` và nở đầy đủ Output Pins của `Resource`.
   - Test Validator bắt lỗi chính xác khi pin dính File Unbound `{ status: "unbound" }`.
2. **Frontend Typecheck & Production Build (`pnpm --prefix web tsc --noEmit` & `pnpm --prefix web build`)**:
   - Đảm bảo 0 lỗi TypeScript và bundle Vite build thành công.
