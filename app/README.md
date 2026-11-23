# Forgity Studio — Desktop & Web UI (`app/`)

Tauri v2 + React 19 + TypeScript application providing the visual DAG Pipeline Canvas (`@xyflow/react`), local workspace management, and Admin Template/Quota management.

## Tech Stack

- **Desktop Shell**: Tauri v2 (`app/src-tauri/`) with bundled `forgity-runner` sidecar and `script-analyzer` resources
- **Frontend**: React 19, Vite, Tailwind CSS, React Aria / Shadcn UI, TanStack Router & TanStack Query
- **API Client**: Orval-generated TypeScript hooks & Zod schemas in `src/gen/` (do not edit manually)

## Common Commands

```bash
# Install dependencies
pnpm install

# Run Web UI in dev mode
pnpm dev

# Run Desktop App (Tauri + Vite)
pnpm tauri dev

# Build Desktop Installer (NSIS .exe / MSI)
pnpm tauri build

# Regenerate Orval API client (requires API running at http://localhost:5189)
pnpm gen:api

# Typecheck
pnpm tsc --noEmit
```
