using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveContentIdFromResourceItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ResourceItems_ContentId",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.DropColumn(
                name: "ContentId",
                schema: "repository",
                table: "ResourceItems");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ContentId",
                schema: "repository",
                table: "ResourceItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_ContentId",
                schema: "repository",
                table: "ResourceItems",
                column: "ContentId");

            migrationBuilder.Sql(@"
                UPDATE repository.""ResourceItems"" r
                SET ""ContentId"" = l.""ContentItemId""
                FROM content.""ContentAnchorLinks"" l
                WHERE l.""TargetId"" = r.""Id"" AND l.""TargetType"" = 0;
            ");
        }
    }
}
