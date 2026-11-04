import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
import { OwnerSubscriptionReminder } from "@/features/subscriptions/SubscriptionReminders";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { htmlLang } from "@/lib/staff-language";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { accountQuery } from "./queries";
import { accountMessages } from "./messages";
import { LanguageSwitch } from "./LanguageSwitch";
import { StaffNav } from "./StaffNav";
import { useInstallableStaffApp } from "./useInstallApp";

// Observes the same identity query as AuthBoundary (no extra request). Signed-out, loading and
// first-password states show only the brand, because navigation would lead nowhere yet.
// The shell sets the available width; each page chooses its own content width.
// Every staff page, sign-in included, makes the staff app installable. Only signed-in pages take the
// restaurant's theme; sign-in and the first password change keep the default palette.
// Before signing in, the language switch sits under the brand, so a new employee can change it
// before reading anything else.
export function StaffLayout({ children }: { children: ReactNode }) {
  const account = useQuery(accountQuery).data;
  const signedIn = !!account && !account.mustChangePassword;
  const language = useStaffLanguage();
  useInstallableStaffApp();
  useDocumentTheme(signedIn ? account.restaurantTheme : null);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = htmlLang(language);
    return () => {
      root.lang = "zh-CN";
    };
  }, [language]);
  if (!signedIn)
    return (
      <div className="flex min-h-dvh flex-col items-center px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
        <BrandMark caption={accountMessages[language].brandCaption} className="mb-5" />
        <LanguageSwitch className="mb-6" />
        <main className="w-full">{children}</main>
      </div>
    );
  return (
    <div className="min-h-dvh md:flex">
      <StaffNav account={account} />
      <main className="min-w-0 flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 sm:px-6 md:pt-8 md:pb-12 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <OwnerSubscriptionReminder />
          {children}
        </div>
      </main>
    </div>
  );
}

export function AccountCard({ children }: { children: ReactNode }) {
  return (
    <Card className="mx-auto w-full max-w-md [--card-spacing:--spacing(6)]">
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

export function AccountCardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
  );
}
