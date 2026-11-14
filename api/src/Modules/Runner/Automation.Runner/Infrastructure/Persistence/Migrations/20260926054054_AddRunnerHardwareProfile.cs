using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Runner.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRunnerHardwareProfile : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CpuModel",
                schema: "runner",
                table: "Runners",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "HardwareDetails",
                schema: "runner",
                table: "Runners",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastHardwareScannedAt",
                schema: "runner",
                table: "Runners",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OsPlatform",
                schema: "runner",
                table: "Runners",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PrimaryGpuName",
                schema: "runner",
                table: "Runners",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "PrimaryGpuVramBytes",
                schema: "runner",
                table: "Runners",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "TotalRamBytes",
                schema: "runner",
                table: "Runners",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CpuModel",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "HardwareDetails",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "LastHardwareScannedAt",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "OsPlatform",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "PrimaryGpuName",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "PrimaryGpuVramBytes",
                schema: "runner",
                table: "Runners");

            migrationBuilder.DropColumn(
                name: "TotalRamBytes",
                schema: "runner",
                table: "Runners");
        }
    }
}
