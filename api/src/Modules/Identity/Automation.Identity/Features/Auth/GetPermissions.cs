using Automation.Identity.Infrastructure.Auth;
using Automation.SharedKernel.Infrastructure.Persistence;

namespace Automation.Identity.Features.Auth;

public class GetPermissionsQuery
{
}

public class GetPermissionsEndpoint(IMessageBus bus) : EndpointWithoutRequest<List<string>>
{
    public override void Configure()
    {
        Get("/permissions");
        Group<AuthGroup>();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<List<string>>>(new GetPermissionsQuery(), ct);
        
        await this.SendResultAsync(result, ct);
    }
}

public class GetPermissionsHandler(
    IPermissionService permissionService,
    ICurrentUserProvider userProvider)
{
    public async Task<Result<List<string>>> HandleAsync(GetPermissionsQuery request, CancellationToken cancellationToken)
    {
        var currentUserId = userProvider.UserId;
        if (currentUserId == null)
        {
            return Result.Fail("User not found");
        }

        var permissions = await permissionService.GetPermissionsAsync(currentUserId.Value, cancellationToken);
        return Result.Ok(permissions);
    }
}
