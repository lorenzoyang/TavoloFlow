import { createFileRoute } from "@tanstack/react-router";
import { OnlineOrderPage } from "@/features/online-order/OnlineOrderPage";

export const Route = createFileRoute("/o/$token")({
  component: function OnlineOrder() {
    const { token } = Route.useParams();
    return <OnlineOrderPage key={token} token={token} />;
  },
});
