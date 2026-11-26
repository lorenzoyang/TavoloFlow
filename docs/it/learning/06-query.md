# 6. TanStack Query e dati del server

Home e Cucina devono conoscere l’identità dell’operatore. Se ogni componente esegue il fetch in un effetto, mantiene il caricamento e conserva un risultato, chi pulisce i dati al logout? Quale identità mostrare se una vecchia GET termina dopo un nuovo accesso? TanStack Query gestisce copie condivise di dati asincroni che possono diventare obsolete.

## Come una query key collega più componenti

`QueryClient` gestisce la cache. Una query key identifica un risultato condivisibile e `queryFn` descrive come ottenerlo. Tramite `useQuery` i componenti osservano la voce e ricevono dati, errori e stato della lettura. Le modifiche notificano gli osservatori interessati. Sullo stesso client letture contemporanee con la stessa chiave possono generalmente condividere la richiesta in corso. Due letture distanti nel tempo possono comunque generare chiamate distinte. [Chiavi delle query](https://tanstack.com/query/v5/docs/framework/react/guides/query-keys) · [query-client.ts](../../../frontend/src/lib/query-client.ts)

La chiave base della cucina è `["kitchen", restaurantId, userId]`, seguita dallo stato della coda. Cambiare uno di questi valori seleziona un altro risultato. In `useInfiniteQuery` il cursore passa come `pageParam` e le pagine appartengono alla stessa lista in cache. Omettere una variabile che influenza il risultato può confondere due viste. L’identità del personale usa la chiave condivisa `["auth","me"]`. Al cambio d’identità l’app annulla e rimuove le query private del personale e sostituisce il risultato dell’identità. La separazione della cache rende coerente la UI, mentre l’API autorizza l’accesso. [useKitchen.ts](../../../frontend/src/features/kitchen/useKitchen.ts) · [store-views.ts](../../../frontend/src/lib/store-views.ts) · [queries.ts](../../../frontend/src/features/accounts/queries.ts)

<a id="cache"></a>

## Una voce della cache nel tempo

Supponi che la query sia abilitata, usi le impostazioni del progetto e che la schermata sia online.

| Momento | Cosa contiene la cache | Cosa può vedere l’utente |
| --- | --- | --- |
| T0 Primo montaggio | Nessun dato per la chiave, parte la GET | Indicatore di caricamento iniziale. |
| T1 Risposta alla GET | Salva il risultato e avvisa gli osservatori. Con `staleTime: 0` può essere subito considerato obsoleto. | Compaiono i dati. Questa impostazione non causa una successione infinita di GET. |
| T2 Ritorno all’app | Il ritorno in primo piano può innescare una lettura in background se le condizioni lo consentono | Il contenuto resta visibile insieme allo stato di sincronizzazione. `isFetching` può essere vero anche in presenza di dati. |
| T3 Ultimo osservatore smontato | La voce inattiva è ancora riutilizzabile | Un nuovo montaggio può mostrare la cache prima della rilettura. |
| T4 Inattività oltre il periodo di conservazione | La voce può essere rimossa | La visita successiva può ripartire da T0. In v5 il `gcTime` predefinito nel browser è di cinque minuti. |

`staleTime` determina per quanto tempo il dato è fresco, `gcTime` quanto conservare una copia inutilizzata. Il polling stabilisce quando leggere periodicamente. Il comportamento predefinito nel browser prevede anche ritentativi per query fallite. TavoloFlow imposta `queries.retry: false` e conserva le riletture al ritorno in primo piano e alla riconnessione. La cucina interroga il server ogni dieci secondi in primo piano, si ferma in background e richiede una lettura dopo il rientro per indicare la sincronizzazione. Una lettura riuscita fotografa un istante: subito dopo potrebbe arrivare un altro ordine. [Impostazioni predefinite di TanStack Query](https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults) · [query-client.ts](../../../frontend/src/lib/query-client.ts) · [useKitchen.ts](../../../frontend/src/features/kitchen/useKitchen.ts)

## Come le altre pagine vengono a sapere di una scrittura

Segnare un piatto come pronto cambia diverse viste, tra cui cucina e banco. Una mutation esegue un’azione con effetti esterni. Dal solo DTO restituito la libreria non può dedurre tutte le liste coinvolte. `invalidateStoreViews` contrassegna come obsolete le chiavi con il prefisso di account e vista interessato, permettendo alle viste attive di rileggere. Con risposta completa e identità certa, `setQueryData` può sostituire direttamente il dato, come al login. Aggiornare manualmente più proiezioni può essere più rapido, ma occorre mantenerle coerenti. [store-views.ts](../../../frontend/src/lib/store-views.ts) · [queries.ts](../../../frontend/src/features/accounts/queries.ts) · [Invalidazione delle query](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation)

Ricostruisci una race. A sta modificando un dato. La lettura R1 parte prima del salvataggio, poi la scrittura W riesce. Serve lo stato successivo a W. `refreshAfterWrite` annulla la query precedente con quella chiave, verifica che l’account sia ancora A, avvia R2 e ricontrolla l’identità al termine. Un messaggio tardivo di salvataggio potrebbe trarre in inganno il nuovo utente B. Contano sia il proprietario dei dati sia il momento della lettura rispetto alla scrittura. [queries.ts](../../../frontend/src/features/accounts/queries.ts)

Una lettura fallita si può ripetere. Per una scrittura potrebbe essersi persa la risposta e il reinvio potrebbe produrre un secondo effetto. Il progetto usa `mutations.retry: false` e `networkMode: "always"` per far emergere subito gli errori delle scritture tentate ed evitare code offline con reinvio. Per gli ordini si salva anche l’intento e si recupera tramite GET. `useMutation` da solo non stabilisce se il database abbia eseguito commit o rollback. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts)

