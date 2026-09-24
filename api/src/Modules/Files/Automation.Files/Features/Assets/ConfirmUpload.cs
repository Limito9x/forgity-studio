using FastEndpoints;
using FluentResults;
using FluentValidation;
using Wolverine.Attributes;
using Wolverine;
using Automation.Files.Contracts;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.Assets;

public record ConfirmUploadCommand(List<Guid> AssetIds);

public class ConfirmUploadValidator : AbstractValidator<ConfirmUploadCommand>
{
    public ConfirmUploadValidator()
    {
        RuleFor(x => x.AssetIds)
            .NotEmpty().WithMessage("AssetIds cannot be empty.");
        RuleForEach(x => x.AssetIds)
            .NotEmpty().WithMessage("AssetId cannot be empty.");
    }
}

public class ConfirmUploadEndpoint(IMessageBus bus) : Endpoint<ConfirmUploadCommand, IReadOnlyList<ConfirmAssetDto>>
{
    public override void Configure()
    {
        Post("confirm-upload");
        Group<AssetsGroup>();
        AllowAnonymous(); // Depending on auth setup
    }

    public override async Task HandleAsync(ConfirmUploadCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<FluentResults.Result<IReadOnlyList<ConfirmAssetDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(FilesDbContext))]
public class ConfirmUploadHandler(IAssetApi assetApi)
{
    public async Task<Result<IReadOnlyList<ConfirmAssetDto>>> HandleAsync(ConfirmUploadCommand command, CancellationToken ct)
    {
        return await assetApi.ConfirmUploadAsync(command.AssetIds, ct);
    }
}
