using System.Text.Json;
using Automation.DynamicForms.Constants;
using Automation.DynamicForms.Contracts;
using Automation.DynamicForms.Domain.Entities;
using Automation.DynamicForms.Features.Structs;
using Automation.DynamicForms.Infrastructure.Api;
using Automation.DynamicForms.Infrastructure.Persistence;
using Automation.DynamicForms.Services;
using Automation.DynamicForms.Services.Processors;
using Automation.Files.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;

namespace Automation.DynamicForms.Tests.Features;

public class StructCrudHandlerTests
{
    private DynamicFormsDbContext CreateInMemoryDbContext(string dbName)
    {
        return TestDynamicFormsDbContext.Create(dbName);
    }

    private SchemaApi CreateSchemaApi(DynamicFormsDbContext db)
    {
        var assetApi = Substitute.For<IAssetApi>();
        var processors = new IFieldTypeProcessor[]
        {
            new DefaultFieldProcessor(),
            new FileFieldProcessor(assetApi),
            new StructFieldProcessor(),
        };
        var engine = new DynamicFormEngine(processors);
        var registered = new[] { new RegisteredDynamicSchema(DynamicFormsOwnerType.ProjectStruct) };
        return new SchemaApi(db, registered, engine);
    }

    [Fact]
    public async Task CreateStruct_ShouldComputeDependenciesAndSucceed()
    {
        using var db = CreateInMemoryDbContext(
            nameof(CreateStruct_ShouldComputeDependenciesAndSucceed)
        );
        var projectId = Guid.NewGuid();

        // 1. Tạo Struct con trước: BaseTransform
        var createChildHandler = new CreateStructHandler(db);
        var childResult = await createChildHandler.HandleAsync(
            new CreateStructCommand(
                projectId,
                "BaseTransform",
                JsonDocument.Parse("""[{"name":"x","type":"number"}]""")
            ),
            CancellationToken.None
        );

        childResult.IsSuccess.Should().BeTrue();
        var childId = childResult.Value.Id;

        // 2. Tạo Struct cha nhúng BaseTransform
        var parentFields = JsonDocument.Parse(
            $$$"""
            [
                { "name": "label", "type": "text" },
                { "name": "transform", "type": "struct", "properties": { "structId": "{{{childId}}}", "cardinality": "single" } }
            ]
            """
        );

        var createParentHandler = new CreateStructHandler(db);
        var parentResult = await createParentHandler.HandleAsync(
            new CreateStructCommand(projectId, "ActorConfig", parentFields),
            CancellationToken.None
        );

        parentResult.IsSuccess.Should().BeTrue();
        parentResult.Value.ActiveVersion.DependencySchemaIds.Should().Contain(childId);
        parentResult.Value.Dependencies.Should().ContainKey(childId);
    }

    [Fact]
    public async Task CreateStruct_ShouldFail_WhenDuplicateNameInSameProject()
    {
        using var db = CreateInMemoryDbContext(
            nameof(CreateStruct_ShouldFail_WhenDuplicateNameInSameProject)
        );
        var projectId = Guid.NewGuid();
        var handler = new CreateStructHandler(db);

        var res1 = await handler.HandleAsync(
            new CreateStructCommand(projectId, "UniqueStruct"),
            CancellationToken.None
        );
        res1.IsSuccess.Should().BeTrue();

        var res2 = await handler.HandleAsync(
            new CreateStructCommand(projectId, "UniqueStruct"),
            CancellationToken.None
        );
        res2.IsFailed.Should().BeTrue();
        res2.Errors[0].Message.Should().Contain("already exists in this project");
    }

