# Chỉ Mục Kế Hoạch Kỹ Thuật (Engineering Plans Archive)

Thư mục này lưu trữ các kế hoạch kỹ thuật, lộ trình triển khai (Roadmaps) và phương án tái cấu trúc của dự án **Automation Studio**.

> [!IMPORTANT]
> **Quy định & Định vị:**
> - Toàn bộ Kế hoạch kỹ thuật **BẮT BUỘC** lưu trữ tập trung tại thư mục `.agents/plans/`. Tuyệt đối không tạo file kế hoạch rải rác ngoài thư mục này.
> - **Sổ bộ Backlog & Định hướng tương lai**: Tra cứu và ghi nhận tại [BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md).
> - Kế hoạch đang thực hiện được giữ trực tiếp tại `.agents/plans/` trong danh mục **Active Plans**.
> - Kế hoạch đã hoàn thành được lưu giữ trong danh mục **Archived Plans** theo tháng (`.agents/plans/archive/YYYY-MM/`) phục vụ tra cứu lịch sử và bối cảnh.

---

## 1. Kế Hoạch Đang Triển Khai (Active Plans)

| Ngày lập | Mã kế hoạch & Tài liệu | Tóm tắt mục tiêu & Phạm vi |
| :--- | :--- | :--- |
| 24/10/2026 | [**topology-aware-resolver-and-trial-readiness**](file:///d:/FullStack/Automation/.agents/plans/2026-10-24-topology-aware-resolver-and-trial-readiness.md) | Topology-Aware Contract Resolution (Auto-Infer Struct Pin từ Incoming Edge), Xử Lý File Unbound (BL-005), Cảnh Báo Trạng Thái Runner Khi Chạy & Làm Sạch DB Cho Trial User. |

---

## 2. Kế Hoạch Lịch Sử Đã Hoàn Thành (Archived Plans)

Toàn bộ các kế hoạch hoàn thành được lưu trữ tại thư mục con [archive/2026-10/](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10):

- [**bl-025-subpipeline-suspend-resume (26/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-26-bl-025-subpipeline-suspend-resume.md): Sub-Pipeline (Macro) Suspend/Resume tuần tự, WaitingForSubPipeline, Wolverine callback hoàn tất child → resume parent, cascade cancel.
- [**bl-024-native-python-script-analyzer-sidecar (26/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-024-native-python-script-analyzer-sidecar.md): Native Python Script Analyzer Sidecar (Subprocess AST Ingestion, Automated Dependency Discovery).
- [**bl-020-pipeline-scripts-and-ai-classify-refactor (25/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-020-pipeline-scripts-and-ai-classify-refactor.md)
- [**bl-019-content-tools-and-resource-struct-dual-mode (25/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-019-content-tools-and-resource-struct-dual-mode.md)
- [**bl-018-fetch-filter-resolve-resources-tooling (25/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-018-fetch-filter-resolve-resources-tooling.md)
- [**bl-016-bl-017-resource-struct-and-sync-tool-refactor (25/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-016-bl-017-resource-struct-and-sync-tool-refactor.md)
- [**bl-015-pipeline-execution-trigger-handler-and-tests (25/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-25-bl-015-pipeline-execution-trigger-handler-and-tests.md)
- [**bl-009-bl-010-workstation-struct-and-resource-filter-tool (24/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-24-bl-009-bl-010-workstation-struct-and-resource-filter-tool.md)
- [**bl-003-bl-004-node-inspector-and-parameters-panel-refactor (24/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-24-bl-003-bl-004-node-inspector-and-parameters-panel-refactor.md)
- [**bl-001-canvas-inspector-diagnostics-ui (24/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-24-bl-001-canvas-inspector-diagnostics-ui.md)
- [**contracts-validation-buildtime-runtime-architecture (23/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-23-contracts-validation-buildtime-runtime-architecture.md)
- [**node-resolution-and-validation-lifecycle (22/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-22-node-resolution-and-validation-lifecycle.md)
- [**node-strategy-and-field-adapters (22/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-22-node-strategy-and-field-adapters.md)
- [**refactor-pipeline-build-time-type-contract-and-struct-registry (22/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10/2026-10-22-refactor-pipeline-build-time-type-contract-and-struct-registry.md)
- [**danh mục chi tiết toàn bộ kế hoạch đầu tháng 10/2026 xem tại [archive/2026-10/](file:///d:/FullStack/Automation/.agents/plans/archive/2026-10)**]
