# Kế Hoạch Kỹ Thuật: Tinh Giản & Tối Ưu Triệt Để Giao Diện Cấu Hình Runner Software

> **Mục tiêu:**
> 1. Xóa bỏ hoàn toàn các trường dữ liệu "ảo" không có tác dụng thực tế (như `Headless Execution Flags: -u -B`, `Target Version Identifier`).
> 2. Chấm dứt anti-pattern **"mỗi card 1 nút Save lẻ tẻ"**, thay bằng cơ chế **Auto-save on select** (hoặc 1 nút Save/Done duy nhất).
> 3. Tái thiết kế giao diện `RunnerSoftwareDialog` từ dạng 3 khối Card khổng lồ cuộn dọc dài ngoằng thành **3 hàng trạng thái tinh gọn (Compact Status Rows)**: Trực quan, không cần thanh cuộn dọc (no scrollbar), nhận diện phiên bản tự động từ Runner Doctor.

---

## 1. Hiện Trạng & Phân Tích Kỹ Thuật (Root Causes)

### 1.1. Trường `headlessFlags` không hề được sử dụng
- **Thực tế Frontend:** Trong [BaseExecutorCard.tsx](file:///d:/FullStack/Automation/web/src/features/runners/components/BaseExecutorCard.tsx#L501-L514), có ô input `Headless Execution Flags (Default)` hiển thị placeholder `-nullrhi -unattended -nosplash` hoặc `-u -B`.
- **Thực tế Backend & Runner:**
  - Backend C# ([ConfigureRunnerExecutor.cs](file:///d:/FullStack/Automation/api/src/Modules/Runner/Automation.Runner/Features/Runners/ConfigureRunnerExecutor.cs)) chỉ lưu JSON settings chung, không có logic xử lý cờ.
  - Native Rust Runner ([dispatcher.rs:L173-L199](file:///d:/FullStack/Automation/runner/src/core/dispatcher.rs#L173-L199)) **hardcode toàn bộ các cờ headless bắt buộc**:
    - Blender: Bắt buộc `-b --python <script> -- --pipe ...` để chạy nền. Nếu user đổi hoặc bỏ `-b`, Blender sẽ pop-up GUI và treo cả pipeline.
    - Unreal Engine: Bắt buộc `-run=ExecutePythonScript -script=... -nullrhi -unattended -nosplash`.
    - Python: Tự động inject biến môi trường `PYTHONUNBUFFERED=1`.
- **Kết luận:** Ô nhập này 100% là "hàng trưng bày", gây nhiễu nhận thức của người dùng.

### 1.2. Trùng lặp thông tin (Data Redundancy)
- Trên mỗi card hiện tại có:
  1. Hàng trên: Input text `Executable Binary Path` + Nút `Browse` + Nút `Copy`.
  2. Hàng dưới: `Discovered Installations (1)` radio item hiển thị lại chính xác đường dẫn đó kèm badge `Active`.
- Người dùng không hiểu sự khác nhau giữa việc chọn radio ở dưới và gõ đường dẫn ở trên.

### 1.3. Anti-pattern phân mảnh thao tác (Per-card Save Configuration)
- Có 3 tools (`Python`, `Blender`, `Unreal Engine`). Nếu người dùng đổi đường dẫn Blender rồi qua Unreal đổi tiếp, họ phải nhớ click **Save Configuration** ở từng Card riêng biệt.
- Ở chân Dialog lại có nút `Done` và `Re-scan Machine`, gây hiểu nhầm về luồng dữ liệu (bấm Done có lưu không hay bị mất thay đổi?).

---

## 2. Thiết Kế Mới: Compact Status Rows (Mental Model)

### 2.1. Triết Lý Thiết Kế
- **Zero-Configuration by Default:** Runner Doctor khi khởi động đã tự quét và biết máy có Blender/UE5/Python nào. Hộp thoại chỉ đóng vai trò là nơi **xác nhận trạng thái (Status Overview)** và cho phép đổi nhanh nếu máy cài nhiều phiên bản.
- **Vừa vặn không scroll (Zero-Scroll Modal):** Kích thước `max-w-xl`, chiều cao ~400px, toàn bộ 3 công cụ hiển thị trọn vẹn trong 1 màn hình.
- **Auto-save on Select:** Khi người dùng chọn phiên bản khác từ danh sách phát hiện hoặc chọn đường dẫn mới qua file picker, hệ thống tự động lưu và hiện nhẹ toast/badge xanh `✓ Synced`.

### 2.2. Bố Cục Giao Diện Mới

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Runner Environment & Software — DESKTOP-DNN7HQ6           [3/3 Ready] ✕│
│ Detected 3D engines and automation runtimes on this workstation.       │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [BLENDER 3D]                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🟧 Blender 5.2.0 LTS (Default)              [Change Path]  ● Ready│  │
│  │    D:\Games\Blender\blender.exe                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [UNREAL ENGINE]                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ⚡ Unreal Engine 5.8 (Detected)             [Change Path]  ● Ready│  │
│  │    C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\...        │  │
│  │    ↳ 📁 2 Projects Mapped                   [Manage Projects]    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  [PYTHON RUNTIME]                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🐍 Python 3.13.7 (System Default)          [Change Path]  ● Ready│  │
│  │    C:\Users\congt\AppData\Local\Programs\Python\Python313\...    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ 🔄 Re-scan Machine                                              [Done] │
└────────────────────────────────────────────────────────────────────────┘
```

#### Các thành phần chính trong mỗi hàng (Executor Row):
1. **Icon & Tên phần mềm:** Logo nhận diện thương hiệu rõ ràng (Blender cam, Unreal đen/vàng, Python xanh/vàng).
2. **Phiên bản hoạt động:** Badge phiên bản nổi bật (`5.2.0 LTS`, `UE 5.8`). Nếu quét được nhiều phiên bản trên máy, hiển thị **Dropdown Menu** chọn nhanh giữa các phiên bản.
3. **Đường dẫn rút gọn:** Đường dẫn thư mục/file thực thi thu gọn, có tooltip khi hover xem full path.
4. **Trạng thái:** Badge xanh lá `● Ready` hoặc màu xám `Not Detected`.
5. **Nút `Change Path`:** Mở `RemoteFileBrowserDialog` để trỏ tay sang thư mục khác nếu muốn.
6. **Riêng Unreal Engine (Extension):** Dòng nhỏ hiển thị số lượng `.uproject` đã map kèm nút popover `Manage Projects` mà không làm phình to card.

---

## 3. Các Giai Đoạn Triển Khai (Phases)

### Phase 1: Dọn Dẹp Code & Loại Bỏ Tham Số Ảo
- [x] **1.1. Xóa `headlessFlags` & `Target Version Identifier`:**
  - Dọn sạch các state và ô input trong `BaseExecutorCard.tsx` và xóa bỏ file cũ.
  - Giữ lại `settings.registeredProjects` riêng cho Unreal Engine.
- [x] **1.2. Thống nhất luồng dữ liệu:**
  - Khi user chọn bản cài đặt từ danh sách quét (`candidates`), tự động gán cả `executablePath` và `version` vào config payload gửi lên API `useConfigureRunnerExecutor`.

---

### Phase 2: Xây Dựng Component `CompactExecutorRow.tsx`
- [x] **2.1. Thiết kế component `CompactExecutorRow`:**
  - Props: `executorKey`, `name`, `icon`, `candidates`, `activeConfig`, `onSaveConfig`, `onBrowsePath`.
  - Hiển thị dạng thẻ bo tròn mỏng (Card row 70-80px):
    - Khi có nhiều candidates: Dropdown `<Select>` cho phép chuyển phiên bản tức thì.
    - Khi chỉ có 1 candidate: Hiển thị badge phiên bản và đường dẫn.
    - Nút Browse / Edit đường dẫn.
    - Badge trạng thái `Ready` (xanh) / `Missing` (vàng cảnh báo kèm nút Scan).
- [x] **2.2. Tích hợp Unreal Project Mapping:**
  - Tách `UnrealExecutorExtension` thành dạng Collapsible nhỏ gọn hoặc Popover/Sub-dialog `Manage Unreal Projects`, không chèn ép không gian hàng chính.

---

### Phase 3: Cập Nhật `RunnerSoftwareDialog.tsx` & Auto-Save
- [x] **3.1. Loại bỏ các nút "Save Configuration" phân mảnh:**
  - Gọi mutation `useConfigureRunnerExecutor` ngay khi người dùng:
    - Chọn một candidate khác từ Dropdown.
    - Hoặc chọn file mới từ `RemoteFileBrowserDialog`.
  - Hiển thị toast nhẹ hoặc hiệu ứng spinner nhỏ tại hàng vừa đổi: *"Blender path updated to 5.2.0"*.
- [x] **3.2. Cân chỉnh kích thước Modal:**
  - Giảm kích thước xuống `max-w-xl`, loại bỏ scrollbar.
  - Header: Thêm badge tổng quan `[3/3 Configured]` hoặc `[2/3 Detected]`.
  - Footer: Giữ nút `Re-scan Machine` (bên trái) và nút `Done` (bên phải).

---

## 4. Kế Hoạch Kiểm Thử & Nghiệm Thu (Verification)

1. **Kiểm thử trực quan (Visual & Ergonomics):**
   - Mở modal `Runner Settings` trên màn hình 1080p -> Xác nhận không xuất hiện thanh cuộn dọc.
   - Toàn bộ 3 công cụ (Python, Blender, Unreal) hiển thị rõ ràng, gọn mắt trong một khung hình duy nhất.
2. **Kiểm thử chuyển đổi phiên bản (Auto-save):**
   - Đổi đường dẫn Blender hoặc chọn candidate khác -> Xác nhận API `POST /api/runners/{id}/executors` được gọi ngay, toast thông báo thành công và badge trạng thái giữ màu xanh `Ready`.
3. **Kiểm thử kiểm tra thực thi (Pipeline Execution):**
   - Kích hoạt chạy một pipeline có Blender node -> Xác nhận Rust Runner nhận đúng đường dẫn đã chọn và thực thi bình thường.
