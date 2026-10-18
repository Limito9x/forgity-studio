# Kế Hoạch Kỹ Thuật: Trang Quản Trị Chi Tiết Runner & Hệ Thống Attached Repositories

> **Mục tiêu:**
> 1. Xây dựng trang chi tiết máy trạm **Runner Detail Page** (`/runners/:runnerId`) theo chuẩn Studio Grade, thay thế cho modal gò bó.
> 2. Đưa cấu hình **DCC Software Engines** (Blender, Unreal Engine, Python và các công cụ mở rộng sau này) ra không gian rộng rãi, thoáng đãng: Xem trọn vẹn danh sách tất cả các bản cài đặt phát hiện được (`Discovered Versions`) và đổi Active chỉ với 1-click.
> 3. Bổ sung tính năng quản trị từ góc nhìn máy trạm: **Attached Repositories** — Xem runner đang phục vụ cho những Repository nào, thuộc Project nào, mount path tại ổ đĩa nào và quản lý Detach an toàn.
> 4. Hiển thị thông số phần cứng & giám sát hiệu năng trực quan: GPU VRAM, CPU Cores, RAM, dung lượng các ổ đĩa C, D, E.

---

## 1. Hiện Trạng & Bối Cảnh Nghiệp Vụ

### 1.1. Nhu Cầu Quản Trị Máy Trạm Toàn Diện
- **Trước đây:** Hệ thống chỉ quản lý Runner qua các thẻ tóm tắt trên `RunnerPage` và một chiếc Modal `RunnerSoftwareDialog`.
  - Khi muốn xem hoặc đổi phiên bản phần mềm, Modal bị thu hẹp khiến trải nghiệm quét và chọn phiên bản bị gò bó.
  - Người dùng không có cách nào biết chiếc máy trạm này hiện đang liên kết với những Repository hay Project nào trong Studio, trừ khi phải vào từng Repository một để tìm kiếm thủ công.
- **Sau khi nâng cấp:** Một chiếc máy trạm (Workstation / Render PC) được coi là một **Compute Resource thực thụ**:
  - Có trang chi tiết riêng `/runners/:runnerId`.
  - Có đầy đủ thông tin: DCC Runtimes, Attached Workspaces/Repositories, và Hardware Specs.

---

## 2. Kiến Trúc & Thiết Kế Giao Diện (`/runners/:runnerId`)

### 2.1. Cấu Trúc Tổng Thể

```text
┌────────────────────────────────────────────────────────────────────────┐
│ ← Back to Runners  /  DESKTOP-DNN7HQ6                     [● Online]   │
│ Physical Workstation • Windows 11 (x86_64) • Machine Key: win-dnn7hq6 │
│ [🔄 Full Rescan]  [📋 Copy Key]                       [Revoke Runner] │
├────────────────────────────────────────────────────────────────────────┤
│  [ 🎮 Software & DCC Engines ]   [ 🔗 Attached Repositories ]   [ 💻 Hardware Specs ]
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  TAB 1: SOFTWARE & DCC ENGINES                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🟧 Blender 3D                      [✓ Active: v5.2.0 LTS]       │  │
│  │    Executable: D:\Games\Blender\blender.exe        [Change Path]  │  │
│  │    Discovered Installations on Workstation:                      │  │
│  │    • v5.2.0 LTS  -  D:\Games\Blender\blender.exe      (● Active) │  │
│  │    • v4.2.0 LTS  -  C:\Program Files\Blender Foundation\...      │  │
│  │                     [Set as Active 1-Click]                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ⚡ Unreal Engine                   [✓ Active: UE 5.8]           │  │
│  │    Executable: C:\Program Files\Epic Games\UE_5.8\...            │  │
│  │    📁 Project Mapping (.uproject):                               │  │
│  │    • Sci-Fi RPG  ➔  D:\Projects\SciFi\SciFiRPG.uproject [Browse] │  │
│  │    • Tech Demo   ➔  D:\UnrealProjects\Demo.uproject     [Browse] │  │
│  │    [+ Map New Project]                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🐍 Python Runtime                  [✓ Active: v3.13.7]          │  │
│  │    Executable: C:\Users\congt\AppData\Local\Programs\...         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

```text
TAB 2: ATTACHED REPOSITORIES & WORKSPACES
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Project       Repository           Local Mount Path               Locks   Actions       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Sci-Fi RPG    Character Assets     D:\Projects\SciFi\Characters    0      [Open] [Detach]│
│ Sci-Fi RPG    Environment Props    D:\Projects\SciFi\Environments  1      [Open] [Detach]│
│ Tech Demo     Main Level           D:\UnrealProjects\TechDemo\Maps 0      [Open] [Detach]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

