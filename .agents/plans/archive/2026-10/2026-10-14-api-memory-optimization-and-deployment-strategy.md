# Kế hoạch Kỹ thuật: Tối ưu Hóa Bộ nhớ API (.NET Core) & Chiến lược Triển khai Tinh gọn (Lean Deployment)

> **Mục tiêu:** Giảm mức tiêu thụ RAM đỉnh của API từ ~540MB xuống dưới ~180MB khi xử lý đồ thị Pipeline phức tạp, triệt tiêu nguy cơ OOM trên môi trường hạn chế tài nguyên (512MB RAM), và xây dựng lộ trình triển khai chi phí 0đ để kiểm thử với Trial User.
> **Thời gian tạo:** 2026-10-13 (Cập nhật chuẩn bị cho ngày 2026-10-14)

---

## 1. Bối cảnh & Hiện trạng Đo đạc

- **Baseline nhàn rỗi (Idle):** Container API .NET 10 chạy Workstation GC (`DOTNET_gcServer=0`) chỉ tiêu thụ **~110 MiB – 130 MiB RAM** (cực kỳ nhẹ và lý tưởng).
- **Vấn đề đột biến (Memory Spike):** Khi client thực hiện Autosave đồ thị Pipeline lớn (ví dụ: *Daz Body To Blender* gồm 32 nodes, 55 edges, kèm toàn bộ JSON config & metadata), mức tiêu thụ RAM vọt lên tức thời **~350 MiB – 548 MiB**.
- **Hệ quả trên môi trường Free Tier (256MB – 512MB):** Linux cgroup phát hiện RAM vượt trần nên gửi tín hiệu `SIGKILL` (OOMKilled, Exit Code 137). Nginx reverse proxy mất kết nối upstream và phản hồi lỗi **502 Bad Gateway**.

---

## 2. Các Điểm Nóng (Hotspots) Cần Tối Ưu Hóa trong API

### 2.1. Phân hệ Pipeline Graph Sync (`SavePipelineGraph.cs`)
- **Vấn đề 1: EF Core ChangeTracker Snapshot:**
  - Query load toàn bộ đồ thị hiện tại để so sánh diff: `.Include(Nodes).Include(Edges)`.
  - Sau khi `SaveChangesAsync()`, EF Core vẫn lưu giữ toàn bộ snapshot của 32 nodes + 55 edges trong bộ nhớ DbContext.
  - **Giải pháp:** Bổ sung `db.ChangeTracker.Clear()` ngay sau khi lưu để thu hồi snapshot lập tức.
- **Vấn đề 2: `JsonDocument` unmanaged memory retention:**
  - Trong vòng lặp duyệt từng node, gọi `JsonSerializer.SerializeToDocument(nodeItem.ConfigValues)` và `Metadata`.
  - Các instance `JsonDocument` giữ vùng nhớ `ArrayPool<byte>` và unmanaged blocks chưa được giải phóng.
  - **Giải pháp:** Sử dụng `using var doc` cho các biến tạm, tối ưu serialization trực tiếp hoặc tái sử dụng parser.
- **Vấn đề 3: SubPipeline Cycle Validation DB queries:**
  - `PipelineCycleValidator.ValidateNoCycleAsync` gọi truy vấn DB đệ quy cho từng SubPipeline node.
  - **Giải pháp:** Gom query danh sách SubPipeline IDs 1 lần duy nhất thay vì query lặp.

### 2.2. Phân hệ Pipeline Orchestrator & Dispatch (`PipelineOrchestrator.cs`)
- **Vấn đề 1: Cartesian Product khi nạp đồ thị thực thi:**
  - Khi kích hoạt `ExecuteOrResumeAsync`:
    `db.PipelineExecutions.Include(x => x.Pipeline).ThenInclude(p => p.Nodes).Include(x => x.Pipeline).ThenInclude(p => p.Edges)`
    Hiện tại **chưa có `.AsSplitQuery()`** và **chưa có `.AsNoTracking()`**.
  - Đồ thị chỉ được đọc để Planner phân đoạn (Segment Planning), không hề được chỉnh sửa, nhưng EF Core vẫn đưa toàn bộ vào ChangeTracker.
  - **Giải pháp:** Thêm `.AsNoTracking()` và `.AsSplitQuery()` cho truy vấn nạp đồ thị thực thi.

### 2.3. Phân hệ Resource & Inspection Metadata (`Repository / Content`)
- **Vấn đề:** Khi quét thư mục chứa hàng chục mô hình 3D (Daz, FBX, Blender), trường `InspectionMetadata` (JSON cấu trúc cây xương, morphs, textures) có kích thước lớn.
- **Giải pháp:** Khi load danh sách Resources trên bảng (Table UI), chỉ `SELECT` các trường cơ bản (Id, Name, Path, Extension, VersionNo). Chỉ load `InspectionMetadata` khi người dùng bấm vào xem chi tiết một Resource cụ thể.

### 2.4. Tối ưu Runtime & Garbage Collector (.NET Container Environment)
- Thiết lập các biến môi trường runtime trong `docker-compose.yml`:
  - `DOTNET_gcServer=0`: Chế độ Workstation GC (đã áp dụng, giảm 80% RAM so với Server GC).
  - `DOTNET_TieredPGO=0`: Tắt Tiered Profile-Guided Optimization trong container RAM thấp (tiết kiệm ~40MB RAM profiling).
  - `DOTNET_TC_QuickJitForLoops=1`: Giảm overhead JIT biên dịch vòng lặp.

---

## 3. Lộ trình Triển khai cho Trial User (Deployment Strategy)

### Phương án A: Cloudflare Tunnel (Khuyến nghị số 1 cho giai đoạn Trial / Feedback)
- **Chi phí:** 0 đồng (Hoàn toàn miễn phí).
- **Yêu cầu thẻ:** Không cần thẻ tín dụng/VISA.
- **Tài nguyên:** Chạy trực tiếp từ máy trạm hiện tại (RAM 16-32GB), mở đường hầm an toàn HTTPS ra ngoài Internet thông qua `cloudflared.exe`.
- **Năng lực phục vụ:** Dư sức gánh 50 – 100 Trial User thử nghiệm cùng lúc mà không lo giật lag hay giới hạn RAM.

### Phương án B: Tối ưu cho Cloud Free Tier / Low-Cost PaaS (Render / Koyeb / VPS 100k)
- Sau khi hoàn thành mục 2, mức RAM đỉnh của API sẽ nằm dưới mức **~180 MiB**.
- Hoàn toàn tương thích và chạy ổn định trên gói **512MB RAM Free** của Render hoặc Koyeb (không lo bị OOMKill).

---

## 4. Danh sách Tác vụ Ngày Mai (Checklist)

- [ ] Bổ sung `db.ChangeTracker.Clear()` và tối ưu `using` JsonDocument trong `SavePipelineGraph.cs`.
- [ ] Bổ sung `.AsNoTracking()` và `.AsSplitQuery()` vào `PipelineOrchestrator.cs`.
- [ ] Rà soát query danh sách Resource trong module `Repository` để đảm bảo không load thừa `InspectionMetadata`.
- [ ] Chạy kịch bản test đo đạc RAM đỉnh sau tối ưu với đồ thị 32 nodes + 55 edges.
- [ ] Quyết định phương án triển khai (Cloudflare Tunnel vs Koyeb/Render) để đưa sản phẩm đến tay Trial User.