## Esercizio e autoverifica

Accedi alla cucina locale, filtra Network sull’API della coda e osserva le GET per oltre venti secondi in primo piano. Passa in background e torna. In `useKitchen` individua `refetchInterval`, `enabled` e `syncIsFresh`. Spiega quando parte la richiesta e quale risposta vale come sincronizzazione dopo il rientro. La vecchia lista può essere visibile mentre la schermata attiva acquisisce dati aggiornati.

**Autoverifica** — Due account dello stesso ristorante condividono un tablet. Basta l’ID del ristorante come chiave?

<details>
<summary>Mostra la risposta</summary>

I dati privati e i permessi dipendono anche dall’utente. Includi l’ambito dell’account e pulisci le vecchie query al cambio. Immagina poi di inserire nella chiave il nome del piatto mentre viene digitato. Una bozza locale diventerebbe una serie di query distinte.

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Perché usare una libreria per i dati del server quando React ha già useState?»** Individua la fonte autorevole e chi gestisce condivisione e aggiornamento dopo lo smontaggio di un componente.

*Con useState gestisco bene una bozza locale. Per un elenco condiviso devo anche coordinare richieste simultanee, aggiornamenti in background e invalidazione. Con TanStack Query i componenti osservano una voce identificata da una chiave. In cucina includiamo nella chiave ristorante, utente e stato della coda. Il server conserva il dato autorevole, mentre il client decide quando aggiornare la copia.*

**Approfondimento** — Il nome che il titolare sta ancora scrivendo andrebbe nella stessa cache?

**«Qual è la differenza tra staleTime e gcTime?»** Fai l’esempio di chi lascia la cucina e poi ritorna.

*StaleTime indica per quanto tempo considero fresco un risultato. Scaduto quel periodo, posso ancora mostrarlo e aggiornarlo in background quando si verifica un evento opportuno. GcTime entra in gioco quando nessun componente osserva più quella query e determina per quanto tempo conservarla. Il polling della cucina ha un intervallo separato, legato alla necessità di mostrare nuovi ordini.*

**Approfondimento** — Perché con `staleTime` a zero si può vedere subito la vecchia coda?

[Indice del corso](../learning-notes.md) · [Capitolo successivo](07-router.md)
