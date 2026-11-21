import { OwnerSubscriptionNotices } from "@/features/subscriptions/SubscriptionNotices";
import { Link } from "@tanstack/react-router";
import { ChevronRight, KeyRound } from "lucide-react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceSuspendedNotice } from "@/features/dining/ServiceNotice";
import { PushSection } from "@/features/push/PushSection";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import type { CurrentAccount } from "./api";
import { accountMessages } from "./messages";
import { staffManagementItems, type StaffDestination } from "./navigation";
import { AuthBoundary } from "./AuthBoundary";
import { LanguageSwitch } from "./LanguageSwitch";
import { LogoutButton } from "./LogoutButton";
import { InstallSection } from "./InstallSection";

const linkFocus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function ManagementRow({ item }: { item: StaffDestination }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`flex min-h-16 items-center gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/40 ${linkFocus}`}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0 text-accent-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.label}</span>
        <span className="block text-sm text-muted-foreground">{item.description}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Home({ account, passwordChanged }: { account: CurrentAccount; passwordChanged: boolean }) {
  const language = useStaffLanguage();
  const m = accountMessages[language];
  const role = account.role === "OWNER" ? m.owner : m.staff;
  const management = staffManagementItems(account, language);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={`${m.greeting}${account.username}`}
        description={`${account.restaurantName} · ${role}`}
      />
      {account.role === "OWNER" && (
        <OwnerSubscriptionNotices key={account.userId} account={account} />
      )}
      {passwordChanged && <Notice tone="success">{m.changeSuccess}</Notice>}
      <ServiceSuspendedNotice account={account} />
      {/* The daily pages are the tabs; home lists only what the tabs leave out. */}
      {management.length > 0 && (
        <section aria-labelledby="home-management" className="space-y-3">
          <h2 id="home-management" className="text-sm font-medium text-muted-foreground">
            {m.management}
          </h2>
          <div className="divide-y rounded-2xl border bg-card shadow-xs">
            {management.map((item) => (
              <ManagementRow key={item.to} item={item} />
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="home-account" className="space-y-3">
        <h2 id="home-account" className="text-sm font-medium text-muted-foreground">
          {m.accountSection}
        </h2>
        <Card>
          <CardContent className="space-y-5">
            <dl className="divide-y">
              {[
                [m.restaurant, account.restaurantName],
                [m.username, account.username],
                [m.role, role],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[6rem_1fr] gap-3 py-2.5 first:pt-0">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 text-sm font-medium wrap-break-word">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{m.language}</span>
              <LanguageSwitch />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                to="/staff/change-password"
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                <KeyRound aria-hidden="true" />
                {m.changeTitle}
              </Link>
              <LogoutButton />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{m.sessionNote}</p>
          </CardContent>
        </Card>
      </section>
      {account.services.online && <PushSection />}
      <InstallSection />
    </div>
  );
}

export function AccountPage({ passwordChanged }: { passwordChanged: boolean }) {
  return (
    <AuthBoundary mode="account">
      {(account) => (
        <Home key={account.userId} account={account} passwordChanged={passwordChanged} />
      )}
    </AuthBoundary>
  );
}
