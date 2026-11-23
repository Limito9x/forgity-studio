<div align="center">

# ⚡ Forgity Studio

### _Local-First Two-Tier Workflow Orchestration & DCC Pipeline Platform_

[![Rust](https://img.shields.io/badge/Rust-Runner-000000?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-FFC131?style=for-the-badge&logo=tauri&logoColor=black)](https://v2.tauri.app/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-blue.svg?style=for-the-badge)](LICENSE)

<p align="center">
  A local-first, node-based workflow automation studio and native Rust execution engine built to orchestrate Blender, Unreal Engine, Daz, and Python toolchains with zero cloud lock-in.
</p>

[Key Features](#-key-features) •
[Architecture](#-architecture) •
[Monorepo Layout](#-monorepo-layout) •
[Quick Start](#-quick-start) •
[License](#-license)

</div>

---

## 🚀 What is Forgity Studio?

Managing digital content creation (DCC) pipelines across Blender, Unreal Engine, Daz Studio, and custom Python scripts is notoriously fragile. Studios often rely on disconnected scripts, ad-hoc CLI triggers, and brittle file handoffs.

**Forgity Studio** solves this with a **Local-First, Two-Tier DAG Architecture**:

1. **Desktop & Visual Canvas (`app/`)**: A Tauri v2 + React 19 application featuring a Palette-driven node graph editor (`React Flow`), local workspace SQLite registry (`.forgity/workspace.db`), workspace Constants/Structs, and live execution tracking.
2. **Shared Rust Core (`crates/forgity-core/`)**: Shared workspace database, Python AST analyzer bridge, DAG bundling, and template manifest logic used by both `app/src-tauri` and `runner/`.
3. **Native Rust Runner (`runner/`)**: A standalone Rust execution engine (`forgity-runner`) invoked as a Tauri sidecar (`run-bundle` / `worker`), streaming structured JSON-lines progress over `stdout` and executing DCC stages in isolated OS processes with Windows Job Object containment.
4. **Cloud Template & Quota API (`api/`)**: A .NET 10 Modular Monolith (FastEndpoints, Wolverine, EF Core, PostgreSQL) providing Cloud Template Catalog, Device-First Workstation Check-in (`/api/runners/check-in`), Library Forking, and User/Machine Quota Management. _(Note: Per ADR-011, legacy Studio Cloud multi-tenancy, RabbitMQ, and remote gRPC daemon modes are sunset.)_

---

## 🏛️ Architecture

### Two-Tier Pipeline Model

- **Component Pipes (`*.component.yaml`)**: Reusable, single-domain sub-workflows (e.g., `daz_to_blender`) composed of typed Python/DCC nodes, Pure nodes (`Constant`, `MakeStruct`, `BreakStruct`), and `Start`/`Return` contracts.
- **Master Pipelines (`*.pipeline.yaml`)**: Top-level orchestrators that sequence Component Pipes and Pure `Joint` nodes across heterogeneous DCC tools.

### Unified DCC Stage Execution

Instead of spawning a fresh Blender or Unreal process for every single node, `forgity-runner` packs connected steps targeting the same DCC host (along with inline Pure nodes) into a single `StageTaskMessage` and executes them sequentially inside **one** persistent DCC process via `stage_runner_guest.py`, eliminating startup overhead and keeping scene state in memory.

### Palette-Driven Canvas & SQLite Workspace State

- Nodes on the canvas are **hydrated by `refId` from the live Palette** (Single Source of Truth). All workspace state — Palette, Constants, Structs, Dependencies, execution metrics, and Canvas snapshots (`local_pipelines.snapshot_json`) — is persisted in **SQLite WAL (`.forgity/workspace.db`)**, while portable definitions live in `*.component.yaml` and `*.pipeline.yaml`.
- Updating a script, Struct, or Constant automatically reconciles affected nodes and prunes broken wires.

---

## 📁 Monorepo Layout

```text
forgity-studio/
├── app/                         # Tauri v2 Desktop & React 19 Frontend (Vite, Tailwind, React Flow)
│   ├── src/                     # Feature slices (pipelines, system, auth) & Orval client
│   └── src-tauri/               # Rust Tauri commands & bundled sidecar/resources
├── crates/forgity-core/         # Shared Rust core (workspace.db, analyzer bridge, DAG bundler)
├── runner/                      # Native Rust Execution Engine (`forgity-runner`)
│   ├── src/                     # DAG scheduler, component/master orchestrators, DCC executors, cache
│   └── scripts/                 # Host/guest DCC runners (`stage_runner_guest.py`)
├── api/                         # .NET 10 Modular Monolith (Cloud Template Catalog, Auth & Quota API)
│   ├── src/                     # FastEndpoints, Wolverine, EF Core, SharedKernel
│   └── tests/                   # Backend unit & integration tests
├── packages/
│   ├── script-analyzer/         # Python static AST analyzer for node pin/executor inference
│   └── proto/                   # Legacy gRPC Protobuf contracts (dormant per ADR-011)
├── pipeline-scripts/            # Built-in DCC & Python automation scripts (blender, unreal, ai, presets)
└── docs/                        # Architecture Decision Records (ADRs) & technical references
```

---

## ⚡ Quick Start (Local Desktop Mode)

### Prerequisites

- [Node.js 22+](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Rust & Cargo](https://www.rust-lang.org/tools/install)
- [Python 3.12+](https://www.python.org/)
- Optional (for Cloud Template & Quota API): [.NET 10 SDK](https://dotnet.microsoft.com/) & [Docker Desktop](https://www.docker.com/)

### 1. Build the Native Rust Runner

```bash
cargo build --manifest-path runner/Cargo.toml
```

### 2. Run the Desktop App (`app/`)

```bash
pnpm --dir app install
pnpm --dir app tauri dev
```

### 3. Optional: Start Cloud Template & Quota API

```bash
cp .env.example .env
docker compose up -d
```

---

## 📄 License

Forgity Studio is licensed under the **Functional Source License, Version 1.1, MIT Future License (`FSL-1.1-MIT`)** — see [LICENSE](LICENSE).

- **Permitted:** Free for personal, academic, and internal studio/company use.
- **Restricted:** Competing commercial products or hosted/managed SaaS offerings of the Software are prohibited until the 2-year MIT conversion date.
