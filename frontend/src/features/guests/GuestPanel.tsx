import { useState } from "react";
import { CircleCheck, Copy, DoorOpen } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Language } from "@/lib/language";
import type { useGuestVisit } from "./useGuestVisit";
import { guestCopy } from "./messages";

type Guest = ReturnType<typeof useGuestVisit>;

// Errors, unknown results and retry waits for the verification and code reads above it. The live
// region stays rendered so announcements are reliable; while empty it leaves the flex flow (no gap).
function Feedback({ guest, language }: { guest: Guest; language: Language }) {
  const m = guestCopy(language, guest.codeRequired);
  return (
    <div id="guest-feedback" className="w-full space-y-3 empty:absolute" aria-live="polite">
      {(guest.error || guest.unknown || guest.stale || !guest.entranceAllowed) && (
        <Notice
          tone="warning"
          action={
            (guest.unknown || guest.stale) && (
              <Button
                variant="outline"
                disabled={guest.busy || guest.checking}
                onClick={() => void guest.retry()}
              >
                {m.retry}
              </Button>
            )
          }
        >
          {guest.unknown
            ? m.unknown
            : guest.error
              ? m[guest.error]
              : guest.stale
                ? m.offline
                : m.unavailable}
        </Notice>
      )}
      {guest.wait > 0 && (
        <p className="text-sm text-muted-foreground">
          {guest.wait} {m.wait}
        </p>
      )}
    </div>
  );
}

function JoinCode({ guest, language }: { guest: Guest; language: Language }) {
  const m = guestCopy(language, guest.codeRequired);
  const [copyNotice, setCopyNotice] = useState("");
  return (
    <div className="space-y-3 rounded-xl bg-card p-4">
      <label htmlFor="guest-current-code" className="text-sm font-medium">
        {m.code}
      </label>
      <Input
        id="guest-current-code"
        value={guest.code}
        readOnly
        className="h-16 pl-[0.5em] text-center font-mono text-3xl font-semibold tracking-[0.5em]"
        onFocus={(e) => e.target.select()}
      />
      <p className="text-sm text-muted-foreground">{m.share}</p>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(guest.code);
            setCopyNotice(m.copied);
          } catch {
            setCopyNotice(m.copyFailed);
          }
        }}
      >
        <Copy aria-hidden="true" />
        {m.copy}
      </Button>
      {copyNotice && (
        <p role="status" className="text-sm">
          {copyNotice}
        </p>
      )}
    </div>
  );
}

export function GuestPanel({ guest, language }: { guest: Guest; language: Language }) {
  const m = guestCopy(language, guest.codeRequired);
  if (guest.visit.ended)
    return (
      <Card>
        <CardContent className="space-y-4 py-4 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <DoorOpen aria-hidden="true" className="size-6" />
          </span>
          <h2 className="text-xl font-semibold">{m.ended}</h2>
          <p className="leading-6 text-muted-foreground">{m.endedHint}</p>
          {guest.error && (
            <p role="alert" className="text-sm text-destructive">
              {m[guest.error]}
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={guest.busy}
            onClick={() => void guest.browse()}
          >
            {m.browse}
          </Button>
        </CardContent>
      </Card>
    );
  if (!guest.visit.sessionId) return null;
  if (guest.checking)
    return (
      <p role="status" className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        {m.checking}
      </p>
    );
  if (guest.verified)
    return (
      <section
        aria-labelledby="guest-title"
        className="relative flex flex-col gap-4 rounded-2xl border border-success/30 bg-success/8 p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-success" />
          <div className="min-w-0 flex-1 basis-48">
            <h2 id="guest-title" className="font-semibold">
              {m.verified}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">{m.stage}</p>
          </div>
          {guest.codeRequired && (
            <Button
              variant="outline"
              disabled={guest.busy || !guest.entranceAllowed || guest.stale}
              onClick={() => {
                if (guest.code) guest.clearCode();
                else void guest.reveal();
              }}
            >
              {guest.code ? m.hide : m.show}
            </Button>
          )}
        </div>
        {guest.codeRequired && guest.code && guest.visible && !guest.stale && (
          <JoinCode key={guest.code} guest={guest} language={language} />
        )}
        <Feedback guest={guest} language={language} />
      </section>
    );
  // The page joins by itself without join codes; this button covers a failed or expired join.
  if (!guest.codeRequired)
    return (
      <Card className="ring-primary/30">
        <CardContent className="relative flex flex-col gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{m.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{m.hint}</p>
          </div>
          <Button
            id="guest-join-direct"
            size="lg"
            aria-describedby="guest-feedback"
            disabled={guest.busy || !guest.entranceAllowed || guest.wait > 0 || guest.unknown}
            onClick={() => void guest.join()}
          >
            {guest.busy ? m.busy : m.join}
          </Button>
          <Feedback guest={guest} language={language} />
        </CardContent>
      </Card>
    );
  if (guest.visit.skipped)
    return (
      <section className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">{m.title}</h2>
        <Button variant="outline" disabled={!guest.entranceAllowed} onClick={guest.enter}>
          {m.enter}
        </Button>
        <Feedback guest={guest} language={language} />
      </section>
    );
  return (
    <Card className="ring-primary/30">
      <CardContent className="relative flex flex-col gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{m.title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{m.hint}</p>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void guest.join();
          }}
        >
          <label htmlFor="guest-join-code" className="text-sm font-medium">
            {m.code}
          </label>
          {/* Keep IME text unchanged while editing; the API normalizes case on submission. */}
          <Input
            id="guest-join-code"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4}
            value={guest.input}
            onChange={(e) => guest.setInput(e.target.value)}
            className="h-16 pl-[0.5em] text-center font-mono text-3xl font-semibold tracking-[0.5em]"
            aria-describedby="guest-feedback"
            disabled={guest.busy || !guest.entranceAllowed}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="submit"
              size="lg"
              disabled={
                guest.busy ||
                !guest.entranceAllowed ||
                guest.wait > 0 ||
                guest.unknown ||
                guest.input.trim().length !== 4
              }
            >
              {guest.busy ? m.busy : m.join}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={guest.busy}
              onClick={guest.skip}
            >
              {m.skip}
            </Button>
          </div>
        </form>
        <Feedback guest={guest} language={language} />
      </CardContent>
    </Card>
  );
}
