# Kế Hoạch Kỹ Thuật: Chuẩn Hóa Kiến Trúc Draft Resource, Runner Holding & Workstation-Scoped Root

> **Tài liệu Kế hoạch Kỹ thuật (Technical Plan)**  
> **Ngày lập:** 21/10/2026 (Cập nhật sau phản biện kiến trúc Multi-User)  
> **Trạng thái:** Đang thực thi (In Progress)  
> **Phạm vi:** `api/` (Backend Core & Pipeline Engine), `web/` (Frontend React), `workers/` (Blender Scripts)

---

## 1. Bối Cảnh & Động Lực (Context & Motivation)

### 1.1 Vấn đề thực tế từ sản xuất 3D (Production Reality):
1. **Lỗi gán nhầm Metadata do phỏng đoán (Heuristic Guessing):**
   - Khi `export_fbx.py` xuất file, trước đây chỉ gửi tên file (`Moonrise.fbx`).
   - Nếu trong Repository tồn tại cả file cũ `Moonrise/Moonrise.fbx` (chưa gán content) và file mới `Characters/Moonrise/Moonrise.fbx` (đã gán content), Backend dùng `FirstOrDefault` duyệt tên file dẫn đến việc gán nhầm metadata vào file cũ.
   - Việc Backend cố quét toàn bộ danh sách mount của mọi máy từng kết nối với repo để cắt ổ đĩa là một dạng phỏng đoán không an toàn khi dự án có nhiều máy trạm (`D:/...`, `E:/...`).
2. **Khái niệm "Draft Resource" chưa được định danh rõ nét:**
   - Trong làm phim/game 3D, giai đoạn dựng hình, bake texture và chỉnh sửa (WIP) diễn ra hoàn toàn cục bộ trên **1 máy trạm (Workstation/Runner)** vì dữ liệu rất nặng (hàng trăm MB đến GB).
   - Một Resource tại một thời điểm chỉ được phép có tối đa 1 bản Draft, và bản Draft này **thuộc quyền sở hữu của máy trạm đang lưu giữ file (`HoldingRunner`)**.
3. **Bài học phản biện kiến trúc: Tại sao KHÔNG đặt "Default Runner" tại Repository?**
   - Repository là tài nguyên chung của cả team (Multi-User Studio). Nhiều artist cùng attach máy của họ vào một Repository.
   - Nếu gán cứng cờ `IsDefault` vào Repository, khi Artist B bấm chạy Pipeline cho file trên máy của mình, hệ thống sẽ đẩy nhầm job sang máy Default của Artist A $\rightarrow$ Gây xung đột và sai lệch đường dẫn cục bộ!
   - **Chân lý thiết kế:** Runner mặc định khi chạy Draft **chính là `HoldingRunner` của file đó**, và không gian làm việc cục bộ là **cặp `[Repository - Runner]`**.

---

## 2. Các Trụ Cột Kiến Trúc Chuẩn Hóa (Core Pillars)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      WORKSTATION-SCOPED WORKSPACE                      │
│             Gốc làm việc vật lý = Cặp [Repository - Runner]            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
   [Holding Runner Ownership]                          [Ambiguity-Free Backend]
   Draft Version gắn chặt với máy đang                 Backend chỉ nhận relative path chuẩn
   giữ file vật lý & Collaborative Lock.               Nếu tên file trùng lặp -> Từ chối đoán mò!
   Pipeline tự route về máy này!
