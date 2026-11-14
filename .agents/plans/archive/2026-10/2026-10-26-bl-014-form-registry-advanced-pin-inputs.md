# Kế Hoạch Kỹ Thuật: Form-Registry-Driven Advanced Pin Inputs & Preset Mode

- **Mã kế hoạch**: `BL-014` (Hoàn thiện mắt xích hội tụ của `BL-024` & Dynamic Form Control Architecture)
- **Ngày lập**: 26/10/2026
- **Trạng thái**: `Drafting / Waiting for Review`
- **Phạm vi tác động**:
  - **Frontend Form Adapters & Registry**:
    - `web/src/features/pipelines/form-scope/field-adapters/types.ts`
    - `web/src/features/pipelines/form-scope/field-adapters/metadataHintAdapter.ts`
    - `web/src/features/pipelines/form-scope/field-adapters/index.ts`
    - `web/src/features/pipelines/form-scope/pipelineRegistry.ts`
  - **Frontend Pin Inspector & Ingestion Deck**:
    - `web/src/features/pipelines/components/node-editor/PinConfigInspector.tsx`
    - `web/src/features/pipelines/components/script-ingestion/deck-workspace/VisualPinMapperTab.tsx`
  - **Tài liệu & Sổ bộ**:
    - `BACKLOG.md` (Chuyển BL-014 sang In Progress)
    - `docs/pipelines/SCRIPT_NODE_GUIDELINES.md`
    - `docs/frontend/patterns/pipelines_canvas.md`

---

## 1. Bối Cảnh & Vấn Đề Cần Giải Quyết

Trong hệ sinh thái Pipeline Canvas, hệ thống Dynamic Form (`pipelineRegistry` + `FormRenderer`) đã được trang bị đầy đủ các Form Control linh hoạt (như `input`, `textarea`, `select`, `tagsInput`, `switch`, `number`, `pin:assetUpload`, v.v.).

Tuy nhiên, cơ chế kết nối từ **PinDefinition** sang **FormRenderer** hiện tại đang bị 2 hạn chế lớn:

1. **Cơ chế suy diễn Control cứng nhắc (Adapter Guessing)**:
   - Các file adapter trong `field-adapters/` (`primitiveAdapter`, `entityRefAdapter`, `assetAdapter`) tự suy đoán control duy nhất dựa trên `primitiveType`. Ví dụ: cứ là `Text` thì luôn hiển thị thành `<Input>` 1 dòng thông thường.
   - Khi một Pin mang dữ liệu văn bản lớn (như System Prompt, JSON config, Python Script snippet), người dùng bị "giam cầm" trong một ô input 1 dòng chật hẹp, không thể mở rộng thành `<Textarea>`.
2. **Preset Mode & Options bị đóng băng ở dạng Read-Only**:
   - Ở kế hoạch `BL-024` trước đó, chúng ta mới chỉ bóc tách thụ động `Literal[...]` từ code Python AST rồi nhét vào `metadata`.
   - Trên giao diện Ingestion (`VisualPinMapperTab` / `PinConfigInspector`), danh sách options chỉ hiện dưới dạng badges thông tin tĩnh. Tác giả script hoặc kỹ sư pipeline **không thể**:
     - Tự tay thêm/bớt/sửa các preset options nếu file Python không khai báo `Literal`.
     - Chuyển đổi linh hoạt giữa `Freeform Input` (nhập tự do) và `Preset Dropdown` (chọn từ danh sách định sẵn).
     - Cho phép chế độ lai `allowCustom` (vừa chọn từ preset gợi ý, vừa có thể gõ giá trị tùy ý).

---

## 2. Bảng Đối Chiếu Trước & Sau Thực Hiện (Before vs After Matrix)

