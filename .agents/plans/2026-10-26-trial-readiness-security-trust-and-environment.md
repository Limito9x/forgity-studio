# Kế Hoạch Kỹ Thuật: Chuẩn Hóa Trial Readiness — Pipeline Script Trust Gate (1-Prompt AI Audit), Pre-flight Runner Check & Email Deliverability

> **Ngày lập**: 26/10/2026  
> **Mã định danh kế hoạch**: `PL-TRIAL-READINESS-01` (Gồm `BL-022`, Pre-flight Runner Gate, Email Deliverability, Isolated Dependencies)  
> **Phạm vi**: `web/` (Frontend Canvas, Dialogs, Ingestion Deck), `api/` (Backend Pipeline & Email), `workers/` (Runner DCC Runtime)  
> **Trạng thái**: `Proposed` (Sẵn sàng triển khai sáng 27/10/2026)

---

## 1. Bối Cảnh & Mục Tiêu

Để sẵn sàng 100% đón người dùng **Trial / Beta** trải nghiệm Automation Studio trên máy cá nhân/workstation đồ họa đắt tiền của họ, hệ thống cần giải quyết dứt điểm 4 rào cản tâm lý & kỹ thuật lớn nhất:

1. **Rào cản niềm tin (Security & Script Transparency - `BL-022`)**:
   - Gói bundle pipeline từ bên ngoài chứa nhiều script Python (`package.scripts`). Nếu bắt người dùng copy từng file cho AI soi thì họ sẽ bỏ cuộc vì quá phiền.
   - Cần một nút bấm duy nhất **"Copy All for AI Audit"** gom toàn bộ script vào 1 prompt chuẩn kỹ sư bảo mật để gửi cho ChatGPT/Claude/Gemini quét 1 lượt, kèm luồng **Trust Gate** minh bạch trước khi Import.
2. **Khả năng xem & tải mã nguồn từ Canvas & Ingestion Deck**:
   - Nâng cấp `ScriptCodeViewerTab.tsx` có sẵn: Thêm nút tải file `.py`, nút copy prompt AI, và thanh cờ cảnh báo rủi ro tĩnh (AST Security Flags: `subprocess`, `socket`, `os.system`, `eval`).
   - Cho phép người dùng mở xem mã nguồn của bất kỳ Script Node nào trực tiếp từ Canvas Inspector.
3. **Pre-flight Runner Readiness Check (`RunPipelineModal.tsx`)**:
   - Trước khi bấm Run, đối chiếu yêu cầu của Pipeline (Blender 4.x, Unreal 5.x, Python) với năng lực và trạng thái trực tuyến của Runner.
   - Hiển thị Checklist xanh/đỏ rõ ràng, chặn đứng việc bấm chạy mù quáng rồi bị treo ở `WaitingForRunner`.
4. **Tỷ lệ vào Hộp thư chính (Email Deliverability Fix)**:
   - Khắc phục tình trạng email mời Beta bị đánh dấu là thư rác (Spam/Junk) do template HTML quá màu mè hoặc thiếu cấu hình SPF/DKIM/DMARC.
   - Chuyển sang mẫu thư tối giản chuẩn **"Developer-to-Developer Personal Note"** (tỷ lệ vào Inbox > 95%).
5. **Cô lập thư viện Python trong Blender / Unreal Engine (`site.addsitedir`)**:
   - Runner tự động cài đặt các dependency phát hiện từ `BL-024` vào thư mục cache riêng biệt, dùng `site.addsitedir()` nạp động vào DCC mà không làm rác hay hỏng môi trường gốc của máy user.

---

## 2. Chi Tiết Các Phân Khu Thực Thi (Phases)

### Phase 1: Pipeline Import Security & Trust Gate với 1-Click AI Multi-Script Audit Prompt (`web/src/features/pipelines/dialogs/ImportPipelineDialog.tsx`)

