# Frontend Rules & Guidelines (`web/`)

Quy tắc áp dụng bắt buộc khi xây dựng hoặc sửa đổi mã nguồn trong thư mục `web/`.

---

## 1. Package Manager & Script Execution
- Luôn sử dụng **`pnpm`** cho toàn bộ thao tác trong thư mục `web/` (`pnpm add`, `pnpm dlx`, `pnpm run`).
- **TUYỆT ĐỐI KHÔNG** dùng `npm` hoặc `npx`.

---

## 2. API Auto-Generation với Orval & Cảnh Báo Thiếu API
- Thư mục `web/src/gen` được tự động sinh bởi `orval` (`pnpm run gen:api`).
- **TUYỆT ĐỐI KHÔNG** viết, sửa hoặc thêm code thủ công bên trong `src/gen`.
- Mọi logic custom API, interceptors, error handling phải đặt bên ngoài (ví dụ: `src/lib/api-client.ts`).
- **QUY TẮC BẮT BUỘC NHẮC USER KHI THIẾU API HOẶC CHƯA GEN ORVAL**:
  - Khi làm việc trên Frontend mà nhận thấy API cần dùng **chưa có trong `src/gen`** hoặc **Backend hoàn toàn chưa có endpoint đó**:
  - **TUYỆT ĐỐI KHÔNG** tự ý âm thầm viết code wrapper thủ công bằng `customInstance` hay raw axios.
  - **BẮT BUỘC PHẢI DỪNG LẠI VÀ THÔNG BÁO NGAY CHO USER**:
    + *Trường hợp 1 (Backend đã có, Orval chưa gen)*: Thông báo cho user biết endpoint đã tồn tại ở Backend nhưng Frontend chưa gen, hướng dẫn/nhắc user bật Backend (`.\cli start`) và chạy `pnpm run gen:api` trong `web/` để đồng bộ.
    + *Trường hợp 2 (Backend cũng chưa có endpoint)*: Báo rõ cho user rằng Backend chưa hỗ trợ endpoint này, cần triển khai Slice Backend trước hay có hướng đi nào khác.


---

## 3. Kiến Trúc Ràng Buộc Cốt Lõi
- **Styling**: Bắt buộc dùng CSS tokens của Shadcn (ví dụ: `bg-background`, `text-muted-foreground`). KHÔNG hardcode mã màu.
- **State**: Bộ lọc (filter), tìm kiếm, phân trang (pagination) BẮT BUỘC lưu trên URL thông qua TanStack Router search params. KHÔNG dùng `useState` cho URL state.
- **Forms**: Bắt buộc dùng `react-hook-form` kết hợp validation schema bằng `zod`.
- **Dates**: Bắt buộc dùng `Temporal API` (`@/lib/temporal`). CẤM dùng native JavaScript `Date` trừ khi tương tác ở ranh giới UI nguyên thủy.
- **Error Handling**: Xử lý tập trung trong `api-client.ts`. KHÔNG viết `try-catch` tùy tiện bên trong React components.

---

## 4. Kiến Trúc Custom Hooks (MANDATORY)
- Tất cả custom hooks của 1 feature phải đặt tại: `src/features/<feature>/hooks/use<Feature>.ts`.
- **TUYỆT ĐỐI KHÔNG** gọi trực tiếp `customInstance` hoặc viết raw axios thủ công khi Orval đã sinh sẵn API trong `src/gen/endpoints/`.
- **Namespace Import:** Luôn import API tự sinh theo namespace:
  ```typescript
  import * as Api from "@/gen/endpoints/<feature>/<feature>";
  ```
- **Re-export Types:** Re-export toàn bộ DTO request/response từ `@/gen/model` ở đầu file hook để các components chỉ cần import tập trung từ `hooks/use<Feature>`.
- **Query Hooks:** Bọc `useGet...` tự sinh, cấu hình `placeholderData: keepPreviousData` (cho list query) và `enabled: !!id` (cho get by id query).
- **Mutation Hooks:**
  - Bắt buộc dùng factory: `createMutationHook(Api.useMutationName, [queryKeysToInvalidate])()`.
  - Tự động invalidate cache khi mutation thành công, không gọi `queryClient.invalidateQueries` thủ công rải rác trong Dialog/Component.

---

## 5. React Aria Components & Thư Viện UI
- **Custom Shadcn Stack:** Dự án sử dụng bộ Shadcn đặc biệt xây dựng trên nền **React Aria Components**, **KHÔNG PHẢI Radix UI**.
- **Component Props Constraints:** Các thuộc tính quen thuộc của Radix như `asChild` thường **KHÔNG TỒN TẠI** hoặc hành vi khác biệt. Trước khi sử dụng props, BẮT BUỘC đọc file type definition trong `src/components/ui/`.
- **Tái Sử Dụng Base Components:** Ưu tiên tái sử dụng các component có sẵn trong `src/components/custom-ui/` và `src/components/layout/` (`BaseDialog`, `BaseFormDialog`, `ResourcePageShell`, `FormSubmitButton`). Không tự chế lại dialog hay page shell từ đầu.

