using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddTemplateContainerManifestAndPipelineKind : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<JsonDocument>(
                name: "ContainerManifestJson",
                schema: "pipeline",
                table: "TemplatePipelineViews",
                type: "jsonb",
                nullable: false);

            migrationBuilder.AddColumn<string>(
                name: "PipelineKind",
                schema: "pipeline",
                table: "PipelineVersions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                schema: "pipeline",
                table: "PipelineVersions",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContainerManifestJson",
                schema: "pipeline",
                table: "TemplatePipelineViews");

            migrationBuilder.DropColumn(
                name: "PipelineKind",
                schema: "pipeline",
                table: "PipelineVersions");

            migrationBuilder.DropColumn(
                name: "Slug",
                schema: "pipeline",
                table: "PipelineVersions");
        }
    }
}
