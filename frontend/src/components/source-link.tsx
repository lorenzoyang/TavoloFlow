import { buttonVariants } from "@/components/ui/button-variants";
import { PRODUCT_NAME, SOURCE_CODE_URL } from "@/lib/brand";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";
import { cn } from "@/lib/utils";

// AGPL-3.0 section 13: everyone who uses the running app over the network, guests included, is
// offered its source. Without a label it speaks the store/platform interface language; guest pages
// pass their own.
export function SourceLink({ label, className }: { label?: string; className?: string }) {
  const fallback = staffMessages[useStaffLanguage()].sourceCode;
  return (
    <a
      href={SOURCE_CODE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "link" }),
        "px-0 text-xs font-normal text-muted-foreground underline hover:text-foreground",
        className,
      )}
    >
      {PRODUCT_NAME} · {label ?? fallback}
    </a>
  );
}
