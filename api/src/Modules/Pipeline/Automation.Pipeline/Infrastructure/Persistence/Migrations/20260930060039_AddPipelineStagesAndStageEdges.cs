using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPipelineStagesAndStageEdges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StageId",
                schema: "pipeline",
                table: "PipelineNodes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TriggeredByNodeId",
                schema: "pipeline",
                table: "PipelineExecutions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PipelineStages",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ExecutorKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TargetRunnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    Position_X = table.Column<float>(type: "real", nullable: false),
                    Position_Y = table.Column<float>(type: "real", nullable: false),
                    Size_Height = table.Column<float>(type: "real", nullable: false),
                    Size_Width = table.Column<float>(type: "real", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineStages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineStages_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PipelineStageEdges",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceStageId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetStageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineStageEdges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineStageEdges_PipelineStages_SourceStageId",
                        column: x => x.SourceStageId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineStages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PipelineStageEdges_PipelineStages_TargetStageId",
                        column: x => x.TargetStageId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineStages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PipelineStageEdges_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PipelineNodes_StageId",
                schema: "pipeline",
                table: "PipelineNodes",
                column: "StageId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineExecutions_ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "ParentExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineStageEdges_PipelineId",
                schema: "pipeline",
                table: "PipelineStageEdges",
                column: "PipelineId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineStageEdges_SourceStageId",
                schema: "pipeline",
                table: "PipelineStageEdges",
                column: "SourceStageId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineStageEdges_TargetStageId",
                schema: "pipeline",
                table: "PipelineStageEdges",
                column: "TargetStageId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineStages_PipelineId",
                schema: "pipeline",
                table: "PipelineStages",
                column: "PipelineId");

            migrationBuilder.AddForeignKey(
                name: "FK_PipelineExecutions_PipelineExecutions_ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "ParentExecutionId",
                principalSchema: "pipeline",
                principalTable: "PipelineExecutions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_PipelineNodes_PipelineStages_StageId",
                schema: "pipeline",
                table: "PipelineNodes",
                column: "StageId",
                principalSchema: "pipeline",
                principalTable: "PipelineStages",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PipelineExecutions_PipelineExecutions_ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.DropForeignKey(
                name: "FK_PipelineNodes_PipelineStages_StageId",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropTable(
                name: "PipelineStageEdges",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineStages",
                schema: "pipeline");

            migrationBuilder.DropIndex(
                name: "IX_PipelineNodes_StageId",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropIndex(
                name: "IX_PipelineExecutions_ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.DropColumn(
                name: "StageId",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropColumn(
                name: "ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.DropColumn(
                name: "TriggeredByNodeId",
                schema: "pipeline",
                table: "PipelineExecutions");
        }
    }
}
