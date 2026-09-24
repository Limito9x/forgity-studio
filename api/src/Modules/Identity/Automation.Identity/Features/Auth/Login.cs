using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain.Enums;
using Automation.Identity.Domain;
using Automation.Identity.Infrastructure.Auth;

namespace Automation.Identity.Features.Auth;

public class LoginCommand
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    [JsonIgnore]
    public string? IpAddress { get; set; }

    [JsonIgnore]
    public string? UserAgent { get; set; }
}

public record LoginResult(
    string AccessToken, 
    [property: JsonIgnore] string RefreshToken, 
    [property: JsonIgnore] DateTime RefreshTokenExpiry
);

public class LoginEndpoint(IMessageBus bus) : Endpoint<LoginCommand, LoginResult>
{
    public override void Configure()
    {
        Post("/login");
        Group<AuthGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(LoginCommand req, CancellationToken ct)
    {
        req.IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        req.UserAgent = HttpContext.Request.Headers.UserAgent.ToString();
        
        var result = await bus.InvokeAsync<Result<LoginResult>>(req, ct);
        
        if (result.IsSuccess)
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = result.Value.RefreshTokenExpiry
            };
            HttpContext.Response.Cookies.Append("refreshToken", result.Value.RefreshToken, cookieOptions);
        }

        await this.SendResultAsync(result, ct);
    }
}

public class LoginHandler(
    ITokenService tokenService,
    UserManager<User> userManager,
    IdentityDbContext db
)
{
    public async Task<Result<LoginResult>> HandleAsync(LoginCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(command.Email);
        if (user == null || !await userManager.CheckPasswordAsync(user, command.Password))
        {
            return Result.Fail("Invalid email or password");
        }

        if(user.Status != UserStatus.Active)
        {
            return Result.Fail("User is not active");
        }

        if (user.MustChangePassword)
        {
            return Result.Fail("You must reset your password before logging in.");
        }

        var accessToken = tokenService.GenerateAccessToken(user);
        var refreshTokenValue = tokenService.GenerateRefreshToken();

        var refreshToken = new RefreshToken
        {
            UserId = user.Id,
            Token = refreshTokenValue,
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            IpAddress = command.IpAddress,
            UserAgent = command.UserAgent,
        };

        db.RefreshTokens.Add(refreshToken);
        await db.SaveChangesAsync(ct);

        var result = new LoginResult(accessToken, refreshTokenValue, refreshToken.ExpiresAt);
        return Result.Ok(result);
    }
}