---

## 6. Table & Dialog Architecture
- **Data Tables**: Table phải là "dumb" presentation component. Không truyền các action callbacks (`onEdit`, `onDelete`) từ Page xuống Table. Không đặt header hay nút "Add" bên trong Table component.
- **Action Columns**: Các cột thao tác mở trực tiếp dialog qua store: `useDialogStore(state => state.openDialog)`.
- **Dialog Extraction**: Toàn bộ dialog (Create, Update, Delete) phải là standalone component đặt trong `features/*/dialogs/` và đăng ký tập trung qua registry (`index.ts`). Không viết inline dialog state (`useState`) trong Page.

---

## 7. Dynamic Form & Canvas Form Architecture
- **Phân biệt Thuật Ngữ**: `FormRenderer` (vẽ Form cho End-User từ JSON) vs `FormBuilder` (Giao diện cấu hình cho Admin).
- **BaseFormField**: Mọi Form Control phải bọc qua `BaseFormField` và dùng `OmitFormProps` để tránh xung đột Type với React Hook Form.
- **Kiến trúc Sàn (Scoped Registry):** Khi phát triển Form Controls cho domain đặc thù (Pipeline Canvas), dùng `ScopedFieldRegistry` kế thừa từ `baseRegistry` (như `pipelineRegistry`).
- **Scope Context Injection:** Cung cấp context (`pipelineId`, `projectId`, `variables`, `edges`, `nodes`) qua Context Provider ở cấp Canvas/Page (`PipelineFormScopeProvider`). Các Form Controls bên dưới đọc qua hook `usePipelineFormScope()`.

---

## 8. Kiểm Tra Mã Nguồn & Type-Checking (Code Verification)
- **CẢNH BÁO QUAN TRỌNG VỀ TSCONFIG**: Do dự án sử dụng TypeScript Project References, file `tsconfig.json` gốc có `"files": []`. Do đó:
  - **TUYỆT ĐỐI KHÔNG** dùng lệnh `pnpm tsc --noEmit` trần trụi (vì nó sẽ bỏ qua thư mục `src/` và luôn báo 0 lỗi dù code sai).
- **BẮT BUỘC** kiểm tra lỗi TypeScript bằng một trong các lệnh sau:
  ```bash
  pnpm run typecheck
  # hoặc
  pnpm tsc -b
  ```
- Trước khi nghiệm thu hoặc báo cáo hoàn thành tính năng, chạy lệnh build tổng thể để xác nhận cả TypeScript lẫn Vite bundle đều qua:
  ```bash
  pnpm build
  ```
- Bất cứ lỗi TypeScript hay Warning nghiêm ngặt (`noUnusedLocals`, `noUnusedParameters`) nào xuất hiện cũng phải được sửa triệt để trước khi chuyển giao.

---

## 9. Quy Chuẩn Page Layout Container & Header (Chống Lệch Layout)
- **Chuẩn duy nhất cho Page / Sub-page Wrapper:** Mọi trang tính năng (Feature Page, Resource Page, Settings Page) nằm trong `ProjectShell` hoặc `AppShell` BẮT BUỘC sử dụng wrapper container chuẩn:
  ```tsx
  <div className="p-6 mx-auto space-y-6 w-full min-w-0">
  ```
- **CẤM TỰ Ý DÙNG `max-w-*` TRÊN PAGE WRAPPER:**
  - Tuyệt đối **KHÔNG** bọc toàn trang bằng `max-w-4xl`, `max-w-5xl`, `max-w-6xl` hay `max-w-prose`. Việc này làm cho trang bị co rúm vào giữa và lệch hoàn toàn so với các trang Data-First khác trong Studio (`Repositories`, `Pipelines`, `Contents`).
  - Layout phải tràn đều không gian làm việc của Desktop Studio (`w-full min-w-0`).
- **Chuẩn Tiêu Đề Header Trang (Page Header Typography):**
  - Tiêu đề chính trang: `<h1 className="text-2xl font-bold tracking-tight">` (KHÔNG dùng `h2` hay `h3` làm title trang).
  - Mô tả phụ: `<p className="text-sm text-muted-foreground mt-1">`.
  - Nút thao tác chính: Luôn dùng `<Button onPress={() => openDialog(...)} className="flex items-center gap-2 cursor-pointer">` với icon `<Plus className="size-4" />`.
- **Chuẩn Empty State:**
  - Luôn sử dụng icon bọc trong vòng tròn: `<div className="p-3 rounded-full bg-primary/10 text-primary mb-3"><Icon className="size-8" /></div>`.
  - Padding: `py-16 px-4 rounded-xl border border-dashed text-center bg-card`.

