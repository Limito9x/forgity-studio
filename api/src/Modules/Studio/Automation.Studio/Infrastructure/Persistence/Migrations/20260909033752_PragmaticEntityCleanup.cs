using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PragmaticEntityCleanup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDeleted",
                schema: "projects",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "projects",
                table: "ProjectMembers");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "projects",
                table: "ProjectMembers");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                schema: "projects",
                table: "ProjectMembers");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "projects",
                table: "ProjectExecutorConfigs");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "projects",
                table: "ProjectExecutorConfigs");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                schema: "projects",
                table: "ProjectExecutorConfigs");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                schema: "projects",
                table: "Projects",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                schema: "projects",
                table: "ProjectMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "projects",
                table: "ProjectMembers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                schema: "projects",
                table: "ProjectMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                schema: "projects",
                table: "ProjectExecutorConfigs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "projects",
                table: "ProjectExecutorConfigs",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                schema: "projects",
                table: "ProjectExecutorConfigs",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
