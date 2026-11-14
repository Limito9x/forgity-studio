<div align="center">

# ⚡ Forgity Studio

### *Local-First Two-Tier Workflow Orchestration & DCC Pipeline Platform*

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

1. **Desktop & Visual Canvas (`app/`)**: A Tauri v2 + React 19 application featuring a Palette-driven node graph editor (`React Flow`), native Python AST script analysis, workspace Constants/Structs, and live execution tracking.
2. **Native Rust Runner (`runner/`)**: A standalone Rust execution engine (`forgity-runner`) that receives an `ExecutionBundle` over `stdin`, streams structured JSON-lines progress over `stdout`, and executes DCC stages in isolated OS processes.
3. **Optional Studio Cloud Backend (`api/`)**: A .NET 10 Modular Monolith (FastEndpoints, Wolverine, EF Core, PostgreSQL, RabbitMQ, gRPC) for team collaboration, cloud storage, and remote orchestration.

---

## 🏛️ Architecture

### Two-Tier Pipeline Model
- **Component Pipes (`*.component.yaml`)**: Reusable, single-domain sub-workflows (e.g., `daz_to_blender`) composed of typed Python/DCC nodes, Pure nodes (`Constant`, `MakeStruct`, `BreakStruct`), and `Start`/`Return` contracts.
- **Master Pipelines (`*.pipeline.yaml`)**: Top-level orchestrators that sequence Component Pipes and Pure `Joint` nodes across heterogeneous DCC tools.

### Unified DCC Stage Execution
Instead of spawning a fresh Blender or Unreal process for every single node, `forgity-runner` packs connected steps targeting the same DCC host (along with inline Pure nodes) into a single `StageTaskMessage` and executes them sequentially inside **one** persistent DCC process via `stage_runner_guest.py`, eliminating startup overhead and keeping scene state in memory.

### Palette-Driven Canvas & Reconciliation
- Nodes on the canvas are **hydrated by `refId` from the live Palette** (Single Source of Truth). Snapshots (`.forgity/snapshots/*.snap.json`) store only instance data (`position`, `configValues`, `fileAssets`, `edges`), never frozen node shapes.
- Updating a script, Struct, or Constant automatically reconciles affected nodes and prunes broken wires.

---

## 📁 Monorepo Layout

```text
forgity-studio/
├── app/                    # Tauri v2 Desktop & React 19 Frontend (Vite, Tailwind, React Flow)
│   ├── src/                # Feature slices (pipelines, runners, contents, auth) & Orval client
│   └── src-tauri/          # Rust Tauri commands (native Python AST analyzer, local runner bridge)
├── runner/                 # Native Rust Runner (`forgity-runner`)
│   ├── src/                # DAG scheduler, component/master orchestrators, DCC executors, cache
│   └── scripts/            # Host/guest DCC runners (`stage_runner_guest.py`)
├── api/                    # Optional .NET 10 Modular Monolith (Studio Cloud & Collaboration)
│   ├── src/                # FastEndpoints, Wolverine, EF Core, SharedKernel
│   └── tests/              # Backend unit & integration tests
├── packages/proto/         # Shared gRPC Protobuf contracts (`agent.proto`, `execution_state.proto`)
└── docs/                   # Architecture Decision Records (ADRs) & technical references
```

---

## ⚡ Quick Start (Local Desktop Mode)

### Prerequisites
- [Node.js 22+](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [Rust & Cargo](https://www.rust-lang.org/tools/install)
- [Python 3.12+](https://www.python.org/)
- Optional (for Studio Cloud): [.NET 10 SDK](https://dotnet.microsoft.com/) & [Docker Desktop](https://www.docker.com/)

### 1. Build the Native Rust Runner
```bash
cargo build --manifest-path runner/Cargo.toml
```

### 2. Run the Desktop App (`app/`)
```bash
pnpm --dir app install
pnpm --dir app tauri dev
```

### 3. Optional: Start Studio Cloud Infrastructure
```bash
cp .env.example .env
docker compose up -d
```

---

## 📄 License

Forgity Studio is licensed under the **Functional Source License, Version 1.1, MIT Future License (`FSL-1.1-MIT`)** — see [LICENSE](LICENSE).

- **Permitted:** Free for personal, academic, and internal studio/company use.
- **Restricted:** Competing commercial products or hosted/managed SaaS offerings of the Software are prohibited until the 2-year MIT conversion date.
