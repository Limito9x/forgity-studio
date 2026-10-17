using System.Text;
using Automation.Identity.Constants;
using Automation.Identity.Domain;
using Automation.Identity.Features.Users.Templates;
using Automation.Notifications.Contracts.Messages;
using Automation.SharedKernel.Extensions.Results;
using FastEndpoints;
using FluentResults;
using FluentValidation;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Wolverine;

namespace Automation.Identity.Features.Users;

public record BulkInviteUserItemResult(
    string Email,
    bool Success,
    string? Reason = null,
    bool IsExistingUser = false
);

public record BulkInviteUsersResponse(
    int TotalProcessed,
    int SucceededCount,
    int SkippedExistingCount,
    int FailedCount,
    List<BulkInviteUserItemResult> Details
);

public record BulkInviteUsersCommand(
    List<string> Emails,
    Guid? RoleId = null,
    string? PersonalNote = null,
    string? DiscordUrl = null
);

public class BulkInviteUsersValidator : Validator<BulkInviteUsersCommand>
{
    public BulkInviteUsersValidator()
    {
        RuleFor(x => x.Emails)
            .NotEmpty().WithMessage("At least one email address is required.")
            .Must(emails => emails != null && emails.Count <= 200)
            .WithMessage("Maximum 200 emails can be processed per batch.");
    }
}

public class BulkInviteUsersEndpoint(IMessageBus bus) : Endpoint<BulkInviteUsersCommand, BulkInviteUsersResponse>
{
    public override void Configure()
    {
        Post("bulk-invite");
        Group<UsersGroup>();
        Permissions(P.Users.Create);
    }

    public override async Task HandleAsync(BulkInviteUsersCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<BulkInviteUsersResponse>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class BulkInviteUsersHandler(
    UserManager<User> userManager,
    RoleManager<Role> roleManager,
    IConfiguration configuration,
    IMessageBus bus)
{
    public async Task<Result<BulkInviteUsersResponse>> Handle(BulkInviteUsersCommand command, CancellationToken ct)
    {
        // 1. Sanitize and deduplicate emails
        var cleanEmails = (command.Emails ?? [])
            .Where(e => !string.IsNullOrWhiteSpace(e))
            .Select(e => e.Trim().ToLowerInvariant())
            .Distinct()
            .ToList();

        if (cleanEmails.Count == 0)
        {
            return Result.Fail<BulkInviteUsersResponse>("No valid email addresses provided.");
        }

        // 2. Resolve Role
        string targetRoleName = IdentityRoles.User;
        if (command.RoleId.HasValue && command.RoleId.Value != Guid.Empty)
        {
            var role = await roleManager.FindByIdAsync(command.RoleId.Value.ToString());
            if (role != null && !string.IsNullOrWhiteSpace(role.Name))
            {
                targetRoleName = role.Name;
            }
        }

        var clientUrl = configuration["AppConfig:ClientUrl"] ?? "http://localhost:5173";
        var isRealEmailSend = configuration.GetValue<bool>("AppConfig:Email:RealEmailSend");
        var defaultEmail = configuration["AppConfig:Email:DefaultEmail"] ?? "test@example.com";

        var details = new List<BulkInviteUserItemResult>();

        foreach (var email in cleanEmails)
        {
            try
            {
                // Basic email syntax check
                if (!email.Contains('@') || !email.Contains('.'))
                {
                    details.Add(new BulkInviteUserItemResult(email, false, "Invalid email format."));
                    continue;
                }

                // Check if user already exists
                var existingUser = await userManager.FindByEmailAsync(email);
                if (existingUser != null)
                {
                    details.Add(new BulkInviteUserItemResult(
                        email,
                        false,
                        "User already exists with this email address.",
                        IsExistingUser: true
                    ));
                    continue;
                }

                // Generate a friendly unique username
                var localPart = email.Split('@')[0];
                var candidateUsername = localPart;
                if (await userManager.FindByNameAsync(candidateUsername) != null)
                {
                    candidateUsername = $"{localPart}_{Guid.NewGuid().ToString("N")[..6]}";
                }

                var user = new User
                {
                    UserName = candidateUsername,
                    Email = email,
                    FirstName = localPart,
                    LastName = "Beta Tester",
                    DisplayName = localPart,
                    EmailConfirmed = true,
                    MustChangePassword = true
                };

                var createResult = await userManager.CreateAsync(user);
                if (!createResult.Succeeded)
                {
                    var errors = string.Join("; ", createResult.Errors.Select(e => e.Description));
                    details.Add(new BulkInviteUserItemResult(email, false, $"Failed to create user: {errors}"));
                    continue;
                }

                // Assign target role
                if (!string.IsNullOrWhiteSpace(targetRoleName))
                {
                    await userManager.AddToRoleAsync(user, targetRoleName);
                }

                // Generate invite token & link
                var token = await userManager.GeneratePasswordResetTokenAsync(user);
                var encodedToken = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
                var inviteLink = $"{clientUrl}/auth/accept-invite?email={Uri.EscapeDataString(email)}&token={encodedToken}";

                // Build HTML email and send via queue
                var recipient = isRealEmailSend ? email : defaultEmail;
                var htmlBody = BetaInviteEmailTemplate.Render(
                    email: email,
                    inviteLink: inviteLink,
                    personalNote: command.PersonalNote,
                    discordUrl: command.DiscordUrl
                );

                var emailCommand = new SendEmailCommand(
                    To: recipient,
                    Subject: "Welcome to Forgity Studio - Closed Beta Invitation",
                    Body: htmlBody,
                    IsHtml: true
                );

                await bus.SendAsync(emailCommand);

                details.Add(new BulkInviteUserItemResult(
                    email,
                    true,
                    "Invitation sent successfully."
                ));
            }
            catch (Exception ex)
            {
                details.Add(new BulkInviteUserItemResult(
                    email,
                    false,
                    $"Unexpected error: {ex.Message}"
                ));
            }
        }

        var succeeded = details.Count(d => d.Success);
        var skipped = details.Count(d => d.IsExistingUser);
        var failed = details.Count(d => !d.Success && !d.IsExistingUser);

        var response = new BulkInviteUsersResponse(
            TotalProcessed: details.Count,
            SucceededCount: succeeded,
            SkippedExistingCount: skipped,
            FailedCount: failed,
            Details: details
        );

        return Result.Ok(response);
    }
}