#### 1.1. Máy phát sinh Prompt kiểm toán bảo mật (AI Security Audit Generator)
- Xây dựng helper function `generatePipelineSecurityAuditPrompt(packageData: PipelinePackageDto): string`:
  - Lặp qua toàn bộ `packageData.scripts` (ví dụ 4 scripts).
  - Định dạng thành văn bản Markdown chuẩn quốc tế với các tiêu chí rà soát:
    - Reverse shells / Socket rò rỉ ra ngoài (`socket`, `requests`, `urllib`).
    - Lệnh xóa file nguy hiểm (`shutil.rmtree`, `os.remove`).
    - Lệnh gọi shell ngoài (`subprocess.Popen` shell=True, `os.system`, `eval`, `exec`).
    - Mã hóa che giấu payload (base64, ctypes).
  - Trả về cấu trúc rõ ràng cho từng script và yêu cầu AI đưa ra kết luận: `[✅ SAFE | ⚠️ CAUTION | 🚨 DANGEROUS]`.

#### 1.2. Nâng cấp giao diện `ImportPipelineDialog.tsx`
- **Thanh công cụ trên danh sách Bundled Custom Scripts**:
  - Nút **"📋 Copy All for AI Audit"**: Bấm 1 click copy toàn bộ prompt đã định dạng vào clipboard kèm Toast thông báo: *"Copied security audit prompt for N scripts to clipboard. Paste into ChatGPT/Claude to verify."*
  - Nút **"⬇️ Download All Scripts (.zip)"**: Cho phép tải trọn bộ script về máy để mở bằng VS Code.
- **Hành động Inspect từng Script**:
  - Mỗi hàng script có icon xem nhanh (👁️). Click vào sẽ mở một modal/drawer hiển thị mã nguồn (tái sử dụng `ScriptCodeViewerTab`).
- **Khóa Trust Gate trước khi Import**:
  - Nếu package có chứa Custom Scripts mới:
    - Bổ sung Checkbox xác nhận:  
      `[ ] I have reviewed the bundled Python scripts and trust their execution on my workstation.`
    - Nút bấm chính đổi nhãn: **"Trust & Import Pipeline(s)"** (chỉ active khi đã tích checkbox).

---

### Phase 2: Nâng Cấp `ScriptCodeViewerTab.tsx` & Xem Script Từ Canvas Node

#### 2.1. Nâng cấp [`ScriptCodeViewerTab.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/components/script-ingestion/deck-workspace/ScriptCodeViewerTab.tsx)
- Thêm nút **"Download (.py)"**: Tạo Blob tải trực tiếp file về máy.
- Thêm nút **"Copy AI Check Prompt"**: Copy prompt kiểm tra đơn lẻ dành riêng cho script đang xem.
- **AST Security & Dependencies Banner**:
  - Quét nhanh bằng Regex/AST các từ khóa nhạy cảm: `subprocess`, `os.system`, `socket`, `shutil.rmtree`, `eval`, `exec`.
  - Hiển thị thanh cảnh báo màu vàng nếu phát hiện: *"Script uses external processes or network calls. Verify author before running."*
  - Hiển thị danh sách dependencies (`dependencies: ["opencv-python", ...]`).

#### 2.2. Tích hợp nút xem mã nguồn trên Canvas
- Trong [NodeConfigInspector.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/components/canvas/NodeConfigInspector.tsx):
  - Khi node là Custom Script Node (có `customScriptKey` hoặc script payload):
  - Hiển thị nút **"View Script Source"** trong Header hoặc Input Properties.
  - Bấm vào sẽ mở Drawer hiển thị `ScriptCodeViewerTab` ngay trên Canvas mà không cần rời trang.

---

### Phase 3: Pre-flight Runner Environment Readiness Gate (`RunPipelineModal.tsx`)

