import { MapPin } from "lucide-react";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { onlineOrdersMessages } from "./messages";
import { mapsUrl, routeUrl, type Coordinates } from "./state";

// A delivery address opens a plain maps search, or with the restaurant's coordinates the driving route
// from the restaurant, whose distance decides the fee band; the doorbell and floor notes follow it.
export function DeliveryAddress({
  address,
  notes,
  origin = null,
}: {
  address: string;
  notes: string | null;
  origin?: Coordinates | null;
}) {
  const m = onlineOrdersMessages[useStaffLanguage()];
  return (
    <div className="space-y-1 text-sm">
      <a
        href={origin ? routeUrl(origin, address) : mapsUrl(address)}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-start gap-2 rounded-xl border px-3 py-2.5 font-medium underline-offset-4 hover:underline"
      >
        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 wrap-break-word">
          {address}
          {origin && (
            <span className="block text-xs font-normal text-muted-foreground">{m.route}</span>
          )}
        </span>
      </a>
      {notes && <p className="text-muted-foreground wrap-break-word">{m.doorbell(notes)}</p>}
    </div>
  );
}
