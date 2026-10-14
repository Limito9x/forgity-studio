<div align="center">

# ⚡ Forgity Studio

### *Extensible Distributed Workflow Orchestration & Digital Asset Pipeline Platform*

[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)](https://dotnet.microsoft.com/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![FastEndpoints](https://img.shields.io/badge/FastEndpoints-VSA-008080?style=for-the-badge)](https://fast-endpoints.com/)
[![Wolverine](https://img.shields.io/badge/Wolverine-MessageBus-E05D44?style=for-the-badge)](https://wolverine.netlify.app/)
[![gRPC](https://img.shields.io/badge/gRPC-Protobuf-244c5a?style=for-the-badge&logo=grpc&logoColor=white)](https://grpc.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-AMQP-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg?style=for-the-badge)](LICENSE)

<p align="center">
  A production-grade, distributed workflow automation engine and node-based studio designed to orchestrate complex digital asset pipelines, DCC tools, and creative automation across heterogeneous environments.
</p>

[Key Features](#-key-features) •
[Architecture](#-architecture) •
[Monorepo Layout](#-monorepo-layout) •
[Quick Start](#-quick-start) •
[Runner Daemon](#-runner-daemon) •
[CI/CD & Releases](#-cicd--releases)

</div>

---

## 🚀 What is Forgity Studio?

Managing digital asset pipelines across heterogeneous tools (Blender, Unreal Engine, Daz, DCC suites, rendering farms, and custom toolchains) is notoriously fragile. Studios often rely on disconnected Python scripts, ad-hoc CLI triggers, and manual file transfers that break easily and leak system resources.

**Forgity Studio** solves this by providing:
1. **Interactive Node-based Canvas (DAG)**: A visual graph workflow editor where technical artists and engineers assemble multi-stage pipelines with typed inputs/outputs (Pins).
2. **Robust Backend Core (.NET 10)**: A Vertical Slice Architecture (VSA) Modular Monolith with transactional outbox, real-time WebSocket state dispatch, and bidirectional gRPC execution services.
3. **Headless Distributed Workers (Python)**: Daemon agents running on local workstations or render nodes that execute pipeline stages in isolated subprocess sessions with automated memory management.

---

## 🏛️ Architecture

Forgity Studio connects visual clients, backend orchestrators, and headless execution daemons in an event-driven lifecycle:

- **Web UI (`web/`)**: React 19 + Vite + Tailwind CSS + TanStack Router/Query. Interactive node graph canvas with dynamic forms and realtime SignalR progress streaming.
- **Backend Core (`api/`)**: .NET 10 Modular Monolith + FastEndpoints + Wolverine + EF Core (PostgreSQL) + Redis + RabbitMQ. Handles DAG planning, change tracking, security, and message distribution.
- **Protobuf Contracts (`packages/proto/`)**: Single Source of Truth for bidirectional gRPC contracts (`agent.proto`, `execution_state.proto`).
- **Distributed Runner Daemon (`workers/`)**: Python 3.12+ daemon managing subprocess execution for DCC tools (Blender, Unreal Engine) with isolated execution and self-healing cleanup.

---

## 🌟 Key Features

### 1. Visual DAG & Dynamic Pin System
- **Node-Based Orchestration**: Construct complex pipelines using Directed Acyclic Graphs (DAG) with topological sorting and cycle validation.
- **Granular Pin Typing**: Strong contract-driven pin bindings (`$ref` and intra-stage data flow) allowing downstream steps to seamlessly consume upstream outputs in-memory.
- **Dynamic Form Engine**: Schema-driven forms rendered dynamically with Zod validation, supporting custom input controls and scoped field registries.

### 2. Host Daemon vs. Guest Stage Runner Isolation
- **Process Isolation**: Heavy tools like Blender and Unreal Engine run as dedicated headless subprocesses (`UnrealEditor-Cmd.exe`, `blender --background`). If an engine encounters a native segmentation fault, the main worker host remains completely unaffected.
- **Automated Memory Cleanup**: Background sweepers eliminate zombie subprocesses and reclaim unmanaged engine memory after each stage completes.

### 3. Smart Collaborative Locking & Zero-Byte Storage
- **File & Resource Tracking**: Multi-storage profile management (Studio Cloud S3/MinIO vs BYOS local filesystem).
- **CAS Deduplication**: Content-Addressable Storage using SHA-256 prevents redundant uploads and enables instantaneous zero-byte copies.

---

## 📁 Monorepo Layout

```text
Forgity/
├── api/                    # .NET 10 Modular Monolith (FastEndpoints, Wolverine, EF Core)
│   ├── src/
│   │   ├── Automation.Api/ # Host Application Entry Point & Web Host
│   │   ├── Modules/        # Modular Monolith slices (Pipeline, Runner, Repository, Files, etc.)
│   │   └── SharedKernel/   # Cross-cutting abstractions, Outbox, and Behaviors
│   └── tests/              # Unit & Integration Tests
├── web/                    # Frontend SPA & Tauri Desktop App (React 19, Vite, Tailwind CSS)
│   ├── src/
│   │   ├── features/       # Feature slices (pipelines, runners, repositories, contents)
│   │   └── gen/            # Auto-generated API client from OpenAPI specs
│   └── Dockerfile          # Ultra-lightweight Zero-CPU Nginx Production runtime
├── workers/                # Python 3.12+ Distributed Runner Daemon & DCC Executors
│   ├── core/               # gRPC client, state store, daemon supervisor
│   ├── worker/             # Subprocess runners for Blender, Unreal, and Python scripts
│   └── scripts/            # 1-Click Installers (install.ps1, install.sh)
├── packages/proto/         # Protobuf single source of truth (agent.proto, execution_state.proto)
├── docker-compose.yml      # Orchestration for Web, API, Postgres, RabbitMQ, Redis
└── .github/workflows/      # Automated CI/CD (GHCR Container Publish & Runner Releases)
```

---

## ⚡ Quick Start

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/) (with WSL2 enabled on Windows)
- [Node.js 22+](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [Python 3.12+](https://www.python.org/)

### 2. Launch Local Environment (Docker Compose)

Clone the repository and spin up all core infrastructure:

```bash
git clone https://github.com/limito9x/automation-studio.git
cd automation-studio

# Copy environment variables
cp .env.example .env

# Start all containers (API, Web, PostgreSQL, RabbitMQ, Redis)
docker compose up -d
```

Access the studio services:
- **Web Studio**: [http://localhost](http://localhost)
- **API Swagger / OpenAPI**: [http://localhost:5189/swagger](http://localhost:5189/swagger)
- **RabbitMQ Dashboard**: [http://localhost:15672](http://localhost:15672) (Username: `limito9x`, Password: see `.env`)

---

## 💻 Runner Daemon (Workstation Setup)

Render nodes and local developer workstations connect to the Studio via the **Forgity Runner Daemon**:

### 1-Click Installation (Windows PowerShell)

Open PowerShell as Administrator and run:

```powershell
irm "http://localhost:5189/api/runners/bootstrap/install.ps1?token=<YOUR_RUNNER_TOKEN>" | iex
```

*The runner automatically installs to `$env:LOCALAPPDATA\Forgity\runner`, creates a background task supervisor, and establishes real-time gRPC & RabbitMQ connections back to the Studio.*

### 1-Click Installation (Linux / macOS Bash)

```bash
curl -fsSL "http://localhost:5189/api/runners/bootstrap/install.sh?token=<YOUR_RUNNER_TOKEN>" | bash
```

---

## 📦 CI/CD & Releases

The project includes pre-configured GitHub Actions workflows:

1. **Docker Container Publishing (`docker-publish.yml`)**:
   - Automatically builds and pushes production images to GitHub Container Registry:
     - `ghcr.io/<owner>/forgity-api:latest`
     - `ghcr.io/<owner>/forgity-web:latest`
2. **Runner Distribution (`release-runner.yml`)**:
   - Compiles Protobuf stubs, packages clean standalone archives (`forgity-runner-vX.Y.Z.zip` & `forgity-runner.zip`), calculates SHA-256 checksums, and publishes official GitHub Releases.

---

## 📄 License

This project is licensed under the terms of the GNU Affero General Public License v3.0 ([AGPL-3.0](LICENSE)).
