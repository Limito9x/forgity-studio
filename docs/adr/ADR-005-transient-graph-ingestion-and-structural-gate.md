# Architecture Decision Record (ADR): Transient Graph Ingestion & Preflight Validation Gates

- **Mã tài liệu**: ADR-005
- **Trạng thái**: Đã phê duyệt & Áp dụng bắt buộc (Accepted & Enforced)
- **Ngày quyết định**: 2026-10-24
- **Phạm vi**: Luồng Import/Export Bundle, Pre-validation, Canvas Live Draft và Run Execution Gate (`Automation.Pipeline`)

---

## 1. Bối Cảnh & Vấn Đề (Context & Problem Statement)

Trước khi thực hiện cải tiến này, hệ thống kiểm tra và nạp đồ thị của Pipeline gặp phải **3 điểm nghẽn nghiêm trọng**:

1. **Lệch pha giữa khâu Kiểm Tra (Validate Package) và khâu Nhập Thật (Import Package)**:
   - Khi người dùng tải lên 1 gói JSON Pipeline Package (`.json`), endpoint `ValidatePipelinePackage` tự parse JSON và chạy một số kiểm tra sơ khai.
   - Nhưng khi người dùng nhấn "Import", endpoint `ImportPipelinePackage` lại tự viết một vòng lặp khác để dựng Entity và lưu vào Database.
   - **Hậu quả**: Trùng lặp code (Code Duplication). Khâu kiểm tra nói "Hợp lệ", nhưng khâu Import lại có thể sinh ra các thực thể bị lỗi hoặc sai lệch ID.
2. **Không có khả năng Kiểm Chứng Đồ Thị Ảo / Nháp (In-Memory Validation)**:
   - Bộ kiểm tra `ValidatePipeline` trước đây bắt buộc phải đọc đồ thị từ Database (`PipelineId`).
   - Nếu người dùng đang chỉnh sửa dở trên Canvas (chưa bấm Save) hoặc gửi lên một gói JSON từ bên ngoài, hệ thống không thể kiểm chứng được nếu không lưu tạm rác vào Database.
3. **Thiếu ranh giới phân định giữa "Lỗi Cấu Trúc" và "Chờ Cấu Hình"**:
   - Khi import một gói pipeline chia sẻ từ cộng đồng hoặc từ máy khác: Nhiều trường hợp node Custom Script chưa có sẵn mã nguồn trên máy mới, hoặc các tham số bắt buộc chưa được điền.
   - Nếu hệ thống chặn đứng không cho Import: Người dùng không thể kéo pipeline mẫu về để sửa.
   - Nếu hệ thống cho phép Import bừa bãi: Đồ thị hỏng cấu trúc (chu trình lặp vô tận DAG cycle, dây cắm vào chân không tồn tại) sẽ tràn vào database gây lỗi ngầm.
4. **Không có chốt chặn khi Bấm Chạy (`RunPipeline`)**:
   - Khi người dùng bấm Run một pipeline có chân bị mất kết nối hoặc thiếu thông số, hệ thống vẫn tạo bản ghi `PipelineExecution`, sinh task RabbitMQ và gửi sang Worker, khiến tiến trình Blender/Unreal bật lên rồi crash vô ích.

---

## 2. Các Phương Án Đã Cân Nhắc (Considered Options)

1. **Phương án A: Lưu tạm đồ thị nháp vào bảng Database Drafts**
   - Tạo bảng `PipelineDrafts` trong DB để lưu đồ thị tạm khi validate.
   - *Hạn chế*: Ô nhiễm database với các bản ghi rác nếu người dùng hủy thao tác; phát sinh thêm logic dọn dẹp; chi phí I/O ghi đĩa không cần thiết.
2. **Phương án B: Nhà Máy Đồ Thị Tạm Thời Trong Bộ Nhớ (Transient Graph Factory - Được chọn)**
   - Xây dựng cơ chế chuyển đổi bất kỳ nguồn dữ liệu nào (JSON Bundle, DTO Snapshot từ Canvas) thành thực thể Domain in-memory để kiểm chứng trước khi quyết định ghi DB.

---

## 3. Quyết Định Kiến Trúc (The Decision)

