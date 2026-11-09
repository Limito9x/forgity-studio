using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectMigrationLogsAndFilteredProjectSlugIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projects_StudioId_Slug",
                schema: "studio",
                table: "Projects");

            migrationBuilder.CreateTable(
                name: "ProjectMigrationLogs",
                schema: "studio",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudioId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserDisplayName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    PackageFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PackageSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    PackageChecksumSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SelectedDomains = table.Column<string>(type: "jsonb", nullable: false),
                    DomainSummaries = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectMigrationLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectMigrationLogs_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "studio",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ProjectMigrationLogs_Studios_StudioId",
                        column: x => x.StudioId,
                        principalSchema: "studio",
                        principalTable: "Studios",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Projects_StudioId_Slug",
                schema: "studio",
                table: "Projects",
                columns: new[] { "StudioId", "Slug" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMigrationLogs_ProjectId_CreatedAt",
                schema: "studio",
                table: "ProjectMigrationLogs",
                columns: new[] { "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectMigrationLogs_StudioId",
                schema: "studio",
                table: "ProjectMigrationLogs",
                column: "StudioId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectMigrationLogs",
                schema: "studio");

            migrationBuilder.DropIndex(
                name: "IX_Projects_StudioId_Slug",
                schema: "studio",
                table: "Projects");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_StudioId_Slug",
                schema: "studio",
                table: "Projects",
                columns: new[] { "StudioId", "Slug" },
                unique: true);
        }
    }
}
