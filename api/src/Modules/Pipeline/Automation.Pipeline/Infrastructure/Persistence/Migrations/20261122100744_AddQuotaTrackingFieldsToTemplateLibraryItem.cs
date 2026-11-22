using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQuotaTrackingFieldsToTemplateLibraryItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRevoked",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastRunAt",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OwnerEmail",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_OwnerUserId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "OwnerUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TemplateLibraryItems_OwnerUserId",
                schema: "pipeline",
                table: "TemplateLibraryItems");

            migrationBuilder.DropColumn(
                name: "IsRevoked",
                schema: "pipeline",
                table: "TemplateLibraryItems");

            migrationBuilder.DropColumn(
                name: "LastRunAt",
                schema: "pipeline",
                table: "TemplateLibraryItems");

            migrationBuilder.DropColumn(
                name: "OwnerEmail",
                schema: "pipeline",
                table: "TemplateLibraryItems");
        }
    }
}
