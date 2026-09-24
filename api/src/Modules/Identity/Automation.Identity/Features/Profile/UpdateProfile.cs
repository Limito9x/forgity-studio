using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Automation.Identity.Constants;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Profile;

public class UpdateProfileCommand
{
    [JsonIgnore]
    public Guid UserId { get; set; }

    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
}

public class UpdateProfileEndpoint(IMessageBus bus) : Endpoint<UpdateProfileCommand, string>
{
    public override void Configure()
    {
        Put("/");
        Group<ProfileGroup>();
    }

    public override async Task HandleAsync(UpdateProfileCommand req, CancellationToken ct)
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

public class UpdateProfileHandler(
    UserManager<User> userManager,
    ICacheService cacheService)
{
    public async Task<Result<string>> HandleAsync(UpdateProfileCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(command.UserId.ToString());
        if (user == null)
            return Result.Fail("User not found");

        user.FirstName = command.FirstName;
        user.LastName = command.LastName;
        user.DisplayName = command.DisplayName;
        user.PhoneNumber = command.PhoneNumber;

        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to update profile: " + errors);
        }

        // Invalidate cache
        await cacheService.RemoveAsync(IdentityCacheKeys.Profile(command.UserId), ct);

        return Result.Ok("Profile updated successfully");
    }
}
