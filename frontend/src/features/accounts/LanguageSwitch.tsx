import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isLanguage, LANGUAGE_NAMES, LANGUAGES } from "@/lib/language";
import { setStaffLanguage, useStaffLanguage } from "@/lib/useStaffLanguage";
import { accountMessages } from "./messages";

export function LanguageSwitch({ className }: { className?: string }) {
  const language = useStaffLanguage();
  return (
    <ToggleGroup
      aria-label={accountMessages[language].language}
      variant="outline"
      spacing={0}
      value={[language]}
      className={className}
      // Pressing the current language again would empty the group; keep the selection instead.
      onValueChange={(values) => {
        if (isLanguage(values[0])) setStaffLanguage(values[0]);
      }}
    >
      {LANGUAGES.map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          lang={value}
          className="bg-card px-3 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {LANGUAGE_NAMES[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
