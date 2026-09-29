using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddScriptManagementFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContentHash",
                schema: "pipeline",
                table: "NodeDefinitions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OverrideTargetRefId",
                schema: "pipeline",
                table: "NodeDefinitions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SemanticVersion",
                schema: "pipeline",
                table: "NodeDefinitions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SourceRepositoryPath",
                schema: "pipeline",
                table: "NodeDefinitions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                schema: "pipeline",
                table: "NodeDefinitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContentHash",
                schema: "pipeline",
                table: "NodeDefinitions");

            migrationBuilder.DropColumn(
                name: "OverrideTargetRefId",
                schema: "pipeline",
                table: "NodeDefinitions");

            migrationBuilder.DropColumn(
                name: "SemanticVersion",
                schema: "pipeline",
                table: "NodeDefinitions");

            migrationBuilder.DropColumn(
                name: "SourceRepositoryPath",
                schema: "pipeline",
                table: "NodeDefinitions");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "pipeline",
                table: "NodeDefinitions");
        }
    }
}
