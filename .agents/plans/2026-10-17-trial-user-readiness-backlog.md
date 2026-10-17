# Kế Hoạch Kỹ Thuật: Rà Soát & Tinh Chỉnh Hệ Thống Chuẩn Bị Đón Trial Users

> **Trạng thái:** DRAFT / PROPOSED  
> **Ngày lập:** 2026-10-17  
> **Mục tiêu:** Rà soát toàn diện hệ thống, loại bỏ các chi tiết thừa thãi/mơ hồ, hoàn thiện nhận diện thương hiệu Forgity Studio, tinh chỉnh trải nghiệm giao diện người dùng (Canvas, Repository, Login, Storage) và chuẩn bị chiến lược Landing Page đón người dùng thử nghiệm (Trial Users).

---

## 1. Tổng Quan & Phân Kỳ Ưu Tiên (Priority Breakdown)

Backlog được chia thành 4 nhóm công việc logic theo thứ tự ưu tiên:

| Nhóm | Tên nhóm công việc | Mức độ ưu tiên | Mục tiêu cốt lõi |
| :--- | :--- | :--- | :--- |
| **Nhóm 1** | **Branding, Layout & Beta Onboarding** | **P0 (Bắt buộc)** | Xóa bỏ tên cũ (Automation Studio/Acme), gom gọn Switcher, tối ưu thẻ Storage, nút Support Creem.io và bộ công cụ Bulk Invite Beta Testers. |
| **Nhóm 2** | **Pipeline Canvas & Node Tooling** | **P0 (Bắt buộc)** | Sàng lọc tool thừa/phức tạp (ForEach), bổ sung description/tooltip, chia 2 tab Node Library và thêm loading state cho input. |
| **Nhóm 3** | **Repository & Resource Experience** | **P1 (Quan trọng)** | Sửa logic hiển thị version, thêm icon nhận diện định dạng file 3D (.blend, .fbx, .uasset), làm gọn dialog Tag Map. |
| **Nhóm 4** | **Landing Page & Growth Strategy** | **P2 (Chiến lược)** | Xây dựng công thức Landing Page cuộn động đón Trial Users và nút kêu gọi Donate/Support. |

---

## 2. Chi Tiết Các Hạng Mục Công Việc

### Nhóm 1: Nhận Diện Thương Hiệu & Bố Cục Toàn Cục (Branding & Global Layout)

#### Task 1.1: Đồng bộ thương hiệu Forgity Studio trong Runner Scripts
- [x] Rà soát và thay thế toàn bộ chuỗi hardcoded `"Automation Studio"` trong runner scripts thành `Forgity Studio` (hoặc cấu hình động `appName`).
  - `workers/commands/register.py`
  - `workers/cli.py`
  - `workers/scripts/install.ps1` và `workers/scripts/install.sh`
  - `workers/tools/package_release.py`

#### Task 1.2: Gom gọn Studio Switcher & User Nav trên Sidebar
- [x] Tách bạch rõ ràng vai trò giữa Header Sidebar và User Nav:
  - **Header Sidebar (`StudioSwitcher.tsx`):** Nơi DUY NHẤT để chọn/chuyển Studio và tạo Studio mới (`Create Studio`).
  - **User Nav (`NavUser.tsx`):** Loại bỏ hoàn toàn danh sách Studios và `Create Studio...`. Chỉ giữ lại các menu cá nhân của User: Profile, Cài đặt tài khoản, Giao diện (Theme), Đăng xuất (Sign out).

#### Task 1.3: Chuẩn hóa Layout Thẻ Studio Storage Profile
- [x] Tối ưu layout trang `StorageProfilesView.tsx`:
  - Đặt giới hạn `max-w-5xl` hoặc cấu hình Grid 2 cột cân xứng.
  - Khi mới chỉ có 1 Storage Profile: Hiển thị thêm 1 ô thẻ gợi ý "Connect Additional S3 Storage" (dạng dashed border outline) ở cột bên cạnh để layout không bị trống trải.

