---
name: create_feature
description: Hướng dẫn cách tạo một tính năng (Feature/Vertical Slice) mới trong một module theo chuẩn Pragmatic Single-File VSA.
---

# Hướng Dẫn Tạo Tính Năng Mới (Pragmatic Single-File VSA)

Dự án áp dụng chuẩn **Single-File Vertical Slice Architecture (VSA)** kết hợp **Mapster-First** (chi tiết xem tại [ADR-005](file:///d:/FullStack/Automation/docs/backend/ADR_PRAGMATIC_SINGLE_FILE_VSA.md)).

> **Quy tắc vàng:** Mỗi tính năng (Use Case) được gói gọn trong **MỘT FILE C# DUY NHẤT** tại `Features/<FeatureGroup>/<SliceName>.cs`. **TUYỆT ĐỐI KHÔNG TẠO THƯ MỤC CON LỒNG NHAU CHO TỪNG SLICE**.

---

## 1. Cấu Trúc File Chuẩn của Một Slice

Tạo file mới tại: `Features/<FeatureGroup>/<ActionName>.cs` (ví dụ: `Features/Tags/CreateTag.cs`):

```csharp
using Automation.Tag.Domain.Entities;
using Automation.Tag.Infrastructure.Persistence;
using Automation.Tag.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Tag.Features.Tags;

// 1. Command / Query Record
public record CreateTagCommand(string Name, string? Color);

// 2. Validator (FluentValidation - nếu có kiểm tra dữ liệu)
public class CreateTagValidator : AbstractValidator<CreateTagCommand>
{
    public CreateTagValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

// 3. FastEndpoints Endpoint
public class CreateTagEndpoint(IMessageBus bus) : Endpoint<CreateTagCommand, TagDto>
{
    public override void Configure()
    {
        Post("");
        Group<TagsGroup>();
        Permissions(P.Tag.Create);
        Description(x => x.WithName("CreateTag"));
    }

    public override async Task HandleAsync(CreateTagCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<TagDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

// 4. Wolverine Handler xử lý nghiệp vụ
[Transactional(typeof(TagDbContext))] // Dùng [NonTransactional] nếu chỉ đọc (Query)
public class CreateTagHandler(TagDbContext db)
{
    public async Task<Result<TagDto>> HandleAsync(CreateTagCommand command, CancellationToken ct)
    {
        var tag = command.Adapt<Domain.Entities.Tag>();
        db.Tags.Add(tag);
        await db.SaveChangesAsync(ct);

        return Result.Ok(tag.Adapt<TagDto>());
    }
}
```

---

## 2. Quy Tắc Bắt Buộc

1. **Pure POCO & Mapster-First**:
   - Entity có thuộc tính public `{ get; set; }`. Không tạo constructor ràng buộc tham số hay hàm `Update()` hình thức.
   - Luôn dùng `command.Adapt<Entity>()` hoặc `db.Query.ProjectToType<TDto>()`.

2. **SendResultAsync Unwrap**:
   - Endpoint luôn khai báo generic response type là Raw DTO (`Endpoint<TRequest, TResponseDto>`), không bọc `Result<TResponseDto>`.
   - Gọi `await this.SendResultAsync(result, ct)` để tự động chuyển FluentResults `Result.Fail` thành 400 Bad Request / 404 Not Found, và `Result.Ok` thành 200 OK.

3. **Transaction Attributes**:
   - Các thao tác Ghi (Create/Update/Delete): Bắt buộc `[Transactional(typeof(<Module>DbContext))]`.
   - Các thao tác Đọc (Get/List/Query): Bắt buộc `[NonTransactional]`.

4. **Kiểm Tra Build**:
   - Sau khi tạo file, chạy `dotnet build api/src/Automation.Api/Automation.Api.csproj` để xác nhận 0 Error, 0 Warning.
