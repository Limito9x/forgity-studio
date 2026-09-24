# Triết Lý Kiến Trúc Của Dự Án (Architecture Philosophy)

Tài liệu này đúc kết toàn bộ bộ khung kiến trúc, các quy ước thiết kế và nguyên lý giao tiếp giữa các thành phần trong hệ thống: **Modular Monolith + Vertical Slice Architecture (VSA)** kết hợp **Distributed Python Desktop Workstations Mesh**.

---

## 1. Modular Monolith & Ranh Giới Module (Module Boundaries)

Dự án áp dụng **Modular Monolith** trên nền tảng .NET 10:

- **Một Host duy nhất, Đa Module độc lập:** Mọi module (`Agent`, `Inspection`, `Platform`, `Workspace`, `Files`, `Content`, `DynamicForms`, `Identity`, `Notifications`, `Projects`, `System`, `Tag`) được đóng gói trong một project C# độc lập (`Automation.<ModuleName>.csproj`).
- **Giao tiếp liên Module (Inter-Module Communication):**
  - **Contracts Interface:** Khi cần truy vấn dữ liệu từ module khác, chỉ giao tiếp qua Contracts (ví dụ: `IPlatformApi`, `IAssetApi`, `IAgentApi`, `ISchemaApi`).
  - **In-Process Wolverine MessageBus:** Phát tín hiệu (Commands/Events) để kích hoạt logic mà không tham chiếu trực tiếp DbContext của module khác.
  - **TUYỆT ĐỐI KHÔNG Reference DbContext chéo:** Mỗi module sở hữu DbContext và schema database riêng biệt trong PostgreSQL (ví dụ: schema `agent`, `inspection`, `workspace`, `platform`...).
- **Quy định Transaction trong Wolverine Handlers:**
  - Write / Mutation Handlers: Bắt buộc khai báo `[Transactional(typeof(<ModuleName>DbContext))]` trỏ vào chính DbContext của module đó.
  - Read-only Query Handlers: Bắt buộc khai báo `[NonTransactional]`.

---

