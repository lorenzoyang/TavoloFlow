import { Link } from "@tanstack/react-router";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CurrentAccount } from "./api";
import { staffNavItems, type StaffDestination } from "./navigation";

function NavItem({ item, rail }: { item: StaffDestination; rail: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      // Home is active only on itself; every other tab also covers its own search states.
      activeOptions={item.to === "/staff" ? { exact: true, includeSearch: false } : undefined}
      className={cn(
        "group flex flex-col items-center justify-center gap-1 rounded-xl font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:text-accent-foreground",
        rail ? "min-h-16 w-full text-xs" : "min-h-14 text-[0.7rem]",
      )}
    >
      <span className="flex h-8 w-14 items-center justify-center rounded-full transition-colors group-aria-[current=page]:bg-accent">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      {item.label}
    </Link>
  );
}

// One list of tabs: a bottom bar on phones, a side rail from tablet width up.
export function StaffNav({ account }: { account: CurrentAccount }) {
  const items = staffNavItems(account.role);
  return (
    <>
      <nav
        aria-label="主导航"
        className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col items-center gap-1 border-r bg-card/70 px-2 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 md:flex"
      >
        <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <UtensilsCrossed aria-hidden="true" className="size-5" />
        </span>
        {items.map((item) => (
          <NavItem key={item.to} item={item} rail />
        ))}
        <p className="mt-auto line-clamp-3 px-1 text-center text-[0.7rem] leading-4 wrap-break-word text-muted-foreground">
          {account.restaurantName}
        </p>
      </nav>
      <nav
        aria-label="主导航"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div
          className="mx-auto grid max-w-lg px-1 pt-1"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => (
            <NavItem key={item.to} item={item} rail={false} />
          ))}
        </div>
      </nav>
    </>
  );
}
