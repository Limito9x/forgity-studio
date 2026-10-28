# Architecture Decision Record (ADR): Modular Monolith Architecture

- **Mã tài liệu**: ADR-001
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-09-01
- **Phạm vi**: Toàn bộ kiến trúc Backend .NET Core (`api/`)

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Khi bắt đầu xây dựng **Automation Studio** — một nền tảng tự động hóa kỹ xảo đồ họa 3D kết hợp điều phối máy trạm desktop mesh — đội ngũ phải đối mặt với lựa chọn kiến trúc nền tảng cho Backend:

### Những thách thức đặc thù của hệ thống:
1. **Ranh giới nghiệp vụ rộng và phức tạp**: Hệ thống bao gồm nhiều miền nghiệp vụ (Bounded Contexts) khác nhau: Quản lý Files/Assets, Quản lý Studio/Project, Thẻ GameplayTags, Quản lý Máy trạm tính toán (Runners), Pipeline Engine, Dynamic Forms, Thông báo thời gian thực...
2. **Nguy cơ sa lầy vào Microservices quá sớm**:
   - Nếu chia thành 10+ Microservices độc lập ngay từ đầu: Chi phí hạ tầng khổng lồ (Service Mesh, Kubernetes, Distributed Tracing), độ trễ mạng cao (Network latency), và bài toán Transaction phân tán (Saga pattern) cực kỳ phức tạp.
   - Nhóm phát triển tinh gọn sẽ mất phần lớn thời gian cho việc duy trì hạ tầng thay vì tập trung vào nghiệp vụ cốt lõi.
3. **Nguy cơ biến thành "Bãi rác Spaghetti" của Monolith truyền thống**:
   - Nếu chỉ viết một Monolith thông thường không có ranh giới: Các bảng dữ liệu (Tables) và DbContext sẽ bị reference chéo lung tung. Sửa đổi ở module Tags có thể làm vỡ module Pipeline hoặc Repository một cách vô thức.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **Phương án A: Microservices Phân Tán (Distributed Microservices)**
   - *Ưu điểm*: Độc lập deploy hoàn toàn, công nghệ đa dạng.
   - *Nhược điểm*: Chi phí vận hành đắt đỏ, gỡ lỗi khó khăn, độ trễ mạng ảnh hưởng đến các tác vụ xử lý 3D liên tục, overhead quá lớn cho quy mô hiện tại.
2. **Phương án B: Classic Monolith (3-Tier Layered)**
   - *Ưu điểm*: Đơn giản, triển khai nhanh lúc đầu.
   - *Nhược điểm*: Không có ranh giới module rõ ràng. Sau 6 tháng code sẽ dính chặt vào nhau, không thể phân tách hoặc scale độc lập.
3. **Phương án C: Modular Monolith (Được chọn)**
   - *Ưu điểm*: Một tiến trình chạy duy nhất (Single Host process), nhưng các module bên trong được chia thành các Project C# độc lập, sở hữu Schema database và DbContext riêng biệt. Giao tiếp liên module được kiểm soát chặt chẽ qua Contracts và In-Process Message Bus.

---

## 3. Quyết Định Kiến Trúc (The Decision)

Chúng ta quyết định áp dụng mô hình **Modular Monolith** trên nền tảng **.NET 10**:

### 3.1. Phân Tách Project và Module Độc Lập
- Mỗi module nghiệp vụ được tổ chức thành 2 Project C# riêng biệt:
  - `Automation.<ModuleName>.Contracts`: Chỉ chứa DTOs, Enums, Interfaces (`I<Module>Api`), Messages phục vụ giao tiếp bên ngoài. Module khác **CHỈ ĐƯỢC PHÉP** reference vào project Contracts này.
  - `Automation.<ModuleName>`: Chứa mã nguồn thực thi nội bộ (DbContext, Entities, Handlers, Endpoints, Services). Dự án khác **TUYỆT ĐỐI KHÔNG** được reference vào project này.
- Tất cả module được nạp và chạy chung trong 1 Host Web API duy nhất (`Automation.Api`).

### 3.2. Ranh Giới Cơ Sở Dữ Liệu Tuyệt Đối (Database Boundary Isolation)
- Dù dùng chung 1 instance PostgreSQL, mỗi module sở hữu một **Postgres Schema riêng biệt** (ví dụ: schema `files`, `tag`, `repository`, `pipeline`, `studio`, `runner`...).
- **Cấm tiệt Reference DbContext chéo**: Module `Pipeline` tuyệt đối không được inject `FilesDbContext` hay `TagDbContext`.
- **Cấm Foreign Key chéo Schema**: Liên kết giữa các module chỉ lưu dưới dạng giá trị khóa thô `Guid TargetId`.

### 3.3. Cơ Chế Giao Tiếp Liên Module (Inter-Module Communication)
1. **Truy vấn đồng bộ (Synchronous Query/Command)**: Qua `I<ModuleName>Api` được định nghĩa trong `Contracts` và đăng ký trong DI container.
2. **Giao tiếp bất đồng bộ (Asynchronous Event-Driven)**: Sử dụng **Wolverine In-Process MessageBus** kết hợp Outbox Pattern. Khi một hành động xảy ra, module phát sự kiện (ví dụ `ResourcePublishedEvent`), các module quan tâm tự lắng nghe mà không cần biết ai phát ra.

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

### Tích cực (Positives):
- **Triển khai cực kỳ nhẹ nhàng (Single Unit of Deployment)**: Chỉ cần build và deploy một container API duy nhất.
- **Ranh giới module rõ ràng (Strict Boundary Enforcement)**: Trình biên dịch C# bảo vệ cấu trúc; không ai có thể vô tình gọi lén vào database của module khác.
- **Sẵn sàng tiến hóa (Microservices-Ready)**: Nếu trong tương lai module `Pipeline` hoặc `Files` cần tải cao gấp 100 lần, ta có thể tách nguyên khối module đó thành một service độc lập chỉ trong vài ngày mà không cần viết lại nghiệp vụ.

### Thách thức & Cách kiểm soát (Trade-offs & Mitigations):
- *Không thể join bảng SQL trực tiếp giữa 2 module*: Phải chấp nhận query 2 pha hoặc lưu snapshot dữ liệu cần thiết. Điều này được bù đắp bằng tốc độ cực nhanh của in-process memory và caching.