#### Task 1.4: Tinh chỉnh Trang Đăng Nhập (Login Page) Thân Thiện Trial User
- [x] Cập nhật `LoginForm.tsx` & `LoginPage.tsx`:
  - Thay thế thương hiệu `Acme Inc.` bằng `Forgity Studio`.
  - Ẩn các nút Social OAuth (Google, GitHub, Microsoft) và nút "Sign up" công khai.
  - Thay thế ảnh poster bằng hình đồ họa 3D Forgity Studio.
  - Bổ sung liên kết dẫn tới form khảo sát: *"Don't have an account? Request Trial Access"*.

#### Task 1.5: Thêm nút "Support Me / Coffee" tại Header & Tích hợp Creem.io
- [x] Bổ sung nút icon nhỏ (Cốc cà phê / Trái tim) tại `AppHeader.tsx`.
- [x] Khi nhấp: Mở modal popup hiển thị lời cảm ơn chân thành từ Founder và các phương thức ủng hộ:
  - **Quốc tế:** Liên kết trang ủng hộ qua **Creem.io** (hỗ trợ tùy chọn mức đóng góp linh hoạt).
  - **Nội địa:** Mã QR MoMo / VietQR.
- [x] **Khả năng mở rộng:** Creem.io đóng vai trò Merchant of Record (xử lý thuế và thanh toán quốc tế), sẵn sàng kiến trúc Webhook để tích hợp các gói tài khoản trong tương lai khi cần.

#### Task 1.6: Chuẩn Hóa Email Hệ Thống & Bộ Công Cụ Mời Beta Tester Hàng Loạt (Bulk Onboarding)
- [x] **Xóa bỏ tên cũ trong Email Sender:**
  - Sửa `MailKitEmailSender.cs:L30`: Thay thế chuỗi hardcoded `"ModularTemplateSystem"` thành `"Forgity Studio"` (hoặc `_config["Smtp:FromName"] ?? "Forgity Studio"`).
- [x] **Xây dựng Responsive HTML Email Template:**
  - Thiết kế template email HTML giao diện Forgity Studio sang trọng (Dark-mode responsive, logo header, nút CTA kích hoạt tài khoản `[ Set Password & Activate ]`).
  - Hỗ trợ biến động: Tên người nhận, Lời nhắn tùy biến của Founder, Link kích hoạt token, Link tài liệu Runner và Link nhóm hỗ trợ kín (Discord/Telegram).
- [x] **Giao diện Admin: "Invite Beta Testers" Dialog:**
  - Thiết kế Dialog trong trang Users/Admin:
    - **Ô nhập danh sách email (Textarea):** Cho phép paste hàng loạt email từ Google Sheet ứng viên (hỗ trợ phân tách bằng dấu phẩy, khoảng trắng hoặc xuống dòng).
    - **Ô lời nhắn cá nhân (Personalized Note):** Cho phép Founder gõ lời dặn dò, hướng dẫn test và đính kèm link Discord.
  - Backend: Endpoint xử lý batch tạo User, gán role Tester, sinh invite token và đẩy `SendEmailCommand` bất đồng bộ qua Wolverine.

---

### Nhóm 2: Tối Ưu Pipeline Canvas & Hệ Thống Node Tools

#### Task 2.1: Sàng lọc & Tinh gọn Node Tools (Thay thế ForEach phức tạp)
- [ ] Rà soát danh sách các tool trong C# Backend:
  - Đánh giá lại tool `ForEach`: Đánh dấu `[Deprecated]` hoặc đưa vào nhóm Advanced.
  - Bổ sung các node xử lý mảng trực tiếp (Batch-First), ví dụ node **`Extract Resource Paths`** (Input: `Resource[]`, Output: `string[] FilePaths`) giải quyết trọn vẹn bài toán trích xuất danh sách file mà không cần dựng vòng lặp DAG phức tạp.

#### Task 2.2: Bổ sung Description & Tooltips Đầy Đủ Cho Node Tools
- [ ] Khai báo thuộc tính `Description` cho toàn bộ các C# Tools (`BaseResolverTool`) và Script Node templates.
- [ ] Hiển thị mô tả trực quan trên Node Inspector, Palette menu chuột phải và Drawer Documentation của Canvas.

