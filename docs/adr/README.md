# Chỉ Mục Quyết Định Kiến Trúc (Architecture Decision Records - ADR)

Chào mừng đến với sổ bộ ghi nhận các **Quyết định Kiến trúc Cốt lõi (ADR)** của dự án **Automation Studio**. 

---

## 1. Triết Lý & Vai Trò Của ADR

Khác với tài liệu mô tả cấu trúc chung (`docs/`) hay cẩm nang vận hành thực chiến (`.agents/playbooks/`):
- **docs/**: Trả lời câu hỏi **CÁI GÌ (WHAT)** — Hệ thống gồm những thành phần nào, data model ra sao.
- **playbooks/**: Trả lời câu hỏi **LÀM THẾ NÀO (HOW)** — Mental model, quy trình tác chiến khi thao tác code để tránh cạm bẫy.
- **ADR**: Trả lời câu hỏi **TẠI SAO (WHY)** — Tại sao chúng ta chọn kiến trúc này mà không chọn kiến trúc khác? Trước đó từng gặp những lỗ hổng, nỗi đau (pains) nào? Đã đánh đổi (trade-offs) điều gì?

> [!IMPORTANT]
> **Quy định bắt buộc đối với Lập trình viên và AI Agent:**
> Trước khi thực hiện bất kỳ thay đổi kiến trúc mang tính nền tảng nào, **BẮT BUỘC** phải tham khảo các ADR tương ứng dưới đây để không bao giờ "tự ý refactor" quay trở lại các ổ gà mà dự án đã từng tốn nhiều công sức để khắc phục.

---

## 2. Danh Mục Các Quyết Định Kiến Trúc

| Mã ADR | Tiêu Đề Quyết Định Kiến Trúc | Trạng Thái | Ngày Quyết Định | Tóm Tắt Nguyên Do & Quyết Sách |
| :--- | :--- | :--- | :--- | :--- |
| [**ADR-001**](file:///d:/FullStack/Automation/docs/adr/ADR-001-modular-monolith-architecture.md) | **Modular Monolith Architecture** | `Accepted` | 2026-09-01 | Phân tách module độc lập theo Bounded Context, giao tiếp qua Contracts API & Wolverine In-Process Bus, DB Schema cô lập hoàn toàn. |
| [**ADR-002**](file:///d:/FullStack/Automation/docs/adr/ADR-002-pragmatic-single-file-vsa.md) | **Pragmatic Single-File VSA & Mapster-First** | `Accepted` | 2026-09-24 | Xóa bỏ bùng nổ thư mục 4 tầng của Clean Architecture; gom Command, Validator, Endpoint, Handler vào 1 file phẳng; POCO Entity + Mapster. |
| [**ADR-003**](file:///d:/FullStack/Automation/docs/adr/ADR-003-cas-deduplication-and-zero-byte-linking.md) | **CAS Deduplication & Zero-Byte Asset Linking** | `Accepted` | 2026-10-11 | Tách rời nhị phân vật lý (Asset - SHA-256) và tham chiếu logic (AssetLink); Presigned upload 2 pha; Piped streaming 8MB chunk không tốn RAM. |
| [**ADR-004**](file:///d:/FullStack/Automation/docs/adr/ADR-004-unified-node-contract-resolver.md) | **Unified Node Contract Resolver (SSOT)** | `Accepted` | 2026-10-23 | Hợp nhất 4 nơi tự tính toán chân pin về một cổng `INodeContractResolver` duy nhất; sửa lỗi StructType; loại bỏ Type Path; O(1) runtime pin lookup. |
| [**ADR-005**](file:///d:/FullStack/Automation/docs/adr/ADR-005-transient-graph-ingestion-and-structural-gate.md) | **Transient Graph Ingestion & Preflight Validation Gates** | `Accepted` | 2026-10-24 | Dựng đồ thị in-memory qua `TransientPipelineGraphFactory`; ranh giới chặn cứng lỗi cấu trúc và cảnh báo cấu hình dạng Draft; HTTP 422 preflight run gate. |

---

## 3. Cấu Trúc Chuẩn Của Một Bản Ghi ADR

Mỗi file ADR trong thư mục này tuân thủ cấu trúc chuẩn quốc tế:
1. **Tiêu đề & Metadata**: Mã ADR, Trạng thái (`Draft` | `Proposed` | `Accepted` | `Superseded`), Ngày quyết định, Phạm vi ảnh hưởng.
2. **Bối cảnh & Lỗ hổng cũ (Context & Problem Statement)**: Nêu rõ những khó khăn, bug, hay điểm gãy mà hệ thống đã gặp phải.
3. **Các phương án đã cân nhắc (Considered Options)**: Liệt kê các giải pháp khả dĩ kèm ưu/nhược điểm.
4. **Quyết định kiến trúc (The Decision)**: Giải pháp được lựa chọn và mô hình triển khai cụ thể.
5. **Hệ quả & Đánh đổi (Consequences & Trade-offs)**: Lợi ích đạt được và các thách thức cần kiểm soát.

