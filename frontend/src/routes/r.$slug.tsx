import { createFileRoute } from "@tanstack/react-router";
import { OnlineMenuPage } from "@/features/online-order/OnlineMenuPage";

export const Route = createFileRoute("/r/$slug")({
  component: function OnlineMenu() {
    const { slug } = Route.useParams();
    return <OnlineMenuPage key={slug} slug={slug} />;
  },
});
