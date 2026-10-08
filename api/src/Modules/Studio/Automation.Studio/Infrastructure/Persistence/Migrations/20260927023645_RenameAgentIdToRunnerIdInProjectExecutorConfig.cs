using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Studio.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RenameAgentIdToRunnerIdInProjectExecutorConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "AgentId",
                schema: "studio",
                table: "ProjectExecutorConfigs",
                newName: "RunnerId");

            migrationBuilder.RenameIndex(
                name: "IX_ProjectExecutorConfigs_ProjectId_AgentId_ExecutorKey",
                schema: "studio",
                table: "ProjectExecutorConfigs",
                newName: "IX_ProjectExecutorConfigs_ProjectId_RunnerId_ExecutorKey");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "RunnerId",
                schema: "studio",
                table: "ProjectExecutorConfigs",
                newName: "AgentId");

            migrationBuilder.RenameIndex(
                name: "IX_ProjectExecutorConfigs_ProjectId_RunnerId_ExecutorKey",
                schema: "studio",
                table: "ProjectExecutorConfigs",
                newName: "IX_ProjectExecutorConfigs_ProjectId_AgentId_ExecutorKey");
        }
    }
}
