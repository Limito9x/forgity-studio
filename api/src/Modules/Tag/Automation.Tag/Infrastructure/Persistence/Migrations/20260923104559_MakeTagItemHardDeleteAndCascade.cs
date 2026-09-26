using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Tag.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MakeTagItemHardDeleteAndCascade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Clean up any soft-deleted tags before dropping columns
            migrationBuilder.Sql("DELETE FROM tag.\"TagItems\" WHERE \"DeletedAt\" IS NOT NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_TagItems_TagItems_ParentId",
                schema: "tag",
                table: "TagItems");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "tag",
                table: "TagItems");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "tag",
                table: "TagItems");

            migrationBuilder.AddForeignKey(
                name: "FK_TagItems_TagItems_ParentId",
                schema: "tag",
                table: "TagItems",
                column: "ParentId",
                principalSchema: "tag",
                principalTable: "TagItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TagItems_TagItems_ParentId",
                schema: "tag",
                table: "TagItems");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                schema: "tag",
                table: "TagItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "tag",
                table: "TagItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TagItems_TagItems_ParentId",
                schema: "tag",
                table: "TagItems",
                column: "ParentId",
                principalSchema: "tag",
                principalTable: "TagItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
