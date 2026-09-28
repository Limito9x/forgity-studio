import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "connect-runner": undefined;
    "runner-software": { runnerId: string; runnerName?: string };
  }
}

const ConnectRunnerDialog = lazy(() =>
  import("./ConnectRunnerDialog").then((m) => ({
    default: m.ConnectRunnerDialog,
  }))
);

const RunnerSoftwareDialog = lazy(() =>
  import("./RunnerSoftwareDialog").then((m) => ({
    default: m.RunnerSoftwareDialog,
  }))
);

registerDialog({
  id: "connect-runner",
  component: ConnectRunnerDialog,
});

registerDialog({
  id: "runner-software",
  component: RunnerSoftwareDialog,
});
