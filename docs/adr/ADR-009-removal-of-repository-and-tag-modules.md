# ADR-009: Removal of Repository (DAM/VCS) and Tag (`GameplayTags`) Modules

- **Status**: Accepted
- **Date**: 2026-11-14
- **Related**:
  - [ADR-007: Two-Tier Pipeline & Local SQLite Index](file:///d:/FullStack/Automation/docs/adr/ADR-007-two-tier-component-master-pipeline-and-local-sqlite-index.md)
  - [ADR-008: Runner-Only Local Execution Engine & Backend Runtime Removal](file:///d:/FullStack/Automation/docs/adr/ADR-008-runner-only-local-execution-engine-and-backend-runtime-removal.md)
  - [BL-055: Legacy Remnants Cleanup](file:///d:/FullStack/Automation/.agents/plans/2026-11-14-bl-055-legacy-remnants-cleanup-and-cloud-registry-trimming.md)

---

## 1. Context & Problem

In the earlier architecture, Forgity Studio modeled local workstation files through two central-database modules:

- **`Automation.Repository`**: Scanned local disk folders into database `Repository`, `Resource`, and `ResourceVersion` tables, coupled with `Workstation` (`Repository` + `Runner`) bindings, collaborative locks, and C# server tools (`QueryWorkstationResources`, `FilterResources`, `ResolveResources`, `SyncLocalChangeToRepository`, `AssignResourcesToContent`).
- **`Automation.Tag`**: Managed hierarchical `GameplayTags` and `TagLinks` per file/sub-path so users could manually tag resources and feed them into downstream pipeline stages.

Over time, this model created major friction with Forgity's core **Local-First & Automation** direction:

1. **Manual Overhead**: Requiring users to scan folders, maintain DB metadata, and manually tag files before or between pipeline stages worked against true end-to-end automation.
2. **Wrong Abstraction Boundary**: Acting as a lightweight DAM/VCS in PostgreSQL meant competing unnecessarily with local filesystems, Git, and Perforce while adding heavy cross-module coupling (`Automation.Pipeline`, `Automation.Studio`, `Automation.Runner`, `web/`).
3. **Obsolete After ADR-007 / ADR-008**: With single-machine 2-tier execution in Rust Runner, stages pass data directly via **In-Memory Blackboard**, **Local Structs**, and **Local File Paths**, without needing a central DB resource catalog as an intermediary.

---

## 2. Decision

1. **Remove `Repository` and `Tag` Modules Completely**:
   - Delete `Automation.Repository`, `Automation.Repository.Contracts`, `Automation.Tag`, and `Automation.Tag.Contracts` from `api/`.
   - Remove `RepositoryMigrationProvider`, `RepositoryStructDefinition`, `ResourceStructDefinition`, `WorkstationStructDefinition`, and repository-coupled tools (`AssignResourcesToContentTool`, `SyncLocalChangeToRepositoryTool`).
   - Delete corresponding frontend feature folders, routes (`/repositories*`, `/resources*`), pickers, and runner repository tabs in `web/`.

2. **Decouple `Automation.Content`**:
   - Keep `Automation.Content` and `DynamicForms` for future refactoring into a standalone **Project Output / Artifact Catalog**, detached from `Repository` and `Tag`.

3. **Preserve Historical Reference on Archive Branch**:
   - The complete pre-cleanup implementation of `Repository`, `Tag`, and `Automation.Pipeline.Runtime` is preserved on Git branch **`archive/pre-local-first-cleanup`** (commit `95de420`).
   - Future engineers or agents needing to inspect legacy behavior, schemas, or UI flows should check `git show archive/pre-local-first-cleanup:<path>` rather than reintroducing these modules into `develop`.

---

## 3. Consequences

### Positive
- **Cleaner Solution & Faster Builds**: Eliminates 4 backend projects, cross-module couplings, and dozens of legacy UI components/routes.
- **True Local-First Dataflow**: Pipelines operate directly on local paths, `Struct`s, and `Blackboard` state without DB sync ceremony.

### Trade-offs
- **External DAM/VCS Integration**: Any future need to publish outputs to an external DAM, Perforce, or custom catalog will be implemented as **Post-Run Hooks / Plugins** rather than built-in `Repository`/`Tag` database tables.
