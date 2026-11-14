import { BellOff, BellRing } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { CurrentAccount } from "@/features/accounts/api";
import { errorMessage } from "@/lib/api";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { pushMessages } from "./messages";
import { usePushSubscription } from "./usePushSubscription";

// 首页: lock-screen notifications of new online orders for this device. Shown only with online
// ordering and when the server has push configured.
export function PushSection({ account }: { account: CurrentAccount }) {
  const language = useStaffLanguage();
  const m = pushMessages[language];
  const push = usePushSubscription(account);
  if (!push.configured) return null;
  const { status, busy } = push;
  const canSwitch = status === "off" || status === "on" || status === "checking";
  const label =
    busy === "enable"
      ? m.enabling
      : busy === "disable"
        ? m.disabling
        : status === "on"
          ? m.disable
          : m.enable;
  return (
    <section aria-labelledby="home-push" className="space-y-3">
      <h2 id="home-push" className="text-sm font-medium text-muted-foreground">
        {m.section}
      </h2>
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6">{m.description}</p>
          {status === "on" && <Notice tone="success">{m.on}</Notice>}
          {status === "denied" && <Notice tone="warning">{m.denied}</Notice>}
          {status === "install-first" && <Notice>{m.installFirst}</Notice>}
          {status === "unsupported" && <Notice>{m.unsupported}</Notice>}
          {push.error !== null && (
            <Notice tone="error">{errorMessage(push.error, m.failed, language)}</Notice>
          )}
          {canSwitch && (
            <Button
              variant={status === "on" ? "outline" : "default"}
              className="w-full sm:w-auto"
              disabled={busy !== null || status === "checking"}
              aria-busy={busy !== null}
              onClick={() => void (status === "on" ? push.disable() : push.enable())}
            >
              {busy ? (
                <Spinner />
              ) : status === "on" ? (
                <BellOff aria-hidden="true" />
              ) : (
                <BellRing aria-hidden="true" />
              )}
              <span aria-live="polite">{label}</span>
            </Button>
          )}
          <p className="text-xs leading-5 text-muted-foreground">{m.note}</p>
        </CardContent>
      </Card>
    </section>
  );
}
