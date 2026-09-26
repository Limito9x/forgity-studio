using Wolverine;
using Automation.SharedKernel.Abstractions.Auth;

namespace Automation.Identity.Features.Permissions;

public record GetAllPermissionsQuery();

public class GetAllPermissionsEndpoint(IMessageBus bus)
    : EndpointWithoutRequest<Dictionary<string, Dictionary<string, IReadOnlyList<string>>>>
{
    public override void Configure()
    {
        Get("/");
        Group<PermissionsGroup>();
        Permissions(P.RolesFeature.Assign);
        
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<Dictionary<string, Dictionary<string, IReadOnlyList<string>>>>>(new GetAllPermissionsQuery(), ct);
        await this.SendResultAsync(result, ct);
    }
}

public class GetAllPermissionsHandler(GlobalPermissionRegistry registry)
{
    public Result<Dictionary<string, Dictionary<string, IReadOnlyList<string>>>> Handle(GetAllPermissionsQuery query)
    {
        return Result.Ok(registry.Modules);
    }
}
