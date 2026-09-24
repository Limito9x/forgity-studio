# Automation Studio - Master Agent Instructions

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
   - *CodeGraph MCP Priority, Quản lý Terminal/Kill Background Process, Ngôn ngữ giao tiếp/Code.*

2. **Khi thao tác với Backend (`api/`)**:
   👉 Đọc [rules/backend.md](file:///d:/FullStack/Automation/.agents/rules/backend.md)
   - *VSA, FastEndpoints, Wolverine Handlers, Dùng CLI scaffold, Mapster, Public modifiers, Transaction attributes.*

3. **Khi thao tác với Frontend (`web/`)**:
   👉 Đọc [rules/frontend.md](file:///d:/FullStack/Automation/.agents/rules/frontend.md)
   - *Sử dụng `pnpm`, Không sửa `src/gen`, React Aria Shadcn stack, Custom hooks bọc API, Temporal API, `pnpm tsc`.*

4. **Khi thao tác với Worker (`workers/`)**:
   👉 Đọc [rules/workers.md](file:///d:/FullStack/Automation/.agents/rules/workers.md)
   - *Không xóa hay import trực tiếp Stage Runners, BaseSubprocessExecutor, Dọn rác RAM engine, RabbitMQ contracts.*

---

## 3. Chỉ Mục Tài Liệu Kỹ Thuật (Documentation Index)

| Phạm vi | Đường dẫn tài liệu | Mô tả nội dung |
| :--- | :--- | :--- |
| **Tổng quan** | [docs/architecture/system_overview.md](file:///d:/FullStack/Automation/docs/architecture/system_overview.md) | Kiến trúc tổng thể liên thông Web <-> API <-> Workers. |
| **Backend** | [docs/backend/ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/backend/ARCHITECTURE.md) | Triết lý kiến trúc Modular Monolith & VSA của Backend. |
| **Backend** | [docs/backend/ADR_PRAGMATIC_SINGLE_FILE_VSA.md](file:///d:/FullStack/Automation/docs/backend/ADR_PRAGMATIC_SINGLE_FILE_VSA.md) | Quyết định kiến trúc: Pragmatic Single-File VSA & Mapster-First POCO. |
| **Backend** | [docs/backend/PIPELINE_ENGINE_ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/backend/PIPELINE_ENGINE_ARCHITECTURE.md) | Thiết kế Pipeline Engine, DAG, Stages, Steps trong Backend. |
| **Backend** | [docs/backend/PIPELINE_PIN_SYSTEM.md](file:///d:/FullStack/Automation/docs/backend/PIPELINE_PIN_SYSTEM.md) | Hệ thống Pin, Data Types, Dynamic Forms của Pipeline. |
| **Frontend** | [docs/frontend/architecture.md](file:///d:/FullStack/Automation/docs/frontend/architecture.md) | Kiến trúc Frontend, luồng dữ liệu Orval -> Hooks -> Components. |
| **Frontend** | [docs/frontend/frontend_rules.md](file:///d:/FullStack/Automation/docs/frontend/frontend_rules.md) | Quy định chi tiết về code frontend và các anti-patterns cần tránh. |
| **Frontend** | [docs/frontend/patterns/users.md](file:///d:/FullStack/Automation/docs/frontend/patterns/users.md) | Mẫu thiết kế chuẩn cho Feature Resource Page (Table + Dialogs). |
| **Frontend** | [docs/frontend/patterns/filter.md](file:///d:/FullStack/Automation/docs/frontend/patterns/filter.md) | Mẫu thiết kế hệ thống Filter Panel & Adapters. |
| **Frontend** | [docs/frontend/patterns/pipelines_canvas.md](file:///d:/FullStack/Automation/docs/frontend/patterns/pipelines_canvas.md) | Mẫu thiết kế Canvas đồ thị, Scoped Registry, Node Inspector. |
| **Worker** | [docs/workers/WORKER_ARCHITECTURE.md](file:///d:/FullStack/Automation/docs/workers/WORKER_ARCHITECTURE.md) | Kiến trúc Worker: Host Subprocess vs Guest Stage Runners. |

---

## 4. Chỉ Mục Kỹ Năng Tự Động Hóa (Skills Index)

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

## 5. Workflows
- [build-dotnet](file:///d:/FullStack/Automation/.agents/workflows/build-dotnet.md): Quy trình build và kiểm tra Backend .NET.
- [suggest-fix-template](file:///d:/FullStack/Automation/.agents/workflows/suggest-fix-template.md): Mẫu đề xuất sửa lỗi tự động.
