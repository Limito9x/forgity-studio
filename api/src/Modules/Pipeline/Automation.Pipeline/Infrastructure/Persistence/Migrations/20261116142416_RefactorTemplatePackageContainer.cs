using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RefactorTemplatePackageContainer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TemplateLibraryItems_TemplatePipelineViews_TemplateViewId",
                schema: "pipeline",
                table: "TemplateLibraryItems");

            migrationBuilder.DropTable(
                name: "TemplatePipelineViews",
                schema: "pipeline");

            migrationBuilder.RenameColumn(
                name: "TemplateViewId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                newName: "TemplatePackageId");

            migrationBuilder.RenameIndex(
                name: "IX_TemplateLibraryItems_TemplateViewId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                newName: "IX_TemplateLibraryItems_TemplatePackageId");

            migrationBuilder.RenameIndex(
                name: "IX_TemplateLibraryItems_OwnerUserId_TemplateViewId_MachineKey_~",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                newName: "IX_TemplateLibraryItems_OwnerUserId_TemplatePackageId_MachineK~");

            migrationBuilder.CreateTable(
                name: "TemplatePackages",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Category = table.Column<string>(type: "text", nullable: false),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    QuotaStrategy = table.Column<string>(type: "text", nullable: false),
                    DefaultQuotaLimit = table.Column<int>(type: "integer", nullable: true),
                    PrimaryMasterVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    ContainerManifestJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplatePackages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemplatePackages_PipelineVersions_PrimaryMasterVersionId",
                        column: x => x.PrimaryMasterVersionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemplatePackages_PrimaryMasterVersionId",
                schema: "pipeline",
                table: "TemplatePackages",
                column: "PrimaryMasterVersionId");

            migrationBuilder.AddForeignKey(
                name: "FK_TemplateLibraryItems_TemplatePackages_TemplatePackageId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "TemplatePackageId",
                principalSchema: "pipeline",
                principalTable: "TemplatePackages",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TemplateLibraryItems_TemplatePackages_TemplatePackageId",
                schema: "pipeline",
                table: "TemplateLibraryItems");

            migrationBuilder.DropTable(
                name: "TemplatePackages",
                schema: "pipeline");

            migrationBuilder.RenameColumn(
                name: "TemplatePackageId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                newName: "TemplateViewId");

            migrationBuilder.RenameIndex(
                name: "IX_TemplateLibraryItems_TemplatePackageId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                newName: "IX_TemplateLibraryItems_TemplateViewId");

            migrationBuilder.RenameIndex(
                name: "IX_TemplateLibraryItems_OwnerUserId_TemplatePackageId_MachineK~",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                newName: "IX_TemplateLibraryItems_OwnerUserId_TemplateViewId_MachineKey_~");

            migrationBuilder.CreateTable(
                name: "TemplatePipelineViews",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    PublishedVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    ContainerManifestJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    DefaultQuotaLimit = table.Column<int>(type: "integer", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    QuotaStrategy = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
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

            migrationBuilder.AddForeignKey(
                name: "FK_TemplateLibraryItems_TemplatePipelineViews_TemplateViewId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "TemplateViewId",
                principalSchema: "pipeline",
                principalTable: "TemplatePipelineViews",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
