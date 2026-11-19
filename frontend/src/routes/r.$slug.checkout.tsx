import { createFileRoute } from "@tanstack/react-router";
import { OnlineCheckoutRoute } from "@/features/online-order/OnlineCheckoutPage";

// Nested under /r/$slug: the menu page keeps the cart and renders this page in its outlet.
export const Route = createFileRoute("/r/$slug/checkout")({
  component: OnlineCheckoutRoute,
});
