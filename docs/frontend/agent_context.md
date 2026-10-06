# Agent Context — HybridVSA Frontend

Đọc file này trước mọi task. Đây là summary nhanh để không cần đọc toàn bộ ARCHITECTURE.md.

## Stack nhanh
React 19, TypeScript, Vite, Tailwind v4, shadcn/ui (Nova), TanStack Router (file-based),
TanStack Query v5, React Hook Form, Zod, hey-api, Temporal API + temporal-polyfill, Lucide

## Cấu trúc quan trọng
```
web/src/gen/endpoints/  ← Orval gen — KHÔNG SỬA, chỉ pnpm --filter web gen:api
web/src/gen/model/      ← Orval gen types
web/src/components/ui/  ← KHÔNG SỬA, shadcn primitives
web/src/lib/api-client.ts ← axios interceptors + Orval mutator customInstance
web/src/lib/query-utils.ts ← createMutationHook (invalidate helper)
web/src/features/[name]/ ← mỗi feature: hooks/ + components/ + schemas/ + dialogs/
web/orval.config.ts     ← input http://localhost:5189/openapi/v1.json
```

## Rules tóm tắt
- Màu/spacing → dùng shadcn token, KHÔNG hard-code
- API → **Orval gen** (`pnpm --filter web gen:api` từ `http://localhost:5189/openapi/v1.json`) → hook (`createMutationHook`) → component, không skip bước. Xem `frontend_rules.md §2` cho workflow tạo endpoint mới (BE → restart BE → gen:api → hook).
- Filter/pagination → URL search params, KHÔNG useState
- Form → RHF + Zod, KHÔNG validate thủ công
- Date → Temporal khắp nơi, Date object chỉ tại boundary shadcn Calendar
- Error handling → `web/src/lib/api-client.ts` interceptors + `customInstance` (Orval mutator), KHÔNG try-catch trong component

## Khi tạo feature mới — thứ tự file
types.ts → hooks → components → index.ts → route

## Tham khảo đầy đủ
- ARCHITECTURE.md — cấu trúc, data flow, layer responsibilities
- FRONTEND-RULES.md — rules chi tiết kèm ví dụ code