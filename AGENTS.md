# Forgity Studio - Master Agent Instructions

---

## 1. Bản Đồ Phân Vùng Monorepo (Subproject Scoping)

Dự án gồm 3 phần độc lập nhưng liên kết chặt chẽ và chia sẻ hợp đồng gRPC:

- **`packages/proto/`**: Nguồn chân lý duy nhất (Single Source of Truth) cho các hợp đồng gRPC Protobuf (`agent.proto`, `execution_state.proto`).
- **`api/` (Backend Core)**: .NET 10 Modular Monolith, Vertical Slice Architecture (VSA), FastEndpoints, Wolverine, EF Core, PostgreSQL, RabbitMQ, gRPC.
- **`app/` (Frontend & Desktop)**: Tauri v2 + React 19, Vite, Tailwind CSS, Shadcn (React Aria Components), TanStack Router/Query, Orval API Client.
- **`runner/` (Native Rust Runner Daemon)**: Rust Host Daemon độc lập (`forgity-runner`), Windows Job Object containment, Named Pipe IPC, zero-RAM S3 streaming, CLI cleaner.
- **`pipeline-scripts/` (Kho Scripts Nghiệp Vụ DCC & Python)**: Toàn bộ script tools phẳng theo Executor (`blender/`, `unreal/`, `daz/`, `ai/`, `presets/`), độc lập với Runner binary.

---

## 2. Quy Tắc & Điều Hướng Luật Theo Scope

**Bộ công cụ tìm kiếm bắt buộc (Search Tooling — đã cài sẵn trên máy):**

- `ast-grep` (0.51+) — tìm kiếm theo cấu trúc AST, ưu tiên khi dò/đổi pattern code:
  - `ast-grep run -p '<pattern>' -l <lang> <dir>` (ví dụ `-l rust`, `-l tsx`, `-l cs`)
  - `ast-grep run -p '<pattern>' -l <lang> -r '<rewrite>' <dir>` để thay thế hàng loạt
  - Thêm `--no-ignore` khi cần quét cả file bị `.gitignore`
  - Lưu ý: `sg` là alias deprecated — luôn dùng `ast-grep`
- `rg` (ripgrep 15.x, có PCRE2 + JIT) — tìm text/literal tốc độ cao: `rg -n "<text>" <dir> -g "*.ts"`
- Không dùng `grep` / `findstr` / `Select-String` để dò code khi `rg` hoặc `ast-grep` đáp ứng được; không dò mò khi chưa hỏi CodeGraph.

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

4. **Khi thao tác với Runner (`runner/`) & Scripts (`pipeline-scripts/`)**:
   👉 Đọc [rules/runner.md](file:///d:/FullStack/Automation/.agents/rules/runner.md)
   - _Native Rust Daemon, Windows Job Object containment, Named Pipe IPC, Single guest runner, Phẳng hóa scripts, Dọn rác CLI._

---

## 3. TÀI LIỆU

> **QUYẾT ĐỊNH KIẾN TRÚC:** Xem tại docs/adr

> **PLAYBOOKS**: Xem tại .agents/playbooks

> **QUY TẮC LƯU TRỮ & TRA CỨU:**
>
> - Toàn bộ Kế hoạch kỹ thuật **BẮT BUỘC** lưu trữ tập trung tại `.agents/plans/`. Chỉ giữ lại các Active Plans và `BACKLOG.md` tại thư mục này.
> - Kế hoạch đã hoàn thành được di chuyển vào kho lưu trữ theo tháng: `.agents/plans/archive/YYYY-MM/`.
> - **Sổ bộ Tồn đọng & Định hướng (Backlog)**: [plans/BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md).
> - Danh mục toàn bộ 25+ kế hoạch lịch sử đã hoàn thành được lưu trữ tại [plans/README.md](file:///d:/FullStack/Automation/.agents/plans/README.md).
> - **Công cụ tự động hóa**: Sử dụng python .agents/scripts/backlog.py [check|archive|new|list] để kiểm tra toàn vẹn, lưu trữ kế hoạch đã xong vào rchive/YYYY-MM/ và đồng bộ chỉ mục tự động.

> - **Không lập danh sách chỉ mục kế hoạch tại AGENTS.md**: Tra cứu trực tiếp tại [plans/BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md) và [plans/README.md](file:///d:/FullStack/Automation/.agents/plans/README.md).
