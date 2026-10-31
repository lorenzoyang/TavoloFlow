import { createFileRoute } from "@tanstack/react-router";
import { PickupStatusPage } from "@/features/online-order/PickupStatusPage";

// A guest's pickup order status; the token in the URL reads this one request only.
export const Route = createFileRoute("/o/$token")({
  component: function PickupStatusRoute() {
    const { token } = Route.useParams();
    return <PickupStatusPage key={token} token={token} />;
  },
});
