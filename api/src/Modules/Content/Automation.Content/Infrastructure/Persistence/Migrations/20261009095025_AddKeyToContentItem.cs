using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Content.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddKeyToContentItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Key",
                schema: "content",
                table: "ContentItems",
                type: "character varying(150)",
                maxLength: 150,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(@"
                UPDATE content.""ContentItems""
                SET ""Key"" = LOWER(REGEXP_REPLACE(""Name"", '[^a-zA-Z0-9]+', '-', 'g'))
                WHERE ""Key"" = '' OR ""Key"" IS NULL;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_ContentItems_ProjectId_ContentTypeId_Key",
                schema: "content",
                table: "ContentItems",
                columns: new[] { "ProjectId", "ContentTypeId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ContentItems_ProjectId_ContentTypeId_Key",
                schema: "content",
                table: "ContentItems");

            migrationBuilder.DropColumn(
                name: "Key",
                schema: "content",
                table: "ContentItems");
        }
    }
}
