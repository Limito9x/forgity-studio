# Sổ Bộ Tồn Đọng & Định Hướng Kỹ Thuật (Engineering Backlog)

Chào mừng đến với **Sổ Bộ Backlog** của dự án **Automation Studio**. 

---

## 1. Triết Lý & Quy Trình Vận Hành Backlog

- **Mục đích**: Ghi nhận toàn bộ các vấn đề kỹ thuật phát hiện trong quá trình làm việc, nợ kỹ thuật (technical debt), và các ý tưởng/định hướng tương lai được thảo luận nhưng **chưa thực hiện ngay trong Sprint hiện tại** nhằm tránh phình phạm vi (Scope Creep).
- **Quy tắc chuyển dịch trạng thái**:
  - `Pending`: Mới ghi nhận, chờ xếp lịch ưu tiên.
  - `In Progress`: Đã được đưa vào Kế hoạch Kỹ thuật Active và đang triển khai code.
  - `Resolved`: Đã hoàn thành, qua kiểm thử tự động và nghiệm thu.
  - `Deferred`: Tạm hoãn lại chờ điều kiện tiên quyết khác hoặc đánh giá lại tính cần thiết.

---

## 2. Bảng Danh Mục Backlog Kỹ Thuật

| Mã | Ngày đề xuất | Tiêu đề & Phạm vi | Nguyên nhân & Bối cảnh | Hướng khắc phục dự kiến | Tài liệu liên quan | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BL-001** | 2026-10-23 | **Canvas & Inspector Diagnostics UI (Phase 2C / R3 UI)**<br/>*(Frontend Canvas)* | Backend đã có `IPipelineContractValidator` và danh sách `Diagnostics` (Error/Warning), nhưng giao diện Canvas chưa hiển thị trực quan mà người dùng chỉ thấy khi bấm Run bị lỗi 422. | - Render huy hiệu (Badge/Icon cảnh báo vàng / lỗi đỏ) trực tiếp trên Header của Node và từng Chân Pin bị lỗi.<br/>- Bổ sung tab/danh sách Diagnostics trong Inspector hoặc Pre-run Drawer để người dùng bấm vào là focus tới node lỗi. | - [plans/2026-10-23-contracts-validation](file:///d:/FullStack/Automation/.agents/plans/2026-10-23-contracts-validation-buildtime-runtime-architecture.md)<br/>- [plans/2026-10-22-node-lifecycle](file:///d:/FullStack/Automation/.agents/plans/2026-10-22-node-resolution-and-validation-lifecycle.md) (Mục R3)<br/>- [ADR-005](file:///d:/FullStack/Automation/docs/adr/ADR-005-transient-graph-ingestion-and-structural-gate.md) | `Pending` *(Kế tiếp)* |
| **BL-002** | 2026-10-23 | **Tái Cấu Trúc Vật Lý Thư Mục Backend 3 Phân Khu (Phase 3)**<br/>*(Backend `Automation.Pipeline`)* | Các file trong `Engine/` và `Features/Pipelines/` hiện đang nằm phẳng hoặc phân nhóm cũ, trộn lẫn giữa Contracts, Build-Time authoring và Runtime state/orchestrator. | Di chuyển các file vật lý vào đúng 3 phân khu chuẩn (`Contracts/`, `BuildTime/`, `Runtime/`) theo bản đồ đối chiếu mục 3 của kế hoạch ngày 23/10, cập nhật namespaces tương ứng. | - [plans/2026-10-23-contracts-validation](file:///d:/FullStack/Automation/.agents/plans/2026-10-23-contracts-validation-buildtime-runtime-architecture.md)<br/>- [ADR-004](file:///d:/FullStack/Automation/docs/adr/ADR-004-unified-node-contract-resolver.md) | `Pending` |
| **BL-003** | 2026-10-22 | **Field Adapter Registry & Dọn Dẹp Form Controls (Phase C / 6.3)**<br/>*(Frontend Inspector)* | `pinToFieldDefinition.ts` và `EntityPinSelect.tsx` còn chứa một số logic phỏng đoán chuỗi (`idLower.includes(...)`), chưa tận dụng 100% `StructType` chuẩn PascalCase từ Backend Contracts. | - Xây dựng hệ thống Adapters (`entityAdapter`, `collectionAdapter`, `assetAdapter`, `primitiveAdapter`).<br/>- Tách nhỏ `ResourceWorkstationSelect.tsx` (bộ chọn 2 bước).<br/>- Xóa bỏ hoàn toàn mảng `PIN_RULES` phỏng đoán. | - [plans/2026-10-22-node-strategy-and-field-adapters](file:///d:/FullStack/Automation/.agents/plans/2026-10-22-node-strategy-and-field-adapters.md)<br/>- [docs/frontend/patterns/pipelines_canvas.md](file:///d:/FullStack/Automation/docs/frontend/patterns/pipelines_canvas.md) | `Pending` |
| **BL-004** | 2026-10-22 | **Tái Cấu Trúc `PipelineParametersPanel.tsx` (Backlog 6.6)**<br/>*(Frontend Parameters Panel)* | File `PipelineParametersPanel.tsx` dài hơn 1000 dòng, vi phạm Single Responsibility (ôm trọn Drawer, Tabs, CRUD Form, Drag-to-spawn capsule và switch-case render type). | - Chia nhỏ thành 4 components độc lập: `ParameterList.tsx`, `ParameterRowItem.tsx`, `ParameterEditorModal.tsx`, và container mỏng `PipelineParametersPanel.tsx` (~120 dòng).<br/>- Tái sử dụng `FormRenderer` cho trường `defaultValue`. | - [plans/2026-10-22-node-strategy-and-field-adapters](file:///d:/FullStack/Automation/.agents/plans/2026-10-22-node-strategy-and-field-adapters.md) (Mục 4) | `Pending` |
| **BL-005** | 2026-10-24 | **Trải Nghiệm Xử Lý File Unbound Sau Import Package**<br/>*(Frontend Canvas & Files)* | Khi import một gói bundle từ bên ngoài mà file đính kèm không có sẵn trên máy đích, pin được đánh dấu `status: unbound`. Hiện người dùng chưa có nút thao tác nhanh để tải file bù vào ngay trên node. | Hiển thị nút "Upload missing file" hoặc "Browse replacement" trực tiếp trên Pin hoặc trong Inspector của Node có pin Unbound, sau khi upload tự động liên kết thành `assetLinkId`. | - [playbooks/pipeline-canvas-sync.md](file:///d:/FullStack/Automation/.agents/playbooks/pipeline-canvas-sync.md)<br/>- [ADR-003](file:///d:/FullStack/Automation/docs/adr/ADR-003-cas-deduplication-and-zero-byte-linking.md) | `Pending` |

---

## 3. Quy Định Thêm Mới Vào Backlog

Mỗi khi phát hiện một vấn đề cần cải tiến hoặc một ý tưởng mới trong quá trình trao đổi:
1. Thêm một hàng mới vào bảng trên với mã định danh tăng dần (`BL-006`, `BL-007`...).
2. Ghi rõ ngày đề xuất, bối cảnh/nguyên nhân thực tế, ý tưởng giải pháp và đường dẫn các file/tài liệu liên quan.
3. Không tự ý thực hiện code cho các hạng mục `Pending` khi chưa có sự thống nhất và phê duyệt kế hoạch triển khai cụ thể từ người dùng.

