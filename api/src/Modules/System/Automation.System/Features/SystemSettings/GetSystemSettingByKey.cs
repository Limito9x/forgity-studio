using Automation.SystemAbstractions;
using Automation.SystemModule.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using FluentResults;

namespace Automation.SystemModule.Features.SystemSettings;

public class GetSystemSettingByKeyHandler(
    SystemDbContext db,
    ISystemSettingsRegistry registry)
{
    public async Task<Result<string>> HandleAsync(
        GetSystemSettingByKeyQuery request,
        CancellationToken cancellationToken)
    {
        var setting = await db.SystemSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Key == request.Key, cancellationToken);

        if (setting != null)
        {
            return Result.Ok(setting.Value);
        }

        var registrySetting = registry.GetSetting(request.Key);
        if (registrySetting.IsSuccess)
        {
            return Result.Ok(registrySetting.Value.DefaultValue);
        }

        return Result.Fail($"System setting with key '{request.Key}' not found.");
    }
}
