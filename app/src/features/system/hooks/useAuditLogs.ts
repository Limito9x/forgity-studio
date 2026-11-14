import { keepPreviousData } from "@tanstack/react-query";
import { z } from "zod";
import * as AuditLogsApi from "@/gen/endpoints/audit-logs/audit-logs";
import { GetAuditLogsQueryParams } from "@/gen/endpoints/audit-logs/audit-logs.zod";

export type AuditLogQuery = z.infer<typeof GetAuditLogsQueryParams>;

export const useAuditLogs = (params: AuditLogQuery) => {
    return AuditLogsApi.useGetAuditLogs(params, {
        query: {
            placeholderData: keepPreviousData,
        }
    });
};

export const useGetAuditLogById = (id: string) => {
    return AuditLogsApi.useGetAuditLogById(id, {
        query: {
            enabled: !!id,
        }
    });
};
