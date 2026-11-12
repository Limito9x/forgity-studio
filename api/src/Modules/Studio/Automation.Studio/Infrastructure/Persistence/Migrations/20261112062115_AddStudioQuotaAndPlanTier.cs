using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStudioQuotaAndPlanTier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ExecutionCreditsRemaining",
                schema: "studio",
                table: "Studios",
                type: "integer",
                nullable: false,
                defaultValue: 50);

            migrationBuilder.AddColumn<int>(
                name: "PlanTier",
                schema: "studio",
                table: "Studios",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<long>(
                name: "StudioManagedStorageQuotaBytes",
                schema: "studio",
                table: "Studios",
                type: "bigint",
                nullable: false,
                defaultValue: 209715200L);

            migrationBuilder.AddColumn<long>(
                name: "StudioManagedStorageUsedBytes",
                schema: "studio",
                table: "Studios",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExecutionCreditsRemaining",
                schema: "studio",
                table: "Studios");

            migrationBuilder.DropColumn(
                name: "PlanTier",
                schema: "studio",
                table: "Studios");

            migrationBuilder.DropColumn(
                name: "StudioManagedStorageQuotaBytes",
                schema: "studio",
                table: "Studios");

            migrationBuilder.DropColumn(
                name: "StudioManagedStorageUsedBytes",
                schema: "studio",
                table: "Studios");
        }
    }
}
