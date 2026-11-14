# Kế hoạch đối chiếu và đơn giản hóa file parameter của Pipeline

Ngày: 2026-10-08. Trạng thái: người dùng đã duyệt kế hoạch; scope 1 hoàn thành, dừng review trước scope 2.

## 1. Mục tiêu và ranh giới

Chỉ xử lý upload file trong config của node trên canvas. Giữ draft → debounce → sync toàn graph theo quyết định của người dùng; quy tắc granular API trong .agents/rules/backend.md đã lỗi thời đối với scope này.

Không gộp cancel pipeline, batch publish script, worker, migration, DbContextFactory, sửa Content/DynamicForms hay dọn Orval vào đợt này. Không discard các thay đổi hiện có. Mỗi scope kết thúc bằng diff và kết quả kiểm tra riêng, không tự chuyển sang scope kế tiếp.

## 2. Đối chiếu code hiện tại

Các đường dẫn backend bên dưới tính từ api/src/Modules; frontend tính từ web/src/features/pipelines.

| Thành phần | Hiện tại đã kiểm tra | Hướng xử lý |
| --- | --- | --- |
| hooks/usePipelineFileUpload.ts | Upload/confirm rồi trả assetId + originalName | Giữ luồng; không thêm endpoint link node |
| types/file-parameter.ts và Pipeline/Automation.Pipeline/Domain/ValueObjects/PipelineFileParameter.cs | Phân biệt draft với reference assetLinkId | Giữ ý nghĩa; không đổi tên originalName sang name chỉ để giống ví dụ |
| components/canvas/hooks/usePipelineDraftState.ts | Debounce 600ms; chặn save chồng; chỉ thay config khi còn giống giá trị đã gửi | Giữ; bổ sung kết quả lỗi từng pin, trạng thái chưa lưu và retry; kiểm tra cả query refresh có ghi đè draft hay không |
| Pipeline/Automation.Pipeline/Features/Pipelines/SavePipelineGraph.cs | Build DTO trước để lấy Inputs, gọi PrepareAsync từng node, lỗi một pin làm fail toàn lượt; build DTO lại sau save | Gom file pins thành batch; điều phối trực tiếp ở slice; trả kết quả từng pin |
| Pipeline/Automation.Pipeline/Features/Pipelines/Services/PipelineFileChanges.cs | Giữ danh sách created/removed, Complete và Dispose thực hiện compensation | Thay bằng luồng gọi contract rõ ràng; chỉ xóa file sau khi hành vi thay thế đã được kiểm tra |
| Pipeline/Automation.Pipeline/Features/Pipelines/Services/PipelineGraphDtoBuilder.cs | Dùng chung cho GET/Save; dựng pins và hydrate file metadata | Giữ builder; tái sử dụng phần dựng definitions, tránh hydrate toàn DTO hai lần; không tạo thêm service chỉ để di chuyển code |
| Files/Automation.Files.Contracts/IAssetApi.cs và Files/Automation.Files/Infrastructure/AssetApiService.cs | Có create/get/remove theo owner; chưa có batch đối chiếu trả kết quả từng item | Thêm contract nghiệp vụ nhỏ và implementation trong Files |
| Pipeline/Automation.Pipeline/Features/Pipelines/PipelineFileLinksCleanup.cs | Kiểm tra graph đang lưu trước khi unlink exact link; phục vụ thay/clear | Giữ tạm trong scope đầu; đánh giá với ranh giới commit trước khi quyết định bỏ |
| PipelineFileValue, PipelineAssetSlots, runtime resolver | Đã có owner node + slot từng pin, persist linkId, resolve metadata | Tái sử dụng, chỉ sửa nếu contract cần; kiểm tra hồi quy |

Không coi tên file mới là bằng chứng file thừa. Contract liên module thuộc Files.Contracts; orchestration một caller thuộc SavePipelineGraph; builder dùng chung được giữ. Không thêm entity hay bảng cho scope này.

## 3. Contract và hành vi đề xuất

