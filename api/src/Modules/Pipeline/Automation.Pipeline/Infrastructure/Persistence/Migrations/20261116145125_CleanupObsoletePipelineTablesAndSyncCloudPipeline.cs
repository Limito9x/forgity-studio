using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CleanupObsoletePipelineTablesAndSyncCloudPipeline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Pipelines_PipelineSnapshots_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropTable(
                name: "NodeDefinitions",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineExecutions",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineSnapshots",
                schema: "pipeline");

            migrationBuilder.DropIndex(
                name: "IX_Pipelines_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropIndex(
                name: "IX_Pipelines_ProjectId_Name",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "GraphData",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "GraphHash",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "TriggerConfig",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "TriggerType",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.RenameColumn(
                name: "DeletedBy",
                schema: "pipeline",
                table: "Pipelines",
                newName: "Description");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                schema: "pipeline",
                table: "Pipelines",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(255)",
                oldMaxLength: 255);

            migrationBuilder.AddColumn<string>(
                name: "PipelineKind",
                schema: "pipeline",
                table: "Pipelines",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                schema: "pipeline",
                table: "Pipelines",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PipelineKind",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "Slug",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.RenameColumn(
                name: "Description",
                schema: "pipeline",
                table: "Pipelines",
                newName: "DeletedBy");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                schema: "pipeline",
                table: "Pipelines",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<Guid>(
                name: "ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                schema: "pipeline",
                table: "Pipelines",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GraphData",
                schema: "pipeline",
                table: "Pipelines",
                type: "jsonb",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GraphHash",
                schema: "pipeline",
                table: "Pipelines",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<JsonDocument>(
                name: "TriggerConfig",
                schema: "pipeline",
                table: "Pipelines",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TriggerType",
                schema: "pipeline",
                table: "Pipelines",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "NodeDefinitions",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentHash = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    Dependencies = table.Column<string>(type: "jsonb", nullable: false),
                    Executor = table.Column<string>(type: "text", nullable: false),
                    Inputs = table.Column<string>(type: "jsonb", nullable: false),
                    Key = table.Column<string>(type: "text", nullable: false),
                    Label = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Outputs = table.Column<string>(type: "jsonb", nullable: false),
                    OverrideTargetRefId = table.Column<string>(type: "text", nullable: true),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SemanticVersion = table.Column<string>(type: "text", nullable: false),
                    SourceRepositoryPath = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NodeDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PipelineSnapshots",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    GraphData = table.Column<string>(type: "jsonb", nullable: false),
                    GraphHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Summary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineSnapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineSnapshots_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PipelineExecutions",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentExecutionId = table.Column<Guid>(type: "uuid", nullable: true),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    SnapshotId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    CurrentBatchId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    ExecutionState = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    NextNodeIndex = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TriggeredByNodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineExecutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineExecutions_PipelineExecutions_ParentExecutionId",
                        column: x => x.ParentExecutionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineExecutions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PipelineExecutions_PipelineSnapshots_SnapshotId",
                        column: x => x.SnapshotId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineSnapshots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PipelineExecutions_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Pipelines_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines",
                column: "ActiveSnapshotId");

            migrationBuilder.CreateIndex(
                name: "IX_Pipelines_ProjectId_Name",
                schema: "pipeline",
                table: "Pipelines",
                columns: new[] { "ProjectId", "Name" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_NodeDefinitions_Executor_Name_ProjectId",
                schema: "pipeline",
                table: "NodeDefinitions",
                columns: new[] { "Executor", "Name", "ProjectId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineExecutions_ParentExecutionId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "ParentExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineExecutions_PipelineId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "PipelineId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineExecutions_SnapshotId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "SnapshotId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineSnapshots_PipelineId_CreatedAt",
                schema: "pipeline",
                table: "PipelineSnapshots",
                columns: new[] { "PipelineId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PipelineSnapshots_PipelineId_VersionNumber",
                schema: "pipeline",
                table: "PipelineSnapshots",
                columns: new[] { "PipelineId", "VersionNumber" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Pipelines_PipelineSnapshots_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines",
                column: "ActiveSnapshotId",
                principalSchema: "pipeline",
                principalTable: "PipelineSnapshots",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
