import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground",
        className,
      )}
    >
      <Spinner />
      {label}
    </p>
  );
}
