import { useCallback, useMemo } from 'react'
import type { FilterField } from '@/gen/model'
import type { SortingState, PaginationState, Updater } from '@tanstack/react-table'

export interface BaseSearchParams {
  page: number
  pageSize: number
  filters?: FilterField[]
  sort?: Record<string, boolean>
  globalKeyword?: string
}

/** Interface chung cho props của các Page component dùng URL-driven table state.
 * Dùng thay cho `typeof Route.useSearch/useNavigate` để không bị phụ thuộc vào route cụ thể.
 */
export interface ResourcePageProps {
  useSearch: () => BaseSearchParams
  useNavigate: () => NavigateFn<BaseSearchParams>
}

export type NavigateFn<T> = (opts: { search?: (prev: T) => T; to?: string; replace?: boolean; [key: string]: any }) => void

export function useResourceQuery<T extends BaseSearchParams>(
  search: T,
  navigate: NavigateFn<T>
) {
  // resetPage = true: reset page về 1 (dùng khi filter/search thay đổi)
  // resetPage = false (default): giữ page hiện tại (dùng khi sort/pageSize thay đổi)
  const onParamChange = useCallback(
    (params: Partial<T>, resetPage = false) => {
      navigate({
        search: (prev) => ({
          ...prev,
          ...params,
          page: params.page ?? (resetPage ? 1 : prev.page),
        }),
        replace: true,
      })
    },
    [navigate]
  )

  const onSearchChange = useCallback(
    (globalKeyword: string) =>
      onParamChange({ globalKeyword: globalKeyword || undefined } as Partial<T>, true),
    [onParamChange]
  )

  const onFiltersApply = useCallback(
    (filters: FilterField[]) =>
      onParamChange({ filters: filters.length ? filters : undefined } as Partial<T>, true),
    [onParamChange]
  )

  // TanStack Table adapter: SortingState ↔ sort Record<string, boolean>
  const sorting = useMemo<SortingState>(() => {
    if (!search.sort) return []
    return Object.entries(search.sort).map(([id, isAsc]) => ({ id, desc: !isAsc }))
  }, [search.sort])

  // API duy nhất cho sort — khớp trực tiếp với BaseTable onSortingChange prop
  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const nextSort: Record<string, boolean> = {}
      next.forEach((item) => { nextSort[item.id] = !item.desc })
      onParamChange(
        { sort: Object.keys(nextSort).length ? nextSort : undefined } as Partial<T>
        // resetPage = false: sort không reset page
      )
    },
    [sorting, onParamChange]
  )

  // TanStack Table adapter: PaginationState ↔ page/pageSize
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: (search.page ?? 1) - 1, pageSize: search.pageSize ?? 10 }),
    [search.page, search.pageSize]
  )

  const onPaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      // Chỉ thay đổi page/pageSize, KHÔNG resetPage
      onParamChange({ page: next.pageIndex + 1, pageSize: next.pageSize } as Partial<T>)
    },
    [pagination, onParamChange]
  )

  return {
    search,
    onParamChange,
    onSearchChange,
    onFiltersApply,
    sorting,
    onSortingChange,
    pagination,
    onPaginationChange,
  }
}

