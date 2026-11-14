# Architecture Decision Record (ADR): Two-Tier Pipeline (Component Pipe vs Master Pipeline) & Local SQLite Relational Index

- **Mã tài liệu**: ADR-007
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-11-13
- **Phạm vi**: Kiến trúc Pipeline Engine (2 tầng Component Pipe & Master Pipeline), Loại bỏ Server-Provided DB Nodes, Rust Runner (`forgity-runner`), Local Workspace Storage & Sync/Publish lên Studio Cloud.
- **Kế thừa & Mở rộng**: [ADR-006](file:///d:/FullStack/Automation/docs/adr/ADR-006-local-first-script-authoring-and-ephemeral-draft-lifecycle.md), [BL-053](file:///D:/FullStack/Automation/.agents/plans/2026-11-12-bl-053-pipeline-engine-de-shackling-component-pipes-and-rust-dag-scheduler.md)

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Sau khi triển khai Local-First Workspace theo [ADR-006](file:///d:/FullStack/Automation/docs/adr/ADR-006-local-first-script-authoring-and-ephemeral-draft-lifecycle.md), hệ thống bộc lộ 2 nhóm vấn đề lớn:

1. **Sự phình to và phụ thuộc cứng vào Server DB Nodes trong đồ thị Pipeline**:
   - Trước đây, một đồ thị DCC bị ép trộn lẫn `.NET Server DB Tools` (`EntityRef`, `QueryWorkstationResourcesTool`, `ResolveResourcesTool`, `UpdateResourceMetadataTool`, `FormatStringTool`) với `ScopeContainer` của DCC.
   - Buộc phải cắt đồ thị thành `DotNetSegment` ↔ `RunnerSegment`, bắn state qua lại RabbitMQ/Redis và không thể thực thi độc lập tại máy trạm Local (Zero-DB / Offline).
2. **Hạn chế của lưu trữ JSON rời rạc ở Local khi quy mô tăng (Scale & Concurrency)**:
   - Tại Tauri Workspace, cấu hình và metadata đang được ghi đè thủ công vào nhiều file JSON rời rạc (`.forgity/local_palette.json`, `local_structs.json`, `constants.json`) và `localStorage`, thiếu ràng buộc quan hệ (Foreign Key) giữa `Master Pipeline` → `Component Pipe` → `Script` → `Struct / Constant`.
   - Khi nâng cấp `Struct` hoặc `Constant`, hoặc khi cần **Publish (Promote) cả cụm phụ thuộc lên Cloud**, việc thiếu bảng ánh xạ `local_id` ↔ `remote_id` và `published_hash` gây rủi ro thiếu sót thành phần con hoặc đứt gãy tham chiếu.
   - Tại Rust Runner (`forgity-runner`), `StorageManager` dùng một file `manifest.json` duy nhất kèm spin-lock `.storage.lock` (timeout 10s, kiểm tra stale PID qua `tasklist` dễ dính lỗi PID reuse trên Windows). Khi chạy song song nhiều tiến trình DCC (`Parallel Batch`), việc đọc/ghi đè toàn bộ file JSON gây nghẽn I/O và tiềm ẩn rủi ro timeout.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **Phương án A: Tiếp tục dùng JSON/File phẳng cho cả định nghĩa lẫn trạng thái Cache/Sync**
   - *Hạn chế*: Không có ACID/Concurrency an toàn đa tiến trình; không có Foreign Key để truy vấn Dependency Bundle khi Publish lên Cloud; dễ bị mất tinh chỉnh UI mỗi lần Auto-Scan ghi đè JSON.
2. **Phương án B: Lưu toàn bộ định nghĩa Pipeline, Script, Struct vào SQLite (Database-First ở Local)**
   - *Hạn chế*: Mất tính di động và khả năng đọc/sửa trực tiếp trên IDE, Git diff hoặc thông qua CLI/MCP cho AI Agent.
3. **Phương án C: Kiến trúc Pipeline 2 Tầng + Hybrid "Portable Declarative Files + Local SQLite Compiled Index" (Được chọn)**
   - Chuẩn hóa toàn bộ thế giới Pipeline về đúng 2 tầng (**Component Pipe** và **Master Pipeline**), loại bỏ hoàn toàn Server-provided DB Nodes.
   - Tách bạch **Source of Truth dạng file phẳng trên đĩa** (để Git, AI/MCP và đóng gói di động) với **Local SQLite (WAL mode)** làm bộ máy quan hệ, chỉ mục biên dịch khi Scan, quản lý cache Runner và theo dõi trạng thái Publish lên Cloud.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Loại Bỏ Server-Provided DB Nodes & Quy Hoạch Pipeline 2 Tầng
- **Loại bỏ hoàn toàn các Server DB Nodes khỏi luồng thực thi Pipeline**: Pipeline không còn phụ thuộc `DotNetSegment`, `EntityRef`, hay các tool truy vấn/cập nhật DB giữa chừng. Mọi tích hợp kho tài nguyên Studio (đăng ký `Resources`, gắn `GameplayTags`) được chuyển sang Out-of-Band Post-Execution Hooks sau khi Pipeline chạy xong.
- **Tầng 1 — `Component Pipe` (Đơn vị DCC nguyên tử)**:
  - Mỗi Component Pipe gắn cố định với **1 Executor duy nhất** (`blender`, `unreal`, `daz`, `python`).
  - Loại bỏ `ScopeContainer` thừa thãi; bản thân Component Pipe là một phiên DCC khép kín.
  - Palette của Component Pipe chỉ gồm: Local Python Scripts (`*.py` cùng executor) + Auto-Gen `Make/Break Struct` + `Pipeline Input / Output`.
- **Tầng 2 — `Master Pipeline` (Điều phối & Hợp lưu)**:
  - Lắp ghép các `Component Pipes` (tự động hỗ trợ chế độ `Single` hoặc `Parallel Batch` với `Max Concurrency`), nút hội tụ `Joint / Barrier` (Multi-wire Array Fan-in), và Pure Helpers (`Make/Break Struct`).
  - Toàn bộ đồ thị chạy trọn vẹn trên 1 máy trạm (Rust Runner DAG Maestro), các node Pure (`Make/Break Struct`, `Joint`) thực thi in-memory (`0ms`).

### 3.2. Mô Hình Lưu Trữ Lai: "Portable Declarative Files + SQLite Compiled Index"
Toàn bộ dữ liệu có giá trị mang đi (Portable / Git-friendly / AI-readable) nằm trên file phẳng; toàn bộ dữ liệu chỉ mục, quan hệ, cache và trạng thái đồng bộ nằm trong **SQLite (`PRAGMA journal_mode = WAL`)**:

1. **Portable Source Files (Nguồn chân lý khi đóng gói & cho AI/CLI)**:
   - `scripts/**/*.py`: Code DCC và AST `@tool_node` (tự động bóc tách `detectedStructs`).
   - `pipelines/**/*.pipeline.yaml`: Định nghĩa đồ thị `Component Pipe` và `Master Pipeline`.
   - `contracts.yaml`: File khai báo hợp đồng dùng chung gồm `constants`, `structs` (tạo từ UI hoặc bổ sung metadata) và **`script_overrides`** (chỉ lưu các tinh chỉnh UI như label, widget, constant binding, default value đè lên kết quả AST mặc định — giữ bảng SQLite gọn sạch không cần cột thừa).
2. **Local Workspace SQLite (`.forgity/workspace.db`) — Tự động dựng (Hydrate) khi Scan**:
   - Đóng vai trò **Compiled Relational Catalog** thay thế cho `local_palette.json`, `local_structs.json`, `constants.json`.
   - **Node Palette là dữ liệu phái sinh (Derived)**: Không cần lưu file nguồn riêng; được suy ra tự động từ `local_scripts` + `local_pipelines (kind: component)` + `local_structs` sau mỗi lần Scan.
   - Khi Scan: Đọc `*.py` + trộn `script_overrides` từ `contracts.yaml` ngay trong RAM $\rightarrow$ ghi bản hoàn chỉnh vào SQLite (`local_structs`, `local_constants`, `local_scripts`, `local_pipelines`, `local_dependencies`).
   - Lưu `remote_id`, `content_hash`, `published_hash` để khi **Publish lên Cloud**, dùng 1 truy vấn SQL lấy trọn bộ Dependency Bundle (`Structs` $\rightarrow$ `Constants` $\rightarrow$ `Scripts` $\rightarrow$ `Pipelines`) đẩy lên PostgreSQL trong 1 Transaction.
   - Đóng vai trò tầng truy vấn `<1ms` cho Tauri UI và CLI/MCP của AI Agent.
3. **Runner Storage SQLite (`runner_state.db`)**:
   - Thay thế hoàn toàn `manifest.json` và `.storage.lock` (`lock.rs`, kiểm tra PID qua `tasklist`) trong `runner/src/storage/`.
   - Quản lý `cached_scripts`, `cached_assets`, `cached_python_envs` bằng SQLite WAL để chịu tải đa tiến trình khi `Parallel Batch` chạy song song nhiều DCC workers.

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

- **Lợi ích**:
  1. **Di động tuyệt đối (100% Portable)**: Chỉ cần copy thư mục chứa `*.py`, `*.pipeline.yaml`, `contracts.yaml` sang máy khác và chạy **Scan**, toàn bộ `.forgity/workspace.db` (gồm cả Palette, Structs, Constants, Script Overrides và Dependency Graph) được tái tạo chính xác 100%.
  2. **Sẵn sàng cho AI/CLI & Cloud Scale**: AI Agent có thể đọc file YAML/Python trực tiếp hoặc truy vấn tức thì qua SQLite Index; Publish lên Cloud đảm bảo toàn vẹn khóa ngoại.
  3. **An toàn đa tiến trình ở Runner**: Triệt tiêu hoàn toàn nguy cơ hỏng file `manifest.json`, lỗi lock timeout 10s và lỗi PID reuse trên Windows.
- **Thách thức cần kiểm soát**:
  - Cần giữ đồng bộ 2 chiều sạch sẽ giữa thao tác chỉnh sửa trên UI (Struct/Constant/Override) với file `contracts.yaml` để file trên đĩa luôn phản ánh đúng ý định người dùng khi đóng gói hoặc commit Git.
  - Cần cơ chế auto-migrate dữ liệu từ `manifest.json` và `.forgity/*.json` cũ sang SQLite trong giai đoạn chuyển tiếp.

