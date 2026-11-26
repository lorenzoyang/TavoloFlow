import { RefreshCw, Sun, Volume2, VolumeX } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatTime } from "@/lib/format";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";
import type { useWakeLock } from "@/lib/useWakeLock";
import type { useAlertSound } from "@/lib/useAlertSound";

const toggleStyle =
  "aria-pressed:border-primary/40 aria-pressed:bg-accent aria-pressed:text-accent-foreground";

type QueueSound = Pick<
  ReturnType<typeof useAlertSound>,
  "sound" | "toggleSound" | "soundBlocked" | "soundUnsupported" | "unlockSound"
>;
type WakeLock = ReturnType<typeof useWakeLock>;

export function QueueScreenActions({
  audio,
  wakeLock,
  active,
  fetching,
  refresh,
  refreshLabel,
}: {
  audio: QueueSound;
  wakeLock: WakeLock;
  active: boolean;
  fetching: boolean;
  refresh: () => void;
  refreshLabel: string;
}) {
  const c = staffMessages[useStaffLanguage()];
  return (
    <>
      <Button
        variant="outline"
        className={toggleStyle}
        aria-pressed={audio.sound}
        aria-label={c.sound}
        onClick={audio.toggleSound}
      >
        {audio.sound ? <Volume2 /> : <VolumeX />}
        <span className="hidden sm:inline">{c.sound}</span>
      </Button>
      {wakeLock.supported && (
        <Button
          variant="outline"
          className={toggleStyle}
          aria-pressed={wakeLock.enabled}
          aria-label={c.wakeLock}
          onClick={wakeLock.toggle}
        >
          <Sun />
          <span className="hidden sm:inline">{c.wakeLock}</span>
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        aria-label={refreshLabel}
        disabled={!active || fetching}
        onClick={refresh}
      >
        <RefreshCw className={cn(fetching && "animate-spin")} />
      </Button>
    </>
  );
}

export function QueueSyncStatus({
  total,
  receivedAt,
  stalled,
  active,
  pending,
  messages,
}: {
  total: string;
  receivedAt?: number;
  stalled: boolean;
  active: boolean;
  pending: boolean;
  messages: { syncing: string; maybeStale: string; writesPaused: string };
}) {
  const language = useStaffLanguage();
  const c = staffMessages[language];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border bg-card px-4 py-3 shadow-xs">
        <p className="font-semibold">{total}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn(
              "size-2.5 rounded-full",
              stalled
                ? "bg-destructive"
                : receivedAt !== undefined
                  ? "bg-success"
                  : "bg-muted-foreground/40",
            )}
          />
          {/* The green dot says it is fresh; the full date matters only once updates stop. */}
          {receivedAt !== undefined
            ? stalled
              ? c.lastSync(formatDateTime(receivedAt, language))
              : c.synced(formatTime(receivedAt, language))
            : c.notSynced}
        </p>
      </div>
      {stalled && (
        <Notice tone="error">
          {!active ? c.disconnected : pending ? messages.syncing : messages.maybeStale}{" "}
          {messages.writesPaused}
        </Notice>
      )}
    </>
  );
}

export function QueueDeviceNotices({ audio, wakeLock }: { audio: QueueSound; wakeLock: WakeLock }) {
  const c = staffMessages[useStaffLanguage()];
  return (
    <>
      {audio.soundBlocked && (
        <Notice
          tone="warning"
          action={
            <Button variant="outline" onClick={audio.unlockSound}>
              <Volume2 />
              {c.soundOn}
            </Button>
          }
        >
          {c.soundBlocked}
        </Notice>
      )}
      {audio.soundUnsupported && <Notice tone="warning">{c.soundUnsupported}</Notice>}
      {wakeLock.failed && <Notice tone="warning">{c.wakeLockFailed}</Notice>}
    </>
  );
}
