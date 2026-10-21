import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "connect-runner": undefined;
    "bulk-import-runner-env": import("./BulkImportRunnerEnvDialog").BulkImportRunnerEnvData;
  }
}

const ConnectRunnerDialog = lazy(() =>
  import("./ConnectRunnerDialog").then((m) => ({
    default: m.ConnectRunnerDialog,
  }))
);

const BulkImportRunnerEnvDialog = lazy(() =>
  import("./BulkImportRunnerEnvDialog").then((m) => ({
    default: m.BulkImportRunnerEnvDialog,
  }))
);

registerDialog({
  id: "connect-runner",
  component: ConnectRunnerDialog,
});

registerDialog({
  id: "bulk-import-runner-env",
  component: BulkImportRunnerEnvDialog,
});


