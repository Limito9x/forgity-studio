using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUnifiedCloudPipelineAndTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConstantProfiles",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    ValuesJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConstantProfiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PipelineVersions",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    GraphHash = table.Column<string>(type: "text", nullable: false),
                    DagBundleJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    ContractsJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineVersions_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PipelineScriptArtifacts",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScriptKey = table.Column<string>(type: "text", nullable: false),
                    ScriptHash = table.Column<string>(type: "text", nullable: false),
                    Executor = table.Column<string>(type: "text", nullable: false),
                    SourceCode = table.Column<string>(type: "text", nullable: false),
                    RequirementsJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineScriptArtifacts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineScriptArtifacts_PipelineVersions_PipelineVersionId",
                        column: x => x.PipelineVersionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectPipelineViews",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    PinnedVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefaultConstantProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectPipelineViews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectPipelineViews_PipelineVersions_PinnedVersionId",
                        column: x => x.PinnedVersionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectPipelineViews_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TemplatePipelineViews",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    PublishedVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Category = table.Column<string>(type: "text", nullable: false),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    QuotaStrategy = table.Column<string>(type: "text", nullable: false),
                    DefaultQuotaLimit = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplatePipelineViews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemplatePipelineViews_PipelineVersions_PublishedVersionId",
                        column: x => x.PublishedVersionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TemplatePipelineViews_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TemplateQuotas",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateViewId = table.Column<Guid>(type: "uuid", nullable: false),
                    MachineKey = table.Column<string>(type: "text", nullable: false),
                    UsedRuns = table.Column<int>(type: "integer", nullable: false),
                    MaxRuns = table.Column<int>(type: "integer", nullable: false),
                    PeriodKey = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplateQuotas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemplateQuotas_TemplatePipelineViews_TemplateViewId",
                        column: x => x.TemplateViewId,
                        principalSchema: "pipeline",
                        principalTable: "TemplatePipelineViews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PipelineScriptArtifacts_PipelineVersionId",
                schema: "pipeline",
                table: "PipelineScriptArtifacts",
                column: "PipelineVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineVersions_PipelineId",
                schema: "pipeline",
                table: "PipelineVersions",
                column: "PipelineId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectPipelineViews_PinnedVersionId",
                schema: "pipeline",
                table: "ProjectPipelineViews",
                column: "PinnedVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectPipelineViews_PipelineId",
                schema: "pipeline",
                table: "ProjectPipelineViews",
                column: "PipelineId");

            migrationBuilder.CreateIndex(
                name: "IX_TemplatePipelineViews_PipelineId",
                schema: "pipeline",
                table: "TemplatePipelineViews",
                column: "PipelineId");

            migrationBuilder.CreateIndex(
                name: "IX_TemplatePipelineViews_PublishedVersionId",
                schema: "pipeline",
                table: "TemplatePipelineViews",
                column: "PublishedVersionId");

            migrationBuilder.CreateIndex(
                name: "IX_TemplateQuotas_TemplateViewId_MachineKey_PeriodKey",
                schema: "pipeline",
                table: "TemplateQuotas",
                columns: new[] { "TemplateViewId", "MachineKey", "PeriodKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConstantProfiles",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineScriptArtifacts",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "ProjectPipelineViews",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "TemplateQuotas",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "TemplatePipelineViews",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineVersions",
                schema: "pipeline");
        }
    }
}