- Draft tiếp tục dùng { assetId, originalName }; tên name trong trao đổi chỉ cùng ý nghĩa filename.
- Giá trị đã lưu tiếp tục dùng { assetLinkId }. Metadata hiển thị lấy từ link cụ thể.
- Pipeline xác định file pins từ definitions phía backend, gom theo nodeId + pinId. Không scan mọi GUID hoặc chỉ nhìn hình dạng JSON để kết luận là file pin.
- Files nhận owner + slot và dữ liệu file mong muốn; không nhận PipelineNode hoặc hiểu graph. Pipeline ánh xạ kết quả owner/slot về node/pin.
- Draft cần đối chiếu, không đồng nghĩa luôn tạo mới. Cùng owner/slot + assetId + filename phải tái sử dụng link phù hợp khi retry. Cùng asset ở pin khác hoặc filename khác không được gộp nhầm.
- Contract batch trả đúng một kết quả cho mỗi item: khóa tương ứng, link khi thành công hoặc mã lỗi/thông báo. Asset chưa confirm, sai owner, sai slot, size/MIME không hợp lệ phải bị từ chối.
- Phân biệt rõ giữ link, thay file và clear. Batch rỗng không được hiểu là xóa mọi link. Clear một pin không được ảnh hưởng pin khác.
- Trong scope 1, thao tác bảo đảm link tồn tại không xóa link cũ. Việc unlink chỉ diễn ra khi graph đã bỏ reference thành công.

## 4. Quy tắc lỗi đề xuất để review trước scope 2

- Lỗi cấu trúc graph/quyền truy cập: fail request trước khi tạo link.
- Lỗi nghiệp vụ của một file: trả lỗi cho pin đó, vẫn cho phép các pin hợp lệ và thay đổi graph hợp lệ được lưu.
- Pin lỗi trên node đã có: giữ reference đã lưu trước đó. Pin lỗi trên node mới: không lưu draft assetId như reference hợp lệ; pin để trống, UI giữ draft lỗi để sửa/retry. Required pin còn thiếu không được chạy pipeline.
- Response gồm graph thực sự đã lưu và file results; chỉ đánh dấu saved sau khi graph commit thành công. Không suy diễn Files thành công là toàn lượt save thành công.
- Frontend chỉ thay draft của pin thành công nếu giá trị hiện tại còn khớp lần gửi; không áp metadata của file cũ lên lựa chọn mới. Pin lỗi giữ lựa chọn và trạng thái lỗi, không tự retry vô hạn do debounce.
- Lỗi hạ tầng/lưu graph: không báo partial save thành công khi graph chưa commit. Giữ draft để retry.

## 5. Các scope triển khai

### Scope 1 — Contract batch trong Files

Sửa IAssetApi.cs và AssetApiService.cs; dự kiến thêm một file contract AssetLinkSync.cs trong Automation.Files.Contracts chứa request/result liên quan. Tên cụ thể chốt khi triển khai, không tạo tầng service mới.

Tái sử dụng validate/query/link hiện có; mỗi module giữ DbContext của mình. Không đổi hành vi UpsertMultipleAsync mà DynamicForms đang gọi.

Kiểm tra: cùng dữ liệu gửi hai lần không nhân link; cùng asset khác tên/owner/pin; sai owner; asset chưa confirm; giới hạn slot; batch có item thành công và thất bại; batch rỗng; giữ nguyên link cũ. Làm rõ lỗi nghiệp vụ từng item và lỗi DB toàn lượt.

Điểm dừng: review contract, file diff, tests Files. Chưa nối canvas.

### Scope 2 — SavePipelineGraph gọi contract

Sửa SavePipelineGraph.cs và DTO liên quan tại Features/Pipelines/Dtos/PipelineDtos.cs; điều chỉnh builder tại chỗ nếu cần. Gom pins, gọi Files một batch, áp kết quả, lưu graph và trả trạng thái từng pin. Loại PipelineFileChanges.cs sau khi có thay thế đầy đủ.

Trước khi sửa, xác minh transaction/outbox hiện tại: SaveChanges trong handler chưa đủ chứng minh transaction đã commit. Giữ cleanup hiện có nếu đó là đường bảo đảm chỉ unlink sau commit; không hứa xóa handler chỉ để giảm số file.

Phải có quyết định rõ cho link mới nếu graph save thất bại: retry tái sử dụng link; compensation nếu dùng phải hiện rõ, chỉ xử lý link mới và không xóa link đã được graph khác/lượt khác nhận. Không coi orphan asset cron là cơ chế dọn link còn tồn tại. Nếu chưa có cách thu hồi link thừa khi người dùng bỏ retry, ghi rõ giới hạn và thảo luận trước khi thêm cơ chế mới. Đây là điểm phải giải quyết trước khi nghiệm thu scope 2.

