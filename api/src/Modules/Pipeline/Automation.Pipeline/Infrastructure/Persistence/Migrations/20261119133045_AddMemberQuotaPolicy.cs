using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberQuotaPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "QuotaCost",
                schema: "pipeline",
                table: "TemplatePackageMembers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "QuotaMode",
                schema: "pipeline",
                table: "TemplatePackageMembers",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "QuotaCost",
                schema: "pipeline",
                table: "TemplatePackageMembers");

            migrationBuilder.DropColumn(
                name: "QuotaMode",
                schema: "pipeline",
                table: "TemplatePackageMembers");
        }
    }
}
