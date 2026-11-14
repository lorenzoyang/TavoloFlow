import { Ban } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import type { Language } from "@/lib/language";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";

// A store page whose service the platform has not turned on for this restaurant. Navigation hides it,
// so only a saved link or an old tab gets here; the server rejects its writes anyway.
export function ServiceNotOffered({
  messages,
  backToHome = false,
}: {
  messages: Record<Language, { title: string }>;
  backToHome?: boolean;
}) {
  const language = useStaffLanguage();
  const c = staffMessages[language];
  return (
    <div>
      <PageHeader
        title={messages[language].title}
        back={backToHome ? { to: "/staff", label: c.home } : undefined}
      />
      <EmptyState icon={Ban} title={c.serviceNotOffered} description={c.serviceNotOfferedHint} />
    </div>
  );
}
