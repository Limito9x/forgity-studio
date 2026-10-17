import { useBulkInviteUsers as useWrappedBulkInviteUsers } from "./useUsers";
export type {
  BulkInviteUsersCommand,
  BulkInviteUsersResponse,
  BulkInviteUserItemResult,
} from "@/gen/model";

export const useBulkInviteUsers = useWrappedBulkInviteUsers;
