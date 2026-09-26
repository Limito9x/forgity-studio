import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as StudiosApi from "@/gen/endpoints/studios/studios";

// Re-export types from @/gen/model
export type {
  StudioDto,
  CreateStudioCommand,
  IReadOnlyListOfStudioDto,
} from "@/gen/model";

export const useStudios = () => {
  return StudiosApi.useGetStudios({
    query: {
      placeholderData: keepPreviousData,
    },
  });
};

export const useGetStudioById = (id?: string) => {
  return StudiosApi.useGetStudioById(id!, {
    query: {
      enabled: !!id,
    },
  });
};

export const useCreateStudio = createMutationHook(
  StudiosApi.useCreateStudio,
  [StudiosApi.getGetStudiosQueryKey()]
);
