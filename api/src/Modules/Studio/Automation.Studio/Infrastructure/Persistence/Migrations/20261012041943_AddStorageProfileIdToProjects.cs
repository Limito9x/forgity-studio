using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStorageProfileIdToProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StorageProfileId",
                schema: "studio",
                table: "Projects",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Projects_StorageProfileId",
                schema: "studio",
                table: "Projects",
                column: "StorageProfileId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Projects_StorageProfileId",
                schema: "studio",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "StorageProfileId",
                schema: "studio",
                table: "Projects");
        }
    }
}
