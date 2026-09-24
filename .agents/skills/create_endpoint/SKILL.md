---
name: create_endpoint
description: Hướng dẫn cách tạo một API Endpoint bằng FastEndpoints theo chuẩn Pragmatic VSA của dự án.
---

# Hướng Dẫn Tạo Endpoint (FastEndpoints)

Dự án sử dụng **FastEndpoints** thay cho Controller truyền thống. Trong kiến trúc **Pragmatic Single-File VSA**, Endpoint được viết trực tiếp bên trong file slice tính năng (`Features/<Group>/<SliceName>.cs`).

### Cấu trúc cơ bản
Endpoint kế thừa từ `Endpoint<TRequest, TResponse>` (trả về trực tiếp Raw DTO, không bọc `Result<T>` để OpenAPI Spec và Orval sinh code Frontend chuẩn xác nhất) hoặc `EndpointWithoutRequest<TResponse>`.

```csharp
public class GetUserByIdEndpoint(IMessageBus bus) : EndpointWithoutRequest<UserDto>
{
    public override void Configure()
    {
        Get("/{id:guid}");
        Group<UsersGroup>(); // QUAN TRỌNG: Gắn Endpoint này vào Group cụ thể của Module
        Permissions(P.Users.GetById); // Hoặc AllowAnonymous() nếu là API công khai
        Description(b => b.WithName("GetUserById"));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<UserDto>>(new GetUserByIdQuery(id), ct);
        
        // Unwrap FluentResult thành mã HTTP chuẩn (200, 400, 404)
        await this.SendResultAsync(result, ct);
    }
}
```

### Lưu ý quan trọng
1. **Raw DTO Response Type**: Luôn khai báo `Endpoint<TRequest, TResponseDto>` là Raw DTO. Tuyệt đối KHÔNG khai báo `Endpoint<..., Result<TDto>>` vì sẽ làm Swagger sinh schema dạng `{ value, isSuccess, isFailed }` làm hỏng TypeScript code generation ở Frontend.
2. **Endpoint Group**: LUÔN thiết lập `Group<TGroup>()` trong hàm `Configure()` để nhóm các API cùng tính năng (vd: `Group<UsersGroup>()`).
3. **Unwrap với SendResultAsync**: Gọi `await this.SendResultAsync(result, ct);` để tự động unwrap `Result<T>` thành HTTP Response tương ứng.
4. **Phân quyền**: Cấu hình `Permissions(P.<Feature>.<Action>)` cho endpoint yêu cầu quyền, hoặc `AllowAnonymous()` nếu là API công khai.
5. **Khởi tạo DI**: Sử dụng Primary Constructor (`public class MyEndpoint(IMessageBus bus) : ...`).
6. **Đặt tên Endpoint & OpenAPI OperationId**: Tên class luôn theo chuẩn `<Action>Endpoint` (vd: `CreateInvoiceEndpoint`). Hệ thống tại `Program.cs` đã cấu hình `Configurator` tự động lấy tên action làm `OperationId` cho OpenAPI. Tuy nhiên, khuyến khích viết tường minh `Description(b => b.WithName("<Action>"))` để đảm bảo Orval sinh code Frontend ngắn gọn và rõ nghĩa nhất.
