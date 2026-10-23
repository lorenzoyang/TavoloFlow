import type { ReactNode } from "react";
import { Utensils } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { messages as m } from "./messages";

// The store layout sets the available width; each page chooses its own content width.
export function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-8 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Utensils aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-lg font-semibold tracking-tight">{m.brand}</p>
          <p className="text-sm text-muted-foreground">{m.brandCaption}</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6 sm:pt-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs leading-6 text-muted-foreground">
        {m.sessionNote}
      </footer>
    </div>
  );
}

export function AccountCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <Card
      className={cn(
        "mx-auto w-full [--card-spacing:--spacing(6)]",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      {children}
    </Card>
  );
}

export function AccountCardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <CardHeader className="gap-2">
      <CardTitle>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </CardTitle>
      {description && <CardDescription className="leading-6">{description}</CardDescription>}
    </CardHeader>
  );
}
