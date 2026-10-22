# Kế Hoạch Kỹ Thuật: Sửa Lỗi Variable, Nâng Cấp Parameters Panel & Thanh Lọc Tool/Script Tham Số

> **Ngày lập**: 21/10/2026  
> **Trạng thái**: Đã lên kế hoạch (Sẵn sàng triển khai cho phiên làm việc tiếp theo)  
> **Mục tiêu chính**: Khắc phục triệt để luồng Variable, hoàn thiện trải nghiệm Default Value & Sửa đổi Input Parameter trên Canvas, rà soát loại bỏ các Tool "rác" không cần thiết và chuẩn hóa các script Python tinh gọn.

---

## 1. Bối Cảnh & Các Vấn Đề Cần Giải Quyết (Context & Pain Points)

1. **Hệ thống Variable đang bị tê liệt**:
   - `SetVariableTool` khai báo `IsPure => false` nhưng lại **thiếu hoàn toàn chân `Exec` (Control Flow)**. Do đó không thể cắm dây Exec trên Canvas, và DAG Planner (`ExecPlanner`) coi nó là node mồ côi (unreachable), bỏ qua không bao giờ chạy `ExecuteAsync`.
   - `PinValueResolver` khi giải quyết dây nối từ `CapsuleNode` / `GetVariable` (`category == "Variable"`) **hoàn toàn không có code đọc từ `memoryStore.GetVariableAsync()`**, dẫn đến việc dây nối luôn nhận giá trị rỗng/null.
   - Khi artist thử dùng Variable để truyền `Runner` hoặc `Repository` sang `SyncLocalChangeToRepository`, tool nhận `null` và báo lỗi "Runner không hợp lệ".

2. **Bất cập ở Blackboard / Parameters Panel**:
   - **Chưa có bộ chọn Entity cho Default Value**: Khi khai báo Input kiểu `EntityRef` (với struct là `Repository`, `Resource`, `Runner`, `ContentType`), ô Default Value chỉ là một ô nhập text thô sơ, bắt artist phải tự nhớ GUID để paste vào.
   - **Thiết lập xong không có cách sửa lại**: Danh sách Parameters chỉ có nút Xóa (`Trash2`). Nếu muốn đổi giá trị mặc định, đổi tên hay mô tả thì buộc phải xóa đi tạo lại, làm đứt toàn bộ các dây nối đã cắm trên Canvas!

3. **Nhu cầu tinh giản, thanh lọc (Decluttering)**:
   - Một số tool trong danh mục hiện tại là "tool rác" hoặc sinh ra trong giai đoạn thử nghiệm trước đây, gây rối mắt cho artist trên Palette.
   - Các script Python (Blender Diffeomorphic, Export FBX, Unreal Import) đang bị **tràn lan tham số** không cần thiết, cần chuẩn hóa lại các bộ tham số đầu vào/đầu ra gọn gàng, rõ ràng.

---

## 2. Kế Hoạch Triển Khai Chi Tiết (Phân Kỳ Từng Hạng Mục)

### Phase 1: Khắc Phục Triệt Để Hệ Thống Variable (Backend Engine)
- **1.1. Chuẩn hóa `SetVariableTool.cs` thành Action Node chuẩn**:
  - Bổ sung chân cắm:
    - Input: `Exec` (`Kind = PinKind.Exec`, `Id = "ExecIn"`)
    - Output: `Exec` (`Kind = PinKind.Exec`, `Id = "ExecOut"`)
  - Chân dữ liệu:
    - Input: `VariableName` (EntityRef variable), `Value` (Data pin động theo type biến)
    - Output: `Value` (Data passthrough)
  - Khi chạy: Ghi giá trị vào `memoryStore.SetVariableAsync(context.PipelineExecutionId, varName, val, ct)`.
- **1.2. Kích hoạt đọc Variable trong `PinValueResolver.cs`**:
  - Tại hàm `ResolveConnectionAsync`: Bổ sung nhánh nhận diện khi `srcNode.Kind == PipelineNodeKind.Capsule` hoặc `RefId == "GetVariable"` với `category == "Variable"`.
  - Gọi trực tiếp `await memoryStore.GetVariableAsync(executionId, targetVarKey, ct)` để trả về đúng giá trị thực trong RAM.

---

