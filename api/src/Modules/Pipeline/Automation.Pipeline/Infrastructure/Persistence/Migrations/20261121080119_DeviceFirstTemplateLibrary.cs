using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DeviceFirstTemplateLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE pipeline.""TemplateLibraryItems"" DROP CONSTRAINT IF EXISTS ""FK_TemplateLibraryItems_ConstantProfiles_ConstantProfileId"";
                DROP TABLE IF EXISTS pipeline.""ConstantProfiles"";
                DROP INDEX IF EXISTS pipeline.""IX_TemplateLibraryItems_ConstantProfileId"";
                DROP INDEX IF EXISTS pipeline.""IX_TemplateLibraryItems_OwnerUserId_TemplatePackageId_MachineK~"";
                ALTER TABLE pipeline.""TemplateLibraryItems"" DROP COLUMN IF EXISTS ""ConstantProfileId"";
                ALTER TABLE pipeline.""ProjectPipelineViews"" DROP COLUMN IF EXISTS ""DefaultConstantProfileId"";

                DELETE FROM pipeline.""TemplateLibraryItems"" a
                USING pipeline.""TemplateLibraryItems"" b
                WHERE a.""Id"" <> b.""Id""
                  AND a.""MachineKey"" = b.""MachineKey""
                  AND a.""TemplatePackageId"" = b.""TemplatePackageId""
                  AND a.""PeriodKey"" = b.""PeriodKey""
                  AND (a.""UsedRuns"" < b.""UsedRuns"" OR (a.""UsedRuns"" = b.""UsedRuns"" AND a.""Id"" < b.""Id""));
            ");

            migrationBuilder.AlterColumn<Guid>(
                name: "OwnerUserId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_MachineKey_TemplatePackageId_PeriodKey",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                columns: new[] { "MachineKey", "TemplatePackageId", "PeriodKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TemplateLibraryItems_MachineKey_TemplatePackageId_PeriodKey",
                schema: "pipeline",
                table: "TemplateLibraryItems");

            migrationBuilder.AlterColumn<Guid>(
                name: "OwnerUserId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ConstantProfileId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DefaultConstantProfileId",
                schema: "pipeline",
                table: "ProjectPipelineViews",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConstantProfiles",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RunnerId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    ValuesJson = table.Column<JsonDocument>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConstantProfiles", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_ConstantProfileId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "ConstantProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_OwnerUserId_TemplatePackageId_MachineK~",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                columns: new[] { "OwnerUserId", "TemplatePackageId", "MachineKey", "PeriodKey" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TemplateLibraryItems_ConstantProfiles_ConstantProfileId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "ConstantProfileId",
                principalSchema: "pipeline",
                principalTable: "ConstantProfiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
