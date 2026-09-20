import { createFileRoute } from "@tanstack/react-router";
import ClientOnlyApp from "@/components/ClientOnlyApp";

export const Route = createFileRoute("/")({
  component: ClientOnlyApp,
});
