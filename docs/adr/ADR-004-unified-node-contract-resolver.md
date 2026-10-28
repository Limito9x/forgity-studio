# Architecture Decision Record (ADR): Unified Node Contract Resolver (Single Source of Truth)

- **Mã tài liệu**: ADR-004
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-10-23
- **Phạm vi**: Kiến trúc Pipeline Engine, Validation và Canvas Graph Builder (`Automation.Pipeline`)

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Trong quá trình kiểm toán mã nguồn (CodeGraph Audit) của module `Automation.Pipeline`, đội ngũ phát hiện ra một **điểm gãy kiến trúc chí mạng**: Hệ thống không có một nơi duy nhất chịu trách nhiệm phân giải hợp đồng chân pin (Pins Contract) của các Node trong đồ thị.

### Những lỗ hổng và lỗi nghiêm trọng phát hiện trong thực tế:
1. **Bốn nơi tự phân giải chân pin theo 4 cách khác nhau (Lệch pha Build-Time vs Runtime)**:
   - `PipelineGraphDtoBuilder`: Tự switch-case để gán pins khi nạp dữ liệu lên Canvas.
   - `ResolveToolPins`: Tự đọc từ `IToolRegistry` khi người dùng chỉnh sửa config node.
   - `ExecStepFactory`: Tự switch-case khi lập kế hoạch chạy Runtime (`ExecPlan`).
   - `ExportPipelineBundle`: Tự viết vòng lặp riêng để lấy pins khi đóng gói export.
2. **Lỗi lệch hợp đồng tai hại ở Runtime**:
   - `ExecStepFactory` chỉ đọc tĩnh `inputs = tool.Inputs; outputs = tool.Outputs;` chứ **không gọi `tool.ResolvePins(configValues, ctx)`**. Khiến các Dynamic Tools (`FormatString`, `MakeArray`, `BreakStruct`...) bị rụng sạch các chân động đã cấu hình khi xuống runtime engine!
   - Với node `Return` và `SubPipeline`, `ExecStepFactory` bỏ trống `inputs = []`, `outputs = []`.
   - Node `IsPure = true` (`BreakStruct`, `MakeStruct`, `FormatString`) bị `ExecStepFactory` bỏ qua (`continue`), khiến `ExecPlanValidator` **không bao giờ kiểm tra được lỗi trên Pure Nodes** (ví dụ node `BreakStruct` chưa chọn `StructType` bị lọt ra tận worker).
3. **Lỗi gán nhầm Metadata và StructType**:
   - Ở các nhánh `Start`, `Return`, và `SubPipeline`, code cũ gán nhầm `Metadata = i.StructType` thay vì `StructType = i.StructType`, làm hỏng cơ chế kiểm tra kiểu dữ liệu có cấu trúc.
4. **Tồn tại kiểu dữ liệu ảo `PinPrimitiveType.Path`**:
   - Kiểu `Path` thực chất chỉ là một chuỗi văn bản (`String`), nhưng gây rối loạn cho Frontend UI và hệ thống ép kiểu Runtime.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **Phương án A: Vá cục bộ tại `ExecStepFactory`**
   - Viết thêm hàm gọi `tool.ResolvePins` bên trong `ExecStepFactory`.
   - *Hạn chế*: Vẫn tồn tại 4 nơi sao chép switch-case. Khi thêm một loại node mới (ví dụ Loop hoặc AI Agent), phải sửa đồng thời cả 4 nơi, nguy cơ tái diễn lỗi lệch pha là 100%.
2. **Phương án B: Thiết kế Bộ Phân Giải Hợp Đồng Tập Trung (Unified Node Contract Resolver - Được chọn)**
   - Rút toàn bộ logic tính toán `(Inputs, Outputs, Label, Category, Executor, IsPure, IsDynamic)` về **MỘT CỔNG DUY NHẤT** `INodeContractResolver`.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Hợp Nhất Về Một Cổng Duy Nhất (`INodeContractResolver`)
- Xây dựng giao diện `INodeContractResolver` và lớp thực thi `PipelineNodeContractResolver` đóng vai trò là **Single Source of Truth** cho cả 5 loại Node: `Start`, `Return`, `Tool`, `Custom`, `SubPipeline`.
- Kết hợp 3 Design Patterns mạnh mẽ:
  - **Context Object + Batch Preloader** (`NodeContractResolutionContext`): Tải trước hàng loạt Tool, Custom Script, Struct Definition và SubPipeline trong 1 round-trip duy nhất, loại bỏ N+1 query.
  - **Strategy Pattern**: Mỗi loại node được xử lý bởi một Strategy chuyên trách, tách bạch rõ ràng giữa `Config` (chỉ chứa dynamic schema) và `Metadata` (chứa dữ liệu hiển thị UI).
  - **Fallback Decorator**: Nếu một node bị mất định nghĩa (Tool bị xóa hoặc Custom Script chưa đăng ký), hệ thống đánh dấu `IsMissingDefinition = true` kèm `MissingReason` mà không làm crash đồ thị Canvas.

### 3.2. Chuẩn Hóa và Loại Bỏ Triệt Để `PinPrimitiveType.Path`
- Khai tử hoàn toàn enum `Path`. Mọi đường dẫn thư mục, tệp tin được chuẩn hóa về `PinPrimitiveType.String`.
- Sửa dứt điểm việc gán nhầm `Metadata` thành `StructType = i.StructType`.

### 3.3. Tối Ưu Độ Phức Tạp O(1) ở Hot Path Runtime Engine
- Tại thời điểm bắt đầu chạy (`PipelineOrchestrator`), hệ thống gọi `INodeContractResolver` 1 lần duy nhất để sinh ra `IReadOnlyDictionary<Guid, ResolvedNodeContract>`.
- Gắn dictionary này vào [`FrozenExecutionGraph.ContractsByNodeId`](file:///d:/FullStack/Automation/api/src/Modules/Pipeline/Automation.Pipeline/Engine/Models/FrozenExecutionGraph.cs).
- Trong suốt quá trình thực thi: `PinValueResolver` và `PureNodeResolver` truy xuất thông tin chân pin với độ phức tạp **$O(1)$** từ RAM, không cần query DB hay quét phản chiếu (Reflection).

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

### Tích cực (Positives):
- **Đồng bộ tuyệt đối (Zero Semantic Drift)**: Dữ liệu chân pin mà Canvas nhìn thấy, Validator kiểm tra, và Runtime Engine thực thi là **giống nhau 100%**.
- **Khả năng mở rộng vượt trội**: Khi thêm loại Node mới hoặc quy tắc pin mới, chỉ cần cập nhật đúng 1 Strategy trong Resolver.
- **Hiệu năng Runtime tăng cao**: Loại bỏ hoàn toàn vòng lặp quét DB và reflection ở Hot Path.

### Thách thức & Cách kiểm soát (Trade-offs & Mitigations):
- *Cần nạp Context trước khi Resolve*: Để đạt hiệu năng cao, hàm resolve yêu cầu truyền `NodeContractResolutionContext`. Khi thao tác đồ thị lớn, tầng gọi cần dùng phương thức `PreloadContextAsync` để gom dữ liệu 1 lần.

