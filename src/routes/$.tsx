import { createFileRoute } from "@tanstack/react-router";
import ClientOnlyApp from "@/components/ClientOnlyApp";

// Catch-all: every non-root path is handled by the legacy react-router-dom App.
export const Route = createFileRoute("/$")({
  component: ClientOnlyApp,
});
