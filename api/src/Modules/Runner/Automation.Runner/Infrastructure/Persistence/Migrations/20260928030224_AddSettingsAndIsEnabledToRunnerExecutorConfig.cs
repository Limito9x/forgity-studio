using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Runner.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSettingsAndIsEnabledToRunnerExecutorConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsEnabled",
                schema: "runner",
                table: "RunnerExecutorConfigs",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<JsonDocument>(
                name: "Settings",
                schema: "runner",
                table: "RunnerExecutorConfigs",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsEnabled",
                schema: "runner",
                table: "RunnerExecutorConfigs");

            migrationBuilder.DropColumn(
                name: "Settings",
                schema: "runner",
                table: "RunnerExecutorConfigs");
        }
    }
}
