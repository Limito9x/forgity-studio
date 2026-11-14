import { createFileRoute } from "@tanstack/react-router";
import { MyMachinePage } from "@/features/local-machine/pages/MyMachinePage";

export const Route = createFileRoute("/local/machine")({
  staticData: {
    breadcrumb: "My Machine",
  },
  component: MyMachineRoute,
});

function MyMachineRoute() {
  return <MyMachinePage />;
}