| Hạng mục kiến trúc | TRƯỚC (Hiện tại) | SAU (Kiến trúc đề xuất) |
| :--- | :--- | :--- |
| **Quyền quyết định UI Control của Pin** | Suy diễn cố định từ `primitiveType` (`Text` $\rightarrow$ `input`, `Number` $\rightarrow$ `number`). Không có cách nào ghi đè. | **Tôn trọng `metadata.type` trước tiên**: Nếu `metadata.type` thuộc `pipelineRegistry` (`select`, `textarea`, `tagsInput`...), hệ thống lập tức ánh xạ sang đúng Control đó. |
| **Cấu hình Preset Mode trên Ingestion Deck** | Read-only. Chỉ hiển thị các options bóc tách từ Python `Literal`. Không cho chỉnh sửa. | **Chủ động cấu hình 100%**: Hỗ trợ chuyển đổi giữa `Freeform Mode` và `Preset Options Mode`. Tích hợp `TagsInput` để tác giả tự thêm/xóa/sửa các giá trị preset. |
| **Multiline Text Support** | Không có. Mọi Pin chuỗi đều hiển thị dạng input 1 dòng. | Hỗ trợ control `textarea` với cấu hình số dòng `rows` (mặc định 3–5 dòng), tự động co giãn. |
| **Độ mở rộng của Form Registry** | Pin Inspector và Form Renderer tách rời; các component mới trong Registry khó được Pin tận dụng. | Pin trở thành "công dân hạng nhất" của `pipelineRegistry`, mở đường cho các control nâng cao (ColorPicker, Slider, JsonEditor) chỉ bằng cách gán `metadata.type`. |

---

## 3. Thiết Kế Hợp Đồng Dữ Liệu (Data Contract)

Hợp đồng `PinDefinition.Metadata` được lưu dạng chuỗi JSON trên PostgreSQL `jsonb` của `Inputs`/`Outputs`:

```json
{
  "type": "select",                   // ID Control trong pipelineRegistry: "select" | "textarea" | "tagsInput" | "input"
  "options": ["gemini-1.5-pro", "gpt-4o", "claude-3-5-sonnet"], // Danh sách presets nếu type="select"
  "allowCustom": true,                // Cho phép nhập tự do ngoài options (Combobox mode)
  "rows": 4,                          // Số dòng hiển thị nếu type="textarea"
  "placeholder": "Select or enter model...",
  "multiline": false
}
```

---

## 4. Lộ Trình Triển Khai 3 Phase (Phased Execution)

