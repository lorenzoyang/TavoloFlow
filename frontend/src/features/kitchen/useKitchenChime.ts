import { useEffect, useRef } from "react";
import { watermarkAdvanced, type WatermarkBaseline } from "@/lib/live-view";
import type { KitchenPage } from "./api";
import { screenArrivals, type LineBaseline } from "./state";

type Options = {
  // The newest poll of the shown tab.
  head: KitchenPage | undefined;
  active: boolean;
  // Polls received before this (mount, foreground resume, reconnect) cannot announce anything.
  resumedAt: number;
  // The NEW lines this screen shows, when it hides categories and every NEW order is loaded;
  // otherwise null, and the restaurant-wide order watermark decides.
  screenLines: string[] | null;
  hidden: string[];
  // added is the number of this screen's new lines, or null when the watermark advanced.
  announce: (added: number | null) => void;
};

// Announces new work. The order watermark is restaurant-wide, so the polls of every tab share one
// baseline, and a screen hiding categories counts only its own new lines while it can see them all.
// Neither is durable event delivery: a filtered screen may over-chime when it falls back to the watermark.
export function useKitchenChime({
  head,
  active,
  resumedAt,
  screenLines,
  hidden,
  announce,
}: Options) {
  const baseline = useRef<WatermarkBaseline>(null);
  const lineBaseline = useRef<LineBaseline>(null);
  useEffect(() => {
    if (!head || !active || head.receivedAt < resumedAt) return;
    // A baseline from before the last resume is not continuous: the first poll after it is silent.
    const previous = baseline.current && baseline.current.at >= resumedAt ? baseline.current : null;
    // A cached tab's older head, or another loaded page, is not a new poll.
    if (previous && head.receivedAt <= previous.at) return;
    const result = watermarkAdvanced(previous, head.latestCreatedAt, head.receivedAt);
    baseline.current = result.baseline;

    const previousLines =
      lineBaseline.current && lineBaseline.current.at >= resumedAt ? lineBaseline.current : null;
    const own = screenLines
      ? screenArrivals(previousLines, screenLines, hidden.join(), head.receivedAt)
      : null;
    lineBaseline.current = own?.baseline ?? null;

    const added = own?.added ?? null;
    if (added !== null ? added > 0 : result.advanced) announce(added);
  }, [head, active, resumedAt, screenLines, hidden, announce]);
}
