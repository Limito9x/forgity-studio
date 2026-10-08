# Automation Studio — Frontend Design System & Layout Guidelines

Tài liệu này là **Single Source of Truth (Nguồn chân lý duy nhất)** định nghĩa toàn bộ quy chuẩn giao diện (UI/UX), kiến trúc Layout, nhịp điệu khoảng cách (Spacing Rhythm), bảng màu (Color Tokens), và Typography cho Frontend của Automation Studio.

> **QUY TẮC CỐT TỬ CHO AGENTS:** Mọi Agent khi sinh mã hoặc chỉnh sửa bất kỳ trang (page), thành phần (component), hoặc hộp thoại (dialog) nào trên Frontend **BẮT BUỘC** phải tuân theo tài liệu này. Tuyệt đối không tự ý thêm các class layout tùy tiện (`max-w-* mx-auto`, padding khác chuẩn `p-6`).

---

## 1. Công Nghệ Nền Tảng (Core Stack)

- **Framework**: React 19 + Vite + TypeScript.
- **Routing**: TanStack Router (File-based routes).
- **CSS Engine**: Tailwind CSS v4 (`@import "tailwindcss";`, `@theme inline`).
- **Design Tokens**: OKLCH Colors (Tối ưu độ tương phản cho cả Dark và Light mode).
- **Component Primitives**: React Aria Components kết hợp phong cách Shadcn UI.
- **Icons**: `lucide-react`.
- **Font**: `@fontsource-variable/inter` (Inter Variable).

---

## 2. Ba Khuôn Mẫu Bố Cục Trang Chuẩn (Layout Archetypes)

Để giải quyết triệt để tình trạng mỗi trang bị lệch lề, thụt thò hoặc padding không đồng nhất, toàn bộ ứng dụng chỉ sử dụng **3 Khuôn mẫu bố cục** duy nhất:

