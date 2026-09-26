using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Runner.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialRunnerSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "runner");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:CollationDefinition:case_insensitive", "und-u-ks-level2,und-u-ks-level2,icu,False")
                .Annotation("Npgsql:PostgresExtension:unaccent", ",,");

            migrationBuilder.CreateTable(
                name: "Runners",
                schema: "runner",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    MachineKey = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    RegistrationToken = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Runners", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RunnerExecutorConfigs",
                schema: "runner",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExecutorKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Version = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ExecutablePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunnerExecutorConfigs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RunnerExecutorConfigs_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalSchema: "runner",
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RunnerStudios",
                schema: "runner",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    StudioId = table.Column<Guid>(type: "uuid", nullable: false),
                    Alias = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    IsApproved = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RunnerStudios", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RunnerStudios_Runners_RunnerId",
                        column: x => x.RunnerId,
                        principalSchema: "runner",
                        principalTable: "Runners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RunnerExecutorConfigs_RunnerId_ExecutorKey",
                schema: "runner",
                table: "RunnerExecutorConfigs",
                columns: new[] { "RunnerId", "ExecutorKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RunnerStudios_RunnerId_StudioId",
                schema: "runner",
                table: "RunnerStudios",
                columns: new[] { "RunnerId", "StudioId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Runners_MachineKey",
                schema: "runner",
                table: "Runners",
                column: "MachineKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Runners_RegistrationToken",
                schema: "runner",
                table: "Runners",
                column: "RegistrationToken",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RunnerExecutorConfigs",
                schema: "runner");

            migrationBuilder.DropTable(
                name: "RunnerStudios",
                schema: "runner");

            migrationBuilder.DropTable(
                name: "Runners",
                schema: "runner");
        }
    }
}
