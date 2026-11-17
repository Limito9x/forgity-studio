using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveStudioExecutionCredits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExecutionCreditsRemaining",
                schema: "studio",
                table: "Studios");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ExecutionCreditsRemaining",
                schema: "studio",
                table: "Studios",
                type: "integer",
                nullable: false,
                defaultValue: 50);
        }
    }
}
