import { Link } from "@tanstack/react-router";
import { Check, CircleCheck, KeyRound, QrCode, Utensils } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { CardContent } from "@/components/ui/card";
import type { CurrentAccount } from "./api";
import { messages as m } from "./messages";
import { AccountCard, AccountCardHeader } from "./AccountLayout";
import { AuthBoundary } from "./AuthBoundary";
import { LogoutButton } from "./LogoutButton";

function AccountDetails({ account, passwordChanged }: { account: CurrentAccount; passwordChanged: boolean }) {
  return (
    <>
      <AccountCardHeader title={m.accountTitle} description={m.accountDescription} />
      <CardContent className="space-y-5">
        <Badge variant="secondary"><Check aria-hidden="true" data-icon="inline-start" />{m.signedIn}</Badge>
        {passwordChanged && (
          <Alert role="status">
            <CircleCheck aria-hidden="true" />
            <AlertDescription className="leading-6">{m.changeSuccess}</AlertDescription>
          </Alert>
        )}
        <dl className="divide-y divide-border">
          {[
            [m.restaurant, account.restaurantName],
            [m.username, account.username],
            [m.role, account.role === "OWNER" ? m.owner : m.staff],
          ].map(([label, value]) => (
            <div key={label} className="py-3 first:pt-0 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 min-w-0 wrap-break-word text-sm font-medium sm:mt-0">{value}</dd>
            </div>
          ))}
        </dl>
        <Link to="/staff/floor" className={buttonVariants({ className: "h-11 w-full" })}>开桌工作台</Link>
        <Link to="/staff/kitchen" className={buttonVariants({ className: "h-11 w-full" })}>厨房工作台</Link>
        {account.role === "OWNER" && <>
          <Link to="/staff/orders" className={buttonVariants({ className: "h-11 w-full" })}>结账工作台</Link>
          <Link to="/staff/history" className={buttonVariants({ variant: "outline", className: "h-11 w-full" })}>历史账单</Link>
          <Link to="/staff/settings" className={buttonVariants({ variant: "outline", className: "h-11 w-full" })}>员工账号设置</Link>
        </>}
        <Link to="/staff/menu" className={buttonVariants({ className: "h-11 w-full" })}>
          <Utensils aria-hidden="true" />{m.menu}
        </Link>
        <Link to="/staff/tables" className={buttonVariants({ variant: "outline", className: "h-11 w-full" })}>
          <QrCode aria-hidden="true" />桌位管理
        </Link>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/staff/change-password" className={buttonVariants({ className: "h-11 w-full" })}>
            <KeyRound aria-hidden="true" />{m.changeTitle}
          </Link>
          <LogoutButton />
        </div>
      </CardContent>
    </>
  );
}

export function AccountPage({ passwordChanged }: { passwordChanged: boolean }) {
  return (
    <AccountCard wide>
      <AuthBoundary mode="account">
        {(account) => <AccountDetails key={account.userId} account={account} passwordChanged={passwordChanged} />}
      </AuthBoundary>
    </AccountCard>
  );
}
