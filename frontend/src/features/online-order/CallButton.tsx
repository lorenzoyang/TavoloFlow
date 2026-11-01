import { Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { Language } from "@/lib/language";
import { onlineOrderMessages } from "./messages";

export function CallButton({
  phone,
  language,
  prominent = false,
}: {
  phone: string;
  language: Language;
  prominent?: boolean;
}) {
  return (
    <a
      href={`tel:${phone}`}
      className={buttonVariants({ variant: prominent ? "default" : "outline", size: "lg" })}
    >
      <Phone />
      {onlineOrderMessages[language].call(phone)}
    </a>
  );
}
