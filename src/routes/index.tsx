import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nuvra - Prove the next move." },
      {
        name: "description",
        content: "A proof-first job agent for live Speedrun startup roles.",
      },
    ],
  }),
  component: () => <Navigate to="/app" />,
});
