using Automation.SystemModule.Domain.Entities;
using Automation.SystemModule.Infrastructure.Persistence;
using Automation.SystemModule.Shared.Dtos;

namespace Automation.SystemModule.Features.SystemSettings;

public record GetSystemSettingByIdQuery(Guid Id);

public class GetSystemSettingByIdEndpoint(IMessageBus bus)
    : Endpoint<GetSystemSettingByIdQuery, SystemSettingDto>
{
    public override void Configure()
    {
        Get("/{id}");
        Group<SystemSettingsGroup>();
        Permissions(P.SystemSettings.GetById);
        Description(x => x.WithName("GetSystemSettingById"));
    }

    public override async Task HandleAsync(
        GetSystemSettingByIdQuery req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<SystemSettingDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetSystemSettingByIdHandler(SystemDbContext db)
{
    public async Task<Result<SystemSettingDto>> HandleAsync(
        GetSystemSettingByIdQuery query,
        CancellationToken ct)
    {
        _ = db;
        // TODO: Implement get by id logic here
        
        return Result.Ok(new SystemSettingDto(query.Id, "Default", "Default", "Default", null));
    }
}
