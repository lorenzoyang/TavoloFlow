import { Spinner } from "@/components/ui/spinner";

export function LoadingState({ label }: { label: string }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
    >
      <Spinner />
      {label}
    </p>
  );
}
