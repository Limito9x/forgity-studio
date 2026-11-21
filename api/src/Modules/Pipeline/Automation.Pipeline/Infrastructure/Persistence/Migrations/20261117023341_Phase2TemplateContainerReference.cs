using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase2TemplateContainerReference : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                schema: "pipeline",
                table: "TemplatePackages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupersedesId",
                schema: "pipeline",
                table: "TemplatePackages",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "TotalAssetBytes",
                schema: "pipeline",
                table: "TemplatePackages",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<int>(
                name: "VersionNumber",
                schema: "pipeline",
                table: "TemplatePackages",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "TemplatePackageMembers",
                schema: "pipeline",
                columns: table => new
                {
                    TemplatePackageId = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplatePackageMembers", x => new { x.TemplatePackageId, x.PipelineVersionId });
                    table.ForeignKey(
                        name: "FK_TemplatePackageMembers_PipelineVersions_PipelineVersionId",
                        column: x => x.PipelineVersionId,
                        principalSchema: "pipeline",
                        principalTable: "PipelineVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TemplatePackageMembers_TemplatePackages_TemplatePackageId",
                        column: x => x.TemplatePackageId,
                        principalSchema: "pipeline",
                        principalTable: "TemplatePackages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemplatePackageMembers_PipelineVersionId",
                schema: "pipeline",
                table: "TemplatePackageMembers",
                column: "PipelineVersionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TemplatePackageMembers",
                schema: "pipeline");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                schema: "pipeline",
                table: "TemplatePackages");

            migrationBuilder.DropColumn(
                name: "SupersedesId",
                schema: "pipeline",
                table: "TemplatePackages");

            migrationBuilder.DropColumn(
                name: "TotalAssetBytes",
                schema: "pipeline",
                table: "TemplatePackages");

            migrationBuilder.DropColumn(
                name: "VersionNumber",
                schema: "pipeline",
                table: "TemplatePackages");
        }
    }
}
