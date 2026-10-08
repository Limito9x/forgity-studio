using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveProjectExecutorConfigs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectExecutorConfigs",
                schema: "studio");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectExecutorConfigs",
                schema: "studio",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    ExecutorKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RunnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Settings = table.Column<JsonDocument>(type: "jsonb", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectExecutorConfigs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectExecutorConfigs_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "studio",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectExecutorConfigs_ProjectId_RunnerId_ExecutorKey",
                schema: "studio",
                table: "ProjectExecutorConfigs",
                columns: new[] { "ProjectId", "RunnerId", "ExecutorKey" },
                unique: true);
        }
    }
}
