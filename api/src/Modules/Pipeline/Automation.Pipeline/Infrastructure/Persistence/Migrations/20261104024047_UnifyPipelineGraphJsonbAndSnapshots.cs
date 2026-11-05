using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UnifyPipelineGraphJsonbAndSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Đổi tên cột Parameters -> GraphData và thêm các cột mới
            migrationBuilder.RenameColumn(
                name: "Parameters",
                schema: "pipeline",
                table: "Pipelines",
                newName: "GraphData");

            migrationBuilder.AddColumn<Guid>(
                name: "ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GraphHash",
                schema: "pipeline",
                table: "Pipelines",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SnapshotId",
                schema: "pipeline",
                table: "PipelineExecutions",
                type: "uuid",
                nullable: true);

            // 2. Tạo bảng PipelineSnapshots
            migrationBuilder.CreateTable(
                name: "PipelineSnapshots",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    GraphData = table.Column<string>(type: "jsonb", nullable: false),
                    GraphHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Summary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "IX_Pipelines_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines",
                column: "ActiveSnapshotId");

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
                name: "FK_PipelineExecutions_PipelineSnapshots_SnapshotId",
                schema: "pipeline",
                table: "PipelineExecutions",
                column: "SnapshotId",
                principalSchema: "pipeline",
                principalTable: "PipelineSnapshots",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Pipelines_PipelineSnapshots_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines",
                column: "ActiveSnapshotId",
                principalSchema: "pipeline",
                principalTable: "PipelineSnapshots",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // 3. ZERO-DATA-LOSS INGESTION: Chuyển dữ liệu từ PipelineNodes & PipelineEdges cũ vào GraphData (jsonb)
            migrationBuilder.Sql("""
                -- Bước 3.1: Dựng JSONB GraphData đầy đủ cho từng Pipeline
                UPDATE pipeline."Pipelines" p
                SET "GraphData" = jsonb_build_object(
                    'parameters', CASE 
                        WHEN p."GraphData" IS NOT NULL AND jsonb_typeof(p."GraphData") = 'array' THEN p."GraphData"
                        ELSE '[]'::jsonb 
                    END,
                    'nodes', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', n."Id",
                                'pipelineId', n."PipelineId",
                                'refId', n."RefId",
                                'kind', n."Kind",
                                'positionX', n."Position_X",
                                'positionY', n."Position_Y",
                                'config', n."Config",
                                'parentId', n."ParentId",
                                'size', CASE 
                                    WHEN n."Size_Width" IS NOT NULL AND n."Size_Height" IS NOT NULL 
                                    THEN jsonb_build_object('width', n."Size_Width", 'height', n."Size_Height")
                                    ELSE NULL 
                                END,
                                'metadata', n."Metadata"
                            )
                        )
                        FROM pipeline."PipelineNodes" n
                        WHERE n."PipelineId" = p."Id"
                    ), '[]'::jsonb),
                    'edges', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', e."Id",
                                'pipelineId', e."PipelineId",
                                'sourceNodeId', e."SourcePipelineNodeId",
                                'sourcePin', e."SourcePin",
                                'targetNodeId', e."TargetPipelineNodeId",
                                'targetPin', e."TargetPin"
                            )
                        )
                        FROM pipeline."PipelineEdges" e
                        WHERE e."PipelineId" = p."Id"
                    ), '[]'::jsonb)
                );

                -- Bước 3.2: Tự động sinh PipelineSnapshot khởi tạo (v1) bất biến
                INSERT INTO pipeline."PipelineSnapshots" (
                    "Id", "PipelineId", "VersionNumber", "GraphData", "GraphHash", "Source", "Summary", "CreatedAt"
                )
                SELECT 
                    gen_random_uuid(),
                    p."Id",
                    1,
                    p."GraphData",
                    encode(sha256(p."GraphData"::text::bytea), 'hex'),
                    'SystemMigration',
                    'Initial snapshot generated during BL-039 JSONB migration',
                    NOW()
                FROM pipeline."Pipelines" p
                WHERE NOT EXISTS (
                    SELECT 1 FROM pipeline."PipelineSnapshots" s WHERE s."PipelineId" = p."Id"
                );

                -- Bước 3.3: Gán ActiveSnapshotId và GraphHash trên Pipelines
                UPDATE pipeline."Pipelines" p
                SET 
                    "ActiveSnapshotId" = s."Id",
                    "GraphHash" = s."GraphHash"
                FROM pipeline."PipelineSnapshots" s
                WHERE s."PipelineId" = p."Id" AND s."VersionNumber" = 1 AND p."ActiveSnapshotId" IS NULL;
            """);

            // 4. Drop các bảng con cũ sau khi toàn bộ dữ liệu đã được di chuyển an toàn 100%
            migrationBuilder.DropTable(
                name: "PipelineEdges",
                schema: "pipeline");

            migrationBuilder.DropTable(
                name: "PipelineNodes",
                schema: "pipeline");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PipelineExecutions_PipelineSnapshots_SnapshotId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.DropForeignKey(
                name: "FK_Pipelines_PipelineSnapshots_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropTable(
                name: "PipelineSnapshots",
                schema: "pipeline");

            migrationBuilder.DropIndex(
                name: "IX_Pipelines_ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropIndex(
                name: "IX_PipelineExecutions_SnapshotId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.DropColumn(
                name: "ActiveSnapshotId",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "GraphHash",
                schema: "pipeline",
                table: "Pipelines");

            migrationBuilder.DropColumn(
                name: "SnapshotId",
                schema: "pipeline",
                table: "PipelineExecutions");

            migrationBuilder.CreateTable(
                name: "PipelineNodes",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    Config = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    RefId = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    Position_X = table.Column<float>(type: "real", nullable: false),
                    Position_Y = table.Column<float>(type: "real", nullable: false),
                    Size_Height = table.Column<float>(type: "real", nullable: true),
                    Size_Width = table.Column<float>(type: "real", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineNodes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineNodes_PipelineNodes_ParentId",
                        column: x => x.ParentId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PipelineNodes_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PipelineEdges",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourcePipelineNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetPipelineNodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SourcePin = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TargetPin = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineEdges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineEdges_PipelineNodes_SourcePipelineNodeId",
                        column: x => x.SourcePipelineNodeId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PipelineEdges_PipelineNodes_TargetPipelineNodeId",
                        column: x => x.TargetPipelineNodeId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PipelineEdges_Pipelines_PipelineId",
                        column: x => x.PipelineId,
                        principalSchema: "pipeline",
                        principalTable: "Pipelines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PipelineEdges_PipelineId",
                schema: "pipeline",
                table: "PipelineEdges",
                column: "PipelineId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineEdges_SourcePipelineNodeId",
                schema: "pipeline",
                table: "PipelineEdges",
                column: "SourcePipelineNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineEdges_TargetPipelineNodeId",
                schema: "pipeline",
                table: "PipelineEdges",
                column: "TargetPipelineNodeId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineNodes_ParentId",
                schema: "pipeline",
                table: "PipelineNodes",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_PipelineNodes_PipelineId",
                schema: "pipeline",
                table: "PipelineNodes",
                column: "PipelineId");

            migrationBuilder.RenameColumn(
                name: "GraphData",
                schema: "pipeline",
                table: "Pipelines",
                newName: "Parameters");
        }
    }
}