    [Fact]
    public async Task UpdateStruct_ShouldFailFast_WhenCircularDependencyDetected()
    {
        using var db = CreateInMemoryDbContext(
            nameof(UpdateStruct_ShouldFailFast_WhenCircularDependencyDetected)
        );
        var projectId = Guid.NewGuid();
        var createHandler = new CreateStructHandler(db);

        // Tạo Struct A
        var resA = await createHandler.HandleAsync(
            new CreateStructCommand(projectId, "StructA"),
            CancellationToken.None
        );
        var idA = resA.Value.Id;

        // Tạo Struct B nhúng A
        var fieldsB = JsonDocument.Parse(
            $$$"""
            [{"name":"a","type":"struct","properties":{"structId":"{{{idA}}}","cardinality":"single"}}]
            """
        );
        var resB = await createHandler.HandleAsync(
            new CreateStructCommand(projectId, "StructB", fieldsB),
            CancellationToken.None
        );
        var idB = resB.Value.Id;

        // Thử cập nhật Struct A để nhúng ngược lại B (Tạo thành cycle: A -> B -> A)
        var updateHandler = new UpdateStructHandler(db);
        var fieldsACycle = JsonDocument.Parse(
            $$$"""
            [{"name":"b","type":"struct","properties":{"structId":"{{{idB}}}","cardinality":"single"}}]
            """
        );

        var cycleResult = await updateHandler.HandleAsync(
            new UpdateStructCommand(projectId, idA, "StructA", fieldsACycle),
            CancellationToken.None
        );

        cycleResult.IsFailed.Should().BeTrue();
        cycleResult.Errors[0].Message.Should().Contain("Circular dependency detected");
    }

    [Fact]
    public async Task DeleteStruct_ShouldBlockDeletion_WhenReferencedByAnotherStruct()
    {
        using var db = CreateInMemoryDbContext(
            nameof(DeleteStruct_ShouldBlockDeletion_WhenReferencedByAnotherStruct)
        );
        var api = CreateSchemaApi(db);
        var projectId = Guid.NewGuid();

        var createHandler = new CreateStructHandler(db);

        // Tạo Struct Con
        var resChild = await createHandler.HandleAsync(
            new CreateStructCommand(projectId, "ChildStruct"),
            CancellationToken.None
        );
        var childId = resChild.Value.Id;

        // Tạo Struct Cha tham chiếu con
        var parentFields = JsonDocument.Parse(
            $$$"""
            [{"name":"c","type":"struct","properties":{"structId":"{{{childId}}}","cardinality":"single"}}]
            """
        );
        var resParent = await createHandler.HandleAsync(
            new CreateStructCommand(projectId, "ParentStruct", parentFields),
            CancellationToken.None
        );

        // Thử xóa Struct Con
        var deleteHandler = new DeleteStructHandler(db, api);
        var deleteResult = await deleteHandler.HandleAsync(
            new DeleteStructCommand(projectId, childId),
            CancellationToken.None
        );

        deleteResult.IsFailed.Should().BeTrue();
        deleteResult
            .Errors[0]
            .Message.Should()
            .Contain("Cannot delete Struct 'ChildStruct' because it is referenced by");
        deleteResult.Errors[0].Message.Should().Contain("ParentStruct");

        // Xóa Struct Cha trước
        var deleteParentResult = await deleteHandler.HandleAsync(
            new DeleteStructCommand(projectId, resParent.Value.Id),
            CancellationToken.None
        );
        deleteParentResult.IsSuccess.Should().BeTrue();

        // Bây giờ xóa Struct Con phải thành công
        var deleteChildAfterParentResult = await deleteHandler.HandleAsync(
            new DeleteStructCommand(projectId, childId),
            CancellationToken.None
        );
        deleteChildAfterParentResult.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task GetProjectStructs_ShouldFilterAndReturnSummaryDtos()
    {
        using var db = CreateInMemoryDbContext(
            nameof(GetProjectStructs_ShouldFilterAndReturnSummaryDtos)
        );
        var projectId = Guid.NewGuid();
        var createHandler = new CreateStructHandler(db);

        await createHandler.HandleAsync(
            new CreateStructCommand(projectId, "AlphaStruct"),
            CancellationToken.None
        );
        await createHandler.HandleAsync(
            new CreateStructCommand(projectId, "BetaStruct"),
            CancellationToken.None
        );

        var getHandler = new GetProjectStructsHandler(db);
        var allList = await getHandler.HandleAsync(
            new GetProjectStructsQuery(projectId),
            CancellationToken.None
        );

        allList.IsSuccess.Should().BeTrue();
        allList.Value.Should().HaveCount(2);

        var filteredList = await getHandler.HandleAsync(
            new GetProjectStructsQuery(projectId, "alpha"),
            CancellationToken.None
        );
        filteredList.IsSuccess.Should().BeTrue();
        filteredList.Value.Should().HaveCount(1);
        filteredList.Value[0].Name.Should().Be("AlphaStruct");
    }
}
