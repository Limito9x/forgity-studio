using Automation.SystemModule.Domain.Entities;
using Automation.SystemModule.Infrastructure.Persistence;
using Automation.SystemModule.Shared.Dtos;
using Gridify;

namespace Automation.SystemModule.Features.SystemSettings;

public class GetSystemSettingsQuery : PagedQuery;

public class GetSystemSettingsEndpoint(IMessageBus bus)
    : Endpoint<GetSystemSettingsQuery, PagedResult<SystemSettingDto>>
{
    public override void Configure()
    {
        Get("/");
        Group<SystemSettingsGroup>();
        Permissions(P.SystemSettings.GetAll);
        Description(x => x.WithName("GetSystemSettings"));
        RequestBinder(new PagedQueryBinder<GetSystemSettingsQuery>());
    }

    public override async Task HandleAsync(
        GetSystemSettingsQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PagedResult<SystemSettingDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetSystemSettingsHandler(SystemDbContext db)
{
    public async Task<Result<PagedResult<SystemSettingDto>>> HandleAsync(
        GetSystemSettingsQuery query,
        CancellationToken ct)
    {
        var mapper = new GridifyMapper<SystemSetting>()
            .GenerateMappings();

        var result = await db.Set<SystemSetting>()
            .ToPagedResultAsync<SystemSetting, SystemSettingDto>(query, mapper, ct);
            
        return result;
    }
}
