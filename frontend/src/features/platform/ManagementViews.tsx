import { useState } from "react";
import { Copy, KeyRound, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { THEMES, themeAttribute, type RestaurantTheme } from "@/lib/theme";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { managementMessages } from "./management-messages";
import { platformMessages } from "./messages";
import type { TemporaryCredential, ManagedAccount } from "./state";

// Each choice renders in its own palette (data-theme), so the radio card is also the preview.
export function ThemeChoices({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: RestaurantTheme;
}) {
  const m = platformMessages[useStaffLanguage()];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{m.themeLegend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {THEMES.map((theme) => (
          <label
            key={theme}
            data-theme={themeAttribute(theme) ?? undefined}
            className="flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl border bg-background p-2.5 text-foreground has-checked:border-primary has-checked:ring-2 has-checked:ring-primary/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50"
          >
            <input
              type="radio"
              name={name}
              value={theme}
              defaultChecked={theme === defaultValue}
              className="sr-only"
            />
            <span aria-hidden="true" className="size-7 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{m.themes[theme].name}</span>
              <span className="block text-xs text-muted-foreground">{m.themes[theme].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ThemeBadge({ theme }: { theme: RestaurantTheme }) {
  const m = platformMessages[useStaffLanguage()];
  return (
    <Badge variant="outline">
      <span
        aria-hidden="true"
        data-theme={themeAttribute(theme) ?? undefined}
        className="size-2.5 rounded-full bg-primary"
      />
      {m.themeBadge(m.themes[theme]?.name ?? theme)}
    </Badge>
  );
}

// The restaurant name keeps every map link's accessible name unique in the restaurant list.
export function MapLink({ url, name }: { url: string; name: string }) {
  const m = platformMessages[useStaffLanguage()];
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={m.openMap(name)}
      className={buttonVariants({ variant: "outline" })}
    >
      <MapPin />
      {m.map}
    </a>
  );
}

// Shown once: the passwords live only in this component's memory and vanish when it closes.
export function TemporaryPasswords({
  credentials,
  close,
}: {
  credentials: TemporaryCredential[];
  close: () => void;
}) {
  const m = managementMessages[useStaffLanguage()];
  const [notice, setNotice] = useState("");
  if (!credentials.length) return null;
  return (
    <section
      aria-labelledby="temporary-passwords"
      className="my-5 space-y-4 rounded-2xl border border-warning/60 bg-warning/12 p-4"
    >
      <div className="flex items-start gap-3">
        <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
        <div>
          <h2 id="temporary-passwords" className="font-semibold">
            {m.passwordsTitle}
          </h2>
          <p className="text-sm leading-6">{m.passwordsHint}</p>
        </div>
      </div>
      {credentials.map((c) => (
        <div key={c.account.id} className="space-y-2 rounded-xl border bg-card p-3">
          <p className="text-sm font-medium">
            {c.account.role} · {c.account.username}
          </p>
          <code className="block font-mono text-lg font-semibold break-all select-all">
            {c.temporaryPassword}
          </code>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(c.temporaryPassword);
                setNotice(m.copied);
              } catch {
                setNotice(m.copyFailed);
              }
            }}
          >
            <Copy />
            {m.copyPassword(c.account.role)}
          </Button>
        </div>
      ))}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <Button onClick={close}>{m.closePasswords}</Button>
    </section>
  );
}

export function AccountActions({
  account,
  disabled,
  platform,
  choose,
}: {
  account: ManagedAccount;
  disabled: boolean;
  platform: boolean;
  choose: (kind: "reset" | "active", account: ManagedAccount) => void;
}) {
  const m = managementMessages[useStaffLanguage()];
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <p className="font-semibold wrap-break-word">
          {account.role} · {account.username}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant={account.isActive ? "success" : "outline"}>
            {account.isActive ? m.active : m.inactive}
          </Badge>
          <Badge variant={account.mustChangePassword ? "warning" : "secondary"}>
            {account.mustChangePassword ? m.mustChange : m.changed}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => choose("reset", { ...account })}
          >
            {m.reset(account.role)}
          </Button>
          {platform && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => choose("active", { ...account })}
            >
              {m.toggle(account.isActive, account.role)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
