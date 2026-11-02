using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddIncludedSubPathsAndMaxScanFilesToRepository : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IncludedSubPaths",
                schema: "repository",
                table: "Repositories",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<int>(
                name: "MaxScanFiles",
                schema: "repository",
                table: "Repositories",
                type: "integer",
                nullable: false,
                defaultValue: 2000);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IncludedSubPaths",
                schema: "repository",
                table: "Repositories");

            migrationBuilder.DropColumn(
                name: "MaxScanFiles",
                schema: "repository",
                table: "Repositories");
        }
    }
}
