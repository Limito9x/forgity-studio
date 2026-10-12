using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAssetLinkAndCloudSyncToResourceVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssetLinkId",
                schema: "repository",
                table: "ResourceVersions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsCloudSynced",
                schema: "repository",
                table: "ResourceVersions",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssetLinkId",
                schema: "repository",
                table: "ResourceVersions");

            migrationBuilder.DropColumn(
                name: "IsCloudSynced",
                schema: "repository",
                table: "ResourceVersions");
        }
    }
}
