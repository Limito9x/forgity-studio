using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Runner.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddHardwareFingerprintAndEncryptedRabbitMqPasswordToRunner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HardwareFingerprint",
                schema: "runner",
                table: "Runners",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RabbitMqEncryptedPassword",
                schema: "runner",
                table: "Runners",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HardwareFingerprint",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "RabbitMqEncryptedPassword",
                schema: "runner",
                table: "Runners");
        }
    }
}
