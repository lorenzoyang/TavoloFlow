import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Utensils } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { displayName, type Language } from "@/features/menu/language";
import { priceText, type MenuItem } from "@/features/menu/api";
import { publicMenuQuery, type PublicMenu } from "./api";
import { readLanguage, saveLanguage, selectedLanguage } from "./language";
import { allergenNames, languageLabels, messages } from "./messages";
import { GuestPanel } from "@/features/guests/GuestPanel";
import { useGuestVisit } from "@/features/guests/useGuestVisit";

function Languages({ language, select }: { language: Language; select: (value: Language) => void }) {
  return <div role="group" aria-label={messages[language].languages} className="flex flex-wrap gap-2">
    {(["zh", "it", "en"] as const).map(value => <Button key={value} className="h-11"
      variant={value === language ? "default" : "outline"} aria-pressed={value === language} onClick={() => select(value)} lang={value}>
      {languageLabels[value]}
    </Button>)}
  </div>;
}

function Dish({ item, language, defaultLanguage }: { item: MenuItem; language: Language; defaultLanguage: Language }) {
  const m = messages[language];
  const name = displayName(item, defaultLanguage, language);
  const description = { zh: item.descriptionZh, it: item.descriptionIt, en: item.descriptionEn }[name.language];
  const amount = priceText(item.priceCents);
  return <Card><CardContent className="space-y-3 pt-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {item.itemCode && <p className="mb-1 text-xs text-muted-foreground wrap-break-word">{item.itemCode}</p>}
        <h3 lang={name.language} className="text-lg font-semibold leading-7 wrap-break-word">{name.text}</h3>
      </div>
      <p className="shrink-0 font-semibold tabular-nums">€ {language === "it" ? amount.replace(".", ",") : amount}</p>
    </div>
    {!item.isAvailable && <Badge variant="secondary">{m.soldOut}</Badge>}
    {description && <p lang={name.language} className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap wrap-break-word">{description}</p>}
    <div className="border-t pt-3 text-xs leading-5 text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">{m.allergens}</p>
      {!item.allergenReviewed ? <p>{m.unreviewed}</p> : item.allergenCodes.length === 0 ? <p>{m.reviewedEmpty}</p>
        : <p>{item.allergenCodes.map(code => allergenNames[language][code] ?? m.unreviewed).join(" · ")}</p>}
    </div>
  </CardContent></Card>;
}

function MenuContent({ token, data, confirmedAt, error, refreshing, refresh, rememberLanguage }: {
  token: string; data: PublicMenu; confirmedAt: number; error: boolean; refreshing: boolean; refresh: () => void; rememberLanguage: (language: Language) => void;
}) {
  const [preference, setPreference] = useState<Language | null>(() => {
    try { return readLanguage(data.restaurant.id, window.localStorage); } catch { return null; }
  });
  const language = selectedLanguage(preference, data.restaurant.defaultLanguage);
  const guest = useGuestVisit(token, data, confirmedAt, error);
  // Keep error/invalid-QR messages in the viewer's language after the menu disappears.
  useEffect(() => { rememberLanguage(language); }, [language, rememberLanguage]);
  const m = messages[language];
  const serviceNotice = data.restaurant.serviceStatus === "SUSPENDED" ? m.suspended
    : !data.table.isEnabled ? m.disabled : !data.restaurant.orderingEnabled ? m.paused
    : !data.activeSessionId ? m.unopened : null;
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const selected = data.menu.categories.find(category => category.id === categoryId);
  const categories = selected ? [selected] : data.menu.categories;
  function selectLanguage(value: Language) {
    setPreference(value);
    try { saveLanguage(data.restaurant.id, value, window.localStorage); } catch { /* Storage can be unavailable. */ }
  }
  return <main lang={language} className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
    <header className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><Utensils className="size-4" />TavoloFlow</p>
          <h1 className="text-2xl font-semibold wrap-break-word">{data.restaurant.name}</h1>
          <p className="mt-2 text-lg font-medium wrap-break-word">{m.table} · {data.table.tableLabel}</p></div>
        <Badge variant="secondary" className="shrink-0">{m.menu}</Badge>
      </div>
      <Languages language={language} select={selectLanguage} />
    </header>
    <GuestPanel guest={guest} language={language} />
    {!guest.visit.ended && <>
    <Alert><AlertDescription className="space-y-2">
      {serviceNotice && <p>{serviceNotice}</p>}
      {serviceNotice !== m.unopened && <p>{m.order}</p>}
    </AlertDescription></Alert>
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{m.stale}</AlertDescription></Alert>}
    <Button variant="outline" className="h-11" disabled={refreshing} onClick={refresh}><RefreshCw className={refreshing ? "animate-spin" : ""} />{m.retry}</Button>
    {data.menu.items.length === 0 ? <p className="rounded-xl border bg-card px-5 py-12 text-center text-muted-foreground">{m.empty}</p> : <>
      <nav aria-label={m.menu} className="flex flex-wrap gap-2">
        <Button variant={!selected ? "default" : "outline"} className="min-h-11 h-auto whitespace-normal" aria-pressed={!selected} onClick={() => setCategoryId(null)}>{m.all}</Button>
        {data.menu.categories.map(category => {
          const name = displayName(category, data.restaurant.defaultLanguage, language);
          return <Button key={category.id} lang={name.language} variant={selected?.id === category.id ? "default" : "outline"}
            className="min-h-11 h-auto max-w-full whitespace-normal wrap-anywhere" aria-pressed={selected?.id === category.id}
            onClick={() => setCategoryId(category.id)}>{name.text}</Button>;
        })}
      </nav>
      {categories.map(category => {
        const name = displayName(category, data.restaurant.defaultLanguage, language);
        const items = data.menu.items.filter(item => item.categoryId === category.id);
        return <section key={category.id} className="space-y-4" aria-labelledby={`category-${category.id}`}>
          <h2 id={`category-${category.id}`} lang={name.language} className="text-xl font-semibold wrap-break-word">{name.text}</h2>
          {items.length ? <div className="grid gap-4">{items.map(item => <Dish key={item.id} item={item} language={language} defaultLanguage={data.restaurant.defaultLanguage} />)}</div>
            : <p className="text-sm text-muted-foreground">{m.emptyCategory}</p>}
        </section>;
      })}
    </>}
    <footer className="border-t pt-5 text-xs leading-6 text-muted-foreground">{m.allergyHint}</footer>
    </>}
  </main>;
}

export function PublicMenuPage({ token }: { token: string }) {
  const query = useQuery(publicMenuQuery(token));
  const [language, setLanguage] = useState<Language>("it");
  const m = messages[language];
  return <div className="min-h-svh bg-muted/30 text-foreground">
    {query.data ? <MenuContent key={query.data.restaurant.id} token={token} data={query.data}
      confirmedAt={query.isFetchedAfterMount && !query.isError ? query.dataUpdatedAt : 0} error={query.isError || query.fetchStatus === "paused"}
      refreshing={query.isFetching} refresh={() => void query.refetch()} rememberLanguage={setLanguage} />
      : <main lang={language} className="mx-auto max-w-lg space-y-6 px-4 py-12">
        <h1 className="text-2xl font-semibold">TavoloFlow · {m.menu}</h1>
        <Languages language={language} select={setLanguage} />
        <Alert role={query.isPending && query.fetchStatus !== "paused" ? "status" : "alert"}><AlertDescription>
          {query.data === null ? m.invalid : query.isError || query.fetchStatus === "paused" ? m.error : m.loading}
        </AlertDescription></Alert>
        <Button variant="outline" className="h-11" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw />{m.retry}</Button>
      </main>}
  </div>;
}
