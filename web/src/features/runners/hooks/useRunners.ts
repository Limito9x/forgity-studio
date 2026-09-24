import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as RunnersApi from "@/gen/endpoints/runners/runners";
import type {
  RunnerDto,
  IReadOnlyListOfRunnerDto,
  RunnerExecutorConfigDto,
  SetupTokenDto,
  AttachRunnerToStudioRequest,
} from "@/gen/model";

export type {
  RunnerDto,
  IReadOnlyListOfRunnerDto,
  RunnerExecutorConfigDto,
  SetupTokenDto,
  AttachRunnerToStudioRequest,
};

export const useRunners = () => {
  return RunnersApi.useGetRunners({
    query: {
      placeholderData: keepPreviousData,
    },
  });
};

export const useStudioRunners = (studioId?: string) => {
  return RunnersApi.useGetStudioRunners(
    studioId!,
    {
      query: {
        enabled: !!studioId,
        placeholderData: keepPreviousData,
      },
    }
  );
};

export const useDiscoverRunnerFolder = (id: string, path?: string) => {
  return RunnersApi.useDiscoverRunnerFolders(
    id,
    { path },
    {
      query: {
        enabled: !!id,
        placeholderData: keepPreviousData,
      },
    }
  );
};

export const useGenerateSetupToken = createMutationHook(
  RunnersApi.useGenerateSetupToken,
  [RunnersApi.getGetRunnersQueryKey()]
);

export const useAttachRunnerToStudio = createMutationHook(
  RunnersApi.useAttachRunnerToStudio,
  [RunnersApi.getGetRunnersQueryKey()]
);
