import type {
  RunnerDto2,
  RunnerHardwareProfile,
  RunnerGpuInfo,
  RunnerDiskInfo,
  ExecutorCandidateDto,
  RunnerExecutorConfigDto,
  ConfigureRunnerExecutorRequest,
  SetupTokenDto,
  AttachRunnerToStudioRequest,
} from "@/gen/model";

export type {
  RunnerDto2,
  RunnerHardwareProfile,
  RunnerGpuInfo,
  RunnerDiskInfo,
  ExecutorCandidateDto,
  RunnerExecutorConfigDto,
  ConfigureRunnerExecutorRequest,
  SetupTokenDto,
  AttachRunnerToStudioRequest,
};

/**
 * RunnerDto đầy đủ thông tin phần cứng được map từ RunnerDto2 của Orval
 */
export type RunnerDto = RunnerDto2 & {
  isOnline?: boolean;
};