```

### Trụ cột 1: Bất biến "Single Active Draft per Resource"
- **Nguyên tắc:** Mỗi `ResourceItem` trong Database tại bất kỳ thời điểm nào chỉ được phép tồn tại **tối đa duy nhất 1 bản Draft** (`ResourceVersionStatus.Draft`).
- **Vòng đời:**
  1. *Khởi tạo / Chỉnh sửa:* File mới sinh ra trên máy trạm $\rightarrow$ Tạo hoặc cập nhật vào bản **Draft** duy nhất.
  2. *Publish:* Người dùng bấm Publish $\rightarrow$ Bản Draft đóng băng thành `Published Version (v1, v2...)`, upload Cloud Storage (MinIO/S3).
  3. *Tái chỉnh sửa (Check-out):* Khi có thay đổi mới từ máy trạm $\rightarrow$ Mở ra một bản Draft tiếp theo.
- **Lợi ích:** Triệt tiêu hoàn toàn tình trạng trôi nổi nhiều phiên bản nháp, bảo vệ tính toàn vẹn của dữ liệu.

### Trụ cột 2: Runner Holding Ownership (Máy trạm nắm giữ Draft)
- Bản Draft không lơ lửng trên mây, nó luôn nằm trên ổ đĩa vật lý của một máy trạm:
  - `HoldingRunnerId`: ID của máy trạm sở hữu bản Draft.
  - `HoldingMountPath`: Đường dẫn mount gốc trên máy đó (`D:/Games/Projects/DemoBlender`).
  - `LockedByRunnerId`: Hệ thống Collaborative Lock bảo vệ chống các máy khác can thiệp.
- Giao diện thể hiện rõ ràng: Huy hiệu `Draft (PC-Workstation-01)`.
- Khi kích hoạt Pipeline trên một Resource Draft: Hệ thống **tự động lấy luôn `HoldingRunner` của file đó** để dispatch job, không bắt người dùng chọn lại thủ công.

### Trụ cột 3: "Workstation-Scoped Root" — Lấy Trực Tiếp Danh Sách Cặp `[Repository - Runner]` trong 1 Lượt Chọn
- **Bản chất:** 
  - `Repository` là không gian logic trên Studio.
  - Nhưng một Draft Resource thực tế **luôn thuộc về một máy trạm vật lý cụ thể**.
  - Không bắt người dùng phải chọn qua 2 bước phân mảnh (chọn Repo rồi mới chờ chọn Runner).
  - Thay vào đó, Studio gom trực tiếp thành **Danh sách Cặp Workstation Root `[Repository - Runner]` trong 1 lượt chọn duy nhất**:
    - Ví dụ option: `DemoBlender @ PC-Workstation-01 (Mount: D:\Games\Projects\DemoBlender)`
    - Mỗi option map 1:1 với entity `RepositoryRunner` trong Database.
- **Cơ chế hoạt động:**
  - **Single Combobox:** Người dùng chỉ cần mở 1 dropdown duy nhất, thấy toàn bộ các máy trạm đang mount vào các repo của project (có thể group theo Repo).
  - Chọn 1 phát là định danh ngay:
    - `RepositoryId`
    - `RunnerId` (máy trạm sở hữu)
    - `RootPath` (đường dẫn mount vật lý)
  - Danh sách Resource bên dưới lập tức lọc ra **chính xác các file Draft đang có mặt trên máy trạm đó** (thông qua `ResourceVersionLocation.RepositoryRunnerId` / `RunnerId`).
  - Triệt tiêu 100% tình trạng máy A chạy đè lên file của máy B hoặc nhầm lẫn giữa các ổ đĩa khác nhau.

### Trụ cột 4: Loại bỏ 100% Heuristic Guessing trong Backend (ĐÃ HOÀN THÀNH)
- Backend `RepositoryApi.ResolveResourceVersionIdsByPathsAsync`:
  - **Xoá bỏ hoàn toàn:** Việc query `runnerMounts` để đoán bóc ổ đĩa. Trách nhiệm sinh relative path chuẩn thuộc về node tool (`export_fbx.py` qua `root_folder`).
  - **Tầng 1 (Exact Match):** Khớp chính xác tuyệt đối `r.RelativePath == normalizedPath`.
  - **Tầng 2 (EndsWith Match):** Khớp hậu tố với relative path dài nhất/sâu nhất.
  - **Tầng 3 (FileName Fallback với Ambiguity Check):**
    - Nếu trong toàn bộ Repository **chỉ có duy nhất 1 file** trùng tên $\rightarrow$ Chấp nhận match.
    - Nếu trong Repository có **từ 2 file trở lên** cùng tên file $\rightarrow$ **Từ chối match**, log cảnh báo `Ambiguous resource name` để bảo vệ dữ liệu, không đoán mò!

---

## 3. Lộ Trình Triển Khai Thực Tế

- [x] **Phase 1: Dọn sạch triệt để Heuristic Guessing trong `RepositoryApi.cs` (Backend)** - *ĐÃ HOÀN THÀNH 100%*
  - Xoá bỏ query `runnerMounts` đoán mò.
  - Thêm Ambiguity Check cho FileName Fallback.
  - Thêm `root_folder` cho `export_fbx.py` để tự tính relative path chuẩn.
  - Bổ sung chức năng Xóa/Loại bỏ Resource trên Web (`RepositoryResourceTable` & `ResourceDetailPage`).

- [x] **Phase 2: Auto-Routing theo Holding Runner của Resource trong Pipeline Engine** - *ĐÃ HOÀN THÀNH 100%*
  - Khi trigger Pipeline với RuntimeInputs chứa `Resource` hoặc `ResourceId`:
    - Dispatcher (`RunnerSegmentDispatcher.cs`) tự động truy vấn Runner đang chứa bản Draft của Resource đó (`HoldingRunnerId`).
    - Gán làm `effectiveRunnerId` tự động mà không cần người dùng chọn Runner trong dropdown.
  - Khi Pipeline thuộc về Repository có đúng 1 Runner đính kèm:
    - Tự động nhận diện `Single Attached Runner` mà không cần cấu hình.
    - Đã bổ sung bộ kiểm thử Unit Test `RunnerSegmentDispatcherTests.cs` (Pass 100%).

- [x] **Phase 3: Workstation-Scoped Root (Cặp [Repo - Runner]), Inline Loading Cho Input & Break Struct Direct FullPath** - *ĐÃ HOÀN THÀNH 100%*
  - **Backend:**
    - Tạo endpoint `[GET] /api/repositories/workstations?projectId={projectId}` trả về danh sách các cặp `[Repository - Runner]` (`WorkstationRootDto`: Id, RepositoryId, RepositoryName, RunnerId, RunnerName, RootPath, IsActive).
    - Cập nhật `GetRepositoryResources.cs`: Hỗ trợ filter theo `runnerId?: Guid` (lọc các Resource có bản Draft nằm trên Runner này qua `ResourceVersionLocation`).
    - Nâng cấp `BreakStructTool.cs`, `ResourceStructDefinition.cs` và `ExecutionEntityStore.cs`: Bổ sung 4 Output Pins trực tiếp: `FullPath`, `DirectoryPath`, `MountPath`, `HoldingRunnerId` $\rightarrow$ Triệt tiêu hoàn toàn nhu cầu dùng node `Get Repo Info` + `Format String`.
  - **Frontend UI/UX:**
    - Nâng cấp `BaseCombobox` & `ComboboxInput`: Hỗ trợ prop `isLoading`. Khi đang fetch dữ liệu, hiển thị Spinner `Loader2` xoay mượt mà ngay bên trong ô input (góc phải), tự động disable tương tác để chống giật/lag dropdown khi click.
    - Dọn bỏ các thẻ text `Loading...` trôi nổi trên header ở `EntityPinSelect.tsx`.
    - Tái cấu trúc bộ chọn Resource trong `EntityPinSelect.tsx`:
      - Bước 1: Chọn Cặp **Workstation Root `[Repo - Runner]`** trong 1 lượt (Single combobox, format: `[Repo] @ [Runner] (Mount: D:\...)`).
      - Tự động chọn (Auto-select) nếu project chỉ có 1 cặp duy nhất.
      - Bước 2: Hiển thị danh sách Draft Resources nằm trên Workstation đó (Checklist / Combobox).
    - Bổ sung `FullPath`, `DirectoryPath`, `MountPath`, `HoldingRunnerId` vào `structPins.ts` cho `Resource` struct trên Canvas.
    - Cập nhật bảng `RepositoryResourceTable.tsx`: Bổ sung bộ lọc Workstation Runner trên toolbar và huy hiệu `Draft @ RunnerName`.

- [ ] **Phase 4: Cập nhật Playbook & Kiểm thử e2e**
  - Cập nhật tài liệu cẩm nang vận hành `.agents/playbooks/resource-repository-lifecycle.md`.
  - Kiểm thử e2e toàn luồng: Chọn cặp Workstation Root $\rightarrow$ Chọn Draft Resource $\rightarrow$ Chạy Pipeline tự động ăn theo Runner đó.