## 2. Kiến Trúc Lát Cắt Dọc Thực Dụng (Pragmatic Single-File VSA)
*(Chi tiết xem tại [ADR-005: Pragmatic Single-File VSA](file:///d:/FullStack/Automation/docs/backend/ADR_PRAGMATIC_SINGLE_FILE_VSA.md))*

Mọi tính năng được tổ chức theo chiều dọc gói gọn trong **1 FILE C# DUY NHẤT** tại `Features/<FeatureGroup>/<FeatureName>.cs` (không tạo thư mục con lồng nhau):
- **Command / Query Record:** Khai báo dữ liệu đầu vào.
- **Validator:** Khai báo FluentValidation trực tiếp bên dưới Request.
- **FastEndpoints Endpoint:** Kế thừa `Endpoint<TRequest, TResponse>`, khai báo `Group<FeatureGroup>()`. Luôn unwrap kết quả trả về bằng `await this.SendResultAsync(result, ct)` để Orval sinh TypeScript types chuẩn xác.
- **Wolverine Handler:** Kế thừa hoặc đánh dấu `[Transactional(typeof(<Module>DbContext))]` (ghi dữ liệu) hoặc `[NonTransactional]` (đọc dữ liệu).
- **Data Mapping & Entities:** Entity là Pure POCO `{ get; set; }`. Toàn bộ dữ liệu được ánh xạ bằng **Mapster** (`.Adapt<TDto>()`, `.ProjectToType<TDto>()`), nói KHÔNG với constructor giáo điều và mapping thủ công lặp lại.

---

## 3. Hệ Thống Tự Động Hóa & Kiểm Định Phân Tán (Distributed Inspection & Worker Mesh)

Hệ thống kết hợp giữa Web Control Plane và mạng lưới máy trạm cục bộ (Python Desktop Agents):

```
┌────────────────────────┐           gRPC Stream (2-way)          ┌────────────────────────┐
│  Automation-Backend    │ ◄────────────────────────────────────► │    Automation-Agent    │
│  (Central Controller)  │                                        │  (Local Workstations)  │
└───────────┬────────────┘                                        └───────────▲────────────┘
            │                                                                 │
            │ Publish Tasks ('tasks.inspect')     Consume Tasks & Publish Res │
            └────────────────────────► RabbitMQ ──────────────────────────────┘
                                (Wolverine Provider)
```

### 3.1. Kết nối gRPC 2 chiều (Real-time Mesh)
- Duy trì kênh gRPC Stream ổn định thông qua `IAgentConnectionRegistry` và `AgentStreamHandler`.
- Phục vụ: Heartbeat báo cáo trạng thái Online/Offline, Duyệt cây thư mục từ xa (`browse-dir`), Quét file đồng bộ (`scan-dir`), và Quét các phần mềm thực thi trên máy (`scan-executors`).

### 3.2. Điều phối Tác vụ qua Wolverine RabbitMQ
- **Shared Provider (`WolverineRabbitMqExtensions.cs`):** Cấu hình tập trung tại `Automation.SharedKernel`, hỗ trợ cờ bật/tắt an toàn (`RabbitMQ:Enabled`) và cơ chế Outbox Pattern tự động gửi tin nhắn khi Database commit thành công.
- **Queue `tasks.inspect`:** Backend bắn message `InspectResourceTask` chứa `ScriptUrl`, `ScriptHash` (SHA-256), `ExecutorKey`, và `ResourceFilePath`.
- **Python Inspector Consumer (`worker/inspector_consumer.py`):**
  - Tự động kiểm tra và cache script theo SHA-256 hash tại thư mục cục bộ (`~/.automation/cache/scripts/<hash>/`).
  - Thực thi Subprocess Headless (Blender `--background --python` hoặc Python).
  - Trả kết quả trực tiếp về queue `inspection_results` với AMQP header: `message-type: inspection-result`.
- **Tự động lưu kết quả:** Wolverine MessageBus ở Backend tự động route message từ queue `inspection_results` tới `SubmitInspectionResultHandler` để cập nhật Database và tính toán trạng thái (`Passed`, `Warning`, `Failed`).

---

## 4. Quy Chuẩn Đặt Tên & Extension (Standardization)

- **Chuẩn hóa Extension:** Toàn bộ hệ thống thống nhất lưu và tra cứu Extension **KHÔNG CÓ DẤU CHẤM `.` Ở ĐẦU** (ví dụ: `blend`, `png`, `fbx`, `psd`).
- **Data Dedup & Upload Flow:** Mọi tệp tải lên (Asset, Script) đều sử dụng cơ chế tính mã băm SHA-256, yêu cầu Presigned Upload URL trực tiếp lên S3/R2 thông qua `IAssetApi` mà không đi qua băng thông Backend.

---

## 5. Quy Chuẩn Thiết Kế Entity Thực Dụng (Pragmatic Persistence Model)

Dự án áp dụng mô hình Persistence Model tinh gọn, loại bỏ các ràng buộc phi thực tế của phong cách DDD giáo điều:

- **Hệ phân cấp BaseEntity & AuditableEntity:**
  - `BaseEntity`: Dành cho Aggregate Roots cần hỗ trợ Soft Delete (`DeletedAt != null`). Tự động sinh ID UUIDv7 (`IdGenerator.NewId()`).
  - `AuditableEntity`: Dành cho Child Entities, Junction Entities hoặc các bảng ghi vết (Hard Delete khi xóa). Tự động sinh ID UUIDv7 (`IdGenerator.NewId()`).
  - `Entity`: Base class thuần túy chỉ chứa `Id` và Equality.
- **Mở quyền truy cập thuộc tính `{ get; set; }`:**
  - Toàn bộ trường dữ liệu của Entity sử dụng `{ get; set; }` công khai.
  - Cho phép sử dụng cú pháp C# Object Initializer (`new Entity { Field = value }`).
  - Hỗ trợ tối đa thư viện Mapster: `request.Adapt<Entity>()` khi tạo mới và `request.Adapt(entity)` khi cập nhật mà không cần cấu hình phức tạp.
- **Triết lý Constructor:**
  - TUYỆT ĐỐI KHÔNG ép buộc viết constructor rỗng `protected Entity() { }` cho EF Core hoặc viết constructor có tham số dài dòng chỉ để gán từng trường.
  - `Id` được khởi tạo tự động bằng UUIDv7 thông qua Base Class, không gán thủ công `Id = ...` trong class con.
  - `CreatedAt` và `UpdatedAt` được tự động hóa thông qua `AuditingInterceptor`, không gán thủ công `DateTimeOffset.UtcNow`.
  - Chỉ viết constructor hoặc method riêng khi thực sự có logic tính toán/nghiệp vụ phức tạp (State Machine).
