import { createFileRoute } from "@tanstack/react-router";
import { PublicMenuPage } from "@/features/public-menu/PublicMenuPage";

export const Route = createFileRoute("/q/$token")({
  component: function QrMenu() {
    const { token } = Route.useParams();
    return <PublicMenuPage key={token} token={token} />;
  },
});
