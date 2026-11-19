# BL-059: Trang Tài Liệu VitePress (Unreal Project Template & Forgity Studio Guide)

- **Trạng thái:** `Pending` (Tạm ghi nhận để triển khai sau khi hoàn thiện bản phát hành)
- **Ngày tạo:** 2026-11-19
- **Công cụ dự kiến:** **VitePress** (deploy tĩnh miễn phí lên Cloudflare Pages / GitHub Pages; ảnh/GIF nhẹ lưu tại `public/images/`, video dài nhúng YouTube/R2).

---

## 1. Chiến Lược Nội Dung (2 Ngách Rõ Ràng)
Đặt **Unreal Project Template** làm trọng tâm nổi bật ngay trang chủ (thứ người dùng quan tâm và tìm kiếm nhất), song song với ngách **Forgity Studio** dành cho người muốn tìm hiểu sâu cách vận hành và tùy biến pipeline.

---

## 2. Cấu Trúc Dự Kiến

### Ngách 1: Unreal Project Template *(Ưu tiên hàng đầu)*
1. **Yêu cầu & Tương thích:**
   - Hỗ trợ **Unreal Engine 5.4+**.
2. **Hệ thống Modular Wardrobe (Plug & Play):**
   - Kiến trúc xoay quanh **Data Asset (`PDA`)** kết hợp định danh bằng **Gameplay Tag** giúp lắp ghép / thay đổi trang phục linh hoạt.
3. **Hệ thống Material (Substrate):**
   - Bộ Material dựng sẵn sử dụng **Substrate**.
   - Lưu ý cấu hình bắt buộc: với **UE 5.4 → 5.7**, cần đảm bảo đã bật **Substrate** trong Project Settings.
4. **Animation & Player Blueprint (Live Retargeting):**
   - Player Blueprint sử dụng mô hình **Live Retargeting** để ăn khớp chính xác với Mannequin.
   - Giải thích lý do kỹ thuật: tránh bake/áp dụng RTG trước rồi tạo ABP riêng cho từng nhân vật vì rất dễ phát sinh lỗi khi đổi nhân vật.

### Ngách 2: Forgity Studio *(Hướng dẫn công cụ & Concept)*
1. **Tổng quan (Overview):** Mô tả ngắn gọn Forgity Studio làm gì (Local-First 3D Automation).
2. **Thiết lập môi trường (`My Machine`):** Cấu hình đường dẫn DCC (Blender, Unreal Engine, Python) và biến môi trường cục bộ.
3. **Quản lý `Workspace`:**
   - Mô hình thư mục Workspace gồm `pipeline-scripts/` và `pipelines/`.
   - Luồng chuẩn: **Sync Scripts** → cấu hình **Constants**.
4. **Pipeline Component:** Khái niệm và cách dựng Component Pipe gắn với 1 DCC cụ thể.
5. **Master Pipeline:** Cách lắp ghép, điều phối tuần tự (**Sequence**), điểm hội tụ (**Joint**), và chạy hàng loạt (**Batch Component**).
6. **Cloud Templates & Fork:** Cách duyệt Catalog, thêm vào Library, và **Fork** template về Workspace để tùy biến.

---

## 3. Các Phase Triển Khai (Khi Bắt Đầu)
- **Phase 1:** Khởi tạo `docs-site/` với VitePress (config sidebar 2 ngách, local search, Mermaid diagram).
- **Phase 2:** Viết đầy đủ nội dung Ngách 1 (**Unreal Project Template**) kèm ảnh chụp màn hình / sơ đồ.
- **Phase 3:** Viết đầy đủ nội dung Ngách 2 (**Forgity Studio**) kèm hướng dẫn từng bước.
- **Phase 4:** Cấu hình deploy tự động (Cloudflare Pages / GitHub Pages).
