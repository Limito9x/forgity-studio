# HybridVSA Frontend — Agent Rules

Đây là bộ quy tắc bắt buộc khi generate hoặc chỉnh sửa code frontend.
Đọc toàn bộ file này trước khi bắt đầu bất kỳ task nào.

---

## 1. Styling — Tailwind + Shadcn Token

### BẮT BUỘC
- Chỉ dùng CSS token của shadcn: `bg-background`, `text-foreground`, `text-primary`, `border-border`, `bg-muted`, v.v.
- Spacing và radius dùng Tailwind utility chuẩn: `p-4`, `gap-2`, `rounded-md`

### NGHIÊM CẤM
- Hard-code màu: `bg-blue-600`, `text-gray-500`, `#3b82f6`
- Hard-code spacing tùy tiện không theo scale
- Inline style `style={{ color: '...' }}` trừ khi dynamic value từ data

### Lý do
Token system đảm bảo đổi theme toàn app chỉ cần sửa `index.css`, không phải hunt từng file.

---

## 2. API — Orval + TanStack Query

### Generated code (KHÔNG SỬA TAY)
```
web/src/gen/endpoints/   ← hooks + fetcher (tags-split)
web/src/gen/model/       ← TypeScript types + params
web/orval.config.ts      ← input: http://localhost:5189/openapi/v1.json, client: react-query + axios, mutator: src/lib/api-client.ts#customInstance
web/package.json         ← "gen:api": "orval" + "postgen:api": "rimraf src/gen/model/params.ts"
```

### Workflow tạo endpoint mới (BẮT BUỘC — đúng thứ tự)
1. **Backend slice**: tạo `api/src/Modules/<Module>/Features/<Group>/<Feature>.cs` theo Pragmatic Single-File VSA — `Command/Query + Validator + Endpoint(Group<...>) + Handler([Transactional]/[NonTransactional])`. Endpoint phải `await this.SendResultAsync(result, ct)` để Orval sinh type chuẩn.
2. **Refresh OpenAPI**: chạy lại backend (`dotnet watch` / `dotnet run`) để `http://localhost:5189/openapi/v1.json` có `operationId` mới. Kiểm tra bằng `curl` hoặc mở URL.
3. **Gen frontend**: `pnpm --filter web gen:api` (wrap `orval`, tự chạy `postgen:api`). KHÔNG sửa tay `src/gen/**`.
4. **Hook**: import từ `@/gen/endpoints/<tag>/<tag>` + `@/gen/model`, wrap bằng `createMutationHook` trong `web/src/lib/query-utils.ts` — xem mẫu `features/tags/hooks/useTags.ts`.

### Hook convention
```ts
// features/tags/hooks/useTags.ts — mẫu chuẩn
import * as TagsApi from "@/gen/endpoints/tags/tags";
import { createMutationHook } from "@/lib/query-utils";

export const useCreateTag = createMutationHook(TagsApi.useCreateTag, [
  TagsApi.getGetTagsQueryKey(),
  TagsApi.getGetTagTreeQueryKey(),
]);

// Query: giữ nguyên pattern Orval
export const useTags = (params?: GetTagsParams) =>
  TagsApi.useGetTags(params, { query: { placeholderData: keepPreviousData } });
```

### Query key convention
```ts
// Dùng helper Orval gen sẵn, không tự đặt string
TagsApi.getGetTagsQueryKey()
TagsApi.getGetTagTreeQueryKey()
// Chỉ khi cần custom: ['feature', 'action', params?]
```

### NGHIÊM CẤM
- Gọi generated API function trực tiếp trong component — phải qua hook
- Gọi `customInstance` / `axios` trực tiếp trong feature — phải qua Orval gen
- Tự define type trùng với `src/gen/model` — luôn import từ gen
- Dùng `useState` để cache data từ API — đó là việc của TanStack Query
- Fetch trong `useEffect` — dùng `useQuery`

### Ngoại lệ tạm thời (khi BE chưa restart để gen)
Nếu cần ship trước khi `openapi/v1.json` cập nhật, được phép viết manual `customInstance` TẠM trong hook với comment bắt buộc:
```ts
// TODO: orval regen — manual until /openapi/v1.json updated (POST /api/tags/bulk)
```
Phải có task regen `pnpm --filter web gen:api` ngay sau khi BE restart, rồi xoá manual code và chuyển về `createMutationHook(TagsApi.useXxx, [...])`.

---

## 3. Error Handling

Tập trung tại `web/src/lib/api-client.ts` (axios interceptors + `customInstance` làm Orval mutator).
**Không** try-catch từng API call trong component hay hook.

```ts
// lib/api-client.ts — interceptors đã xử lý 401 refresh, 403/4xx/5xx toast
AXIOS_INSTANCE.interceptors.response.use(undefined, async (error) => {
  if (shouldRefresh) return handleTokenRefresh(originalRequest);
  if (status !== 401) handleApiError(status, data);
  return Promise.reject(error);
});
```

Exception: mutation `onError` được dùng nếu cần xử lý lỗi đặc thù của từng form (ví dụ toast `Failed to create tag`).

---

## 4. Form — React Hook Form + Zod

```ts
// Pattern chuẩn
const schema = z.object({
  name: z.string().min(1, 'Bắt buộc'),
  email: z.string().email(),
})
type FormValues = z.infer<typeof schema>

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { name: '', email: '' },
})
```

### NGHIÊM CẤM
- Validate bằng tay (if/else check) — dùng Zod schema
- `<form onSubmit>` trong artifact React — dùng `<div>` + `onClick` handler
- Dùng `useState` cho từng field của form

