using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSlugToProject : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projects_StudioId",
                schema: "studio",
                table: "Projects");

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                schema: "studio",
                table: "Projects",
                type: "character varying(150)",
                maxLength: 150,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(@"
                UPDATE ""studio"".""Projects""
                SET ""Slug"" = lower(regexp_replace(trim(""Name""), '[^a-zA-Z0-9]+', '-', 'g'))
                WHERE ""Slug"" = '' OR ""Slug"" IS NULL;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_StudioId_Slug",
                schema: "studio",
                table: "Projects",
                columns: new[] { "StudioId", "Slug" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projects_StudioId_Slug",
                schema: "studio",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "Slug",
                schema: "studio",
                table: "Projects");

            migrationBuilder.CreateIndex(
                name: "IX_Projects_StudioId",
                schema: "studio",
                table: "Projects",
                column: "StudioId");
        }
    }
}
