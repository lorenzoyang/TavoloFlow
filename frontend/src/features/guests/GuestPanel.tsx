import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Language } from "@/lib/language";
import type { useGuestVisit } from "./useGuestVisit";
import { guestMessages } from "./messages";

export function GuestPanel({ guest, language }: { guest: ReturnType<typeof useGuestVisit>; language: Language }) {
  const m = guestMessages[language];
  const [copyNotice, setCopyNotice] = useState("");
  if (guest.visit.ended) return <Card><CardContent className="space-y-4 pt-6"><h2 className="text-xl font-semibold">{m.ended}</h2><p>{m.endedHint}</p>
    {guest.error && <p role="alert">{m[guest.error]}</p>}
    <Button className="min-h-11 h-auto whitespace-normal" disabled={guest.busy} onClick={() => void guest.browse()}>{m.browse}</Button></CardContent></Card>;
  if (!guest.visit.sessionId) return null;
  return <Card><CardContent className="space-y-4 pt-6">
    <h2 className="text-lg font-semibold">{guest.verified ? m.verified : m.title}</h2>
    {guest.checking ? <p role="status">{m.checking}</p> : guest.verified ? <>
      <p className="text-sm text-muted-foreground">{m.stage}</p>
      <Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={guest.busy || !guest.entranceAllowed || guest.stale} onClick={() => { setCopyNotice(""); if (guest.code) guest.clearCode(); else void guest.reveal(); }}>{guest.code ? m.hide : m.show}</Button>
      {guest.code && guest.visible && !guest.stale && <div className="space-y-3"><label htmlFor="guest-current-code" className="text-sm font-medium">{m.code}</label>
        <Input id="guest-current-code" value={guest.code} readOnly className="h-14 text-center text-2xl tracking-widest" onFocus={e => e.target.select()} />
        <p className="text-sm text-muted-foreground">{m.share}</p>
        <Button variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={async () => {
          try { await navigator.clipboard.writeText(guest.code); setCopyNotice(m.copied); } catch { setCopyNotice(m.copyFailed); }
        }}>{m.copy}</Button>{copyNotice && <p role="status">{copyNotice}</p>}</div>}
    </> : guest.visit.skipped ? <Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={!guest.entranceAllowed} onClick={guest.enter}>{m.enter}</Button> : <form className="space-y-3" onSubmit={e => { e.preventDefault(); void guest.join(); }}>
      <p className="text-sm text-muted-foreground">{m.hint}</p><label htmlFor="guest-join-code" className="text-sm font-medium">{m.code}</label>
      <Input id="guest-join-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={4} value={guest.input}
        onChange={e => guest.setInput(e.target.value.toUpperCase())} className="h-12 text-center text-xl tracking-widest" aria-describedby="guest-feedback" disabled={guest.busy || !guest.entranceAllowed} />
      <div className="flex flex-wrap gap-3"><Button type="submit" className="min-h-11 h-auto whitespace-normal" disabled={guest.busy || !guest.entranceAllowed || guest.wait > 0 || guest.unknown || guest.input.trim().length !== 4}>{guest.busy ? m.busy : m.join}</Button>
        <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={guest.busy} onClick={guest.skip}>{m.skip}</Button></div>
    </form>}
    <div id="guest-feedback" className="space-y-3" aria-live="polite">
      {(guest.error || guest.unknown || guest.stale || !guest.entranceAllowed) && <Alert><AlertDescription>{guest.unknown ? m.unknown : guest.error ? m[guest.error] : guest.stale ? m.offline : m.unavailable}</AlertDescription></Alert>}
      {guest.wait > 0 && <p>{guest.wait} {m.wait}</p>}
      {(guest.unknown || guest.stale) && <Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={guest.busy || guest.checking} onClick={() => void guest.retry()}>{m.retry}</Button>}
    </div>
  </CardContent></Card>;
}
