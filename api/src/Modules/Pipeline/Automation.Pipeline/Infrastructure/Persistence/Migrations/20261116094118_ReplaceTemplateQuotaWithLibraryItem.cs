using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Pipeline.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReplaceTemplateQuotaWithLibraryItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TemplateQuotas",
                schema: "pipeline");

            migrationBuilder.CreateTable(
                name: "TemplateLibraryItems",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateViewId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MachineKey = table.Column<string>(type: "text", nullable: false),
                    ConstantProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    UsedRuns = table.Column<int>(type: "integer", nullable: false),
                    MaxRuns = table.Column<int>(type: "integer", nullable: true),
                    PeriodKey = table.Column<string>(type: "text", nullable: false),
                    AddedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplateLibraryItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemplateLibraryItems_ConstantProfiles_ConstantProfileId",
                        column: x => x.ConstantProfileId,
                        principalSchema: "pipeline",
                        principalTable: "ConstantProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TemplateLibraryItems_TemplatePipelineViews_TemplateViewId",
                        column: x => x.TemplateViewId,
                        principalSchema: "pipeline",
                        principalTable: "TemplatePipelineViews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_ConstantProfileId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "ConstantProfileId");

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_OwnerUserId_TemplateViewId_MachineKey_~",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                columns: new[] { "OwnerUserId", "TemplateViewId", "MachineKey", "PeriodKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemplateLibraryItems_TemplateViewId",
                schema: "pipeline",
                table: "TemplateLibraryItems",
                column: "TemplateViewId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TemplateLibraryItems",
                schema: "pipeline");

            migrationBuilder.CreateTable(
                name: "TemplateQuotas",
                schema: "pipeline",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateViewId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: true),
                    MachineKey = table.Column<string>(type: "text", nullable: false),
                    MaxRuns = table.Column<int>(type: "integer", nullable: false),
                    PeriodKey = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    UsedRuns = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplateQuotas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemplateQuotas_TemplatePipelineViews_TemplateViewId",
                        column: x => x.TemplateViewId,
                        principalSchema: "pipeline",
                        principalTable: "TemplatePipelineViews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemplateQuotas_TemplateViewId_MachineKey_PeriodKey",
                schema: "pipeline",
                table: "TemplateQuotas",
                columns: new[] { "TemplateViewId", "MachineKey", "PeriodKey" },
                unique: true);
        }
    }
}