### Phase 1: Mở Rộng Form Adapter & Pipeline Registry (`web/src/features/pipelines/form-scope/`)
* **Nhiệm vụ cụ thể**:
  1. Cập nhật `PinMetadataHint` trong [types.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/field-adapters/types.ts):
     - Bổ sung `type?: "input" | "textarea" | "select" | "tagsInput" | string`.
     - Bổ sung `allowCustom?: boolean`, `rows?: number`, `placeholder?: string`.
  2. Nâng cấp [metadataHintAdapter.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/field-adapters/metadataHintAdapter.ts):
     - Mở rộng hàm `match`: Bắt mọi Pin có `hint.type` hợp lệ (`"select"`, `"textarea"`, `"tagsInput"`, `"tag-tree-select"` hoặc có `hint.options`).
     - Mở rộng hàm `create`:
       - Khi `hint.type === "textarea"`: Trả về field definition có `type: "textarea"` kèm `properties: { rows: hint.rows || 4 }`.
       - Khi `hint.type === "tagsInput"`: Trả về field definition có `type: "tagsInput"`.
       - Khi `hint.type === "select"` hoặc có `options`: Trả về field definition có `type: "select"`, gán `options` và `defaultValue`.
  3. Đăng ký & Hoàn thiện Schema trong [pipelineRegistry.ts](file:///d:/FullStack/Automation/web/src/features/pipelines/form-scope/pipelineRegistry.ts) đảm bảo các control này validate Zod sạch sẽ khi submit node config.
* **Tiêu chí nghiệm thu Phase 1**:
  - `pnpm --dir web tsc --noEmit` pass không lỗi.
  - Test case: Pin có `metadata = '{"type":"textarea","rows":5}'` tự động render `<Textarea>` nhiều dòng trên Canvas Node Inspector.

---

### Phase 2: Nâng Cấp Pin Inspector UI (`PinConfigInspector.tsx`)
* **Nhiệm vụ cụ thể**:
  1. Thêm khối điều khiển **"UI Control & Input Mode"** trong [PinConfigInspector.tsx](file:///d:/FullStack/Automation/web/src/features/pipelines/components/node-editor/PinConfigInspector.tsx) khi chọn một Input Pin:
     - Chọn chế độ hiển thị:
       - **Default Input** (`input`): Nhập 1 dòng truyền thống.
       - **Preset Dropdown** (`select`): Chế độ danh sách lựa chọn định sẵn.
       - **Multiline Text** (`textarea`): Chế độ nhập văn bản dài (Prompt / Script / JSON).
       - **Tags Array** (`tagsInput`): Chế độ nhập mảng từ khóa.
  2. Khi chọn **Preset Dropdown (`select`)**:
     - Hiển thị bộ nhập `TagsInput` cho phép thêm, sửa, xóa các giá trị options bằng tay.
     - Tự động nạp sẵn các options đã bóc tách được từ Python AST `Literal`.
     - Cho phép chọn 1 option làm **Default Value**.
     - Cung cấp toggle **Allow Custom Value** (`allowCustom`).
  3. Khi chọn **Multiline Text (`textarea`)**:
     - Hiển thị ô chọn số dòng hiển thị `Rows` (mặc định 4 dòng).
  4. Đồng bộ 2 chiều (Bi-directional Sync):
     - Mọi thay đổi trong UI lập tức cập nhật vào `pin.metadata` (dưới dạng JSON string).
* **Tiêu chí nghiệm thu Phase 2**:
  - Tác giả có thể thêm/xóa option preset tùy ý.
  - Chuyển đổi mượt mà giữa các kiểu control mà không làm mất `primitiveType` gốc (ví dụ: kiểu gốc vẫn là `Text`, nhưng control hiển thị là `textarea` hoặc `select`).

---

### Phase 3: Kiểm Thử Hội Tụ End-to-End & Cập Nhật Tài Liệu
* **Nhiệm vụ cụ thể**:
  1. Kiểm thử trên luồng Ingestion (`VisualPinMapperTab.tsx`):
     - Import script `workers/pipelines/ai/classify_mesh_types.py`.
     - Xác nhận pin `provider` nhận diện đúng preset options `["gemini", "openai", "ollama"]`.
     - Thêm một option mới `"deepseek"` bằng tay trên giao diện `PinConfigInspector`.
     - Đổi pin `raw_metadata` sang kiểu `Multiline Text (textarea)`.
  2. Lưu Custom Node vào thư viện và kéo ra Canvas:
     - Chân pin `provider` hiển thị Dropdown Select có cả 4 options (`gemini`, `openai`, `ollama`, `deepseek`).
     - Chân pin `raw_metadata` hiển thị dạng Textarea co giãn thoải mái.
  3. Cập nhật tài liệu:
     - `BACKLOG.md`: Chuyển `BL-014` sang trạng thái `Resolved`.
     - Cập nhật hướng dẫn viết script trong `docs/pipelines/SCRIPT_NODE_GUIDELINES.md`.

---

## 5. Ranh Giới Đỏ & Nguyên Tắc Bảo Toàn Kiến Trúc (Redlines)

1. **Tuyệt đối không phá vỡ Schema Backend Core**:
   - `PinDefinition.PrimitiveType` và `PinDefinition.Cardinality` vẫn là Nguồn Chân Lý Duy Nhất (SSOT) cho việc validate kiểu dữ liệu runtime và nối dây Pin trên Canvas.
   - `controlType` và `options` chỉ là **Metadata gợi ý hiển thị (Presentation Layer)**, lưu trong trường `Metadata` hiện có, không can thiệp vào schema DB PostgreSQL.
2. **Backward Compatibility**:
   - Mọi Node cũ không có `metadata.type` tiếp tục hoạt động bình thường 100% qua fallback `primitiveAdapter`.
3. **Tuân thủ Native Tooling**:
   - Toàn bộ code thay đổi được thực hiện trực tiếp bằng tool `edit_file` / `write_file`, không dùng script ngoài.

---

## 6. Cổng Duyệt Của Người Dùng (User Review Gate)

> [!IMPORTANT]
> Đây là bản Kế hoạch Kỹ thuật chi tiết. Agent sẽ dừng lại tại đây và **KHÔNG tự ý sửa code** cho đến khi User xem xét và xác nhận đồng ý thực hiện (ví dụ: gõ *"tiến hành plan"* hoặc phản hồi uốn nắn).