### Khuôn Mẫu 1: Resource / CRUD Management Page (Mặc định cho 90% trang)
Áp dụng cho: *Users, Roles, Projects, Runners, Repositories, Structs, Audit Logs, v.v.*
* **BẮT BUỘC sử dụng component**: `<ResourcePageShell>` ([web/src/components/layout/shells/ResourcePageShell.tsx](file:///d:/FullStack/Automation/web/src/components/layout/shells/ResourcePageShell.tsx)).
* **Cơ chế**: `<ResourcePageShell>` đã tự động tích hợp class `page-container`, thanh tìm kiếm từ khóa, bộ lọc linh hoạt (FilterPanel), nút thêm mới (Add Button), nút làm mới (Refresh) và chế độ ẩn/hiện cột (View Options).
* **Mẫu chuẩn**:
```tsx
export function MyResourcePage({ useSearch, useNavigate }: ResourcePageProps) {
  return (
    <ResourcePageShell
      title="Runners Management"
      description="Manage workstation daemons and stage executors."
      icon={Cpu}
      onAdd={() => openDialog("connect-runner")}
      addLabel="Connect Runner"
      resource={resourceQuery}
      filterConfig={filterConfig}
    >
      <MyResourceTable table={table} columns={columns} isLoading={isLoading} />
    </ResourcePageShell>
  );
}
```

---

### Khuôn Mẫu 2: Hub / Custom Dashboard / Multi-Section Page
Áp dụng cho: *Dashboard (`/`), System Settings (`/settings`), Node Ingestion, Create Custom Node, v.v.*
* **BẮT BUỘC sử dụng class**: `page-container` kết hợp `space-y-6`.
* **Định nghĩa trong `index.css`**:
  ```css
  @utility page-container {
    padding: 1.5rem; /* p-6 (24px) đồng nhất tuyệt đối */
    width: 100%;
    min-width: 0;
  }
  ```
* **CẤM TUYỆT ĐỐI**:
  - ❌ `max-w-5xl mx-auto` hoặc `max-w-7xl mx-auto` (làm nội dung bị bóp hẹp và thụt sâu vào giữa màn hình, lệch so với Header và Sidebar).
  - ❌ `p-4 md:p-6 lg:p-8` (khi lên màn hình lớn `lg`, trang sẽ bị thụt lề 32px thay vì 24px chuẩn).
* **Mẫu chuẩn**:
```tsx
export function MyCustomPage() {
  return (
    <div className="page-container space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Page Title</h1>
        <p className="text-sm text-muted-foreground">Subtitle description.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Content Cards */}
      </div>
    </div>
  );
}
```

---

### Khuôn Mẫu 3: Fullscreen Canvas / Visual Editor
Áp dụng cho: *Pipeline DAG Canvas (`/projects/$projectId/pipeline/$pipelineId`).*
* **Đặc tính**: Khung toàn màn hình, không có padding ngoài để diện tích tương tác của đồ thị (XYFlow) đạt tối đa.
* **Cấu trúc**:
```tsx
<div className="flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden relative bg-background">
  <ReactFlow nodes={nodes} edges={edges} ... />
</div>
```

---

## 3. Hệ Nhịp Điệu Khoảng Cách (Spacing Rhythm System)

Tuân thủ nghiêm ngặt hệ số **4px / 8px**:

| Phân loại | Tailwind Class | Giá trị thực | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| **Micro Spacing** | `gap-1` / `gap-1.5` | 4px - 6px | Khoảng cách giữa icon và label, trong button hoặc badge. |
| **Element Spacing** | `gap-2` | 8px | Khoảng cách giữa các nút toolbar, form control nội bộ. |
| **Card Gap** | `gap-4` | 16px | Khoảng cách giữa các Card trong lưới grid (`grid gap-4`). |
| **Section Spacing** | `space-y-6` | 24px | Khoảng cách giữa các khối lớn trên trang (`page-container space-y-6`). |
| **Standard Padding** | `p-6` | 24px | Padding bao quanh trang tiêu chuẩn (`page-container`). |
| **Card Padding** | `p-4` / `p-6` | 16px - 24px | Padding bên trong một Card. |

---

## 4. Bậc Cấp Chữ (Typography Scale)

Dự án sử dụng font chữ **Inter Variable**. Không tùy tiện đặt cỡ font ngoài bảng chuẩn sau:

| Bậc (Hierarchy) | Tailwind Class | Sử dụng cho |
| :--- | :--- | :--- |
| **Page Title (H1)** | `text-2xl font-bold tracking-tight text-foreground` | Tiêu đề lớn đầu trang trong Shell hoặc Hub. |
| **Section Title (H2)** | `text-lg font-semibold tracking-tight text-foreground` | Tiêu đề từng phân mục lớn (Recent Projects, Quick Actions). |
| **Card / Item Title (H3)** | `text-sm font-semibold text-foreground` | Tiêu đề card, tiêu đề node trên canvas. |
| **Subtitle / Description** | `text-sm text-muted-foreground` | Mô tả phụ ngay bên dưới H1. |
| **Body / Table Cell** | `text-xs/relaxed text-foreground` | Nội dung văn bản thường, dòng dữ liệu bảng. |
| **Label / Hint / Meta** | `text-xs text-muted-foreground` | Nhãn trường nhập liệu, text phụ trong bảng. |
| **Monospace / Code** | `font-mono text-xs bg-muted/40 px-1 py-0.5 rounded` | Script Hash, Runner ID, file path, code snippet. |

---

## 5. Bảng Màu & Tokens Ngữ Nghĩa (Semantic Color Tokens)

Dự án sử dụng chuẩn Tailwind v4 + OKLCH. **Tuyệt đối cấm hardcode mã hex (như `#ffffff`, `#1e293b`) hoặc màu cụ thể (như `bg-blue-600`):**

* **Nền**: `bg-background` (nền app), `bg-card` (nền thẻ), `bg-muted` (nền phụ, badge), `bg-popover` (nền dialog/menu).
* **Chữ**: `text-foreground` (chữ chính), `text-muted-foreground` (chữ phụ), `text-primary` (màu nhận diện chủ đạo), `text-destructive` (cảnh báo nguy hiểm / xóa).
* **Đường viền**: `border-border` (viền chuẩn), `border-border/60` (viền mờ nhẹ cho card/divider).
* **Trạng thái**:
  - `bg-primary text-primary-foreground`
  - `bg-secondary text-secondary-foreground`
  - `bg-destructive/10 text-destructive` (Soft Alert / Delete button variant).

---

## 6. Quy Chuẩn Thành Phần (Component Standards)

### A. Button (`@/components/ui/button`)
* Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`.
* Size: Chủ yếu dùng `size="sm"` (h-6) hoặc `size="default"` (h-7) trong UI bảng; `size="lg"` (h-8) cho nút Hero Action.

### B. Card (`@/components/ui/card`)
* Luôn tuân theo cấu trúc phân rã: `<Card>` -> `<CardHeader>` (chứa `<CardTitle>`, `<CardDescription>`) -> `<CardContent>` -> `<CardFooter>`.

### C. Dialogs & Modals
* Sử dụng tập trung thông qua `useDialogStore`: `openDialog("dialog-name", data)`.
* Tiêu đề dialog dùng `DialogTitle`, nội dung bọc trong `DialogBody` hoặc form control chuẩn.

---

## 7. Checklist Kiểm Tra Giao Diện Trước Khi Hoàn Tất (Self-Review Checklist)

Mỗi khi agent hoàn thành một tính năng Frontend, hãy đối chiếu:
- [ ] Trang có dùng đúng **`ResourcePageShell`** (nếu là trang bảng/resource) hoặc **`page-container space-y-6`** (nếu là hub/custom) không?
- [ ] Có xuất hiện bất kỳ `max-w-* mx-auto` nào ở cấp độ trang không? (Nếu có -> Xóa bỏ).
- [ ] Lề mép trái của nội dung có thẳng hàng với Breadcrumb/Title trên Header (24px / p-6) không?
- [ ] Có hardcode màu sắc nào ngoài semantic tokens không?
- [ ] Chạy `pnpm tsc -b` có đạt 0 lỗi TypeScript không?
