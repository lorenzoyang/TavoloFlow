import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/online-order/PrivacyPage";

// Not nested under /r/$slug: the menu page renders no outlet.
export const Route = createFileRoute("/r/$slug_/privacy")({
  component: function OnlinePrivacy() {
    const { slug } = Route.useParams();
    return <PrivacyPage key={slug} slug={slug} />;
  },
});
