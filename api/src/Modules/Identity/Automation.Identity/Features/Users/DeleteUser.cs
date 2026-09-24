using Microsoft.AspNetCore.Identity;
using Automation.Identity.Domain.Enums;
using Automation.Identity.Domain;

namespace Automation.Identity.Features.Users;

public record DeleteUserCommand(Guid Id);

public class DeleteUserEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("/{Id}");
        Group<UsersGroup>();
        Permissions(P.Users.Delete);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("Id");
        var result = await bus.InvokeAsync<Result<string>>(new DeleteUserCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

public class DeleteUserHandler(UserManager<User> userManager)
{
    public async Task<Result<string>> HandleAsync(DeleteUserCommand command, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(command.Id.ToString());
        if (user == null || user.IsDeleted)
            return Result.Fail("User not found");

        // Soft delete logic handled by interceptor, so we just Update or Remove.
        // IdentityUser is tracked by UserManager, so we can set IsDeleted manually or just call DeleteAsync.
        // Let's set DeletedAt manually and UpdateAsync so EF Core interceptor triggers (or identity updates it).
        
        user.DeletedAt = DateTimeOffset.UtcNow;
        user.Status = UserStatus.Inactive;

        var result = await userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            return Result.Fail("Failed to delete user: " + errors);
        }

        return Result.Ok("User deleted successfully");
    }
}
