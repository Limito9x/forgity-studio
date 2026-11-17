using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DropLegacyPipelineScriptArtifacts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                INSERT INTO pipeline."PipelineScripts"
                    ("Id", "Key", "Executor", "ScriptHash", "SourceCode", "RequirementsJson",
                     "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy")
                SELECT DISTINCT ON (artifact."ScriptKey", artifact."ScriptHash")
                       gen_random_uuid(), artifact."ScriptKey", artifact."Executor", artifact."ScriptHash",
                       artifact."SourceCode", artifact."RequirementsJson", artifact."CreatedAt",
                       artifact."CreatedBy", artifact."UpdatedAt", artifact."UpdatedBy"
                FROM pipeline."PipelineScriptArtifacts" AS artifact
                WHERE artifact."DeletedAt" IS NULL
                ORDER BY artifact."ScriptKey", artifact."ScriptHash", artifact."CreatedAt", artifact."Id"
                ON CONFLICT ("Key", "ScriptHash") DO NOTHING;

                INSERT INTO pipeline."PipelineVersionScripts" ("PipelineVersionId", "PipelineScriptId")
                SELECT DISTINCT artifact."PipelineVersionId", script."Id"
                FROM pipeline."PipelineScriptArtifacts" AS artifact
                INNER JOIN pipeline."PipelineScripts" AS script
                    ON script."Key" = artifact."ScriptKey"
                    AND script."ScriptHash" = artifact."ScriptHash"
                WHERE artifact."DeletedAt" IS NULL
                ON CONFLICT ("PipelineVersionId", "PipelineScriptId") DO NOTHING;
                """
            );

            migrationBuilder.DropTable(
                name: "PipelineScriptArtifacts",
                schema: "pipeline");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PipelineScriptArtifacts",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    Executor = table.Column<string>(type: "text", nullable: false),
                    RequirementsJson = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    ScriptHash = table.Column<string>(type: "text", nullable: false),
                    ScriptKey = table.Column<string>(type: "text", nullable: false),
                    SourceCode = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "IX_PipelineScriptArtifacts_PipelineVersionId",
                schema: "pipeline",
                table: "PipelineScriptArtifacts",
                column: "PipelineVersionId");

            migrationBuilder.Sql(
                """
                INSERT INTO pipeline."PipelineScriptArtifacts"
                    ("Id", "PipelineVersionId", "ScriptKey", "ScriptHash", "Executor", "SourceCode",
                     "RequirementsJson", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy",
                     "DeletedAt", "DeletedBy")
                SELECT gen_random_uuid(), link."PipelineVersionId", script."Key", script."ScriptHash",
                       script."Executor", script."SourceCode", script."RequirementsJson",
                       script."CreatedAt", script."CreatedBy", script."UpdatedAt", script."UpdatedBy",
                       NULL, NULL
                FROM pipeline."PipelineVersionScripts" AS link
                INNER JOIN pipeline."PipelineScripts" AS script
                    ON script."Id" = link."PipelineScriptId";
                """
            );
        }
    }
}