#### Task 2.3: Phân chia 2 Tab Riêng Biệt Cho Node Library
- [ ] Tái cấu trúc trang `NodeLibraryPage`:
  - **Tab 1: Built-in Core Tools:** Các node C# hệ thống (Math, String, Array, Logic, DCC wrappers).
  - **Tab 2: Custom Script Library:** Các Node Python script do studio tải lên hoặc chia sẻ.

#### Task 2.4: Bổ sung Loading State cho Form Inputs (Trigger Pipeline & Parameters)
- [ ] Cập nhật `RunPipelineModal.tsx` và `ParameterInput.tsx`:
  - Bổ sung trạng thái `isLoading` / `isFetching`: hiển thị Skeleton hoặc Spinner `Loader2` trong ô input khi đang tải danh sách Repositories, Runners hoặc Variables.
  - Vô hiệu hóa tạm thời ô input kèm placeholder: *"Loading available options..."*.

---

### Nhóm 3: Dữ Liệu Tài Nguyên & Giao Diện Repository (Repository Experience)

#### Task 3.1: Rà soát & Sửa Logic Hiển Thị Version Number tại Repository / Resource
- [ ] Sửa logic lấy version mới nhất trong `ResourceDetailPage.tsx`:
  - Sắp xếp mảng versions giảm dần theo `versionNo` để `versions[0]` luôn là phiên bản mới nhất, tránh trường hợp nhầm lẫn lấy phải v1 ban đầu.
  - Đảm bảo badge phiên bản ở tiêu đề phản ánh đúng phiên bản cao nhất hiện có.

#### Task 3.2: Icon Phân Loại Resource Dựa Vào File Extension (`.blend`, `.fbx`, `.uasset`...)
- [ ] Tạo bộ icon nhận diện định dạng file tại `web/src/assets/icons/file-types/`.
- [ ] Viết component `<FileTypeIcon extension={ext} />`:
  - `.blend` ➔ Icon Blender
  - `.uproject`, `.uasset` ➔ Icon Unreal Engine
  - `.fbx`, `.obj` ➔ Icon 3D Mesh
  - `.png`, `.jpg`, `.exr`, `.tga` ➔ Icon Texture/Image
  - `.duf` ➔ Icon DAZ Studio
  - Khác ➔ Icon File mặc định
- [ ] Áp dụng vào bảng Resource list, Tag Panel và Drawer Step Logs.

#### Task 3.3: Tinh Chỉnh Dialog Preview Tag Map (Gọn gàng, bám sát Node Tool)
- [ ] Thiết kế lại `SimulateTagMapDialog.tsx` theo dạng Visual Slot Mapping:
  - Cột 1: Tags nguồn (Badges).
  - Cột 2: Trạng thái liên kết mũi tên (`Mapped` xanh lá / `Unmapped` xám).
  - Cột 3: Tên Pin / Tham số đầu vào tương ứng trên DCC Node Tool.
  - Bổ sung thanh tìm kiếm nhanh và bộ lọc tag thiếu slot.

---

### Nhóm 4: Chiến Lược Xây Dựng Landing Page & Quản Trị Trial Users (Growth Strategy)

#### Task 4.1: Định Vị Thương Hiệu & Thông Điệp Cốt Lõi (Value Proposition)
1. **Thông điệp cốt lõi (Tagline & Positioning):**
   - *Định vị:* DAZ ➔ UE5 là Flagship Showcase để thu hút sự chú ý trên Reddit/forums. Bản chất sản phẩm là **Visual Automation Engine cho toàn bộ luồng 3D Pipeline**.
   - *Hero Headline:* **"Craft your 3D workflow once. Automate forever with visual pipelines."**  
     *(Thiết lập quy trình 3D một lần. Tự động hóa mãi mãi với đồ thị trực quan.)*
   - *Sub-headline:* *"Turn tedious multi-DCC manual steps into one-click visual pipelines. Forgity Studio seamlessly connects Blender, Unreal Engine, DAZ, and Substance into unified background automation pipelines without boilerplate glue code."*
