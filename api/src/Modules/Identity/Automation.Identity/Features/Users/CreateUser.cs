using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Automation.Identity.Domain;
using Automation.Notifications.Contracts.Messages;

namespace Automation.Identity.Features.Users;

public record CreateUserCommand(string Username, string Email, string FirstName, string LastName, Guid RoleId);

public class CreateUserEndpoint(IMessageBus bus) : Endpoint<CreateUserCommand, Guid>
{
    public override void Configure()
    {
        Post("/");
        Group<UsersGroup>();
        Permissions(P.Users.Create);
    }

    public override async Task HandleAsync(CreateUserCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<Guid>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class CreateUserHandler(
    UserManager<User> userManager,
    RoleManager<Role> roleManager,
    IConfiguration configuration,
    IMessageBus bus)
{
    public async Task<Result<Guid>> Handle(CreateUserCommand command, CancellationToken ct)
    {        
        var user = new User
        {
            UserName = command.Username,
            Email = command.Email,
            FirstName = command.FirstName,
            LastName = command.LastName,
            DisplayName = command.Username,
            EmailConfirmed = true,
            MustChangePassword = true
        };

        var result = await userManager.CreateAsync(user);
        
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to create user: " + errors);
        }

        if (command.RoleId != Guid.Empty)
        {
            var role = await roleManager.FindByIdAsync(command.RoleId.ToString());
            if (role != null)
            {
                await userManager.AddToRoleAsync(user, role.Name!);
            }
        }

        // Generate token and send invite email
        var token = await userManager.GeneratePasswordResetTokenAsync(user);
        var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

        var clientUrl = configuration["AppConfig:ClientUrl"] ?? "http://localhost:5173";
        var inviteLink = $"{clientUrl}/auth/accept-invite?email={Uri.EscapeDataString(command.Email)}&token={encodedToken}";

        var isRealEmailSend = configuration.GetValue<bool>("AppConfig:Email:RealEmailSend");
        var defaultEmail = configuration["AppConfig:Email:DefaultEmail"] ?? "test@example.com";
        var recipient = isRealEmailSend ? command.Email : defaultEmail;

        var emailCommand = new SendEmailCommand(
            To: recipient,
            Subject: "Welcome to Our System - Accept Your Invitation",
            Body: $"<p>Hello {user.FirstName},</p><p>You have been invited to join our system. Please click the link below to set up your password and activate your account:</p><p><a href=\"{inviteLink}\">Accept Invitation</a></p>",
            IsHtml: true
        );

        await bus.SendAsync(emailCommand);
        
        return Result.Ok(user.Id);
    }
}