Kiểm tra: node mới/cũ; nhiều pin; success lẫn failure; thay/clear; xóa node; graph save fail; retry sau mất response; cleanup không xóa link còn dùng; GET và runtime vẫn resolve đúng link. Không thêm transaction xuyên DbContext hoặc sửa SharedKernel toàn cục để hoàn thành scope này.

Điểm dừng: review riêng backend và hành vi lỗi trước frontend.

### Scope 3 — Draft frontend và nghiệm thu luồng

Sửa usePipelineGraph.ts, usePipelineDraftState.ts, types/file-parameter.ts và các upload control/inspector thực sự cần hiển thị lỗi. Giữ upload hook và debounce hiện có. Regenerate client qua Orval khi response thay đổi; không sửa tay gen và không gộp dọn toàn bộ cấu hình Orval.

Bổ sung apply kết quả theo node/pin, giữ lựa chọn mới khi response cũ về, lỗi/retry từng pin và trạng thái chưa lưu. Kiểm tra effect reset từ graph/query invalidation, đổi pipeline trong lúc request chạy, clear và node bị xóa khi upload đang chạy.

Kiểm tra build frontend và thao tác thực tế: upload → autosave → reload; hai pin một lỗi; chọn file B lúc A đang save; retry không nhân link; clear; node mới bị bỏ; save lỗi không hiển thị đã lưu. Chạy tests backend liên quan, pnpm.cmd run build trong web. Chỉ chạy lại khi thay đổi hoặc có vấn đề mới.

Điểm dừng: review diff của scope và báo rõ kiểm tra đã chạy/thất bại/chưa chạy.

## 6. Content / DynamicForms dùng để tham khảo

Content gọi ISchemaApi.SaveDataAsync; FileFieldProcessor lấy asset/name và gọi Files.UpsertMultipleAsync. Học cách phân trách nhiệm này, không sao chép nguyên implementation:

- SchemaApi lưu Values trước rồi bỏ qua Result của LinkFileFieldsAsync.
- UpsertMultipleAsync bỏ qua input rỗng; toRemove so existing với tập existing nên luôn rỗng.
- Các field chia sẻ owner/slot nhưng được xử lý từng field; sửa thành snapshot removal trực tiếp có thể xóa link của field khác.

Các lỗi đó được ghi nhận, không sửa kèm Pipeline.

## 7. Tài liệu và giới hạn thay đổi

Kế hoạch duy nhất của đợt này nằm trong .agents/plans. Khi triển khai xong cập nhật docs/pipeline-file-parameter-contract.md cho đúng hành vi thực tế; không tạo thêm plan trùng trong docs. Ghi nhận cần cập nhật quy tắc granular đã lỗi thời, không đổi ngược quyết định draft sync.

Lượt lập kế hoạch chỉ tạo tài liệu này; không sửa source, chạy migration, discard, stage hoặc commit thay đổi. Các kiểm tra ở trên là tiêu chí dự kiến, chưa phải kết quả đã chạy.
## 8. Kết quả scope 1 — 2026-10-08

- Thêm AssetLinkSync.cs (request/result) và IAssetApi.SyncLinksAsync; implementation nằm trong AssetApiService hiện có.
- Batch đọc assets/links, đối chiếu owner/slot + asset/name, validate từng item và lưu các link mới một lần. Tái sử dụng validation asset của CreateLinkAsync.
- Existing link được kiểm tra ownership/slot và yêu cầu asset; clear chỉ được xác nhận, không unlink. Không đổi UpsertMultipleAsync.
- Lỗi nghiệp vụ có ErrorCode/ErrorMessage từng item; lỗi database/cancellation throw. Detach các insert của lời gọi khi save kết thúc để không để lại pending inserts sau lỗi.
- Retry tuần tự và item trùng trong batch tái sử dụng link; chưa bảo đảm chống trùng giữa các lời gọi đồng thời. Không thêm locking, migration hay transaction xuyên module.
- Đã chạy: dotnet test api/tests/Automation.Files.Tests/Automation.Files.Tests.csproj --no-restore --verbosity minimal. Kết quả cuối: 24 passed, 0 failed, 0 skipped.
- Tests được bổ sung vào AssetLinkApiTests.cs hiện có; tài liệu contract cập nhật trong docs/pipeline-file-parameter-contract.md.
- Source đổi trong scope này: một file contract mới, hai file Files hiện có, một file tests hiện có. Không nối SavePipelineGraph/frontend, không xóa PipelineFileChanges/cleanup, không stage/commit/discard.
- Scope 2 và scope 3 chưa triển khai. Dừng đúng ranh giới review của kế hoạch.