---

## 5. Routing — TanStack Router file-based

### Tạo route mới
Tạo file trong `src/routes/` — router tự detect.

```ts
// routes/dashboard/users/index.tsx
export const Route = createFileRoute('/dashboard/users/')({
  component: UsersPage,
  validateSearch: (search) => usersSearchSchema.parse(search), // filter qua URL
})
```

### Filter/Pagination qua URL search params
```ts
// Không dùng useState cho filter
const { page, search } = Route.useSearch()
const navigate = Route.useNavigate()

const setPage = (p: number) => navigate({ search: (prev) => ({ ...prev, page: p }) })
```

### NGHIÊM CẤM
- Dùng `useState` cho filter/pagination — phải lên URL
- `useNavigate` từ React Router — đây là TanStack Router

---

## 6. Component Rules

### Feature component
```
features/[name]/components/   ← chỉ dùng trong feature đó
```
- Được phép inject hooks của feature
- Không được import từ feature khác trực tiếp — qua public API (`features/*/index.ts`)

### Shared component
```
components/   ← dùng 2+ feature
```
- Nhận data qua props — không tự fetch
- Không import từ bất kỳ feature nào
- Không có side effects (không gọi API, không navigate)

### DataTable pattern
```tsx
// Mỗi trang định nghĩa columns riêng
// features/users/components/users-columns.tsx
export const userColumns: ColumnDef<User>[] = [...]

// Page compose lại
export function UsersPage() {
  const { data, isLoading } = useUsers(filters)
  return (
    <DataTable
      columns={userColumns}
      data={data}
      isLoading={isLoading}
      toolbar={<UsersToolbar />}
    />
  )
}
```
**Không** tạo god-component DataTable nhận mọi config — mỗi trang own column def của nó.

---

## 7. Date/Time — Temporal

```ts
import { Temporal, fromDate, toDate, fromISOString } from '@/lib/temporal'

// Tính toán, so sánh — dùng Temporal
const today = Temporal.Now.plainDateISO()
const nextWeek = today.add({ days: 7 })

// Nhận từ API — parse ngay
const createdAt = fromISOString(apiResponse.createdAt)

// Gửi lên API — serialize về string
body: { date: selectedDate.toString() }

// shadcn Calendar boundary — convert tại đây, không leak Date ra ngoài
const handleSelect = (d: Date | undefined) => {
  if (d) setSelected(fromDate(d))
}
```

### NGHIÊM CẤM
- `new Date()` trừ tại boundary với UI component chưa support Temporal
- Import `date-fns`, `dayjs`, `moment`
- So sánh date bằng string

---

## 8. TypeScript

- `strict: true` — không tắt
- Không dùng `any` — dùng `unknown` nếu type thực sự không xác định
- Không `as SomeType` ép kiểu tùy tiện — parse bằng Zod nếu cần runtime validation
- Type của API response lấy từ generated types — không tự define lại

---

## 9. File Naming

```
components/    → PascalCase.tsx        (UserCard.tsx)
hooks/         → camelCase.ts          (useUsers.ts)
types          → camelCase.ts          (types.ts hoặc user.types.ts)
utils/lib      → camelCase.ts          (temporal.ts)
routes         → kebab-case hoặc TanStack convention ($userId.tsx)
column defs    → kebab-case            (users-columns.tsx)
```

---

## 10. Khi Agent Tạo Feature Mới

Checklist theo thứ tự:

1. `features/[name]/types.ts` — define filter type, form value type
2. `features/[name]/hooks/use[Name].ts` — useQuery hook
3. `features/[name]/hooks/useCreate[Name].ts` — useMutation hook (nếu cần)
4. `features/[name]/components/[Name]sTable.tsx` — DataTable component
5. `features/[name]/components/[Name]sColumns.tsx` — column definitions
6. `features/[name]/index.ts` — re-export public API
7. `routes/.../index.tsx` — route file

Không tạo file ngoài pattern này trừ khi có lý do rõ ràng.

---

## 11. Internationalization (i18n)

Hệ thống bắt buộc dùng `react-i18next` cho ĐA SỐ text hiển thị trên UI.

### Quy tắc chia Locale
- **`common.json` (Namespace: `common`)**: Chứa các từ khóa dùng chung cho toàn bộ app như các hành động cơ bản (Create, Update, Edit, Delete, Save, Cancel, Confirm), các thuật ngữ phân trang, filter chung. KHÔNG ĐƯỢC lặp lại các từ khóa này trong từng feature.
- **`features/[name]/locales/*.json` (Namespace: `[name]`)**: Chứa text đặc thù của feature đó như tiêu đề trang, tên các trường (fields), enum, hoặc message thông báo liên quan trực tiếp đến business logic của module.

### Sử dụng Hook
- Phải import `useTranslation` từ `react-i18next`.
- Tuyệt đối KHÔNG gọi `useTranslation` ở module scope (ngoài Component), đây là vi phạm Rules of Hooks.
- Khi cần dùng chung từ khóa từ `common` bên trong Component của feature, sử dụng syntax khai báo nhiều namespace: `const { t } = useTranslation(["users", "common"]);` rồi gọi `t("common:edit")`.

### Zod Validation Error
- Các message lỗi từ Zod đã được config Error Map để tự động dịch nếu message truyền vào là một key của i18n (ví dụ: `z.string({ message: "common:required" })`). Đừng hardcode text lỗi vào Zod schema.