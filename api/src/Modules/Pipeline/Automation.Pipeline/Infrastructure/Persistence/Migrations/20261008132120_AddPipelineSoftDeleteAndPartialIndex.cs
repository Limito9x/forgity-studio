using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPipelineSoftDeleteAndPartialIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PipelineExecutions_Pipelines_PipelineId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.Sql("DROP INDEX IF EXISTS pipeline.\"IX_Pipelines_ProjectId_Name\";");

            migrationBuilder.CreateIndex(
                name: "IX_Pipelines_ProjectId_Name",
                schema: "pipeline",
                table: "Pipelines",
                columns: new[] { "ProjectId", "Name" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_PipelineExecutions_Pipelines_PipelineId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "PipelineId",
                principalSchema: "pipeline",
                principalTable: "Pipelines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PipelineExecutions_Pipelines_PipelineId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.Sql("DROP INDEX IF EXISTS pipeline.\"IX_Pipelines_ProjectId_Name\";");

            migrationBuilder.CreateIndex(
                name: "IX_Pipelines_ProjectId_Name",
                schema: "pipeline",
                table: "Pipelines",
                columns: new[] { "ProjectId", "Name" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.AddForeignKey(
                name: "FK_PipelineExecutions_Pipelines_PipelineId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "PipelineId",
                principalSchema: "pipeline",
                principalTable: "Pipelines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
