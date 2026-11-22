START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pipeline."__EFMigrationsHistory" WHERE "MigrationId" = '20261122100744_AddQuotaTrackingFieldsToTemplateLibraryItem') THEN
    ALTER TABLE pipeline."TemplateLibraryItems" ADD "IsRevoked" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pipeline."__EFMigrationsHistory" WHERE "MigrationId" = '20261122100744_AddQuotaTrackingFieldsToTemplateLibraryItem') THEN
    ALTER TABLE pipeline."TemplateLibraryItems" ADD "LastRunAt" timestamp with time zone;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pipeline."__EFMigrationsHistory" WHERE "MigrationId" = '20261122100744_AddQuotaTrackingFieldsToTemplateLibraryItem') THEN
    ALTER TABLE pipeline."TemplateLibraryItems" ADD "OwnerEmail" text;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pipeline."__EFMigrationsHistory" WHERE "MigrationId" = '20261122100744_AddQuotaTrackingFieldsToTemplateLibraryItem') THEN
    CREATE INDEX "IX_TemplateLibraryItems_OwnerUserId" ON pipeline."TemplateLibraryItems" ("OwnerUserId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pipeline."__EFMigrationsHistory" WHERE "MigrationId" = '20261122100744_AddQuotaTrackingFieldsToTemplateLibraryItem') THEN
    INSERT INTO pipeline."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261122100744_AddQuotaTrackingFieldsToTemplateLibraryItem', '10.0.10');
    END IF;
END $EF$;

-- Backfill OwnerEmail from identity."Users" for existing installations with OwnerUserId
DO $$
BEGIN
    IF to_regclass('identity."Users"') IS NOT NULL THEN
        UPDATE pipeline."TemplateLibraryItems" t
        SET "OwnerEmail" = u."Email"
        FROM identity."Users" u
        WHERE t."OwnerUserId" = u."Id"
          AND (t."OwnerEmail" IS NULL OR t."OwnerEmail" = '');
    END IF;
END $$;

COMMIT;
