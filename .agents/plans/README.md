# Chỉ Mục Kế Hoạch Kỹ Thuật (Engineering Plans Archive)

Thư mục này lưu trữ toàn bộ các kế hoạch kỹ thuật, lộ trình triển khai (Roadmaps) và phương án tái cấu trúc của dự án **Automation Studio**.

> [!IMPORTANT]
> **Quy định & Định vị:**
> - Toàn bộ Kế hoạch kỹ thuật **BẮT BUỘC** lưu trữ tập trung tại thư mục `.agents/plans/`. Tuyệt đối không tạo file kế hoạch rải rác ngoài thư mục này.
> - **Sổ bộ Backlog & Định hướng tương lai**: Tra cứu và ghi nhận tại [BACKLOG.md](file:///d:/FullStack/Automation/.agents/plans/BACKLOG.md).
> - Kế hoạch đang thực hiện được đưa vào danh mục **Active Plans**.
> - Kế hoạch đã hoàn thành được lưu giữ trong danh mục **Archived Plans** phục vụ tra cứu lịch sử và bối cảnh.

---

## 1. Kế Hoạch Đang Triển Khai (Active Plans)

| Ngày lập | Mã kế hoạch & Tài liệu | Tóm tắt mục tiêu & Phạm vi |
| :--- | :--- | :--- |
| 23/10/2026 | [**contracts-validation-buildtime-runtime-architecture**](file:///d:/FullStack/Automation/.agents/plans/2026-10-23-contracts-validation-buildtime-runtime-architecture.md) | **Kiến Trúc Tổng Thể 3 Phân Khu (`Contracts & Validation` -> `BuildTime` & `Runtime`)**: Hợp nhất `INodeContractResolver`, `IPipelineContractValidator`, `TransientPipelineGraphFactory`, Runtime State Tracking & Tái cấu trúc thư mục vật lý. |

---

## 2. Kế Hoạch Lịch Sử Đã Hoàn Thành (Archived Plans)

### Tháng 10/2026 (Refactor Kiến Trúc, Runner Native & Batch-First)

- [**node-strategy-and-field-adapters (22/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-22-node-strategy-and-field-adapters.md): Kế hoạch Tái Cấu Trúc Node View Strategy (6.2), Field Adapter Registry (6.3), Chuẩn Hóa Return Node & ContentItem Struct.
- [**refactor-pipeline-build-time-type-contract-and-struct-registry (22/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-22-refactor-pipeline-build-time-type-contract-and-struct-registry.md): Kế hoạch Tái cấu trúc Toàn diện Build-Time, Chuẩn hóa Type Contract & Struct Registry.
- [**variable-repair-parameters-edit-and-tool-decluttering (21/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-21-variable-repair-parameters-edit-and-tool-decluttering.md): Kế Hoạch Sửa Lỗi Variable, Nâng Cấp Parameters Panel (Default Value & Edit) và Thanh Lọc Tool/Script Tham Số.
- [**stage-delete-confirm-and-assign-content-tool (21/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-21-stage-delete-confirm-and-assign-content-tool.md): Cảnh Báo Xóa Stage Container & Nâng Cấp Tool Assign Resources To Content (Create If Not Exists).
- [**standardize-draft-resource-and-default-runner (21/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-21-standardize-draft-resource-and-default-runner.md): Chuẩn Hóa Kiến Trúc Draft Resource, Runner Holding & Default Runner Auto-Routing.
- [**generic-runner-env-and-remote-control (21/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-21-generic-runner-env-and-remote-control.md): Biến Môi Trường Generic cho Runner ([env]), Quản Trị Từ Xa Phong Cách PaaS & Global CLI (forgity setup).
- [**standardize-pipeline-tools-and-tagmap (19/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-19-standardize-pipeline-tools-and-tagmap.md): Chuẩn Hóa Server Pipeline Tools, Tái Cấu Trúc TagMap Batch-First & Thanh Lọc 23 Zombie Tools.
- [**runner-detail-page-and-attached-repositories (18/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-18-runner-detail-page-and-attached-repositories.md): Xây Dựng Trang Chi Tiết Máy Trạm (`/runners/:id`) & Quản Trị Attached Repositories Đa Dự Án.
- [**refactor-runner-software-settings-dialog (18/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-18-refactor-runner-software-settings-dialog.md): Tinh Giản & Tối Ưu Giao Diện Cấu Hình Runner Software (Compact Rows, Auto-Save on Select).
- [**runner-detach-and-cancel-execution (18/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-18-runner-detach-and-cancel-execution.md): Bổ sung Cancel Pipeline Execution trên Canvas và Triển khai Cơ chế Detach Runner 2 Cấp độ.
- [**rust-runner-daemon-migration (18/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-18-rust-runner-daemon-migration.md): Xây Dựng Rust Runner Daemon Siêu Nhẹ (Forgity Runner Native, Single Binary, <15MB RAM).
- [**trial-user-readiness-backlog (17/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-17-trial-user-readiness-backlog.md): Chuẩn Bị Toàn Diện Cho Trial User (Branding, Bulk Beta Onboarding, Node Tools Tinh Gọn).
- [**investigate-pipeline-realtime-tracking-desync (16/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-16-investigate-pipeline-realtime-tracking-desync.md): Khắc Phục Triệt Để Luồng Đồng Bộ Tiến Độ Pipeline Real-time (Web Canvas <-> SignalR <-> RabbitMQ <-> Runner).
- [**batch-cross-storage-asset-migration (13/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-13-batch-cross-storage-asset-migration.md): Di Chuyển Dữ Liệu Lưu Trữ Hàng Loạt (Piped Streaming Zero-Disk Buffer, Deduplication SHA-256).
- [**deploy-hardening-runner-security-storage-bundle (12/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-12-deploy-hardening-runner-security-storage-bundle.md): Bảo Mật Dynamic RabbitMQ Runner, Độc Lập Storage Profile Import/Export Bundle.
- [**phase-3-3-publish-pipeline-e2e (12/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-12-phase-3-3-publish-pipeline-e2e.md): Luồng Publish End-to-End từ Web <-> API <-> Runner Daemon, Streaming Upload S3/MinIO.
- [**refactor-resource-lifecycle-draft-publish (11/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-11-refactor-resource-lifecycle-draft-publish.md): Tái Cấu Trúc Vòng Đời Resource (Draft vs Publish In-place), Smart Collaborative Lock & Studio Storage Profile.
- [**fix-pipeline-import-export-and-exec-edges (09/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-09-fix-pipeline-import-export-and-exec-edges.md): Hoàn Thiện Import/Export Custom Node Library & Khắc Phục Lỗi Nối Dây Exec trên Canvas.
- [**pipeline-soft-delete-archive (08/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-08-pipeline-soft-delete-archive.md): Soft Delete (Archive), Partial Unique Index Chống Trùng Tên Trong Đống Active.
- [**pipeline-export-import-bundle (08/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-08-pipeline-export-import-bundle.md): Xuất Nhập Pipeline Dạng Unified Package Bundle Hỗ Trợ Batch, Đệ Quy SubPipeline.
- [**pipeline-file-draft-sync (08/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-08-pipeline-file-draft-sync.md): Đồng Bộ File Parameter Trong Cấu Hình Node của Pipeline Canvas.
- [**unreal-batch-first-refactor (06/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/unreal-batch-first-refactor.md): Tái Cấu Trúc Unreal Engine Subprocess Sang Cơ Chế Batch-First.
- [**deploy-readiness-batch-first (06/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-06-deploy-readiness-batch-first.md): Chuẩn Bị Triển Khai & Tối Ưu Xử Lý Hàng Loạt Batch-First.
- [**daz-to-blender-unreal-pipeline-upgrade (03/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-03-daz-to-blender-unreal-pipeline-upgrade.md): Nâng Cấp Pipeline DAZ -> Blender -> Unreal Engine (Queue Isolation, AI Tagging).
- [**refactor-repository-trigger-deprecate-platform (02/10/2026)**](file:///d:/FullStack/Automation/.agents/plans/2026-10-02-refactor-repository-trigger-deprecate-platform.md): Loại Bỏ Module Platform, Chuẩn Hóa Repository Trigger, Batch Resource List & RunnerId.

