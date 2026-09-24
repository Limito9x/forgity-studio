using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Identity.Constants;
using Automation.Identity.Infrastructure.Persistence;

namespace Automation.Identity.Features.Profile;

public record UpdateAvatarCommand(Guid AssetId, string FileName)
{
    public Guid UserId { get; set; }
}

public class UpdateAvatarValidator : AbstractValidator<UpdateAvatarCommand>
{
    public UpdateAvatarValidator()
    {
        RuleFor(x => x.AssetId).NotEmpty().WithMessage("AssetId is required.");
    }
}

public class UpdateAvatarEndpoint(IMessageBus bus) : Endpoint<UpdateAvatarCommand, string>
{
    public override void Configure()
    {
        Put("/avatar");
        Group<ProfileGroup>();
    }

    public override async Task HandleAsync(UpdateAvatarCommand req, CancellationToken ct)
    {
        var userIdString = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdString, out var userId))
        {
            HttpContext.Response.StatusCode = 401;
            return;
        }

        req.UserId = userId;
        var result = await bus.InvokeAsync<Result<string>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(IdentityDbContext))]
public class UpdateAvatarHandler(
    IAssetApi assetApi,
    ICacheService cacheService)
{
    public async Task<Result<string>> HandleAsync(
        UpdateAvatarCommand request,
        CancellationToken cancellationToken)
    {
        var linkResult = await assetApi.VerifyAndLinkAsync(
            request.AssetId, 
            "User", 
            "Avatar", 
            request.UserId.ToString(), 
            request.FileName, 
            0, 
            cancellationToken);

        if (linkResult.IsFailed) return linkResult.ToResult<string>();

        // Invalidate cache
        await cacheService.RemoveAsync(IdentityCacheKeys.Profile(request.UserId), cancellationToken);

        return Result.Ok("Avatar updated successfully.");
    }
}
