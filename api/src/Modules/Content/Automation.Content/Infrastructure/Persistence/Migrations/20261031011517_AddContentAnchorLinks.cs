using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Content.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddContentAnchorLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContentAnchorLinks",
                schema: "content",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    AnchorPath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    TargetType = table.Column<int>(type: "integer", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    MetadataJson = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContentAnchorLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContentAnchorLinks_ContentItems_ContentItemId",
                        column: x => x.ContentItemId,
                        principalSchema: "content",
                        principalTable: "ContentItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContentAnchorLinks_ContentItemId_AnchorPath",
                schema: "content",
                table: "ContentAnchorLinks",
                columns: new[] { "ContentItemId", "AnchorPath" });

            migrationBuilder.CreateIndex(
                name: "IX_ContentAnchorLinks_ProjectId",
                schema: "content",
                table: "ContentAnchorLinks",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ContentAnchorLinks_TargetType_TargetId",
                schema: "content",
                table: "ContentAnchorLinks",
                columns: new[] { "TargetType", "TargetId" });

            // Two-Way Data Migration: Populate existing links from repository.ResourceItems
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_schema = 'repository' 
                          AND table_name = 'ResourceItems' 
                          AND column_name = 'ContentId'
                    ) THEN
                        INSERT INTO content.""ContentAnchorLinks"" 
                            (""Id"", ""ProjectId"", ""ContentItemId"", ""AnchorPath"", ""TargetType"", ""TargetId"", ""CreatedAt"", ""UpdatedAt"")
                        SELECT 
                            gen_random_uuid(),
                            rep.""ProjectId"",
                            r.""ContentId"",
                            'root/' || r.""DisplayName"",
                            0, -- TargetType: Resource
                            r.""Id"",
                            NOW(),
                            NOW()
                        FROM repository.""ResourceItems"" r
                        JOIN repository.""Repositories"" rep ON r.""RepositoryId"" = rep.""Id""
                        WHERE r.""ContentId"" IS NOT NULL
                          AND EXISTS (SELECT 1 FROM content.""ContentItems"" c WHERE c.""Id"" = r.""ContentId"");
                    END IF;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Two-Way Rollback: Restore ContentId into repository.ResourceItems from ContentAnchorLinks
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_schema = 'repository' 
                          AND table_name = 'ResourceItems' 
                          AND column_name = 'ContentId'
                    ) THEN
                        UPDATE repository.""ResourceItems"" r
                        SET ""ContentId"" = l.""ContentItemId""
                        FROM content.""ContentAnchorLinks"" l
                        WHERE l.""TargetId"" = r.""Id"" 
                          AND l.""TargetType"" = 0;
                    END IF;
                END $$;
            ");

            migrationBuilder.DropTable(
                name: "ContentAnchorLinks",
                schema: "content");
        }
    }
}
