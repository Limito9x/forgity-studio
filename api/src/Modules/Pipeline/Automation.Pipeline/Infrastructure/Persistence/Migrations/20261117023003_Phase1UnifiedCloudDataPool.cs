using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase1UnifiedCloudDataPool : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "ProjectId",
                schema: "pipeline",
                table: "Pipelines",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "ContractsHash",
                schema: "pipeline",
                table: "PipelineVersions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "PipelineScripts",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "text", nullable: false),
                    Executor = table.Column<string>(type: "text", nullable: false),
                    ScriptHash = table.Column<string>(type: "text", nullable: false),
                    SourceCode = table.Column<string>(type: "text", nullable: false),
                    RequirementsJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineScripts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PipelineVersionScripts",
                schema: "pipeline",
                columns: table => new
                {
                    PipelineVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineScriptId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineVersionScripts", x => new { x.PipelineVersionId, x.PipelineScriptId });
                    table.ForeignKey(
                        name: "FK_PipelineVersionScripts_PipelineScripts_PipelineScriptId",
                        column: x => x.PipelineScriptId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineScripts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PipelineVersionScripts_PipelineVersions_PipelineVersionId",
                        column: x => x.PipelineVersionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Pipelines_Slug",
                schema: "pipeline",
                table: "Pipelines",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PipelineScripts_Key_ScriptHash",
                schema: "pipeline",
                table: "PipelineScripts",
                columns: new[] { "Key", "ScriptHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PipelineVersionScripts_PipelineScriptId",
                schema: "pipeline",
                table: "PipelineVersionScripts",
                column: "PipelineScriptId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PipelineVersionScripts",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineScripts",
                schema: "pipeline");

            migrationBuilder.DropIndex(
                name: "IX_Pipelines_Slug",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "ContractsHash",
                schema: "pipeline",
                table: "PipelineVersions");

            migrationBuilder.AlterColumn<Guid>(
                name: "ProjectId",
                schema: "pipeline",
                table: "Pipelines",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
