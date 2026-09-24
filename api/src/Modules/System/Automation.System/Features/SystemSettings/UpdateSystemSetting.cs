using Automation.SystemModule.Domain.Entities;
using Automation.SystemModule.Infrastructure.Persistence;
using Automation.SystemModule.Shared.Dtos;

namespace Automation.SystemModule.Features.SystemSettings;

public record UpdateSystemSettingCommand(Guid Id, string Value);

public class UpdateSystemSettingValidator : Validator<UpdateSystemSettingCommand>
{
    public UpdateSystemSettingValidator()
    {
        RuleFor(x => x.Id)
            .NotEmpty()
            .WithMessage("Id is required");
    }
}

public class UpdateSystemSettingEndpoint(IMessageBus bus)
    : Endpoint<UpdateSystemSettingCommand, SystemSettingDto>
{
    public override void Configure()
    {
        Put("/{id}");
        Group<SystemSettingsGroup>();
        Permissions(P.SystemSettings.Update);
        Description(x => x.WithName("UpdateSystemSetting"));
    }

    public override async Task HandleAsync(
        UpdateSystemSettingCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<SystemSettingDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class UpdateSystemSettingHandler(SystemDbContext db)
{
    public async Task<Result<SystemSettingDto>> HandleAsync(
        UpdateSystemSettingCommand request,
        CancellationToken cancellationToken)
    {
        _ = db;
        // TODO: Implement logic here
        
        return Result.Ok(new SystemSettingDto(request.Id, "Default", "Default", "Default", null));
    }
}
