using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Files.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStorageProfileIdToAssets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Assets_HashSha256",
                schema: "files",
                table: "Assets");

            migrationBuilder.DropIndex(
                name: "IX_Assets_StoragePath",
                schema: "files",
                table: "Assets");

            migrationBuilder.AddColumn<Guid>(
                name: "StorageProfileId",
                schema: "files",
                table: "Assets",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Assets_HashSha256_StorageProfileId",
                schema: "files",
                table: "Assets",
                columns: new[] { "HashSha256", "StorageProfileId" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "IX_Assets_StoragePath_StorageProfileId",
                schema: "files",
                table: "Assets",
                columns: new[] { "StoragePath", "StorageProfileId" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Assets_HashSha256_StorageProfileId",
                schema: "files",
                table: "Assets");

            migrationBuilder.DropIndex(
                name: "IX_Assets_StoragePath_StorageProfileId",
                schema: "files",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "StorageProfileId",
                schema: "files",
                table: "Assets");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_HashSha256",
                schema: "files",
                table: "Assets",
                column: "HashSha256",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Assets_StoragePath",
                schema: "files",
                table: "Assets",
                column: "StoragePath",
                unique: true);
        }
    }
}
