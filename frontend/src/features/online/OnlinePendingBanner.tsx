import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { CurrentAccount } from "@/features/accounts/api";
import { onlineRing } from "@/lib/alert-sound";
import { syncIsFresh } from "@/lib/live-view";
import { useAlertSound } from "@/lib/useAlertSound";
import { useLiveView } from "@/lib/useLiveView";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { onlinePendingQuery } from "./api";
import { onlineOrdersMessages } from "./messages";
import { pendingBanner } from "./state";

// Repeats the ring at this interval while someone is waiting.
const RING_EVERY = 3_000;

// One line above every staff page while online requests wait, ringing until someone accepts or rejects
// them. It has no mute and no device switch, and the kitchen's sound switch does not touch it; only a
// visible, online page polls and rings. It stays mounted at zero, so the first tap anywhere already
// unlocks the browser's audio before an order arrives.
export function OnlinePendingBanner({ account }: { account: CurrentAccount }) {
  const m = onlineOrdersMessages[useStaffLanguage()];
  const view = useLiveView();
  const pending = useQuery({
    ...onlinePendingQuery(account),
    enabled: view.active,
    refetchInterval: view.active ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const count = pending.data?.items.length ?? 0;
  const fresh = syncIsFresh(
    pending.data?.receivedAt ?? 0,
    view.now,
    view.resumeAfter,
    view.active,
    pending.isError,
  );
  const ringing = fresh && count > 0;
  const { play, soundBlocked, soundUnsupported } = useAlertSound(null, onlineRing);
  useEffect(() => {
    if (!ringing) return;
    play();
    const timer = window.setInterval(play, RING_EVERY);
    return () => window.clearInterval(timer);
  }, [ringing, play]);

  // On the online orders page itself the list is right below, so the banner only rings and asks for
  // the tap that unlocks sound.
  const onOrdersPage = !!useMatchRoute()({ to: "/staff/online" });
  const banner = pendingBanner(count);
  if (!banner) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 -mx-4 mb-4 bg-warning px-4 pt-safe text-warning-foreground shadow-xs sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 py-1.5">
        <BellRing className="size-5 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1 truncate font-semibold">
          {banner.full ? m.bannerFull(count) : m.banner(count)}
        </p>
        {!onOrdersPage && (
          <Link to="/staff/online" className={buttonVariants({ variant: "outline" })}>
            {m.view}
          </Link>
        )}
      </div>
      {(soundBlocked || soundUnsupported) && (
        <p className="mx-auto max-w-6xl pb-2 text-sm">
          {soundUnsupported ? m.soundUnsupported : m.tapForSound}
        </p>
      )}
    </div>
  );
}
