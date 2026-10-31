import { createFileRoute } from "@tanstack/react-router";
import { OnlineMenuPage } from "@/features/online-order/OnlineMenuPage";

// The restaurant's online pickup menu, outside the staff and platform layouts.
export const Route = createFileRoute("/r/$slug")({
  component: function OnlineMenuRoute() {
    const { slug } = Route.useParams();
    return <OnlineMenuPage key={slug} slug={slug} />;
  },
});
