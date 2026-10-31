import { Ban } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { staffMessages } from "@/lib/staff-messages";
import { useStaffLanguage } from "@/lib/useStaffLanguage";

// A page of a service the platform has not enabled for this restaurant; navigation already hides it,
// so only a typed or bookmarked URL reaches this. The server rejects the service's writes as well.
export function ServiceNotOffered() {
  const c = staffMessages[useStaffLanguage()];
  return <EmptyState icon={Ban} title={c.notOffered} description={c.notOfferedHint} />;
}
