using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Automation.Identity.Infrastructure.Persistence;

namespace Automation.Identity.Features.Auth;

public class LogoutCommand
{
    [JsonIgnore]
    public string RefreshToken { get; set; } = string.Empty;
}

public class LogoutEndpoint(IMessageBus bus) : EndpointWithoutRequest<string>
{
    public override void Configure()
    {
        Post("/logout");
        Group<AuthGroup>();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var req = new LogoutCommand();
        if (HttpContext.Request.Cookies.TryGetValue("refreshToken", out var token))
        {
            req.RefreshToken = token;
        }

        var result = await bus.InvokeAsync<Result<string>>(req, ct);
        
        HttpContext.Response.Cookies.Delete("refreshToken");

        await this.SendResultAsync(result, ct);
    }
}

public class LogoutHandler(IdentityDbContext db)
{
    public async Task<Result<string>> HandleAsync(LogoutCommand command, CancellationToken ct)
    {
        var refreshToken = await db
            .RefreshTokens.FirstOrDefaultAsync(rt => rt.Token == command.RefreshToken, ct);

        if (refreshToken is not null && !refreshToken.IsRevoked)
        {
            refreshToken.RevokedAt = DateTime.UtcNow;
            refreshToken.RevokeReason = "Logout";
            await db.SaveChangesAsync(ct);
        }

        return Result.Ok("Logged out successfully");
    }
}
