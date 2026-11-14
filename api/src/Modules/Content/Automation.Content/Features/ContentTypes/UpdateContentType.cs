using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.SharedKernel.Errors;

namespace Automation.Content.Features.ContentTypes;

public record UpdateContentTypeCommand{
    public Guid Id { get; set; }
    
    public string Name { get; set; } = null!;
    
    public string DisplayName { get; set; } = null!;
    
    public string? Description { get; set; }
    
    public string? Icon { get; set; }
    
    public string? Color { get; set; }
    
    public int SortOrder { get; set; }
    
    public JsonDocument? DisplayConfig { get; set; }  
};

public class UpdateContentTypeValidator : Validator<UpdateContentTypeCommand>
{
    public UpdateContentTypeValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.Icon).MaximumLength(100);
        RuleFor(x => x.Color).MaximumLength(50);
        RuleFor(x => x.DisplayConfig).NotNull();
    }
}

public class UpdateContentTypeEndpoint(IMessageBus bus)
    : Endpoint<UpdateContentTypeCommand, ContentTypeDto>
{
    public override void Configure()
    {
        Put("{Id:guid}");
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.Update);
        Description(x => x.WithName("UpdateContentType"));
    }

    public override async Task HandleAsync(
        UpdateContentTypeCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentTypeDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class UpdateContentTypeHandler(ContentDbContext db)
{
    public async Task<Result<ContentTypeDto>> HandleAsync(
        UpdateContentTypeCommand request,
        CancellationToken cancellationToken)
    {
        var item = await db.ContentTypes.FirstOrDefaultAsync(x => x.Id == request.Id, cancellationToken);
        if (item is null) return Result.Fail(new NotFoundError("ContentType not found"));
        
        item.Update(
            request.Name,
            request.DisplayName,
            request.Description,
            request.Icon,
            request.Color,
            request.SortOrder,
            request.DisplayConfig
        );
        
        await db.SaveChangesAsync(cancellationToken);
        
        return Result.Ok(new ContentTypeDto
        {
            Id = item.Id,
            ProjectId = item.ProjectId,
            Key = item.Key,
            Name = item.Name,
            DisplayName = item.DisplayName,
            Description = item.Description,
            Icon = item.Icon,
            Color = item.Color,
            SortOrder = item.SortOrder,
            DisplayConfig = item.DisplayConfig
        });
    }
}
