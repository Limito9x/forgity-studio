using FastEndpoints;
using FluentResults;
using FluentValidation;
using Wolverine.Attributes;
using Wolverine;
using Automation.Files.Contracts;
using Automation.Files.Infrastructure.Persistence;
using Automation.SharedKernel.Extensions.Results;

namespace Automation.Files.Features.Assets;

public record RequestUploadCommand(List<UploadRequestItemDto> Items);

public class RequestUploadValidator : AbstractValidator<RequestUploadCommand>
{
    public RequestUploadValidator()
    {
        RuleFor(x => x.Items).NotEmpty().WithMessage("Items cannot be empty.");
        RuleForEach(x => x.Items).SetValidator(new UploadRequestItemValidator());
    }
}

public class UploadRequestItemValidator : AbstractValidator<UploadRequestItemDto>
{
    public UploadRequestItemValidator()
    {
        RuleFor(x => x.HashSha256)
            .NotEmpty().WithMessage("Hash is required.")
            .Length(64).WithMessage("Hash must be exactly 64 characters long.");

        RuleFor(x => x.Extension)
            .NotEmpty().WithMessage("Extension is required.")
            .Must(x => x.StartsWith(".")).WithMessage("Extension must start with a dot.");

        RuleFor(x => x.SizeBytes)
            .GreaterThan(0).WithMessage("Size must be greater than 0.");
            
        RuleFor(x => x.ContentType)
            .NotEmpty().WithMessage("Content type is required.");
    }
}

public class RequestUploadEndpoint(IMessageBus bus) : Endpoint<RequestUploadCommand, IReadOnlyList<AssetUploadDto>>
{
    public override void Configure()
    {
        Post("request-upload");
        Group<AssetsGroup>();
        AllowAnonymous(); // Depending on auth setup
    }

    public override async Task HandleAsync(RequestUploadCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<FluentResults.Result<IReadOnlyList<AssetUploadDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(FilesDbContext))]
public class RequestUploadHandler(IAssetApi assetApi)
{
    public async Task<Result<IReadOnlyList<AssetUploadDto>>> HandleAsync(RequestUploadCommand command, CancellationToken ct)
    {
        return await assetApi.RequestUploadAsync(command.Items, ct);
    }
}
