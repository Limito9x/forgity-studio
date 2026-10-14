import type {
  RunnerDto as GenRunnerDto,
  RunnerHardwareProfile,
  RunnerGpuInfo,
  RunnerDiskInfo,
  ExecutorCandidateDto,
  RunnerExecutorConfigDto,
  ConfigureRunnerExecutorRequest,
  SetupTokenDto,
  AttachRunnerToStudioRequest,
} from "@/gen/model";

export type RunnerDto = GenRunnerDto & {
  appVersion?: string | null;
};

export type {
  RunnerHardwareProfile,
  RunnerGpuInfo,
  RunnerDiskInfo,
  ExecutorCandidateDto,
  RunnerExecutorConfigDto,
  ConfigureRunnerExecutorRequest,
  SetupTokenDto,
  AttachRunnerToStudioRequest,
};
