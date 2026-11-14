import { createFileRoute } from "@tanstack/react-router"
import { UserPage } from "@/features/users/UserPage"
import { buildPagedSearchSchema } from "@/lib/schemas/pagedSearch.schema"
import { USER_FILTERABLE_FIELDS } from "@/features/users/schemas/userFilterableFields"

export const usersRouteSearch = buildPagedSearchSchema(USER_FILTERABLE_FIELDS)

export const Route = createFileRoute("/_protected/_layout/users/")({
  validateSearch: usersRouteSearch,
  component: UsersPage,
})

function UsersPage() {
  return <UserPage useSearch={Route.useSearch} useNavigate={Route.useNavigate} />
}
