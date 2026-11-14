using Microsoft.AspNetCore.Identity;
using Mapster;
using Wolverine.Attributes;
using Automation.Identity.Constants;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Profile;

public record GetProfileQuery(Guid UserId);

public record GetProfileResult(
    Guid Id,
    string UserName,
    string Email,
    string FirstName,
    string LastName,
    string DisplayName,
    string PhoneNumber,
    string? AvatarUrl
);

public class GetProfileEndpoint(IMessageBus bus) : EndpointWithoutRequest<GetProfileResult>
{
    public override void Configure()
    {
        Get("/");
        Group<ProfileGroup>();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        // Extract user id from JWT claims
        var userIdString = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdString, out var userId))
        {
            HttpContext.Response.StatusCode = 401;
            return;
        }

        var result = await bus.InvokeAsync<Result<GetProfileResult>>(new GetProfileQuery(userId), ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetProfileHandler(
    UserManager<User> userManager, 
    Files.Contracts.IAssetApi assetApi,
    ICacheService cacheService)
{
    public async Task<Result<GetProfileResult>> HandleAsync(GetProfileQuery query, CancellationToken ct)
    {
        var cacheKey = IdentityCacheKeys.Profile(query.UserId);
        
        // 1. Try get from cache
        var cachedProfile = await cacheService.GetAsync<GetProfileResult>(cacheKey, ct);
        if (cachedProfile != null)
        {
            return Result.Ok(cachedProfile);
        }

        // 2. Fetch from DB
        var user = await userManager.FindByIdAsync(query.UserId.ToString());
        if (user == null)
            return Result.Fail("User not found");

        string? avatarUrl = null;
        var avatarResult = await assetApi.GetFilesAsync(user.Id.ToString(), nameof(User), IdentityAssetSlots.Avatar, ct);
        if (avatarResult.IsSuccess)
        {
            avatarUrl = avatarResult.Value.FirstOrDefault()?.PublicUrl;
        }

        var result = user.Adapt<GetProfileResult>() with { AvatarUrl = avatarUrl };

        // 3. Set cache
        await cacheService.SetAsync(cacheKey, result, TimeSpan.FromMinutes(15), ct);

        return Result.Ok(result);
    }
}
