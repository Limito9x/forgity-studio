# Automation Studio - Master Agent Instructions

> Pipeline Canvas definitions (22/10/2026): xem cập nhật đầu `playbooks/pipeline-canvas-sync.md`. Palette là nguồn định nghĩa chung; graph giữ config/resolved pins, không chứa capabilities. Phase B qua kiểm tra tự động, chờ UI; Phase C chưa triển khai.

> Node lifecycle (22/10/2026): [plan khởi tạo, resolve và validation](plans/2026-10-22-node-resolution-and-validation-lifecycle.md) ghi nhận hướng tiếp nối Phase B. Xem mental model đầu [Canvas playbook](playbooks/pipeline-canvas-sync.md); phân biệt resolve schema với validation graph. R1–R4 là lộ trình chưa triển khai.

Chào mừng đến với Monorepo **Automation Studio**. Tài liệu này đóng vai trò là **Master Router** và **Chỉ mục trung tâm (Master Index)** định hướng cho các Agent khi làm việc trong toàn bộ workspace này.

---

## 1. Bản Đồ Phân Vùng Monorepo (Subproject Scoping)

Dự án gồm 3 phần độc lập nhưng liên kết chặt chẽ và chia sẻ hợp đồng gRPC:

- **`packages/proto/`**: Nguồn chân lý duy nhất (Single Source of Truth) cho các hợp đồng gRPC Protobuf (`agent.proto`, `execution_state.proto`).
- **`api/` (Backend Core)**: .NET 10 Modular Monolith, Vertical Slice Architecture (VSA), FastEndpoints, Wolverine, EF Core, PostgreSQL, RabbitMQ, gRPC.
- **`web/` (Frontend & Desktop)**: Tauri v2 + React 19, Vite, Tailwind CSS, Shadcn (React Aria Components), TanStack Router/Query, Orval API Client.
- **`workers/` (Pipeline Worker Daemon)**: Python 3.12+ Worker, RabbitMQ Consumer, gRPC Client, Subprocess Headless Executors cho Blender và Unreal Engine.

---

## 2. Quy Tắc & Điều Hướng Luật Theo Scope

Trước khi bắt đầu bất kỳ tác vụ nào, hãy đọc và tuân thủ các quy tắc tương ứng:

