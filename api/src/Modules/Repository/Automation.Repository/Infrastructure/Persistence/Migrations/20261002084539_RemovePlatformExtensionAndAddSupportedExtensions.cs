using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemovePlatformExtensionAndAddSupportedExtensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ResourceItems_PlatformExtensionId",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.DropColumn(
                name: "PlatformExtensionId",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.AddColumn<string>(
                name: "Extension",
                schema: "repository",
                table: "ResourceItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SupportedExtensions",
                schema: "repository",
                table: "Repositories",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_Extension",
                schema: "repository",
                table: "ResourceItems",
                column: "Extension");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ResourceItems_Extension",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.DropColumn(
                name: "Extension",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.DropColumn(
                name: "SupportedExtensions",
                schema: "repository",
                table: "Repositories");

            migrationBuilder.AddColumn<Guid>(
                name: "PlatformExtensionId",
                schema: "repository",
                table: "ResourceItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_PlatformExtensionId",
                schema: "repository",
                table: "ResourceItems",
                column: "PlatformExtensionId");
        }
    }
}