### 3.1. Nhà Máy Đồ Thị In-Memory Thống Nhất (`ITransientPipelineGraphFactory`)
- Triển khai `TransientPipelineGraphFactory` đóng vai trò là nhà máy duy nhất chịu trách nhiệm:
  - `BuildFromPackageAsync`: Chuyển đổi gói JSON Bundle thành các thực thể `Pipeline` và `NodeContractResolutionContext` hoàn toàn trên RAM. Tự động sinh `NodeDefinition` ảo cho các Custom Script nhúng trong gói để phục vụ kiểm chứng hợp đồng.
  - `BuildFromDraftSnapshot`: Chuyển đổi các Node, Edge, Parameter nháp gửi từ Canvas thành thực thể `Pipeline` in-memory.
- **Zero Code Duplication**: Cả `ValidatePipelinePackage` và `ImportPipelinePackage` đều sử dụng chung một `TransientPipelineGraphFactory`. Đảm bảo những gì được duyệt xem trước đồng nhất 100% với những gì được lưu xuống Database.

### 3.2. Cơ Chế Phân Ranh Giới Chặn Import Thông Minh (`IsStructuralImportBlocker`)
Thiết lập quy tắc phân định ranh giới cứng giữa Lỗi cấu trúc và Cảnh báo cấu hình:
- **Lỗi Cấu Trúc (Structural Error - BẮT BUỘC CHẶN `IsValid = false`)**:
  - `DagCycleDetected`: Đồ thị chứa chu trình lặp vô tận.
  - `IncompatiblePinType`: Nối dây giữa 2 chân không tương thích kiểu (ví dụ String vào Object).
  - `DanglingEdgePin`: Dây nối trỏ vào một chân pin không hề tồn tại trên node.
  - `MissingNodeDefinition` trên Node `Tool`: Thiếu tool C# của hệ thống (chứng tỏ server thiếu code).
- **Cảnh Báo Cấu Hình (Configuration Warning - CHO PHÉP IMPORT DẠNG BẢN NHÁP DRAFT)**:
  - `UnresolvedRequiredPin`: Chưa điền giá trị cho tham số bắt buộc.
  - `UnselectedStructSchema`: Chưa chọn loại StructType cho Dynamic Tool (`BreakStruct`).
  - `MissingNodeDefinition` trên Node `Custom`: Chưa có file script trên máy đích (hệ thống gắn cờ `unresolvedScript = true` trong metadata để người dùng vào gán script sau).

### 3.3. Chốt Chặn Kiểm Chứng Thực Thi An Toàn (Preflight Run Gate)
- Tại endpoint `RunPipeline`, trước khi tạo bất kỳ bản ghi DB hay gửi message qua RabbitMQ:
  - Hệ thống tự động kích hoạt `IPipelineContractValidator.ValidateGraphAsync`.
  - Nếu đồ thị chứa bất kỳ chẩn đoán mức `Error`: Ngay lập tức từ chối yêu cầu và trả về mã lỗi HTTP **422 Unprocessable Entity** kèm chi tiết danh sách lỗi (`UnresolvedPinsError`).
  - Tuyệt đối không cho phép đồ thị lỗi đi vào hàng đợi của Worker.

---

## 4. Hệ Quả & Đánh Đổi (Consequences & Trade-offs)

### Tích cực (Positives):
- **Bảo vệ toàn vẹn Database và Worker**: Ngăn chặn 100% dữ liệu rác hoặc task hỏng làm sập máy trạm.
- **Trải nghiệm người dùng mượt mà (Permissive yet Safe)**: Người dùng có thể thoải mái tải các pipeline chia sẻ về dưới dạng bản nháp để bổ sung cấu hình mà không bị chặn oan uổng.
- **Canvas Real-time Validation**: Canvas có thể validate trực tiếp trên dữ liệu nháp mà người dùng chưa cần bấm Save.

### Thách thức & Cách kiểm soát (Trade-offs & Mitigations):
- *Tốn một lượng nhỏ CPU khi parse và validate*: Việc dựng đồ thị in-memory tốn vài mili-giây CPU, nhưng hoàn toàn xứng đáng so với việc tiết kiệm hàng trăm lần I/O đĩa và loại bỏ hoàn toàn các task lỗi trên worker.

