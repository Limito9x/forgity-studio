# Architecture Decision Record (ADR): CAS Deduplication & Zero-Byte Asset Linking

- **Mã tài liệu**: ADR-003
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-10-11
- **Phạm vi**: Module Quản lý Tệp và Hệ thống Lưu trữ (`Automation.Files`)

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Trong hệ sinh thái **Automation Studio**, tài nguyên đồ họa (3D Meshes, Textures 4K/8K, Motion Capture FBX, Unreal Packages) có dung lượng cực lớn (từ hàng trăm Megabytes đến hàng chục Gigabytes mỗi tệp).

### Các điểm nghẽn nghiêm trọng khi lưu trữ kiểu truyền thống:
1. **Lãng phí dung lượng đĩa khủng khiếp (Storage Bloat)**:
   - Khi người dùng nhân bản một Pipeline, hoặc copy một Resource giữa các phân đoạn, nếu hệ thống copy file vật lý sang một bản mới, dung lượng S3/MinIO sẽ tăng theo cấp số nhân. Một file model nhân vật 2GB dùng ở 10 pipeline sẽ ngốn 20GB lưu trữ vô ích.
2. **Nghẽn băng thông và sập RAM máy chủ Web API (Memory Exhaustion & I/O Choke)**:
   - Nếu client upload file 5GB trực tiếp qua Web API (`multipart/form-data`), Web API sẽ phải đệm dữ liệu vào RAM hoặc ổ cứng tạm, làm chậm toàn bộ các request khác và dễ dẫn đến Out-Of-Memory (OOM).
3. **Mắc kẹt nhà cung cấp (Vendor Lock-in) và Nhu cầu Đa Lưu Trữ (BYOS - Bring Your Own Storage)**:
   - Studio lớn cần lưu trữ file nhạy cảm trên AWS S3 riêng của họ, trong khi người dùng cá nhân dùng Cloud mặc định của Studio. Hệ thống cần khả năng di chuyển (migrate) hàng loạt terabytes dữ liệu giữa 2 storage profile mà không làm gián đoạn hệ thống.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **Phương án A: File Attachment truyền thống gắn vào từng Entity**
   - Lưu trữ dạng `Node.FilePath = "s3://bucket/nodes/node-123/file.fbx"`.
   - *Hạn chế*: Không thể tái sử dụng file, xóa node dễ làm mất file hoặc mồ côi (orphan files), chi phí lưu trữ tăng chóng mặt.
2. **Phương án B: Content Addressable Storage (CAS) kết hợp Zero-byte Linking (Được chọn)**
   - Phân tách tuyệt đối giữa **Vật lý (Asset)** và **Logic (AssetLink)** dựa trên mã băm SHA-256 nội dung tệp.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Phân Tách Tuyệt Đối giữa `Asset` và `AssetLink`
- **Thực thể `Asset` (Vật lý - CAS)**:
  - Đại diện cho khối nhị phân thực tế lưu trên S3/MinIO.
  - Định danh bằng SHA-256 hash của nội dung.
  - Nếu 100 người cùng upload một file có cùng nội dung (cùng hash SHA-256), hệ thống chỉ lưu đúng **1 bản ghi Asset vật lý duy nhất**.
- **Thực thể `AssetLink` (Logic - Tham chiếu Zero-byte)**:
  - Đại diện cho việc một thực thể nghiệp vụ (ví dụ: Node Pin, Resource Version, Custom Script) đang trỏ tới một `Asset`.
  - Lưu trữ `OriginalFileName`, `OwnerType`, `OwnerId`, `SlotName`.
  - Nhân bản hay chia sẻ file thực chất chỉ là tạo thêm 1 bản ghi `AssetLink` (tốn vài bytes trong DB, **0 byte trên S3**).

### 3.2. Server-Bypass: Quy Trình Upload 2 Pha (Direct Presigned Upload)
- Web API tuyệt đối không nhận luồng byte trực tiếp từ client.
- **Pha 1 (`RequestUpload`)**: Client tính hash SHA-256 ở local và gửi request lên API.
  - Nếu file đã tồn tại trên Storage Profile đích (CAS deduplication): API trả về `IsAlreadyExists = true`, client không cần upload byte nào.
  - Nếu file chưa có: API cấp **Presigned PUT URL** từ S3. Client tự upload thẳng lên S3/MinIO.
- **Pha 2 (`ConfirmUpload`)**: Client thông báo cho API sau khi upload xong để API kích hoạt verify metadata và đánh dấu `IsConfirmed = true`.

### 3.3. Piped Streaming Cho Di Chuyển Dữ Liệu (Zero-Disk Buffer)
- Khi thực hiện di chuyển tài nguyên giữa các Storage Profile (`MigrateAssetsStorage`):
  - Hệ thống sử dụng cơ chế **Piped Streaming** (kết hợp AWS S3 `GetObjectAsync` Stream và `TransferUtility.UploadAsync`) xử lý theo từng chunk nhỏ 8MB–16MB.
  - **Zero-Disk**: Không ghi bất kỳ byte nào ra đĩa máy chủ.
  - **Zero-Memory Leak**: Băng thông giải phóng ngay sau mỗi chunk, cho phép di chuyển hàng chục GB mà RAM API vẫn giữ mức <100MB.

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

### Tích cực (Positives):
- **Tiết kiệm 60–80% chi phí lưu trữ**: Khử trùng lặp file (Deduplication) cực kỳ hiệu quả trên môi trường 3D/VFX.
- **Tốc độ nhân bản tức thì**: Clone pipeline hay gán file giữa các node diễn ra trong vài mili-giây.
- **Bảo vệ Web API**: Máy chủ API luôn ổn định, không bị nghẽn I/O khi người dùng tải file lớn.

### Thách thức & Cách kiểm soát (Trade-offs & Mitigations):
- *Quản lý vòng đời xóa file (Garbage Collection)*: Khi một `AssetLink` bị xóa, không thể xóa ngay `Asset` vật lý trên S3 vì có thể có `AssetLink` khác đang trỏ tới. Cần có Background Job kiểm tra Reference Count để dọn dẹp các Asset mồ côi (Orphan Assets).