2. **Quy trình Tuyển chọn & Đón tiếp Trial Cohort 1:**
   - **Kênh tuyển dụng:** Đăng bài chia sẻ video demo trên Reddit (`r/unrealengine`, `r/blender`), Blender Artists, Facebook Groups.
   - **Google Form sàng lọc:** Thu thập Email, Tên, Cấu hình máy (GPU/RAM), Bộ phần mềm DCC sử dụng, và Nỗi đau thủ công họ muốn tự động hóa.
   - **Onboarding:** Founder lọc ra 15–30 ứng viên xuất sắc nhất, paste email vào tính năng **Bulk Invite** (Task 1.6) để gửi thư mời kích hoạt tự động kèm link Discord hỗ trợ 1-1.
3. **Hình ảnh & Video Demo (Visual Proof):**
   - 1 Video ngắn 15–30s quay trực tiếp màn hình Live Tracking rực rỡ (các node sáng vàng/xanh kèm drawer logs chạy thời gian thực).
   - Bento Grid 4 tính năng nổi bật: Headless Subprocess Runner, Zero-DB Real-time Tracking, Zero-Byte S3 Storage Sync, AST Dynamic Script Ingestion.

#### Task 4.2: Công Thức & Kỹ Thuật Thiết Kế Landing Page Cuộn Động (Scroll-Driven Animation)
- **Công thức hiệu ứng:**
  - **Sticky Canvas Preview:** Khung mô phỏng Canvas được cố định ở trung tâm (`sticky top-0 h-screen`); khi cuộn chuột, các tính năng bên cạnh trượt lên và Canvas tự động đổi trạng thái (từ Draft ➔ Live Tracking ➔ Succeeded).
  - **Bento Grid:** Bố cục các ô tính năng bo tròn viền kính (Glassmorphism), viền sáng neon khi di chuột.
- **Kỹ thuật khuyến nghị:**
  - Áp dụng skill `ui-ux-pro-max` của dự án.
  - Sử dụng `Framer Motion` kết hợp `Lenis Smooth Scroll` để đạt độ mượt mà cao nhất.

---

## 3. Bảng Theo Dõi Các Điểm Placeholder Cần Người Dùng Bổ Sung (Pending User Assets & Config Checklist)

> **Quy ước Workflow:** Mọi điểm cần dữ liệu cá nhân của người dùng sẽ được khởi tạo dưới dạng **Mock / Placeholder chuẩn giao diện** (chạy mượt mà, không bao giờ lỗi runtime). Người dùng chỉ cần tra cứu bảng dưới đây để thay thế link hoặc ảnh thật khi đã chuẩn bị xong.

| Hạng mục Placeholder | Vị trí File Code / Biến Cấu Hình | Trạng thái Tạm thời (Fallback) | Cách người dùng thay thế khi sẵn sàng |
| :--- | :--- | :--- | :--- |
| **Link Thanh Toán Creem.io** | Biến `VITE_CREEM_CHECKOUT_URL` trong `web/.env` | Mở link mẫu: `https://creem.io` | Điền link trang Checkout/Tip của bạn sau khi đăng ký Creem.io |
| **Link Google Form Tuyển Tester** | Biến `VITE_TRIAL_REQUEST_FORM_URL` trong `web/.env` | Mở link form Google mẫu | Điền URL link Google Form tuyển chọn Cohort 1 của bạn |
| **Link Kênh Hỗ Trợ Kín (Discord/Telegram)** | Biến `VITE_DISCORD_COMMUNITY_URL` trong `web/.env` | Trỏ `#` hoặc trang liên hệ | Điền link Invite vào Discord / Group trao đổi với tester |
| **Video / Media Demo Landing Page** | `web/src/assets/video/canvas-demo.mp4` | Khung Canvas Animation tương tác (SVG Motion) | Thả video quay màn hình thực tế (MP4 / WebM) vào thư mục asset |

