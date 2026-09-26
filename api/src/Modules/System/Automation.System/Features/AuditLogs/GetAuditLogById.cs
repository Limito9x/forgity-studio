using Automation.SystemModule.Domain.Entities;
using Automation.SystemModule.Infrastructure.Persistence;
using Automation.SystemModule.Shared.Dtos;
using Microsoft.EntityFrameworkCore;

namespace Automation.SystemModule.Features.AuditLogs;

public record GetAuditLogByIdQuery(Guid Id);

public class GetAuditLogByIdEndpoint(IMessageBus bus)
    : Endpoint<GetAuditLogByIdQuery, AuditLogDto>
{
    public override void Configure()
    {
        Get("/{id}");
        Group<AuditLogsGroup>();
        Permissions(P.AuditLogs.GetById);
        Description(x => x.WithName("GetAuditLogById"));
    }

    public override async Task HandleAsync(
        GetAuditLogByIdQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<AuditLogDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetAuditLogByIdHandler(SystemDbContext db)
{
    public async Task<Result<AuditLogDto>> HandleAsync(
        GetAuditLogByIdQuery query,
        CancellationToken ct)
    {
        var log = await db.Set<AuditLog>()
            .Where(x => x.Id == query.Id)
            .Select(x => new AuditLogDto(
                x.Id,
                x.UserId,
                x.Action,
                x.EntityName,
                x.EntityId,
                x.OldValues,
                x.NewValues,
                x.Timestamp,
                x.IpAddress,
                x.UserAgent))
            .FirstOrDefaultAsync(ct);

        if (log is null)
            return Result.Fail(new Error("Audit log not found").WithMetadata("Code", "404"));

        return log;
    }
}
