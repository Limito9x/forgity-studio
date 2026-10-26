using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddResourceItemSoftDeletePartialIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ResourceItems_RepositoryId_RelativePath",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_RepositoryId_RelativePath",
                schema: "repository",
                table: "ResourceItems",
                columns: new[] { "RepositoryId", "RelativePath" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ResourceItems_RepositoryId_RelativePath",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.CreateIndex(
                name: "IX_ResourceItems_RepositoryId_RelativePath",
                schema: "repository",
                table: "ResourceItems",
                columns: new[] { "RepositoryId", "RelativePath" },
                unique: true);
        }
    }
}