### Phase 2: Nâng Cấp Parameters Panel & Default Value Entity Selector (Frontend Canvas)
- **2.1. Tích hợp `EntityPinSelect` cho Default Value của Parameter**:
  - Trong [PipelineParametersPanel.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/PipelineParametersPanel.tsx):
    - Khi chọn `Type: EntityRef / Struct` (type = 4):
    - Dựa vào `structType` (Repository, Runner, Resource, ContentType), thay thế ô Text Input bằng component **`EntityPinSelect`** (hoặc `BaseCombobox` tương ứng).
    - Cho phép chọn trực tiếp Repository, Runner hoặc ContentType từ danh sách dự án.
- **2.2. Bổ sung tính năng Sửa Parameter (Edit Inline / Modal)**:
  - Thêm nút icon **`Pencil` (Edit)** cạnh nút thùng rác trên từng dòng Parameter.
  - Khi click: Mở form chỉnh sửa cho phép đổi `Label`, `Default Value`, `Description`, `IsRequired`.
  - Gọi callback `onUpdateParameter(key, updatedData)` đã có sẵn trên prop của Canvas để cập nhật dữ liệu mà **không làm đổi ID/Key, không làm mất node và không làm đứt dây nối**.

---

### ~~Phase 3: Thông Minh Hóa Khâu Đồng Bộ (Auto-Infer Runner cho Sync Local Change)~~ [ĐÃ HỦY BỎ THEO YÊU CẦU USER]
> *Quyết định*: Giữ nguyên cơ chế cắm dây (explicit wire) minh bạch cho Runner. Sau khi Phase 1 hoàn tất, artist chỉ cần kéo thả Capsule Variable `Runner` là xong, vừa trực quan vừa tránh rủi ro đoán ngầm sai máy trạm khi repo có nhiều Runner.

---

### Phase 3: Thanh Lọc Tool "Rác" & Chuẩn Hóa Tham Số Script Python
- **3.1. Audit danh mục Tool trên Canvas**:
  - Rà soát toàn bộ các resolver tools trong `api/src/Modules/Pipeline/Automation.Pipeline/Tools/`.
  - Đánh giá và phân loại:
    - **Cốt lõi (Keep)**: BreakStruct, MakeStruct, AssignResourcesToContent, SyncLocalChangeToRepository, UpdateResourceMetadata, ForEachLoop, SetVariable, GetVariable...
    - **Thừa thãi / Đã lỗi thời (Deprecate/Remove)**: Các tool nối chuỗi không cần thiết (`GetRepoInfo`, `FormatString` đã bị thay thế bởi Direct FullPath), các tool test tạm thời.
- **3.2. Tinh gọn tham số Script Python**:
  - Rà soát các script trong `workers/pipelines/`:
    - `workers/pipelines/blender/export_fbx.py`
    - `workers/pipelines/blender/bake_mesh.py`
    - Các script import/export Unreal Engine.
  - Lược bỏ các tham số cồng kềnh, chỉ giữ đúng bộ tham số tối thiểu (File đầu vào, Thư mục xuất đầu ra, Cấu hình xuất chuẩn).

---

## 3. Checklist Theo Dõi Tiến Độ (Progress Checklist)

- [x] **Phase 1**: Sửa chân Exec cho `SetVariableTool` và bổ sung `GetVariableAsync` vào `PinValueResolver`. (Đã hoàn thành & Unit test Pass 100%)
- [x] **Phase 2.1**: Tích hợp Entity Selector cho ô Default Value trong `PipelineParametersPanel.tsx`. (Hỗ trợ EntityPinSelect cho Struct/EntityRef và Select Boolean cho type Boolean)
- [x] **Phase 2.2**: Bổ sung nút Edit Parameter trên `PipelineParametersPanel.tsx` (Inline edit form, khóa key readonly giữ nguyên dây nối, cập nhật label/type/cardinality/default/description/isRequired).
- [x] ~~**Phase Auto-infer Runner**~~: Đã hủy bỏ theo ý kiến User (ưu tiên cắm dây minh bạch).
- [ ] **Phase 3**: Rà soát thanh lọc Tool thừa, chuẩn hóa Type Contract (xóa bỏ hardcode `is "runner" or "agent"`) & tinh gọn tham số script Python.
- [ ] **Phase 4**: Kiểm tra Build .NET & Frontend, chạy thử nghiệm toàn bộ luồng E2E trên Canvas.