- Trong [`RunPipelineModal.tsx`](file:///d:/FullStack/Automation/web/src/features/pipelines/dialogs/RunPipelineModal.tsx):
  - Quét qua danh sách các Node/Stage trong Pipeline để trích xuất danh sách **Required Executors** (`blender`, `unreal`, `python`).
  - Đối chiếu với Runner đang được chọn:
    - Runner có Online không?
    - Runner có cài đặt phần mềm đáp ứng Stage không?
  - Hiển thị khối **"Pre-flight Environment Readiness"** trực quan:
    - 🟢 Runner Online (Status: Active, Heartbeat: < 30s)
    - 🟢 Blender 4.x detected
    - 🔴/🟡 Unreal Engine 5.x missing / Runner Offline
  - Nếu thiếu điều kiện tiên quyết: Vô hiệu hóa nút **"Run Pipeline"** và hiện hướng dẫn khắc phục thay vì để đồ thị chạy và bị treo ở `WaitingForRunner`.

---

### Phase 4: Tối Ưu Hóa Email Mời Beta (Anti-Spam & Deliverability)

- **Mẫu thư "Developer-to-Developer Personal Note"**:
  - Loại bỏ hoàn toàn CSS gradient, hình ảnh dung lượng lớn, bảng màu sặc sỡ.
  - Sử dụng typography nền trắng chữ đen, font sans-serif tinh gọn (Inter/System).
  - Tỷ lệ HTML/Text < 20%.
  - Luôn gửi kèm **Multipart MIME** (`text/plain` chạy song song với `text/html`).
- **Checklist cấu hình Domain gửi (DNS Records)**:
  1. `SPF`: `v=spf1 include:... ~all`
  2. `DKIM`: CNAME bản ghi ký số từ dịch vụ gửi mail (Resend / SendGrid / Postmark).
  3. `DMARC`: `v=DMARC1; p=none; rua=mailto:...`

---

### Phase 5: Cô Lập Thư Viện Python Runner (`site.addsitedir`)

- **Cơ chế Isolated Packages Storage**:
  - Runner tạo thư mục: `%USERPROFILE%\.automation-runner\cache\python-packages\<hash_of_deps>\`.
  - Khi phát hiện script cần dependencies (`BL-024`): Runner tự động chạy `pip install --target "<cache_dir>" <packages>`.
- **Dynamic Site Injection**:
  - Khi spawn subprocess Blender hoặc Unreal:
    ```python
    import site
    site.addsitedir(r"path/to/cache_dir")
    ```
  - Tuyệt đối không can thiệp vào `site-packages` nằm trong `Program Files/Blender Foundation` của người dùng.

---

## 3. Thứ Tự Triển Khai (Execution Schedule)

| Bước | Hạng mục | Dự kiến thời gian | Phụ trách chính |
| :---: | :--- | :---: | :--- |
| **B1** | **Phase 1: Import Security & Trust Gate + 1-Click AI Multi-Script Audit Prompt** | ~40 phút | Frontend (`ImportPipelineDialog.tsx`) |
| **B2** | **Phase 2: Nâng cấp `ScriptCodeViewerTab` (Download, AI Prompt, AST Flags) & Canvas Drawer** | ~35 phút | Frontend (`ScriptCodeViewerTab.tsx`, `NodeConfigInspector.tsx`) |
| **B3** | **Phase 3: Pre-flight Runner Environment Readiness Gate** | ~35 phút | Frontend (`RunPipelineModal.tsx`) |
| **B4** | **Phase 4: Email Beta Invite Template & DNS Anti-Spam Checklist** | ~20 phút | Backend/Template |
| **B5** | **Phase 5: Runner Isolated Packages Injection (`site.addsitedir`)** | ~1 giờ | Runner / DCC Subprocess |

---

## 4. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

1. Khi kéo thả file `.pipeline.json` chứa 3 script Python vào `ImportPipelineDialog`:
   - Bấm **"Copy All for AI Audit"**: Clipboard nhận được toàn bộ prompt Markdown của cả 3 script kèm hướng dẫn kiểm toán.
   - Từng script có icon (👁️) mở modal xem code và tải về riêng lẻ.
   - Nút "Trust & Import" chỉ enable khi tích xác nhận tin cậy.
2. Tại Canvas: Bấm vào Custom Script Node có nút mở xem trực tiếp mã nguồn kèm cảnh báo bảo mật nếu có lệnh nguy hiểm.
3. Tại `RunPipelineModal`: Hiển thị rõ ràng checklist môi trường Runner, ngăn việc bấm chạy khi Runner offline.
4. Mẫu email gửi thử đạt điểm spam < 1.0 trên Mail-Tester và vào thẳng Primary Inbox của Gmail/Outlook.
5. Toàn bộ test TypeScript (`pnpm tsc`) và Backend tests (`dotnet test`) tiếp tục pass 100%.

