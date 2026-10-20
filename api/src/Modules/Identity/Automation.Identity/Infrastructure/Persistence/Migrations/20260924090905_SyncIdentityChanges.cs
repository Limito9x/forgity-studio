using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Automation.Identity.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SyncIdentityChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // PostgreSQL does not support altering database collation on an existing database.
            // Extension 'unaccent' is already enabled.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
