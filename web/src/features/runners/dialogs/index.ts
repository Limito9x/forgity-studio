import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "connect-runner": undefined;
  }
}

const ConnectRunnerDialog = lazy(() =>
  import("./ConnectRunnerDialog").then((m) => ({
    default: m.ConnectRunnerDialog,
  }))
);

registerDialog({
  id: "connect-runner",
  component: ConnectRunnerDialog,
});

