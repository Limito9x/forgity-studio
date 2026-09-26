using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using FluentValidation;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Auth;

public record ResetPasswordCommand(string Email, string Token, string NewPassword);

public class ResetPasswordValidator : Validator<ResetPasswordCommand>
{
    public ResetPasswordValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Invalid email format.");
            
        RuleFor(x => x.Token)
            .NotEmpty().WithMessage("Token is required.");
            
        RuleFor(x => x.NewPassword)
            .NotEmpty().WithMessage("New password is required.")
            .MinimumLength(6).WithMessage("Password must be at least 6 characters.");
    }
}

public class ResetPasswordEndpoint(IMessageBus bus) : Endpoint<ResetPasswordCommand, string>
{
    public override void Configure()
    {
        Post("/reset-password");
        Group<AuthGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(ResetPasswordCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<string>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class ResetPasswordHandler(UserManager<User> userManager)
{
    public async Task<Result<string>> HandleAsync(ResetPasswordCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(command.Email);
        
        if (user == null)
        {
            return Result.Fail("User not found or invalid token.");
        }

        string decodedToken;
        try
        {
            var decodedBytes = WebEncoders.Base64UrlDecode(command.Token);
            decodedToken = Encoding.UTF8.GetString(decodedBytes);
        }
        catch (FormatException)
        {
            return Result.Fail("Invalid token format.");
        }

        var result = await userManager.ResetPasswordAsync(user, decodedToken, command.NewPassword);

        if (result.Succeeded)
        {
            user.MustChangePassword = false;
            await userManager.UpdateAsync(user);
            return Result.Ok("Password reset successfully.");
        }

        var errors = string.Join(", ", result.Errors.Select(e => e.Description));
        return Result.Fail($"Failed to reset password: {errors}");
    }
}
