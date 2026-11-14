using Automation.SystemModule.Domain.Entities;
using Automation.SystemModule.Infrastructure.Persistence;
using Automation.SystemModule.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Gridify;

namespace Automation.SystemModule.Features.AuditLogs;

public class GetAuditLogsQuery : PagedQuery;

public class GetAuditLogsEndpoint(IMessageBus bus)
    : Endpoint<GetAuditLogsQuery, PagedResult<AuditLogDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<AuditLogsGroup>();
        Permissions(P.AuditLogs.GetAll);
        Description(x => x.WithName("GetAuditLogs"));
        RequestBinder(new PagedQueryBinder<GetAuditLogsQuery>());
    }

    public override async Task HandleAsync(
        GetAuditLogsQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PagedResult<AuditLogDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetAuditLogsHandler(SystemDbContext db)
{
    public async Task<Result<PagedResult<AuditLogDto>>> HandleAsync(
        GetAuditLogsQuery query,
        CancellationToken ct)
    {
        var mapper = new GridifyMapper<AuditLog>()
            .GenerateMappings();

        if (query.Sort is null || query.Sort.Count == 0)
        {
            query.Sort = new Dictionary<string, bool> { { "Timestamp", false } };
        }

        var result = await db.AuditLogs
            .AsNoTracking()
            .ToPagedResultAsync<AuditLog, AuditLogDto>(query, mapper, ct);
            
        return result;
    }
}
