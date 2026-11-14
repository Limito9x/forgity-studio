using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Runner.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAppVersionToRunner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AppVersion",
                schema: "runner",
                table: "Runners",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AppVersion",
                schema: "runner",
                table: "Runners");
        }
    }
}