```text
TAB 3: HARDWARE & PERFORMANCE MONITORING
┌───────────────────────────┬───────────────────────────┬────────────────────────────┐
│ 🎮 GPU: NVIDIA RTX 4090   │ ⚡ CPU: 16 Logical Cores   │ 💾 Memory: 32.0 GB RAM     │
│ VRAM: 24.0 GB Dedicated   │ Architecture: x86_64      │ Status: Healthy            │
├───────────────────────────┴───────────────────────────┴────────────────────────────┤
│ 💽 Local Storage Drives:                                                           │
│ Drive C:\ [====================--------] 145 GB free / 500 GB (71% used)          │
│ Drive D:\ [==========------------------] 1.4 TB free / 2.0 TB (30% used)           │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Các Giai Đoạn Triển Khai (Phases)

### Phase 1: Backend API — Query Attached Repositories theo Runner
- [ ] **1.1. Tạo Slice `GetAttachedRepositoriesByRunner.cs` trong `Automation.Repository`:**
  - Route: `GET /api/repository-runners/by-runner/{runnerId:guid}`
  - Truy vấn bảng `RepositoryRunners` theo `RunnerId`, include `Repository`.
  - Kết hợp thông tin Project (thông qua `Repository.ProjectId` và cache/query từ Studio module).
  - Trả về DTO:
    ```csharp
    public record AttachedRepositoryDto(
        Guid RepositoryId,
        string RepositoryName,
        Guid ProjectId,
        string? ProjectName,
        string? MountPath,
        bool IsActive,
        DateTimeOffset AttachedAt,
        int ActiveLocksCount
    );
    ```
- [ ] **1.2. Đăng ký Permissions & Viết Unit Test:**
  - Viết test `GetAttachedRepositoriesByRunnerTests.cs` kiểm tra logic query và trả kết quả chính xác.

---

### Phase 2: Frontend Routing & Layout Shell
- [ ] **2.1. Cấu hình TanStack Router:**
  - Tạo route file: `web/src/routes/_protected/_layout/runners_.$runnerId.tsx` (hoặc cấu trúc `runners/$runnerId`).
  - Hỗ trợ breadcrumb động: `Runners / {RunnerName}`.
- [ ] **2.2. Xây dựng Shell Component `RunnerDetailPage.tsx`:**
  - Header: Tên máy, OS badge, Machine key (kèm nút copy), nút Rescan toàn diện và nút Back quay lại danh sách.
  - Tab Controller: 3 Tabs (`Software & Engines`, `Attached Repositories`, `Hardware & Specs`).
- [ ] **2.3. Cập nhật `RunnerCard.tsx`:**
  - Thêm liên kết điều hướng khi click vào tên Runner hoặc nút "Manage Details" ➔ Chuyển thẳng vào `/runners/${runner.id}`.

---

### Phase 3: Tab 1 — Software & DCC Engines (Rộng rãi & Tự động quét)
- [ ] **3.1. Thiết kế Thẻ DCC Engine Lớn (`DccEngineCard.tsx`):**
  - Hiển thị Logo thương hiệu, danh mục (DCC / Game Engine / Runtime).
  - Khối phiên bản Active: Badge phiên bản to, đường dẫn file `.exe` rõ ràng, nút Browse thay đổi đường dẫn.
  - Khối **Discovered Installations**: Danh sách tất cả các bản cài đặt tìm thấy trên máy từ `forgity-runner doctor`.
    - Mỗi bản có: Tên thư mục, phiên bản (`v5.2.0 LTS`, `v4.2`), đường dẫn đầy đủ.
    - Nút bấm **`[ Set as Active ]`**: Click 1 phát là tự động lưu ngay, không cần xác nhận phức tạp.
- [ ] **3.2. Unreal Project Mapping Component Rộng Rãi:**
  - Không gian bảng thoải mái để thêm/xóa file `.uproject`.
  - Nút Browse file picker trực tiếp trên máy trạm thông qua `RemoteFileBrowserDialog`.
- [ ] **3.3. Sẵn sàng thẻ mở rộng (Coming Soon):**
  - Thẻ dành cho DAZ Studio (`.duf`), Substance Painter, Houdini.

---

### Phase 4: Tab 2 — Attached Repositories & Workspaces
- [ ] **4.1. Custom Hook `useAttachedRepositoriesByRunner`:**
  - Gọi API `GET /api/repository-runners/by-runner/{runnerId}`.
- [ ] **4.2. Bảng Danh Sách Repositories:**
  - Cột Project (Badge màu).
  - Cột Repository Name (Click để chuyển sang trang Repository).
  - Cột Local Mount Path (Hiển thị đường dẫn trên máy tính, có nút Copy).
  - Cột File Locks: Hiển thị nếu máy này đang giữ lock tệp nào.
  - Cột Thao tác: Nút `Open` và nút `Detach` (gọi dialog `DetachRunnerDialog`).

---

### Phase 5: Tab 3 — Hardware & Performance Specs
- [ ] **5.1. Thiết kế Dashboard Phần Cứng:**
  - Hiển thị chi tiết GPU (Model, VRAM).
  - Hiển thị CPU (Model, Cores).
  - Hiển thị RAM (Dung lượng tổng).
  - Hiển thị thanh đo trực quan dung lượng ổ đĩa (Drives C, D, E) dựa trên `runner.hardwareDetails.disks`.

---

## 4. Kế Hoạch Kiểm Thử & Tiêu Chí Nghiệm Thu (Verification)

1. **Kiểm thử Routing & Điều hướng:**
   - Từ trang danh sách `Runners`, click vào bất kỳ Runner nào -> Chuyển mượt mà vào `/runners/{id}` với đầy đủ dữ liệu.
2. **Kiểm thử Đổi Phiên Bản Engine (Tab 1):**
   - Bấm `Set as Active` ở một bản Blender khác -> Xác nhận API lưu thành công và UI cập nhật ngay.
3. **Kiểm thử Attached Repositories (Tab 2):**
   - Gắn runner vào 1 repository ở project A -> Vào trang runner detail xác nhận repository và project A xuất hiện đầy đủ thông tin mount path.
   - Thử bấm Detach -> Xác nhận modal xác nhận mở lên và gỡ thành công.
4. **Kiểm thử Responsive & Aesthetics:**
   - Giao diện chuẩn Dark-mode, thoáng mắt, không bị gò bó hay scrollbar lồng nhau.
