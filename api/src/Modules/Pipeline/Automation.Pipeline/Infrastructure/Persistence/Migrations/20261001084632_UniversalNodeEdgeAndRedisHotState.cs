using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UniversalNodeEdgeAndRedisHotState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PipelineNodes_PipelineStages_StageId",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropTable(
                name: "NodeExecutions",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineStageEdges",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineStages",
                schema: "pipeline");

            migrationBuilder.RenameColumn(
                name: "StageId",
                schema: "pipeline",
                table: "PipelineNodes",
                newName: "ParentId");

            migrationBuilder.RenameIndex(
                name: "IX_PipelineNodes_StageId",
                schema: "pipeline",
                table: "PipelineNodes",
                newName: "IX_PipelineNodes_ParentId");

            migrationBuilder.AddColumn<JsonDocument>(
                name: "Metadata",
                schema: "pipeline",
                table: "PipelineNodes",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "Size_Height",
                schema: "pipeline",
                table: "PipelineNodes",
                type: "real",
                nullable: true);

            migrationBuilder.AddColumn<float>(
                name: "Size_Width",
                schema: "pipeline",
                table: "PipelineNodes",
                type: "real",
                nullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_PipelineNodes_PipelineNodes_ParentId",
                schema: "pipeline",
                table: "PipelineNodes",
                column: "ParentId",
                principalSchema: "pipeline",
                principalTable: "PipelineNodes",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PipelineNodes_PipelineNodes_ParentId",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropColumn(
                name: "Metadata",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropColumn(
                name: "Size_Height",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.DropColumn(
                name: "Size_Width",
                schema: "pipeline",
                table: "PipelineNodes");

            migrationBuilder.RenameColumn(
                name: "ParentId",
                schema: "pipeline",
                table: "PipelineNodes",
                newName: "StageId");

            migrationBuilder.RenameIndex(
                name: "IX_PipelineNodes_ParentId",
                schema: "pipeline",
                table: "PipelineNodes",
                newName: "IX_PipelineNodes_StageId");

            migrationBuilder.CreateTable(
                name: "NodeExecutions",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineExecutionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Log = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Output = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    Progress = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NodeExecutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NodeExecutions_PipelineExecutions_PipelineExecutionId",
                        column: x => x.PipelineExecutionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineExecutions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_NodeExecutions_PipelineNodes_PipelineNodeId",
                        column: x => x.PipelineNodeId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PipelineStages",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    ExecutorKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    TargetRunnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    Position_X = table.Column<float>(type: "real", nullable: false),
                    Position_Y = table.Column<float>(type: "real", nullable: false),
                    Size_Height = table.Column<float>(type: "real", nullable: false),
                    Size_Width = table.Column<float>(type: "real", nullable: false)
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
                name: "IX_NodeExecutions_PipelineExecutionId",
                schema: "pipeline",
                table: "NodeExecutions",
                column: "PipelineExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_NodeExecutions_PipelineNodeId",
                schema: "pipeline",
                table: "NodeExecutions",
                column: "PipelineNodeId");

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
                name: "FK_PipelineNodes_PipelineStages_StageId",
                schema: "pipeline",
                table: "PipelineNodes",
                column: "StageId",
                principalSchema: "pipeline",
                principalTable: "PipelineStages",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
