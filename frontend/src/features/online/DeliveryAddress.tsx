import { MapPin, Navigation, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import { onlineOrdersMessages } from "./messages";
import { mapsUrl, routeUrl, type Coordinates } from "./state";

// A delivery address and its doorbell and floor notes, as text: the map opens from ContactActions.
export function DeliveryAddress({ address, notes }: { address: string; notes: string | null }) {
  const m = onlineOrdersMessages[useStaffLanguage()];
  return (
    <div className="space-y-0.5 text-sm">
      <p className="flex items-start gap-2 font-medium">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 wrap-break-word">{address}</span>
      </p>
      {notes && <p className="pl-6 text-muted-foreground wrap-break-word">{m.doorbell(notes)}</p>}
    </div>
  );
}

// Calling the customer and opening the address, side by side in the restaurant's colour so they read as
// actions at a glance; the number and the address themselves show as text beside the customer. With
// the restaurant's coordinates the map opens the driving route from the restaurant, whose road distance
// decides the fee band; otherwise a plain search for the address.
export function ContactActions({
  phone,
  address,
  origin = null,
}: {
  phone: string | null;
  address: string | null;
  origin?: Coordinates | null;
}) {
  const m = onlineOrdersMessages[useStaffLanguage()];
  if (!phone && !address) return null;
  const action = cn(
    buttonVariants({ variant: "outline" }),
    "border-primary/40 text-primary hover:text-primary",
  );
  return (
    <div className={cn("grid gap-2", phone && address && "grid-cols-2")}>
      {phone && (
        <a href={`tel:${phone}`} aria-label={`${m.callButton} ${phone}`} className={action}>
          <Phone aria-hidden="true" />
          {m.callButton}
        </a>
      )}
      {address && (
        <a
          href={origin ? routeUrl(origin, address) : mapsUrl(address)}
          target="_blank"
          rel="noreferrer"
          className={action}
        >
          <Navigation aria-hidden="true" />
          {origin ? m.routeButton : m.mapButton}
        </a>
      )}
    </div>
  );
}
