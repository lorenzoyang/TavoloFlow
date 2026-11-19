import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Notice } from "@/components/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import type { Language } from "@/lib/language";
import { useDocumentTheme } from "@/lib/useDocumentTheme";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "@/features/public-menu/PublicMenuViews";
import { onlineMenuQuery, type OnlineMenu } from "./api";
import { onlineOrderMessages } from "./messages";
import { OnlineHeader } from "./OnlineViews";
import { useRestaurantLanguage } from "./useRestaurantLanguage";

function PrivacyContent({ slug, data }: { slug: string; data: OnlineMenu }) {
  const [language, selectLanguage] = useRestaurantLanguage(
    data.restaurant.id,
    data.restaurant.defaultLanguage,
  );
  useDocumentTheme(data.restaurant.theme);
  const m = onlineOrderMessages[language];
  return (
    <div lang={language} className="min-h-dvh">
      <OnlineHeader
        name={data.restaurant.name}
        phone={data.restaurant.publicPhone}
        language={language}
        selectLanguage={selectLanguage}
      />
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-5 pb-12">
        <Link
          to="/r/$slug"
          params={{ slug }}
          className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")}
        >
          <ArrowLeft />
          {m.backToMenu}
        </Link>
        <h2 className="font-display text-2xl font-semibold">{m.privacyTitle}</h2>
        {/* The gist first; the full notice below is what the law asks for. */}
        <section
          aria-labelledby="privacy-summary"
          className="space-y-2 rounded-2xl border bg-secondary p-4"
        >
          <h3 id="privacy-summary" className="font-semibold">
            {m.privacySummaryTitle}
          </h3>
          <ul className="list-disc space-y-1 pl-5 leading-7">
            {m.privacySummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        {m.privacySections(data.restaurant.name, data.restaurant.publicPhone).map((section) => (
          <section key={section.heading} className="space-y-2">
            <h3 className="font-semibold">{section.heading}</h3>
            <p className="leading-7 wrap-break-word">{section.body}</p>
          </section>
        ))}
      </main>
    </div>
  );
}

// The privacy notice of one restaurant's online ordering; it shares the menu's query and cache.
export function PrivacyPage({ slug }: { slug: string }) {
  const query = useQuery(onlineMenuQuery(slug));
  const [language, setLanguage] = useState<Language>("it");
  if (query.data) return <PrivacyContent slug={slug} data={query.data} />;
  const m = onlineOrderMessages[language];
  const failed = query.isError || query.fetchStatus === "paused";
  return (
    <main
      lang={language}
      className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10"
    >
      <BrandMark />
      <LanguageToggle language={language} select={setLanguage} />
      <Notice tone={query.data === null || failed ? "error" : "info"}>
        {query.data === null ? m.invalidLink : failed ? m.error : m.loading}
      </Notice>
    </main>
  );
}
