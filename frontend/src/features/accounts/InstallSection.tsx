import { Download } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { platformPwaMessages } from "@/features/push/messages";
import { accountMessages } from "./messages";
import { useInstallOffer, type AppScope } from "./useInstallApp";

// Hidden inside the installed app. Chromium offers a one-tap installation once the site has seen
// some use (a tap and about 30 seconds); until then, and in other browsers, the steps per device
// are listed.
export function InstallSection({ scope = "/staff" }: { scope?: AppScope }) {
  const language = useStaffLanguage();
  const m = accountMessages[language];
  const { standalone, installed, canInstall, install } = useInstallOffer(scope);
  if (standalone) return null;
  return (
    <section aria-labelledby="home-install" className="space-y-3">
      <h2 id="home-install" className="text-sm font-medium text-muted-foreground">
        {m.installSection}
      </h2>
      <Card>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6">
            {scope === "/platform"
              ? platformPwaMessages[language].installDescription
              : m.installDescription}
          </p>
          {installed ? (
            <Notice tone="success">{m.installed}</Notice>
          ) : canInstall ? (
            <Button className="w-full sm:w-auto" onClick={install}>
              <Download aria-hidden="true" />
              {m.install}
            </Button>
          ) : (
            <ul className="space-y-2 text-sm leading-6">
              {[m.installIos, m.installAndroid, m.installDesktop].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          )}
          {scope === "/staff" && (
            <p className="text-xs leading-5 text-muted-foreground">{m.installKitchenSound}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
