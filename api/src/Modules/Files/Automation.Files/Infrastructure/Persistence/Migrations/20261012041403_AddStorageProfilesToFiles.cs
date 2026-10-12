using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Files.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddStorageProfilesToFiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StorageProfiles",
                schema: "files",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StudioId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ProviderType = table.Column<int>(type: "integer", nullable: false),
                    BucketName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ServiceUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Region = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AccessKey = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SecretKey = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PublicBaseUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    MaxFileSizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorageProfiles", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Assets_StorageProfileId",
                schema: "files",
                table: "Assets",
                column: "StorageProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_StorageProfiles_StudioId",
                schema: "files",
                table: "StorageProfiles",
                column: "StudioId");

            migrationBuilder.CreateIndex(
                name: "IX_StorageProfiles_StudioId_IsDefault",
                schema: "files",
                table: "StorageProfiles",
                columns: new[] { "StudioId", "IsDefault" });

            migrationBuilder.AddForeignKey(
                name: "FK_Assets_StorageProfiles_StorageProfileId",
                schema: "files",
                table: "Assets",
                column: "StorageProfileId",
                principalSchema: "files",
                principalTable: "StorageProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Assets_StorageProfiles_StorageProfileId",
                schema: "files",
                table: "Assets");

            migrationBuilder.DropTable(
                name: "StorageProfiles",
                schema: "files");

            migrationBuilder.DropIndex(
                name: "IX_Assets_StorageProfileId",
                schema: "files",
                table: "Assets");
        }
    }
}
