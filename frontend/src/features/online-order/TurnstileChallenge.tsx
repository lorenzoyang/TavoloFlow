import { useEffect, useRef, useState, type ReactNode } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/language";
import { onlineOrderMessages } from "./messages";
import { loadTurnstile } from "./turnstile";
import { verificationContext, type VerificationProof } from "./verification";

export function TurnstileChallenge({
  siteKey,
  binding,
  language,
  onProof,
  retry,
  fallback,
  quiet = false,
}: {
  siteKey: string;
  binding: string;
  language: Language;
  onProof: (proof: VerificationProof | null) => void;
  retry: () => void;
  fallback: ReactNode;
  // Without its own progress line: the checkout says it above its button, and the widget shows its tick.
  quiet?: boolean;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const m = onlineOrderMessages[language];
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    void loadTurnstile()
      .then((api) => {
        if (!active || !target.current) return;
        const invalidate = () => {
          if (active) {
            onProof(null);
            setReady(false);
          }
        };
        const id = api.render(target.current, {
          sitekey: siteKey,
          action: "online_order",
          cData: binding,
          language: language === "zh" ? "zh-CN" : language,
          theme: "light",
          size: "flexible",
          "response-field": false,
          callback: (token) => {
            if (active) {
              setFailed(false);
              setReady(true);
              onProof({ token, context: verificationContext(siteKey, binding, language) });
            }
          },
          "expired-callback": invalidate,
          "timeout-callback": invalidate,
          "error-callback": () => {
            if (active) {
              invalidate();
              setFailed(true);
            }
            return true;
          },
        });
        dispose = () => api.remove(id);
      })
      .catch(() => {
        if (active) {
          onProof(null);
          setFailed(true);
        }
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [siteKey, binding, language, onProof]);
  return (
    <div className="min-w-0 space-y-2">
      <div ref={target} />
      {failed ? (
        <Notice
          tone="error"
          action={
            <>
              <Button type="button" variant="outline" onClick={retry}>
                {m.verificationRetry}
              </Button>
              {fallback}
            </>
          }
        >
          {m.verificationUnavailable}
        </Notice>
      ) : quiet ? null : (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {ready ? m.verificationReady : m.verificationRequired}
        </p>
      )}
    </div>
  );
}
