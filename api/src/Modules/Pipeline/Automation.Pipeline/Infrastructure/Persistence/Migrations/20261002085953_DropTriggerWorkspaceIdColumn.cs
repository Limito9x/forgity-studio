using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DropTriggerWorkspaceIdColumn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TriggerWorkspaceId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.AlterColumn<string>(
                name: "Kind",
                schema: "pipeline",
                table: "PipelineNodes",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TriggerWorkspaceId",
                schema: "pipeline",
                table: "Pipelines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Kind",
                schema: "pipeline",
                table: "PipelineNodes",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30);
        }
    }
}
