using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialRepositorySchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "repository");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:CollationDefinition:case_insensitive", "und-u-ks-level2,und-u-ks-level2,icu,False")
                .Annotation("Npgsql:PostgresExtension:unaccent", ",,");

            migrationBuilder.CreateTable(
                name: "Repositories",
                schema: "repository",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Repositories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RepositoryRunners",
                schema: "repository",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RepositoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    RootPath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RepositoryRunners", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RepositoryRunners_Repositories_RepositoryId",
                        column: x => x.RepositoryId,
                        principalSchema: "repository",
                        principalTable: "Repositories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ResourceItems",
                schema: "repository",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RepositoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PlatformExtensionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RelativePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ContentId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResourceItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ResourceItems_Repositories_RepositoryId",
                        column: x => x.RepositoryId,
                        principalSchema: "repository",
                        principalTable: "Repositories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ResourceVersions",
                schema: "repository",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNo = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    FileHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Metadata = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResourceVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ResourceVersions_ResourceItems_ResourceId",
                        column: x => x.ResourceId,
                        principalSchema: "repository",
                        principalTable: "ResourceItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ResourceVersionLocations",
                schema: "repository",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ResourceVersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    RepositoryRunnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsOrigin = table.Column<bool>(type: "boolean", nullable: false),
                    DiscoveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResourceVersionLocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ResourceVersionLocations_RepositoryRunners_RepositoryRunner~",
                        column: x => x.RepositoryRunnerId,
                        principalSchema: "repository",
                        principalTable: "RepositoryRunners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ResourceVersionLocations_ResourceVersions_ResourceVersionId",
                        column: x => x.ResourceVersionId,
                        principalSchema: "repository",
                        principalTable: "ResourceVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RepositoryRunners_RepositoryId_RunnerId",
                schema: "repository",
                table: "RepositoryRunners",
                columns: new[] { "RepositoryId", "RunnerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_ContentId",
                schema: "repository",
                table: "ResourceItems",
                column: "ContentId");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_PlatformExtensionId",
                schema: "repository",
                table: "ResourceItems",
                column: "PlatformExtensionId");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_RepositoryId_DisplayName",
                schema: "repository",
                table: "ResourceItems",
                columns: new[] { "RepositoryId", "DisplayName" });

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_RepositoryId_RelativePath",
                schema: "repository",
                table: "ResourceItems",
                columns: new[] { "RepositoryId", "RelativePath" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ResourceVersionLocations_RepositoryRunnerId",
                schema: "repository",
                table: "ResourceVersionLocations",
                column: "RepositoryRunnerId");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceVersionLocations_ResourceVersionId_RepositoryRunner~",
                schema: "repository",
                table: "ResourceVersionLocations",
                columns: new[] { "ResourceVersionId", "RepositoryRunnerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ResourceVersions_ResourceId_FileHash",
                schema: "repository",
                table: "ResourceVersions",
                columns: new[] { "ResourceId", "FileHash" },
                unique: true,
                filter: "\"FileHash\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceVersions_ResourceId_VersionNo",
                schema: "repository",
                table: "ResourceVersions",
                columns: new[] { "ResourceId", "VersionNo" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ResourceVersionLocations",
                schema: "repository");

            migrationBuilder.DropTable(
                name: "RepositoryRunners",
                schema: "repository");

            migrationBuilder.DropTable(
                name: "ResourceVersions",
                schema: "repository");

            migrationBuilder.DropTable(
                name: "ResourceItems",
                schema: "repository");

            migrationBuilder.DropTable(
                name: "Repositories",
                schema: "repository");
        }
    }
}
