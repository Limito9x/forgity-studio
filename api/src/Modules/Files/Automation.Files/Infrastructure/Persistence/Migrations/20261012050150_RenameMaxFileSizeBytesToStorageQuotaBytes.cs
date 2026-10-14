using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Files.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameMaxFileSizeBytesToStorageQuotaBytes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "MaxFileSizeBytes",
                schema: "files",
                table: "StorageProfiles",
                newName: "StorageQuotaBytes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "StorageQuotaBytes",
                schema: "files",
                table: "StorageProfiles",
                newName: "MaxFileSizeBytes");
        }
    }
}
