# Architecture Decision Record (ADR): Pragmatic Single-File VSA & Mapster-First Paradigm

- **Mã tài liệu**: ADR-005
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-09-24
- **Phạm vi**: Toàn bộ Backend .NET Core (`api/`)

---

## 1. Bối Cảnh & Bài Học Đắt Giá (Context & Lessons Learned)

Trong giai đoạn đầu phát triển hệ thống, dự án đã chịu ảnh hưởng của các lý thuyết kiến trúc giáo điều (Dogmatic Architecture) như Clean Architecture cổ điển và biến thể Vertical Slice Architecture (VSA) phân mảnh:

### 1.1. Những "nỗi đau" (Pains) gặp phải trong thực tế:
1. **Bùng nổ thư mục & file (Folder & File Explosion)**:
   - Với mỗi nghiệp vụ CRUD đơn giản (như `CreateTag`, `GetTagById`), kiến trúc cũ ép tạo 1 thư mục riêng chứa 4 file rời rạc: `*Command.cs`, `*Validator.cs`, `*Endpoint.cs`, `*Handler.cs`.
   - Với hơn 100 slices trong hệ thống, dự án bị phân mảnh thành hơn 400 files lắt nhắt. Lập trình viên phải mở 4-5 tab trình duyệt mã nguồn chỉ để đọc hiểu hoặc sửa 1 tính năng.
2. **Cực hình khi phát triển cùng AI Agent**:
   - Khi cần thêm một trường dữ liệu (field) hoặc sửa luồng, AI Agent phải thực hiện nhiều thao tác đọc/ghi trên 4 file khác nhau, dễ gây out-of-sync, tốn token vô ích và tăng nguy cơ sinh lỗi ngữ cảnh.
3. **"Cuồng giáo hóa" DDD (Dogmatic DDD Ceremony)**:
   - Ép buộc Entity phải giấu setter, bắt buộc có constructor tham số dài dòng và các hàm `Update()` hình thức.
   - Khi thêm 1 thuộc tính: phải sửa Constructor Entity, sửa hàm `Update()`, sửa Request DTO, sửa Handler map tay. Mọi lợi ích về type-safety bị triệt tiêu bởi chi phí bảo trì khổng lồ.
4. **Nghịch lý phân cấp "Con chứa Cha"**:
   - Module tên `Projects` nhưng lại chứa `Studio` (cấp tổ chức cha của Project) và chứa cả việc quản lý máy trạm (`StudioRunner`).

---

## 2. Quyết Định Kiến Trúc (The Decisions)

### Quyết định 1: Chuẩn hóa Single-File Vertical Slice (1 Slice = 1 File Phẳng)
- **Quy tắc**: Mỗi tính năng nghiệp vụ (Use Case) được gói gọn trong **MỘT FILE C# DUY NHẤT** đặt trực tiếp tại `Features/<FeatureGroup>/<SliceName>.cs` (không tạo thêm folder con cho từng slice).
- **Cấu trúc chuẩn của 1 Slice File**:
  ```csharp
  // 1. Request / Command / Query Record
  public record CreateItemCommand(...);

  // 2. Validator (FluentValidation - nếu có)
  public class CreateItemValidator : AbstractValidator<CreateItemCommand> { ... }

  // 3. FastEndpoints API Endpoint
  public class CreateItemEndpoint(IMessageBus bus) : Endpoint<CreateItemCommand, ItemDto> { ... }

  // 4. Wolverine Handler xử lý nghiệp vụ
  [Transactional(typeof(ModuleDbContext))] // hoặc [NonTransactional]
  public class CreateItemHandler(ModuleDbContext db) { ... }
  ```
- **Lợi ích**:
  - Toàn bộ bức tranh của một tính năng nằm trọn vẹn trong một file duy nhất. Đọc hiểu từ luồng HTTP vào -> Kiểm tra dữ liệu -> Thực thi DB chỉ trong 1 cuộn chuột.
  - Tối ưu tuyệt đối cho AI Agent: 1 lệnh đọc/sửa file duy nhất nắm trọn vẹn ngữ cảnh.

### Quyết định 2: Mapster-First & Pragmatic POCO Entities
- **Quy tắc**:
  - Entity chuyển về dạng Pure POCO với public `{ get; set; }`, loại bỏ toàn bộ parameterized constructors và hàm update rỗng.
  - Sử dụng **Mapster** làm nguồn chân lý duy nhất để mapping:
    - Query: `db.Entities.ProjectToType<TDto>().ToListAsync(ct)` (EF Core tối ưu SQL select).
    - Mutation: `request.Adapt<Entity>()` hoặc `entity.Adapt<TDto>()`.
- **Lợi ích**:
  - Khi cần thêm trường mới: Chỉ cần thêm property vào DTO và Entity. Code tự động chạy, Swagger/OpenAPI tự cập nhật, Frontend Orval tự sinh types mới mà không phải chạm vào bất kỳ hàm khởi tạo nào.

### Quyết định 3: Tách Biệt Rõ Ràng Giữa Business Tenant và Compute Infrastructure
- **Tầng Nghiệp Vụ & Tổ Chức (`Automation.Studio`)**:
  - `Studio` là Root Organization.
  - `Project` là các dự án thuộc Studio.
  - Module này thuần túy quản lý nghiệp vụ, không chứa các bảng liên quan đến socket mạng hay máy tính cục bộ.
- **Tầng Hạ Tầng Tính Toán (`Automation.Runner`)**:
  - `Runner` (máy vật lý daemon), `RunnerExecutorConfig` (Blender, Unreal...).
  - `RunnerStudio` (quản lý việc máy trạm được cấp quyền phục vụ những Studio nào — tương tự kiến trúc GitHub Actions Runners).
  - Kết nối giữa 2 tầng là **liên kết lỏng qua `Guid StudioId` và `IRunnerApi`**, tuân thủ nguyên lý Module độc lập của Modular Monolith.

---

## 3. Hệ Quả & Đánh Giá (Consequences)

### Tích cực (Positives):
- **Tốc độ phát triển tăng 300%**: Tạo và sửa tính năng cực nhanh, code ngắn gọn, trực diện.
- **Giảm 70% số lượng file trong Backend**: Từ ~450 files giảm xuống còn ~150 files, solution nhẹ và sạch sẽ.
- **Workflow của AI Agent mượt mà tuyệt đối**: Không còn tình trạng agent quên sửa 1 trong 4 file của slice.
- **Dễ dàng bảo trì & refactor**: Xóa một feature chỉ đơn giản là xóa 1 file `.cs` duy nhất, không để lại rác hay folder rỗng.

### Thách thức & Cách kiểm soát (Trade-offs & Mitigations):
- *File có thể dài nếu nghiệp vụ phức tạp*: Nếu 1 slice vượt quá 200 dòng, chỉ tách logic tính toán nặng ra các Service/Helper nội bộ trong `Shared/`, vẫn giữ Command, Validator, Endpoint, Handler trong file slice chính.

---

## 4. Tài Liệu Tham Chiếu & Cập Nhật Đi Kèm
- [docs/backend/ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/backend/ARCHITECTURE.md)
- [.agents/rules/backend.md](file:///d:/FullStack/Automation/.agents/rules/backend.md)
- [.agents/skills/create_feature/SKILL.md](file:///d:/FullStack/Automation/.agents/skills/create_feature/SKILL.md)
