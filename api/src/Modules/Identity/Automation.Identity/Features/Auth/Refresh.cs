using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Automation.Identity.Domain;
using Automation.Identity.Infrastructure.Auth;
using Automation.Identity.Infrastructure.Persistence;

namespace Automation.Identity.Features.Auth;

public class RefreshTokenCommand
{
    [JsonIgnore]
    public string Token { get; set; } = string.Empty;

    [JsonIgnore]
    public string? IpAddress { get; set; }

    [JsonIgnore]
    public string? UserAgent { get; set; }
}

public record RefreshTokenResult(
    string AccessToken,
    [property: JsonIgnore] string NewRefreshToken,
    [property: JsonIgnore] DateTime RefreshTokenExpiry
);

public class RefreshEndpoint(IMessageBus bus) : EndpointWithoutRequest<RefreshTokenResult>
{
    public override void Configure()
    {
        Post("/refresh");
        Group<AuthGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var req = new RefreshTokenCommand();
        if (HttpContext.Request.Cookies.TryGetValue("refreshToken", out var token))
        {
            req.Token = token;
        }
        req.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        req.UserAgent = HttpContext.Request.Headers.UserAgent.ToString();

        var result = await bus.InvokeAsync<Result<RefreshTokenResult>>(req, ct);
        
        if (result.IsSuccess)
        {
            HttpContext.Response.Cookies.Append("refreshToken", result.Value.NewRefreshToken, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = result.Value.RefreshTokenExpiry
            });
        }

        await this.SendResultAsync(result, ct);
    }
}

public class RefreshTokenHandler(ITokenService tokenService, IdentityDbContext db)
{
    public async Task<Result<RefreshTokenResult>> HandleAsync(
        RefreshTokenCommand command,
        CancellationToken ct
    )
    {
        var refreshToken = await db
            .RefreshTokens.Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == command.Token, ct);

        if (refreshToken is null)
            return Result.Fail("Refresh token not found");

        if (refreshToken.IsRevoked)
        {
            await RevokeAllUserTokensAsync(refreshToken.UserId, "Suspicious reuse detected", ct);
            return Result.Fail("Token has been revoked");
        }

        if (refreshToken.IsExpired)
            return Result.Fail("Token is expired");

        var newRefreshTokenValue = tokenService.GenerateRefreshToken();
        var newRefreshToken = new RefreshToken
        {
            Token = newRefreshTokenValue,
            UserId = refreshToken.UserId,
            IpAddress = command.IpAddress,
            UserAgent = command.UserAgent,
            ExpiresAt = DateTime.UtcNow.AddDays(7),
        };

        refreshToken.RevokedAt = DateTime.UtcNow;
        refreshToken.ReplacedByToken = newRefreshTokenValue;
        refreshToken.RevokeReason = "Replaced";

        db.RefreshTokens.Add(newRefreshToken);
        await db.SaveChangesAsync(ct);

        var accessToken = tokenService.GenerateAccessToken(refreshToken.User);

        return Result.Ok(
            new RefreshTokenResult(accessToken, newRefreshTokenValue, newRefreshToken.ExpiresAt)
        );
    }

    private async Task RevokeAllUserTokensAsync(Guid userId, string reason, CancellationToken ct)
    {
        var activeTokens = await db
            .RefreshTokens.Where(rt => rt.UserId == userId && rt.RevokedAt == null)
            .ToListAsync(ct);

        foreach (var token in activeTokens)
        {
            token.RevokedAt = DateTime.UtcNow;
            token.RevokeReason = reason;
        }

        await db.SaveChangesAsync(ct);
    }
}