1. **Toàn Cục (Toàn bộ workspace)**:
   👉 Đọc [rules/general.md](file:///d:/FullStack/Automation/.agents/rules/general.md)
   - _CodeGraph MCP Bắt buộc kèm `projectPath` (Top Priority), Quản lý Terminal, Lập Implementation Plan chi tiết & Review Gate từng Phase._

2. **Khi thao tác với Backend (`api/`)**:
   👉 Đọc [rules/backend.md](file:///d:/FullStack/Automation/.agents/rules/backend.md)
   - _VSA, FastEndpoints, Wolverine Handlers, Dùng CLI scaffold, Mapster, Public modifiers, Transaction attributes._

3. **Khi thao tác với Frontend (`web/`)**:
   👉 Đọc [rules/frontend.md](file:///d:/FullStack/Automation/.agents/rules/frontend.md)
   - _Sử dụng `pnpm`, Không sửa `src/gen`, React Aria Shadcn stack, Custom hooks bọc API, Temporal API, `pnpm tsc`._

4. **Khi thao tác với Worker (`workers/`)**:
   👉 Đọc [rules/workers.md](file:///d:/FullStack/Automation/.agents/rules/workers.md)
   - _Không xóa hay import trực tiếp Stage Runners, BaseSubprocessExecutor, Dọn rác RAM engine, RabbitMQ contracts._

---

## 3. Chỉ Mục Quyết Định Kiến Trúc (Architecture Decision Records - ADR)

> **QUY TẮC BẢO TOÀN KIẾN TRÚC:** Trước khi đề xuất thay đổi lớn về mặt thiết kế hoặc cấu trúc hệ thống, Agent **BẮT BUỘC** phải đọc các ADR tương ứng dưới đây để hiểu rõ bối cảnh lịch sử, những lỗ hổng đã gặp phải trong quá khứ và các đánh đổi (trade-offs) đã được thống nhất. Tuyệt đối không tự ý refactor ngược lại các quyết sách này.

| Mã ADR | Tiêu đề quyết định | Đường dẫn tài liệu | Tóm tắt lý do & quyết sách cốt lõi |
| :--- | :--- | :--- | :--- |
| **Index** | **Toàn bộ ADRs** | [docs/adr/README.md](file:///d:/FullStack/Automation/docs/adr/README.md) | Thư mục trung tâm và quy chuẩn các Quyết định Kiến trúc. |
| **ADR-001** | **Modular Monolith** | [docs/adr/ADR-001-modular-monolith-architecture.md](file:///d:/FullStack/Automation/docs/adr/ADR-001-modular-monolith-architecture.md) | Phân tách module độc lập theo Bounded Context, giao tiếp qua Contracts API & Wolverine In-Process Bus, DB Schema cô lập hoàn toàn. |
| **ADR-002** | **Pragmatic Single-File VSA** | [docs/adr/ADR-002-pragmatic-single-file-vsa.md](file:///d:/FullStack/Automation/docs/adr/ADR-002-pragmatic-single-file-vsa.md) | Xóa bỏ bùng nổ thư mục 4 tầng của Clean Architecture; gom Command, Validator, Endpoint, Handler vào 1 file phẳng; POCO Entity + Mapster. |
| **ADR-003** | **CAS Deduplication & Zero-Byte Linking** | [docs/adr/ADR-003-cas-deduplication-and-zero-byte-linking.md](file:///d:/FullStack/Automation/docs/adr/ADR-003-cas-deduplication-and-zero-byte-linking.md) | Tách rời nhị phân vật lý (Asset - SHA-256) và tham chiếu logic (AssetLink); Presigned upload 2 pha; Piped streaming 8MB chunk không tốn RAM. |
| **ADR-004** | **Unified Node Contract Resolver (SSOT)** | [docs/adr/ADR-004-unified-node-contract-resolver.md](file:///d:/FullStack/Automation/docs/adr/ADR-004-unified-node-contract-resolver.md) | Hợp nhất 4 nơi tự tính toán chân pin về một cổng `INodeContractResolver` duy nhất; sửa lỗi StructType; loại bỏ Type Path; O(1) runtime pin lookup. |
| **ADR-005** | **Transient Graph Ingestion & Structural Gate** | [docs/adr/ADR-005-transient-graph-ingestion-and-structural-gate.md](file:///d:/FullStack/Automation/docs/adr/ADR-005-transient-graph-ingestion-and-structural-gate.md) | Dựng đồ thị in-memory qua `TransientPipelineGraphFactory`; ranh giới chặn cứng lỗi cấu trúc và cảnh báo cấu hình dạng Draft; HTTP 422 preflight run gate. |

---

## 4. Chỉ Mục Cẩm Nang Vận Hành Cốt Lõi (Core Operational Playbooks - MANDATORY)

> **QUY TẮC SỐNG:** Trước khi can thiệp vào bất kỳ module/feature nào, Agent **BẮT BUỘC** phải đọc Playbook tương ứng dưới đây để nắm trọn vẹn luồng dữ liệu (Data Lifecycle) từ A đến Z. Sau khi sửa đổi code, Agent **BẮT BUỘC** phải cập nhật lại Playbook để tài liệu luôn phản ánh đúng 100% thực tế.

| Module / Luồng cốt lõi | Đường dẫn Playbook | Tóm tắt Mental Model & Cơ chế vận hành |
| :--- | :--- | :--- |
| **Pipeline Engine Lifecycle** | [.agents/playbooks/pipeline-engine.md](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-engine.md) | Luồng Run -> DAG Planner -> Memory/Entity/State Store -> Phân đoạn DotNet / RunnerSegment -> RabbitMQ -> Worker Subprocess -> Cancel gọn -> SignalR. |
| **Pipeline Canvas & File Sync** | [.agents/playbooks/pipeline-canvas-sync.md](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-canvas-sync.md) | Cơ chế Autosave Debounce 600ms, Sync toàn đồ thị (SavePipelineGraph), Quy ước File Pin: Draft `{ assetId, originalName }` -> DB `{ assetLinkId }`. |
| **Worker Runtime & Storage** | [.agents/playbooks/worker-runtime.md](file:///d:/FullStack/Automation/.agents/playbooks/worker-runtime.md) | Quản lý runtime storage (`cache/scripts`, `cache/assets`, `temp/`, `logs/`), lock `.storage.lock`, Script resolver theo SHA-256 hash, Background cleanup daemon. |
| **Resource & GameplayTags Lifecycle** | [.agents/playbooks/resource-repository-lifecycle.md](file:///d:/FullStack/Automation/.agents/playbooks/resource-repository-lifecycle.md) | Vòng đời Repository -> Resource -> ResourceVersion -> Mount Locations, Inspection JSON metadata, Phân rã TagLink theo SubPath, TagPanel Dnd & Shift-Click. |
| **Files & Storage Lifecycle** | [.agents/playbooks/files-storage-lifecycle.md](file:///d:/FullStack/Automation/.agents/playbooks/files-storage-lifecycle.md) | Vòng đời StorageProfile (Studio Cloud vs BYOS), Asset (CAS Deduplication) vs AssetLink (Zero-byte copy), Presigned Upload 2 pha, Batch Cross-Storage Piped Streaming 8MB chunk & Job Tracker. |

---

## 5. Chỉ Mục Tài Liệu Kiến Trúc Tham Khảo (Architecture Reference Index)

| Phạm vi       | Đường dẫn tài liệu                                                                                                             | Mô tả nội dung                                                        |
| :------------ | :----------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Tổng quan** | [docs/architecture/system_overview.md](file:///d:/FullStack/Automation/docs/architecture/system_overview.md)                   | Kiến trúc tổng thể liên thông Web <-> API <-> Workers.                |
| **Backend**   | [docs/backend/ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/backend/ARCHITECTURE.md)                                   | Triết lý kiến trúc Modular Monolith & VSA của Backend.                |
| **Backend**   | [docs/adr/ADR-002-pragmatic-single-file-vsa.md](file:///d:/FullStack/Automation/docs/adr/ADR-002-pragmatic-single-file-vsa.md) | Quyết định kiến trúc: Pragmatic Single-File VSA & Mapster-First POCO. |
| **Backend**   | [docs/backend/FILES_STORAGE_ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/backend/FILES_STORAGE_ARCHITECTURE.md)       | Kiến trúc Hệ thống Lưu trữ & Vòng đời Tệp (Multi-storage, Zero-byte Copy, Piped Streaming). |
| **Backend**   | [docs/backend/PIPELINE_ENGINE_ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/backend/PIPELINE_ENGINE_ARCHITECTURE.md)   | Thiết kế Pipeline Engine, DAG, Stages, Steps trong Backend.           |
| **Backend**   | [docs/backend/PIPELINE_PIN_SYSTEM.md](file:///d:/FullStack/Automation/docs/backend/PIPELINE_PIN_SYSTEM.md)                     | Hệ thống Pin, Data Types, Dynamic Forms của Pipeline.                 |
| **Frontend**  | [docs/frontend/architecture.md](file:///d:/FullStack/Automation/docs/frontend/architecture.md)                                 | Kiến trúc Frontend, luồng dữ liệu Orval -> Hooks -> Components.       |
| **Frontend**  | [docs/frontend/design.md](file:///d:/FullStack/Automation/docs/frontend/design.md)                                             | Hệ thống Design System & Layout Guidelines (3 Khuôn mẫu bố cục, page-container, Spacing 4/8dp). |
| **Frontend**  | [docs/frontend/frontend_rules.md](file:///d:/FullStack/Automation/docs/frontend/frontend_rules.md)                             | Quy định chi tiết về code frontend và các anti-patterns cần tránh.    |
| **Frontend**  | [docs/frontend/patterns/users.md](file:///d:/FullStack/Automation/docs/frontend/patterns/users.md)                             | Mẫu thiết kế chuẩn cho Feature Resource Page (Table + Dialogs).       |
| **Frontend**  | [docs/frontend/patterns/filter.md](file:///d:/FullStack/Automation/docs/frontend/patterns/filter.md)                           | Mẫu thiết kế hệ thống Filter Panel & Adapters.                        |
| **Frontend**  | [docs/frontend/patterns/pipelines_canvas.md](file:///d:/FullStack/Automation/docs/frontend/patterns/pipelines_canvas.md)       | Mẫu thiết kế Canvas đồ thị, Scoped Registry, Node Inspector.          |
| **Frontend**  | [docs/frontend/patterns/design_patterns_catalog.md](file:///d:/FullStack/Automation/docs/frontend/patterns/design_patterns_catalog.md) | Sổ tay Design Patterns thực chiến (Facade, Strategy/Adapter, Registry, Domain Composition). |
| **Pipeline**  | [docs/pipelines/SCRIPT_NODE_GUIDELINES.md](file:///d:/FullStack/Automation/docs/pipelines/SCRIPT_NODE_GUIDELINES.md)           | Quy chuẩn viết Script Node Python, AST Schema Ingestion & DCC Templates. |
| **Worker**    | [docs/workers/WORKER_ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/workers/WORKER_ARCHITECTURE.md)                     | Kiến trúc Worker: Host Subprocess vs Guest Stage Runners.             |
| **Vận hành**  | [docs/ops/database_backup_restore.md](file:///d:/FullStack/Automation/docs/ops/database_backup_restore.md)                     | Hướng dẫn Vận hành: Sao lưu (Backup) & Phục hồi (Restore) PostgreSQL Docker. |

---

## 6. Chỉ Mục Kỹ Năng Tự Động Hóa (Skills Index)

### Kỹ Năng Backend (`api/`)

- [create_endpoint](file:///d:/FullStack/Automation/.agents/skills/create_endpoint/SKILL.md): Tạo mới FastEndpoints API Endpoint chuẩn VSA.
- [create_feature](file:///d:/FullStack/Automation/.agents/skills/create_feature/SKILL.md): Tạo mới Slice tính năng hoàn chỉnh (Command, Handler, Validator, Endpoint).
- [create_module](file:///d:/FullStack/Automation/.agents/skills/create_module/SKILL.md): Hướng dẫn tạo module mới chuẩn kiến trúc Modular Monolith.
- [create_crud](file:///d:/FullStack/Automation/.agents/skills/create_module/SKILL.md): Sinh mã CRUD hoàn chỉnh bằng CLI `tools/Automation.Cli`.
- [create_migration](file:///d:/FullStack/Automation/.agents/skills/create_migration/SKILL.md): Tạo và áp dụng EF Core Database Migration cho Module.
- [create_permission](file:///d:/FullStack/Automation/.agents/skills/create_permission/SKILL.md): Định nghĩa và đăng ký quyền (Permissions) cho module.
- [create_pipeline_tool](file:///d:/FullStack/Automation/.agents/skills/create_pipeline_tool/SKILL.md): Tạo Node Tool mới cho Pipeline Engine.
- [fastendpoints_results](file:///d:/FullStack/Automation/.agents/skills/fastendpoints_results/SKILL.md): Quy chuẩn trả kết quả API với FluentResults và unwrap SendResultAsync.
- [register_and_link_asset](file:///d:/FullStack/Automation/.agents/skills/register_and_link_asset/SKILL.md): Đăng ký và liên kết Asset Slots giữa các module.
- [clean_program_configuration](file:///d:/FullStack/Automation/.agents/skills/clean_program_configuration/SKILL.md): Tái cấu trúc Program.cs và các DI Extensions gọn gàng.

### Kỹ Năng Frontend (`web/`)

- [build_frontend_table](file:///d:/FullStack/Automation/.agents/skills/build_frontend_table/SKILL.md): Xây dựng Data Table chuẩn ResourcePageShell và DataTableRowActions.
- [build_frontend_form](file:///d:/FullStack/Automation/.agents/skills/build_frontend_form/SKILL.md): Xây dựng Form thêm/sửa kết hợp React Hook Form, Zod và Dialog.
- [build_frontend_hook](file:///d:/FullStack/Automation/.agents/skills/build_frontend_hook/SKILL.md): Viết custom query/mutation hook bọc API tự sinh từ Orval.
- [create-frontend-feature](file:///d:/FullStack/Automation/.agents/skills/create-frontend-feature/SKILL.md): Quy trình tạo Feature CRUD mới bằng Plop và hoàn thiện logic.
- [create_form_control](file:///d:/FullStack/Automation/.agents/skills/create_form_control/SKILL.md): Tạo Form Control mới cho hệ thống Dynamic Form.
- [ui-ux-pro-max](file:///d:/FullStack/Automation/.agents/skills/ui-ux-pro-max/SKILL.md): Thiết kế UI/UX chuyên nghiệp, bảng màu, typography, khoảng cách 4/8dp, animations.

---

## 7. Workflows

- [build-dotnet](file:///d:/FullStack/Automation/.agents/workflows/build-dotnet.md): Quy trình build và kiểm tra Backend .NET.
- [suggest-fix-template](file:///d:/FullStack/Automation/.agents/workflows/suggest-fix-template.md): Mẫu đề xuất sửa lỗi tự động.

---

## 8. Kế Hoạch Kỹ Thuật (Engineering Plans)

> **QUY TẮC LƯU TRỮ & TRA CỨU:**
> - Toàn bộ Kế hoạch kỹ thuật **BẮT BUỘC** lưu trữ tập trung tại `.agents/plans/`. Chỉ giữ lại các Active Plans và `BACKLOG.md` tại thư mục này.
> - Kế hoạch đã hoàn thành được di chuyển vào kho lưu trữ theo tháng: `.agents/plans/archive/YYYY-MM/`.
> - **Sổ bộ Tồn đọng & Định hướng (Backlog)**: [plans/BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md).
> - Danh mục toàn bộ 25+ kế hoạch lịch sử đã hoàn thành được lưu trữ tại [plans/README.md](file:///d:/FullStack/Automation/.agents/plans/README.md).

### Kế hoạch đang thực hiện (Active):
- [**trial-readiness-security-trust-and-environment (26/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-26-trial-readiness-security-trust-and-environment.md): Chuẩn Hóa Trial Readiness — Pipeline Script Trust Gate (1-Prompt AI Audit), Script Viewer & Pre-flight Environment Check & Email Deliverability (`BL-022`).
- [**bl-014-form-registry-advanced-pin-inputs (26/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-26-bl-014-form-registry-advanced-pin-inputs.md): Form-Registry-Driven Advanced Pin Inputs & Preset Mode (Multiline Textarea, Dropdown Presets with TagsInput, allowCustom Combobox).
- [**topology-aware-resolver-and-trial-readiness (24/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-24-topology-aware-resolver-and-trial-readiness.md): Topology-Aware Contract Resolution (Auto-Infer Struct Pin từ Incoming Edge), Xử Lý File Unbound (BL-005), Cảnh Báo Trạng Thái Runner Khi Chạy & Làm Sạch DB Cho Trial User.

### Kế hoạch vừa hoàn thành gần nhất (Đã Archive):
- [**bl-025-subpipeline-suspend-resume (26/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-26-bl-025-subpipeline-suspend-resume.md): Sub-Pipeline (Macro) Suspend/Resume tuần tự, WaitingForSubPipeline, Wolverine callback hoàn tất child → resume parent, lan truyền fail/timeout, cascade cancel đệ quy.
- [**bl-024-native-python-script-analyzer-sidecar (26/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-024-native-python-script-analyzer-sidecar.md): Native Python Script Analyzer Sidecar (Subprocess AST Ingestion, Automated Dependency Discovery, Full-width Markdown Description & Literal Dropdown Mapping tại `api/lib/analyzers/`).
