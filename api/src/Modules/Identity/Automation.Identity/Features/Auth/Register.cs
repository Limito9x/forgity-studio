using Automation.SystemAbstractions;
using Microsoft.AspNetCore.Identity;
using Automation.Identity.Constants;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Auth;

public record RegisterCommand(
    string Email,
    string Password,
    string FirstName,
    string LastName
);

public class RegisterValidator : Validator<RegisterCommand>
{
    public RegisterValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required")
            .EmailAddress().WithMessage("Invalid email format");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("Password is required")
            .MinimumLength(6).WithMessage("Password must be at least 6 characters");

        RuleFor(x => x.FirstName)
            .NotEmpty().WithMessage("First name is required");

        RuleFor(x => x.LastName)
            .NotEmpty().WithMessage("Last name is required");
    }
}

public class RegisterEndpoint(IMessageBus bus)
    : Endpoint<RegisterCommand, Result>
{
    public override void Configure()
    {
        Post("/register");
        Group<AuthGroup>();
        AllowAnonymous();
        
    }

    public override async Task HandleAsync(
        RegisterCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class RegisterHandler(
    UserManager<User> userManager,
    IMessageBus bus)
{
    public async Task<Result> HandleAsync(
        RegisterCommand request,
        CancellationToken cancellationToken)
    {
        var user = new User
        {
            Email = request.Email,
            UserName = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            DisplayName = $"{request.FirstName} {request.LastName}".Trim()
        };

        var result = await userManager.CreateAsync(user, request.Password);
        
        if (!result.Succeeded)
        {
            var errors = result.Errors.Select(e => new Error(e.Description)).ToList();
            return Result.Fail(errors);
        }

        var defaultRoleResult = await bus.InvokeAsync<Result<string>>(new GetSystemSettingByKeyQuery(IdentitySettings.DefaultRole), cancellationToken);
        var defaultRole = defaultRoleResult.IsSuccess ? defaultRoleResult.Value : "user";
        await userManager.AddToRoleAsync(user, defaultRole);

        return Result.Ok();
    }
}
