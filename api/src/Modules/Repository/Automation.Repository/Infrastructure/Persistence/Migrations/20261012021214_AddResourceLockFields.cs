using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Repository.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddResourceLockFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LockedAt",
                schema: "repository",
                table: "ResourceItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LockedByRunnerId",
                schema: "repository",
                table: "ResourceItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LockedByUserId",
                schema: "repository",
                table: "ResourceItems",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LockedAt",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.DropColumn(
                name: "LockedByRunnerId",
                schema: "repository",
                table: "ResourceItems");

            migrationBuilder.DropColumn(
                name: "LockedByUserId",
                schema: "repository",
                table: "ResourceItems");
        }
    }
}
