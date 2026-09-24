using System.Text.Json.Serialization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Content.Constants;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.Content.Shared.Dtos;
using Automation.DynamicForms.Contracts;
using Automation.SharedKernel.Errors;
using Automation.SharedKernel.Extensions.Strings;

namespace Automation.Content.Features.ContentTypes;

public record CreateContentTypeCommand{
    public Guid ProjectId { get; set; }

    public string Name { get; set; } = null!;

    public string DisplayName { get; set; } = null!;

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? Color { get; set; }

    public int SortOrder { get; set; }

    public JsonDocument? DisplayConfig { get; set; }
}

public class CreateContentTypeValidator : Validator<CreateContentTypeCommand>
{
    public CreateContentTypeValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(255);
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.Icon).MaximumLength(100);
        RuleFor(x => x.Color).MaximumLength(50);
        RuleFor(x => x.DisplayConfig).NotNull();
    }
}

public class CreateContentTypeEndpoint(IMessageBus bus)
    : Endpoint<CreateContentTypeCommand, ContentTypeDto>
{
    public override void Configure()
    {
        Post(ContentRoutes.NestedContentTypes);
        Group<ContentTypesGroup>();
        Permissions(P.ContentType.Create);
        Description(x => x.WithName("CreateContentType"));
    }

    public override async Task HandleAsync(
        CreateContentTypeCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ContentTypeDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(ContentDbContext))]
public class CreateContentTypeHandler(ContentDbContext db, ISchemaApi schemaApi)
{
    public async Task<Result<ContentTypeDto>> HandleAsync(
        CreateContentTypeCommand request,
        CancellationToken cancellationToken)
    {
        var key = request.Name.ToSlug();

        var existingType = await db.ContentTypes
            .AnyAsync(c => c.ProjectId == request.ProjectId && c.Key == key, cancellationToken);
            
        if (existingType)
        {
            return Result.Fail(new Error($"ContentType with key '{key}' already exists in this project."));
        }

        var contentType = new ContentType(
            request.ProjectId,
            key,
            request.Name,
            request.DisplayName,
            request.Description,
            request.Icon,
            request.Color,
            request.SortOrder,
            request.DisplayConfig
        );
        
        db.ContentTypes.Add(contentType);
        await db.SaveChangesAsync(cancellationToken);
        
        var emptyFields = JsonDocument.Parse("[]");
        var schemaResult = await schemaApi.UpsertSchemaAsync(
            "ContentType", 
            contentType.Id.ToString(), 
            contentType.Name, 
            emptyFields, 
            cancellationToken);

        if (schemaResult.IsFailed)
        {
            return schemaResult.ToResult<ContentTypeDto>();
        }
        
        return Result.Ok(new ContentTypeDto
        {
            Id = contentType.Id,
            ProjectId = contentType.ProjectId,
            Key = contentType.Key,
            Name = contentType.Name,
            DisplayName = contentType.DisplayName,
            Description = contentType.Description,
            Icon = contentType.Icon,
            Color = contentType.Color,
            SortOrder = contentType.SortOrder,
            DisplayConfig = contentType.DisplayConfig
        });
    }
}
