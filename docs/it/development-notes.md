[English](../en/development-notes.md) · **Italiano** · [中文](../zh-CN/development-notes.md)

# Note di sviluppo

In queste note racconto come è nato TavoloFlow e com'è fatto: perché l'ho sviluppato, cosa fa e cosa non fa, quali tecnologie ho scelto, com'è organizzata l'architettura, quali decisioni di progettazione ho preso e quali limiti vedo oggi. L'ho sviluppato principalmente con agenti AI come Claude Code e Codex: ho partecipato più alla progettazione e alle decisioni sulla direzione del progetto che alla scrittura del codice e ai dettagli di implementazione.

È il mio primo progetto web full stack. L'ho iniziato dopo anni di studio dell'informatica, quando mi sono reso conto di non aver mai realizzato una vera web app, e ho deciso di farne una. Questa decisione, però, è arrivata in piena era dell'AI: da una parte vedevo l'AI generare codice apparentemente perfetto con un semplice prompt, dall'altra avevo davanti lo studio di vari framework, su libri dedicati enormi o sulla documentazione ufficiale. Il finale era prevedibile: ho deciso di usare l'AI per sviluppare questo progetto.

A pensarci ora, non credo sia stato un problema. Le basi teoriche le avevo già grazie agli studi, e il modo migliore per imparare a sviluppare un progetto e a usare i framework è proprio realizzarne uno vero: scoprire da sé le difficoltà e chiedersi (o chiedere all'AI): "invece di fare questo a mano, perché non posso avere qualcosa che lo faccia al posto mio?". È così che nascono i framework: per soddisfare esigenze reali. Sono progettati e fatti in un certo modo perché risolvono un insieme di problemi che si incontravano spesso, e se capisci le esigenze e le difficoltà che eliminano, capisci molto più facilmente e velocemente il framework. Dopotutto sono anche loro prodotti fatti di codice: solo che, invece della business logic di un e-commerce o di un gestionale, la loro "business logic" risolve problemi che si incontrano spesso nello sviluppo di un certo tipo di software.

Avevo quindi davanti tre strade. La prima era guardare un tutorial e, insieme a una chat LLM, farmi una panoramica completa di quello che stavo per fare, per poi recuperare i pezzi che mi servivano subito leggendo le parti pertinenti della documentazione o di un libro dedicato. La seconda era buttarmi in un progetto open source già esistente, simile a quello che volevo fare, leggerne il codice facendo domande all'AI e studiare le parti corrispondenti sulla documentazione o sui libri, come nella prima strada. Ma allora mi sono chiesto: perché non faccio direttamente un progetto mio insieme all'AI e poi studio il mio progetto? Un progetto sviluppato con l'aiuto dell'AI non ha mica un codice di qualità peggiore di quello dei progetti che trovi a caso su GitHub. Perché non farlo così? Da qui è nata la terza strada, quella che ho scelto.

A questo punto è chiaro perché comincio a scrivere questi appunti: non basta l'input, devo produrre anche un po' di output. Devo metterci le mani per consolidare la memoria e rafforzare le connessioni neurali, e quindi imparare meglio e più a fondo. E anche per lasciare in questo progetto qualcosa di più mio, che lo distingua da un progetto generato interamente dall'AI.

## Perché questo progetto

All'inizio volevo solo fare un progetto full stack: una web app da pubblicare online, su un server, con un proprio database e accessibile a tutti, cosa che non avevo mai fatto prima. Avevo esperienza solo con servizi serverless come Vercel e Cloudflare. Ma visto che dovevo comunque fare un progetto, perché non farne uno davvero utile, magari con cui guadagnare qualche soldino?

Mi è venuta così l'idea di un sistema di ordinazione tramite la scansione di un codice QR. Da una prima indagine, poco approfondita, mi è sembrata un'ottima idea, con un buon mercato almeno tra i ristoranti cinesi, dove pochi offrivano questo servizio ai clienti. All'inizio pensavo che quei pochi usassero un servizio fornito dalle aziende dei sistemi di cassa, già integrato nei loro prodotti.

Solo dopo il rilascio ho scoperto che i ristoranti che non offrivano l'ordinazione tramite QR ai propri clienti o non ne avevano bisogno, o non conoscevano un possibile fornitore: ed è qui che entravo in gioco io. Però la web app che ho fatto non supporta la stampa delle comande: quando arriva un ordine, non può stamparlo su una stampante collegata. Non l'ho fatto sia per la complessità, perché sapevo che prima o poi sarei dovuto tornare a leggere il codice, sia perché le stampanti compatibili con il funzionamento dell'app sono costose. Sono stampanti cloud (per esempio quelle con Star CloudPRNT o Epson Server Direct Print) con un sistema integrato che interroga periodicamente il mio server per chiedere se ci sono nuovi ordini; quando ce ne sono, il server li restituisce in un formato che la stampante sa stampare. Senza una stampante a disposizione su cui provarla, non ero sicuro di riuscire a realizzare questa funzione, e così per ora l'app non la offre, anche se per quasi tutti i ristoranti che ho visitato era indispensabile.

Poi, come se non bastasse, dopo aver scoperto che praticamente tutti i potenziali clienti avevano bisogno di stampare gli ordini, ho fatto un'altra scoperta: i ristoranti che già offrivano l'ordinazione tramite QR non usavano, come avevo pensato all'inizio, una funzione integrata nel sistema di cassa, ma si affidavano a un'azienda SaaS cinese. Visto tutto questo, ho deciso di renderlo open source, perché possa servire anche ad altri, ma senza spegnerlo: continuo a offrirlo come servizio su [qiaotavoloflow.it](https://qiaotavoloflow.it) ai ristoranti che non vogliono occuparsi di un server.

## Cosa fa

TavoloFlow è un sistema di ordinazione al tavolo tramite codice QR, che accetta anche ordini online. Ogni tavolo ha un QR fisso: il cliente lo scansiona con il telefono, ordina dal menu e l'ordine arriva in cucina. Chi non è al ristorante, invece, ordina dal link online del locale, da ritirare in negozio o, se il ristorante consegna, da ricevere a casa. Lo staff deve accettare ogni ordine online. Un ritiro programmato entra in cucina all'ora di preparazione concordata. Sono due servizi separati: l'amministratore della piattaforma li attiva per ogni ristorante, anche uno solo dei due. Il pagamento resta quello di sempre, alla cassa, al ritiro o alla consegna: l'app registra solo che il conto è stato incassato. Ci sono quattro tipi di utenti, e ognuno ha la sua parte dell'app.

**Cliente**, dal proprio telefono, senza installare nulla e senza registrarsi:

- scansiona il QR e consulta il menu in cinese, italiano o inglese, con foto, allergeni e piatti esauriti; un piatto in offerta mostra il prezzo pieno barrato sopra quello scontato;
- entra nella visita del tavolo aperta dal personale, inserendo il codice del tavolo (quattro caratteri) se il ristorante lo richiede;
- per i piatti con opzioni (formato, zucchero, topping, piccantezza…) sceglie prima le opzioni in un pannello: quelle obbligatorie non sono mai preselezionate, e i supplementi si sommano al prezzo;
- compone il carrello, con una nota per ogni piatto, e invia l'ordine; può ordinare più volte durante il pasto;
- vede gli ordini di tutto il tavolo e lo stato di ogni piatto: ricevuto, pronto in cucina, annullato;
- se il ristorante offre gli ordini online, ordina anche da casa, dal link del ristorante (`/r/{link}`): stesso menu e stesse opzioni, poi «Vai alla cassa», dove sceglie ritiro o consegna e inserisce l'eventuale indirizzo, poi nome e telefono. Per la consegna vede le tariffe per distanza e l'eventuale ordine minimo; se il ristorante usa il preventivo automatico, dopo l'indirizzo tocca «Calcola la consegna» e vede il costo esatto della consegna. Qui può anche inserire un codice sconto del ristorante: se è valido, vede subito lo sconto sui piatti e il nuovo totale. Se il titolare ha attivato il ritiro programmato, alla cassa può scegliere la data e uno degli orari disponibili entro il limite impostato dal titolare. Per la consegna la preparazione inizia appena accettato l'ordine;
- segue l'ordine online da una pagina di stato (`/o/{token}`): in attesa di conferma, accettato con l'orario previsto o concordato, pronto e infine completato. Se il ristorante non risponde entro 10 minuti, l'ordine scade e la pagina mette in evidenza il telefono del ristorante.

**Staff**, da telefono o tablet; l'area staff si può installare come app (PWA):

- **Sala** (solo con il QR al tavolo, come i Tavoli): vede i tavoli e i loro conti, apre un tavolo quando arrivano i clienti e comunica il codice. Può mettere in pausa gli ordini via QR per tutti i tavoli e continuare a prendere le ordinazioni per i tavoli aperti. Il dettaglio del conto indica quali ordini ha inserito lo staff. Chiude senza incasso un tavolo senza ordini o con tutti i piatti annullati;
- **Cucina**: riceve i nuovi ordini con un avviso sonoro, aggiornati ogni 10 secondi; li vede nelle viste Piatti (raggruppati per piatto), Ordini ed Evasi; ogni schermo riapre l'ultima scelta tra Piatti e Ordini e, nella vista Piatti, può mostrare solo alcune categorie del menu (per esempio uno schermo solo per le bevande); sotto ogni piatto vede le opzioni scelte dal cliente; segna ogni piatto come pronto o lo annulla; gli ordini online entrati in preparazione compaiono insieme a quelli dei tavoli, come «Ritiro #12» o «Consegna #12»;
- **Pass**: su un tablet al bancone, mostra i piatti pronti da portare ai tavoli; quando un piatto arriva al tavolo si tocca «Servito»;
- **Menu**: segna un piatto, o una singola opzione (per esempio un topping finito), come esaurito o di nuovo disponibile;
- **Ordini online**: accetta un ordine scegliendo il tempo previsto o, per un ritiro programmato, con quanti minuti di anticipo iniziare. Per una consegna senza preventivo sceglie prima la fascia con il pulsante «Percorso». Può anche rifiutare una richiesta o annullare un ritiro programmato accettato prima dell'inizio della preparazione. In entrambi i casi può indicare un motivo, che il cliente vede nella pagina dell'ordine. Finché c'è un ordine da accettare, ogni pagina dello staff mostra in alto un banner che suona. Qui vede anche gli ordini accettati e non ancora chiusi, con telefono e indirizzo del cliente;
- in **Impostazioni ordini online** mette in pausa gli ordini online, fino a fine fascia o per il resto della giornata;
- dalla Home attiva su ogni dispositivo le **notifiche a schermo bloccato** dei nuovi ordini online;
- l'interfaccia è in cinese, italiano o inglese, scelta per ogni dispositivo; finché nessuno la sceglie, segue la lingua del browser.

**Titolare**: tutto quello che fa lo staff, e in più:

- gestisce il menu: categorie, piatti in tre lingue, prezzi, allergeni, foto, e i gruppi di opzioni condivisi tra i piatti (formato, zucchero, topping, piccantezza…), con supplementi, allergeni propri e modelli già tradotti nelle tre lingue; un gruppo nuovo può anche partire dalla copia di uno esistente. Un menu fisso è un piatto con gruppi obbligatori (per esempio «scegli una bibita»), e le loro opzioni si possono prendere dai piatti, spuntandone anche più d'uno insieme: nomi e allergeni vengono copiati una volta sola, quindi se poi il piatto cambia, l'opzione resta com'era. Può mettere un piatto in offerta con un prezzo scontato, che vale sia al tavolo sia online, e toglierlo svuotando il campo;
- gestisce i tavoli e ne scarica il QR e il segnatavolo da stampare;
- nella sezione Conto chiude la visita dopo l'incasso, e nello Storico conti consulta i conti chiusi;
- nel Conto chiude anche gli ordini online: «Ritirato, verifica incasso» o «Consegnato, verifica incasso» dopo l'incasso, oppure «Cliente non venuto» o «Non consegnato»; finché l'ordine è aperto può correggere il costo di consegna;
- in **Impostazioni ordini online** imposta il telefono pubblico, gli orari della settimana (al massimo due fasce al giorno), il preavviso e l'ultimo giorno prenotabile per il ritiro programmato, oltre alle regole di consegna. Può impostare la posizione, fino a cinque fasce di costo per distanza su strada, una soglia di consegna gratuita per fascia, un ordine minimo per il ristorante e una nota in tre lingue; crea ed elimina i **codici sconto** per gli ordini online: una percentuale sui piatti (dall'1 al 50%), valida fino a un ultimo giorno facoltativo, da condividere su Instagram, sui volantini o nei sacchetti;
- reimposta la password dell'account staff e vede lo stato del proprio abbonamento.

**Amministratore della piattaforma**, cioè chi offre il servizio ai ristoranti:

- crea un ristorante insieme ai suoi due account (titolare e staff), con password temporanee; in seguito può disattivare questi account o reimpostarne la password;
- sospende o riattiva un ristorante, ne sceglie il tema di colori, decide se serve il codice del tavolo, elimina definitivamente un ristorante sospeso;
- per ogni ristorante attiva il QR al tavolo, gli ordini online o tutti e due, e imposta il link online (`/r/…`);
- gestisce il contatto del titolare, la tariffa annuale e i periodi di abbonamento, e registra il pagamento di ogni periodo, ricevuto fuori dall'app;
- anche la sua interfaccia è in cinese, italiano o inglese, con la stessa scelta per dispositivo dello staff.

## Cosa non fa (e perché)

- **Pagamenti online.** Gestire pagamenti vuol dire commissioni, sicurezza dei dati di pagamento e rimborsi: troppo per una prima versione.
- **Scontrino fiscale.** TavoloFlow non sostituisce la cassa né il registratore telematico: lo scontrino continua a emetterlo il sistema di cassa del ristorante.
- **Stampa delle comande.** Per i motivi spiegati sopra: serve una stampante cloud compatibile, e non ne avevo una per provarla.
- **Notifiche push per cucina, pass e conti.** Queste pagine si aggiornano interrogando il server a intervalli regolari (polling). Per un ristorante piccolo basta, ed è molto più semplice. L'unica notifica push è quella dei nuovi ordini online, che deve arrivare anche a telefono bloccato (vedi «PWA per lo staff»).
- **Funzionamento offline.** L'app non salva pagine né dati sul dispositivo per usarli senza rete: ordini e conti devono essere sempre aggiornati. Se la connessione cade, la pagina già aperta mostra gli ultimi dati con un avviso, ma blocca le operazioni (per esempio chiudere un conto) finché un aggiornamento non riesce; se si apre una pagina senza rete, l'area staff mostra solo una pagina che lo segnala.
- **Account personali per ogni cameriere.** Ogni ristorante ha un solo account staff, condiviso, più quello del titolare. Per un ristorante piccolo è sufficiente e non serve sapere chi ha fatto cosa.
- **Consegne con piattaforme esterne.** Gli ordini online ci sono, con ritiro in negozio o consegna fatta dal ristorante, ma senza piattaforme come Glovo o Deliveroo, senza pagamento online. Il cliente paga al ritiro o alla consegna. Il ritiro può essere programmato e il costo della consegna segue le fasce per distanza decise dal titolare (vedi «Costo di consegna per distanza»). Una prima versione dell'asporto era stata sviluppata e poi tolta, per tenere semplice la prima versione; quella di oggi è stata riprogettata da zero.
- **Programmi fedeltà e sconti per singolo cliente.** I codici sconto sono condivisi: chiunque conosca il codice lo può usare, quante volte vuole. Senza account cliente non c'è modo di dire «una volta a testa» o «solo al primo ordine» (il telefono non è verificato, e dopo 30 giorni viene cancellato). Al tavolo i codici non ci sono: lì lo sconto lo fa la cassa, come sempre.
- **Divisione del conto e statistiche di vendita.** Ogni visita ha un solo conto, e oltre allo storico dei conti chiusi non ci sono report.
- **All you can eat.** Niente turni di ordinazione né limiti per persona: i ristoranti a cui pensavo (ramen, cucina cinese, bubble tea) lavorano alla carta.

## Scelta dello stack tecnologico

All'inizio, in realtà, ho fatto un prototipo di questa idea con TypeScript, Hono e una SPA React, tutto su Cloudflare, senza un database mio ma con quello offerto da Cloudflare (D1), con l'illusione di ridurre al minimo i costi di manutenzione. Con un prompt dettagliato ho fatto generare il progetto all'AI, ma il risultato era per me completamente incomprensibile. Non avendo mai fatto un progetto, non conoscevo i problemi e le difficoltà che si incontrano, e quindi non sapevo quali problemi risolvessero tutti gli strumenti, le librerie e i framework che l'AI aveva introdotto. Ho avuto subito un sovraccarico cognitivo e ho rinunciato; l'ho usato solo per avere una panoramica di quello che sarebbe dovuto diventare il mio progetto.

Sono passato quindi a qualcosa di più stabile. Pensando alla stabilità e alla spendibilità sul mercato del lavoro, mi sono venuti in mente Java e C#. Li conosco entrambi, ma C# è più espressivo e ha un ecosistema più uniforme, una barriera d'ingresso più bassa e un framework più "batteries-included". Alla fine ho scelto C# con .NET, quindi ASP.NET Core come framework web per il backend ed EF Core come ORM, con Npgsql come provider per PostgreSQL. "Batteries-included" qui si vede davvero: autenticazione con cookie, autorizzazione con policy, protezione dei dati (Data Protection, usata, tra l'altro, per proteggere i cookie e cifrare il codice di ogni visita) e dependency injection sono tutti integrati nel framework, e il backend non usa nessuna libreria esterna per queste cose. Per il rate limiting uso invece `Common/FixedWindowLimiter`, un’implementazione del progetto in memoria, senza il middleware di rate limiting di ASP.NET Core. Le librerie di terze parti, oltre a Npgsql, sono due: SkiaSharp, per ridimensionare e convertire le foto dei piatti, e Lib.Net.Http.WebPush, che firma e cifra le notifiche push (vedi «PWA per lo staff»). EF Core non offre un'API per i lock di riga (`SELECT ... FOR UPDATE`), quindi in quei punti uso SQL scritto a mano. Per i test uso xUnit: nelle classi di integrazione con `PostgreSqlFixture`, Testcontainers avvia un PostgreSQL usa e getta in Docker. I test HTTP usano `WebApplicationFactory` per avviare l’API in memoria e mandarle richieste come farebbe un browser; quelli del livello dati usano direttamente il `DbContext`. Ci sono anche test puri senza database. Il codice C# lo formatto con CSharpier, l'equivalente di Prettier per C#.

Per il database ho scelto PostgreSQL semplicemente perché è il database open source più utilizzato, e anche uno dei più potenti.

Per il frontend, avendo appena finito di studiare le basi di React, ho scelto React, che è anche ottimo per questa web app: è praticamente una SPA, e l'area staff funziona anche come PWA. Il resto dello stack:

- **TypeScript**, per avere i tipi anche sul frontend e trovare gli errori già in fase di build;
- **Vite**, per il server di sviluppo e la build;
- **TanStack Router**, per le route definite come file, con parametri e query string tipizzati: un link a una pagina che non esiste, o con un parametro sbagliato, non compila;
- **TanStack Query**, per i dati che arrivano dal server: tiene la cache, gestisce il polling della cucina e dei conti e ricarica i dati dopo ogni modifica;
- **Tailwind CSS** e **shadcn/ui** (su Base UI), per lo stile e i componenti: shadcn copia i componenti nel progetto invece di installarli come libreria, quindi si possono modificare liberamente;
- **qrcode**, per generare i QR dei tavoli direttamente nel browser;
- **Oxlint** e **Prettier**, per il lint e la formattazione, e il test runner integrato di Node per testare la logica pura senza installare un framework di test.

Per la distribuzione uso **Docker Compose** su una VPS, con **Caddy** come reverse proxy, che ottiene da solo il certificato HTTPS. Le migrazioni del database non partono all'avvio dell'API: a ogni rilascio le applico esplicitamente con un bundle di migrazioni di EF Core. Tutti i passaggi sono nella guida al [self-hosting](self-hosting.md).

## Architettura

In questa sezione descrivo com'è fatto TavoloFlow: quali sono i pezzi, dove si trova il codice di ognuno e come passano i dati da una parte all'altra. Il perché delle scelte più importanti (lock, versioni, idempotenza, polling…) lo spiego nella sezione successiva, «Decisioni di progettazione».

### Panoramica

```mermaid
flowchart LR
  G["Cliente al tavolo<br>/q/{token}"] --> C
  O["Cliente online<br>/r/{slug}, /o/{token}"] --> C
  S["Staff e titolare<br>/staff/*"] --> C
  P["Amministratore<br>/platform/*"] --> C
  C["Caddy<br>HTTPS e file della SPA"] -->|"/api/*"| A["API ASP.NET Core"]
  A --> D[("PostgreSQL")]
  A --> K["Chiavi di Data Protection<br>(cartella su disco)"]
  A -.->|"notifiche push"| N["Servizi push<br>Apple, Google, Mozilla, Microsoft"]
```

Tutto passa da un solo indirizzo. Il browser parla solo con Caddy, che fa due cose:

- restituisce i file statici della SPA, cioè quelli prodotti da `vite build`: un `index.html` quasi vuoto più i file JavaScript e CSS in `assets/`. Il browser li scarica ed esegue React, che costruisce la pagina direttamente sul dispositivo: è il cosiddetto client-side rendering (CSR);
- inoltra all'API (il web server di ASP.NET Core, Kestrel) ogni richiesta che inizia con `/api`.

In sviluppo questo ruolo lo svolge il proxy di Vite, che manda `/api` a `http://localhost:5093`. Frontend e API stanno quindi sulla stessa origine (stesso schema, dominio e porta): i cookie non devono passare da un dominio all'altro e non serve configurare CORS.

Una spiegazione minima di CORS: è una regola del browser. Quando il JavaScript di una pagina fa una richiesta, il browser confronta l'origine della pagina (da dove ha caricato `index.html`, per esempio `https://app.esempio.it`) con l'origine dell'URL chiamato. Se sono uguali, come qui (`https://app.esempio.it/api/...`), la richiesta è "same-origin" e CORS non entra in gioco. Che poi Caddy inoltri la richiesta all'API dentro il server, il browser non lo sa nemmeno. Se invece l'API stesse su un altro dominio, per esempio `api.esempio.it`, il server dovrebbe rispondere con appositi header (`Access-Control-Allow-Origin` e altri), altrimenti il browser bloccherebbe la risposta, e anche i cookie sarebbero più complicati da gestire.

Alcuni punti da tenere a mente:

- **Un solo processo API, tre tipi di utenti.** La stessa applicazione ASP.NET Core serve clienti (al tavolo e online), staff e amministratori. Ognuno ha il suo cookie, e il backend capisce quale usare guardando il path dell'URL della richiesta, cioè la parte dopo il dominio, per esempio `/api/public/orders` (vedi «Tre identità» più sotto).
- **Tre container in produzione:** `db` (PostgreSQL), `api` e `caddy`. Solo Caddy espone porte verso l'esterno (80 e 443): il database e l'API sono raggiungibili solo dalla rete interna di Docker.
- **Una sola chiamata verso l'esterno.** L'API non dipende da servizi esterni, con un'eccezione: le notifiche push dei nuovi ordini online, che partono dall'API verso i servizi push di Apple, Google, Mozilla o Microsoft. Se non arrivano, l'app funziona lo stesso.
- **Le chiavi di Data Protection** stanno in una cartella persistente. Data Protection è il sistema di ASP.NET Core per cifrare e firmare dati, e queste sono le sue chiavi segrete. Il cookie di login, infatti, non punta a una sessione salvata sul server: contiene direttamente il "biglietto" dell'account (vedi «Tre identità»), cifrato e firmato con queste chiavi, così il browser non può né leggerlo né falsificarlo. Con le stesse chiavi vengono protetti anche i token CSRF (spiegati in «Cookie, CSRF e same-origin») e i codici del tavolo salvati nel database. Se le chiavi stessero solo dentro il container, si perderebbero a ogni nuovo rilascio: tutti dovrebbero rifare il login e i codici delle visite aperte non si potrebbero più leggere. Per questo la cartella è indicata in `DataProtection:KeyRingPath` e sta su un volume persistente.

### Modello dei dati

Il database ha venti tabelle. Lo schema completo è in [`er-diagram.dbml`](../reference/er-diagram.dbml), e c'è anche un'[immagine](../reference/er-diagram.png). Divise per argomento:

| Gruppo            | Tabelle                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account           | `platform_users` (amministratori), `restaurant_users` (per ogni ristorante un account titolare e uno staff)                                                                                                                                                                                            |
| Ristorante e menu | `restaurants`, `menu_categories`, `menu_items`, `menu_item_images` (i byte delle foto, separati così le letture del menu non li caricano), `menu_option_groups` e `menu_options` (le opzioni condivise tra i piatti), `menu_item_option_groups` (quali piatti usano quale gruppo), `restaurant_tables` |
| Servizio          | `dining_sessions`, `orders`, `order_items`                                                                                                                                                                                                                                                             |
| Ordini online     | `online_hours` (gli orari della settimana), `online_counters` (l'ultimo numero d'ordine di ogni giorno), `online_requests` (gli ordini dei clienti, da accettare), `online_coupons` (i codici sconto), `delivery_tiers` (le fasce di costo della consegna)                                                                                                                                      |
| Notifiche         | `push_subscriptions` (i dispositivi che ricevono le notifiche a schermo bloccato)                                                                                                                                                                                                                      |
| Abbonamento       | `restaurant_subscription_periods`                                                                                                                                                                                                                                                                      |

Il concetto centrale è la **visita** (`DiningSession`, tabella `dining_sessions`). Quando arrivano i clienti, lo staff apre il tavolo dalla Sala e nasce una visita `ACTIVE`, con il suo codice del tavolo (cifrato) e un numero di versione del conto, `bill_version`. I clienti non hanno account: per il sistema un cliente è solo "un browser che è entrato in questa visita".

Con gli ordini online la visita ha anche un **canale** (`channel`): `DINE_IN` per il tavolo, `PICKUP` e `DELIVERY` per gli ordini online da ritirare o da consegnare. Una visita online nasce solo quando lo staff accetta l'ordine, non ha né tavolo né codice, ha un solo ordine e, se è una consegna, anche il costo di consegna (`delivery_fee_cents`). Prima dell'accettazione l'ordine del cliente è soltanto una riga di `online_requests` (vedi «Ordini online: una richiesta da accettare»); se il cliente ha accettato un preventivo automatico, la riga conserva anche costo e distanza (`delivery_fee_cents`, `delivery_distance_meters`), e l'accettazione porta quel costo nella visita.

Ogni ordine appartiene a una visita e ha una o più righe (`order_items`), una per piatto, con la quantità e una nota facoltativa. Ogni riga ha il suo stato: nasce `NEW`, poi la cucina la porta a `READY` (pronta) o a `CANCELLED` (annullata); quando il piatto arriva al tavolo, dal Pass si compila `served_at`. L'ordine ha anche uno stato riassuntivo: `NEW` finché almeno una riga è `NEW`, poi `PROCESSED` (è la differenza tra le viste Ordini ed Evasi della Cucina).

Quando la visita si chiude (dopo l'incasso, oppure senza incasso se non c'erano ordini o se erano tutti annullati), diventa `CLOSED` e salva il motivo (`PAID`, `EMPTY` o `VOIDED`; per gli ordini online anche `NO_SHOW`, se il cliente non ritira o la consegna non riesce), il totale e l'ora di chiusura. Una visita chiusa non si riapre mai: i clienti successivi avranno una visita nuova.

Il frontend rende l'uso più comodo, ma non garantisce niente. Alcune regole, poi, non le controlla solo il codice C#: le garantisce direttamente il database, così restano vere anche se un giorno il codice avesse un bug.

| Regola                                              | Come la garantisce PostgreSQL                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un tavolo ha al massimo una visita aperta           | indice unico parziale `uq_active_session_per_table` su `table_id`, solo per le righe con `status = 'ACTIVE'`                                                                                                                                                                                            |
| Una richiesta del cliente crea al massimo un ordine | indice unico `uq_order_one_per_request` su `(dining_session_id, client_request_id)`; per gli ordini online `uq_online_request_client_request` su `(restaurant_id, client_request_id)`                                                                                                                   |
| I dati di ristoranti diversi non si mescolano       | ogni tabella di business ha `restaurant_id` (tranne `menu_item_images`, che arriva al ristorante attraverso il suo piatto) e le chiavi esterne sono composte, `(id, restaurant_id)`: un ordine può puntare solo a una visita dello stesso ristorante, una riga solo a un ordine dello stesso ristorante |
| Stato e campi sono sempre coerenti                  | check constraint come `ck_session_lifecycle`: una visita `ACTIVE` ha il codice cifrato e nessun dato di chiusura, una `CLOSED` ha ora, motivo e totale, e il codice è cancellato; `ck_order_item_lifecycle` fa lo stesso per le righe                                                                   |
| Il canale decide i campi                            | `ck_session_dine_in` e `ck_session_online`: una visita al tavolo ha sempre il nome del tavolo (e, finché è aperta, il tavolo e il codice), una visita online non ha mai tavolo né codice; `ck_session_delivery_fee`: il costo di consegna c'è sempre nelle consegne e mai negli altri canali            |
| La consegna ha un punto di partenza                 | `ck_restaurant_delivery_ready`: con la consegna attiva il ristorante ha sempre le coordinate; che ci sia almeno una fascia lo controlla il salvataggio delle impostazioni, perché le fasce stanno in un'altra tabella |
| Solo valori ammessi                                 | gli enum sono salvati come testo maiuscolo (`ACTIVE`, `READY`…) e un check constraint elenca i valori validi                                                                                                                                                                                            |

La storia degli ordini, invece, non la protegge il database. Ogni riga salva una copia (snapshot) di nome, prezzo e allergeni del piatto: se poi il piatto cambia prezzo, la riga resta com'era. Lo stesso vale per le opzioni scelte: la riga le salva in `options_snapshot` (una colonna jsonb), con i nomi del gruppo e dell'opzione e il supplemento. Il prezzo unitario della riga comprende già i supplementi (e parte dal prezzo scontato, se il piatto era in offerta), quindi il conto resta sempre prezzo unitario × quantità, e gli allergeni salvati sono quelli del piatto più quelli delle opzioni scelte. Anche una richiesta online salva i suoi piatti come copia, nella colonna jsonb `lines`; quando lo staff l'accetta, una sola funzione (`OrderLineSnapshot.ToOrderItem`) la trasforma nelle righe dell'ordine. Ma PostgreSQL non impedisce un UPDATE diretto su queste copie o sui conti chiusi: che non cambino lo garantiscono i service, che non li modificano mai. Anche l'eliminazione di un piatto o di un tavolo passa da un service, `CatalogDeletionService`: prima azzera il riferimento (`menu_item_id` nelle righe, `table_id` nelle visite chiuse), poi elimina, e la copia resta. Qui il database fa solo da controllo: la chiave esterna non permette di eliminare un piatto o un tavolo ancora collegati.

Altre convenzioni:

- **Soldi in centesimi interi** (`long`, colonne `*_cents`), mai numeri decimali. Il massimo è il più grande intero che JavaScript rappresenta esattamente (2⁵³ − 1, `InputRules.MaxSafeCents`), così il browser non perde precisione.
- **Orari in UTC** (`timestamptz`), mostrati nel fuso orario del ristorante (Europe/Rome). Solo i periodi di abbonamento e il giorno a cui appartiene un ordine online (`business_date`) usano date semplici (`date`).
- **Nomi in snake_case**, mappati a mano in `Data/Configurations/`, una classe per entità.
- **Un solo database per tutti i ristoranti** (multi-tenant): stanno tutti nelle stesse tabelle, separati da `restaurant_id`. Eliminare un ristorante cancella tutte le sue righe con `ON DELETE CASCADE`.
- **Migrazioni** in `Data/Migrations/`, generate da EF Core e solo in avanti; non partono mai all'avvio (vedi «Scelta dello stack tecnologico»).

### Backend: moduli e percorso di una richiesta

Il backend è un solo progetto, `backend/TavoloFlow.Api/`, organizzato per argomento invece che per tipo di classe:

| Cartella             | Cosa contiene                                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Program.cs`         | il punto di partenza: registra i servizi e la pipeline dei middleware. Con un'opzione come `--seed-dev-accounts` diventa invece un comando una tantum, che esegue e termina (`Operations/MaintenanceCommands.cs`)                                               |
| `Controllers/`       | 20 classi controller in 19 file, tutte molto sottili                                                                                                                                                                                                            |
| `Common/`            | codice trasversale: il formato degli errori (`ApiError`, `ApiException` e il filtro globale), la scelta dell'identità e il CSRF (`BrowserSecurity`), la paginazione con cursore, gli enum come testo, le regole di input e il rate limiter                      |
| `Accounts/`          | login, logout (che cancella anche l'iscrizione alle notifiche del dispositivo) e cambio password di titolare e staff                                                                                                                                            |
| `Menus/`             | gestione del menu, disponibilità, foto dei piatti, gruppi di opzioni (`MenuOptionService`), lettura del menu pubblico; tutte le scritture del menu passano dallo stesso lock (`MenuWrites`)                                                                     |
| `Tables/`            | tavoli e token dei QR                                                                                                                                                                                                                                           |
| `Dining/`            | apertura del tavolo, la Sala, il codice del tavolo cifrato, il riepilogo del conto condiviso, la pausa dei nuovi ordini                                                                                                                                         |
| `Guests/`            | ingresso del cliente nella visita e il suo cookie                                                                                                                                                                                                               |
| `Ordering/`          | creazione idempotente degli ordini, controllo e prezzo delle opzioni scelte (`OrderOptions`), il controllo delle righe condiviso con gli ordini online (`OrderLines`), ordini del tavolo                                                                        |
| `Kitchen/`           | coda della Cucina, piatto pronto o annullato, il Pass, con i nomi degli ordini online                                                                                                                                                                           |
| `Billing/`           | conto, le quattro chiusure (`PAID`, `VOIDED`, `EMPTY` e, solo online, `NO_SHOW`), correzione del costo di consegna, Storico conti                                                                                                                               |
| `Platform/`          | area amministratore: ristoranti, servizi attivi e link online, account, abbonamenti                                                                                                                                                                             |
| `Online/`            | ordini online: impostazioni, menu, invio e recupero, accettazione e rifiuto; `OnlineAvailability` decide se si può ordinare e `OnlineRequestState` gestisce attesa e scadenza; limiti per browser/IP e verifica Turnstile con `OnlineVerification`; costo di consegna: fasce, ordine minimo e preventivo automatico con Geoapify (`OnlineDelivery`, `DeliveryQuotes`) |
| `Push/`              | notifiche a schermo bloccato: la chiave VAPID, le iscrizioni dei dispositivi, la coda in memoria e l'invio (`PushSender`, l'unico `BackgroundService`)                                                                                                          |     |
| `Data/`, `Entities/` | `ApplicationDbContext`, le mappature e le migrazioni di EF Core, i lock di riga (`RowLocks`), il servizio di eliminazione; le 18 entità                                                                                                                         |

Ogni modulo ha un file `XxxContracts.cs` con i DTO (cosa entra e cosa esce dall'API) e le fabbriche degli errori, per esempio `DiningErrors.SessionClosed()`, più uno o più service con le regole e le transazioni.

Le dipendenze tra moduli seguono quasi sempre il percorso di una visita: `Guests` usa `Dining`; `Ordering` usa `Guests` e `Dining`; `Kitchen` usa `Ordering` e `Dining`; `Billing` usa `Dining` e `Kitchen` (solo per riusare il formato degli ordini nella risposta del conto); `Platform` usa `Accounts`. Gli ordini online hanno aggiunto due legami nei due sensi. `Online` usa `Ordering` (lo stesso controllo di piatti e prezzi), `Menus` e `Dining` (il riepilogo del conto), mentre `Dining` e `Kitchen` usano i tipi di risposta di `Online` per mostrare numero, nome e orario previsto. `Online` mette in coda le notifiche di `Push`, e `Push` usa l'errore di `Online` quando un ristorante non ha gli ordini online. Inoltre `Accounts` usa `Push` (l'uscita cancella l'iscrizione del dispositivo) e `Platform` usa `Online` (non si spengono gli ordini online finché ce n'è uno aperto). `Common/` non dipende da nessun modulo di business.

**Controller sottili.** Un controller fa solo tre cose: dichiara chi può chiamare l'endpoint, prende l'identità affidabile e chiama il service. Per esempio, segnare un piatto come pronto:

```csharp
[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class KitchenController(KitchenService kitchen, CurrentAccount current) : ControllerBase
{
    [HttpPost("api/staff/orders/{id:guid}/items/{itemId:guid}/ready")]
    public async Task<IActionResult> Ready(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchen.ReadyAsync(current.RequireUser().RestaurantId, id, itemId, ct));
}
```

L'ID del ristorante non arriva mai dal client: viene dal cookie, attraverso `CurrentAccount`. Così uno staff non può toccare i dati di un altro ristorante nemmeno cambiando gli ID nell'URL: il service cerca l'ordine filtrando anche per ristorante, non lo trova e risponde 404.

I service sono registrati come scoped: ogni richiesta ha la sua istanza, che condivide il `DbContext` della richiesta. Ogni service apre e chiude da solo le proprie transazioni, e legge l'ora da un `TimeProvider` iniettato invece che da `DateTime.UtcNow`, così nei test si può spostare il tempo in avanti.

**Il percorso di una richiesta.** Ecco cosa attraversa una richiesta, nell'ordine in cui `Program.cs` monta i pezzi:

```mermaid
flowchart TD
  R["Richiesta HTTP"] --> FH["UseForwardedHeaders<br>IP e schema reali dietro Caddy"]
  FH --> NS["Cache-Control: no-store<br>su tutte le risposte di /api<br>(le foto dei piatti lo sostituiscono con una cache di un anno)"]
  NS --> EX["UseExceptionHandler<br>errore imprevisto → 500 INTERNAL_ERROR"]
  EX --> HS["Fuori dallo sviluppo<br>HSTS e redirect a HTTPS"]
  HS --> AU["UseAuthentication<br>lo schema Browser sceglie il cookie dal percorso"]
  AU --> AZ["UseAuthorization<br>policy dell'endpoint, di default Store Staff"]
  AZ --> CS["CsrfValidationFilter<br>le scritture devono avere il token CSRF"]
  CS --> MB["Model binding e validazione<br>errore → 400 VALIDATION_FAILED"]
  MB --> CT["Controller → service"]
  CT -->|"ApiException"| EF["ApiExceptionFilter<br>→ JSON ApiError"]
```

- **Autenticazione.** Legge il cookie dell'identità a cui appartiene il percorso e costruisce `HttpContext.User`. Per staff e amministratori ricontrolla anche l'account nel database (`ValidatePrincipal`, vedi «Tre identità»).
- **Autorizzazione.** Ogni controller dichiara una policy: `StoreStaff`, `StoreOwner`, `StoreAccount` (valida anche prima del primo cambio password, solo per le operazioni sul proprio account), `GuestAccess` o `PlatformAdmin`. Un endpoint senza `[Authorize]` cade nella policy di fallback, che è Store Staff: un endpoint nuovo è protetto anche se ci si dimentica di dichiararla. Login, menu pubblico, ingresso nella visita, pagine e invio degli ordini online e richiesta del token CSRF si aprono esplicitamente con `[AllowAnonymous]`. Un controller anonimo sotto `/api/public` deve però dichiarare anche la policy della sua identità, `GuestAccess`: con il solo `[AllowAnonymous]` l'autorizzazione usa la policy di fallback, che autentica con lo schema Store, e in un browser dove c'è anche il login dello staff il token CSRF del cliente non corrisponde più all'identità. Un test di `OnlineOrderingTests` lo verifica con tutte le identità insieme nello stesso browser. Le risposte 401 e 403 le scrivono gli eventi del cookie, prima dei filtri MVC, ma con lo stesso formato JSON.
- **CSRF.** `CsrfValidationFilter` è registrato su tutti i controller: ogni POST, PUT, PATCH e DELETE deve avere l'header `X-CSRF-TOKEN` ottenuto dalla stessa identità, altrimenti la risposta è 400 `CSRF_VALIDATION_FAILED` (vedi «Cookie, CSRF e same-origin»).
- **Errori.** Un service rifiuta una richiesta lanciando un'`ApiException` con stato HTTP, codice e messaggio. Il filtro globale `ApiExceptionFilter` la trasforma sempre nello stesso JSON:

  ```json
  {
    "code": "SESSION_CLOSED",
    "message": "本次用餐已结束。",
    "requestId": "0HN…:00000001",
    "errors": null
  }
  ```

  Alcuni codici aggiungono campi: per esempio `BILL_CHANGED` porta anche `currentBill`, il conto aggiornato. I messaggi del server sono in inglese e servono agli sviluppatori; il frontend non li mostra, ma in tutte e tre le lingue sceglie il testo in base a `code` (`lib/api-messages.ts`).

### Frontend: organizzazione delle feature

Il frontend (`frontend/src/`) è una sola SPA con un'area per ogni tipo di utente: `/q/{token}` per il cliente al tavolo, `/r/{slug}` (menu e ordine) e `/o/{token}` (stato dell'ordine) per il cliente online, `/staff/*` per titolare e staff, `/platform/*` per l'amministratore.

**Route.** Con TanStack Router le route sono file in `routes/`, e il nome del file è l'URL: `staff.kitchen.tsx` diventa `/staff/kitchen`, `q.$token.tsx` diventa `/q/{token}` con il parametro `token`. Da questi file il plugin di Vite genera `routeTree.gen.ts`, che non si modifica a mano. `staff.tsx` e `platform.tsx` sono route di layout: avvolgono tutte le pagine della loro area (per lo staff, `StaffLayout` mostra la navigazione, rende l'area installabile come PWA e tiene il controller delle notifiche push). I file delle route restano sottilissimi e passano subito alla feature:

```tsx
export const Route = createFileRoute("/staff/kitchen")({
  component: KitchenPage,
});
```

**Feature.** Il codice vero sta in `features/`, una cartella per parte del prodotto:

| Feature         | Pagine                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `public-menu`   | menu del cliente, `/q/{token}`                                                                                                         |
| `guests`        | ingresso del cliente nella visita, con il codice del tavolo                                                                            |
| `orders`        | pannello delle opzioni, carrello, invio dell'ordine, ordini del tavolo                                                                 |
| `online-order`  | pagine del cliente online: menu e cassa, `/r/{slug}`, informativa privacy e stato dell'ordine, `/o/{token}`                            |
| `accounts`      | login, cambio password, Home, navigazione, installazione della PWA                                                                     |
| `dining`        | Sala, `/staff/floor`                                                                                                                   |
| `kitchen`       | Cucina, `/staff/kitchen`                                                                                                               |
| `pass`          | Pass, `/staff/pass`                                                                                                                    |
| `online`        | Ordini online, `/staff/online`, il banner che suona in ogni pagina dello staff, e Impostazioni ordini online, `/staff/online-settings` |
| `push`          | la sezione «Notifiche a schermo bloccato» della Home e il controller che tiene allineati browser e server                              |
| `billing`       | Conto, `/staff/orders`, e Storico conti, `/staff/history`                                                                              |
| `menu`          | Menu, `/staff/menu`, con le schede Piatti e Opzioni                                                                                    |
| `tables`        | Tavoli e QR, `/staff/tables`                                                                                                           |
| `subscriptions` | Abbonamento del titolare, `/staff/subscription`, e periodi di abbonamento nell'area amministratore                                     |
| `platform`      | area amministratore, `/platform/*`, e Account staff, `/staff/settings`                                                                 |

Ogni feature ha più o meno la stessa forma:

- `api.ts`: tutte le chiamate al server della feature, le chiavi delle query e i tipi delle risposte. Componenti e hook non scrivono mai un URL;
- `state.ts`: logica pura, senza React né API del browser (validazione, regole del carrello, recupero dopo un errore di rete), testata con `node --test`;
- `use<Feature>.ts`: hook per il polling, per fermarsi quando la pagina è nascosta o offline e per scartare le risposte arrivate in ritardo;
- `*Page.tsx` e `*Views.tsx`: il rendering;
- `messages.ts`: i testi dell'interfaccia, un oggetto per lingua (cinese, italiano e inglese). Ogni lingua ha lo stesso tipo dell'oggetto cinese, quindi se manca una traduzione il progetto non compila.

Il codice condiviso sta in `lib/` (`api.ts` con le funzioni di richiesta, formato di prezzi e orari, lingue, temi…), in `components/` (i pezzi comuni delle pagine: `PageHeader`, `Notice`, `ConfirmDialog`, `MasterDetail`…) e in `components/ui/`, dove stanno i componenti di shadcn/ui.

**Dove stanno i dati.** Nel frontend ci sono tre tipi di stato, e ognuno ha il suo posto:

| Tipo                           | Dove                    | Esempi                                                                                                               |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Dati del server                | cache di TanStack Query | menu, Sala, coda della Cucina, conti                                                                                 |
| Intenzioni locali della scheda | `sessionStorage`        | carrello (anche quello online), identificativi delle operazioni in attesa di conferma                                |
| Dati del dispositivo           | `localStorage`          | lingua dell'interfaccia, suono, vista e categorie nascoste della Cucina, token dell'ultimo ordine online del cliente |

Il primo pezzo della chiave di ogni query dice a quale identità appartengono i dati: `public` (menu anonimo), `guest`, `platform`, `["auth", "me"]` (l'identità dello staff); tutto il resto conta come dato privato del ristorante. Quando lo staff fa login o logout, `lib/query-scope.ts` svuota solo la cache dello staff, e i dati del cliente o dell'amministratore aperti nella stessa scheda restano.

### Tre identità: staff, cliente, piattaforma

Uno stesso browser può avere fino a tre identità nello stesso momento, per esempio il titolare che prova il menu del cliente sul proprio telefono. Ognuna ha il suo cookie, e non si disturbano tra loro:

| Identità | Chi               | Percorsi API                    | Cookie                                      | Durata                                              | Nel backend              |
| -------- | ----------------- | ------------------------------- | ------------------------------------------- | --------------------------------------------------- | ------------------------ |
| Store    | titolare e staff  | tutto `/api` tranne i due sotto | `TavoloFlow.Store`, path `/`                | 30 giorni fissi, resta dopo la chiusura del browser | `CurrentAccount`         |
| Guest    | cliente al tavolo | `/api/public/*`                 | `TavoloFlow.Guest`, path `/api/public`      | 12 ore fisse, sparisce alla chiusura del browser    | `GuestIdentity`          |
| Platform | amministratore    | `/api/platform/*`               | `TavoloFlow.Platform`, path `/api/platform` | 30 giorni fissi, resta dopo la chiusura del browser | `CurrentPlatformAccount` |

Nessun cookie si rinnova da solo con l'uso: alla scadenza bisogna rifare il login (o, per il cliente, rientrare nella visita). Sono tutti `HttpOnly`, quindi JavaScript non può leggerli.

**Il percorso decide l'identità.** Tutto si basa su una sola funzione, `BrowserSecurity.SchemeFor(path)`:

```csharp
public static string SchemeFor(PathString path) =>
    path.StartsWithSegments("/api/platform") ? PlatformScheme :
    path.StartsWithSegments("/api/public") ? GuestScheme : StoreScheme;
```

La usano due pezzi:

1. Lo schema di autenticazione predefinito, `Browser`, non legge nessun cookie: guarda il percorso e passa la richiesta allo schema giusto (Store, Guest o Platform), che legge il proprio cookie e costruisce `HttpContext.User`.
2. Il CSRF: ogni token viene legato all'identità del percorso per cui è stato chiesto (`store`, `guest` o `platform`), quindi un token ottenuto come cliente non vale per una scrittura dello staff.

Anche il path dei cookie aiuta: il browser manda il cookie Guest solo alle richieste sotto `/api/public` e quello Platform solo sotto `/api/platform`.

**Cosa c'è nel cookie e cosa viene ricontrollato.**

- Store e Platform: il cookie contiene l'ID dell'account, il ruolo e la versione delle credenziali (`credential_version`), più l'ID del ristorante per lo staff. A ogni richiesta `ValidatePrincipal` rilegge l'account dal database: se è stato disattivato o se la versione è cambiata (cambio o reset della password), il cookie viene rifiutato. Così cambiare password fa uscire subito tutti gli altri dispositivi.
- Guest: il cookie contiene ristorante, tavolo e visita, più un identificativo casuale generato a ogni ingresso, a cui viene legato il token CSRF. Dimostra soltanto che "questo browser è entrato in questa visita"; che la visita sia ancora aperta lo controlla ogni service del cliente, a ogni richiesta. Dopo la chiusura il cookie resta nel browser, ma ogni richiesta risponde `SESSION_CLOSED`.

**Il cliente online non ha un’identità di login.** Le pagine `/r/{slug}` e `/o/{token}` non usano cookie di login: il recupero si basa sul `clientRequestId` casuale dopo un errore di rete e sul token della pagina di stato. L’invio richiede un token CSRF nell’ambito Guest da `/api/public/csrf` e il cookie `TavoloFlow.OnlineBrowser`. Quest’ultimo è solo un identificatore casuale del browser firmato dal server, per limitare gli ordini in attesa nello stesso ristorante: non significa che il cliente abbia fatto login o verificato il telefono. Con Turnstile attivo, i nuovi invii richiedono anche una prova di verifica.

**Nel frontend** `lib/api.ts` ha una famiglia di funzioni per ogni identità: `request`/`write` per lo staff, `publicRequest` per le letture anonime (senza cookie, come menu pubblico, recupero e stato degli ordini), `publicWrite` per l’invio anonimo online (richieste same-origin con cookie CSRF e identificatore del browser), `guestRequest`/`guestWrite` per il cliente al tavolo e `platformRequest`/`platformWrite` per l’amministratore. Anche la query online `ordering-context` manda i cookie same-origin, per ritrovare l’ordine in attesa di questo browser in questo ristorante. Prima di ogni scrittura, il frontend chiede un token CSRF nuovo all’endpoint `csrf` della propria identità e lo manda nell’header `X-CSRF-TOKEN`.

Perché cookie e non token JWT, e come funziona la protezione CSRF, lo spiego in «Cookie, CSRF e same-origin».

### Il flusso completo di una visita

Per vedere come lavorano insieme tutte le parti, ecco una visita dall'apertura del tavolo alla chiusura del conto, nel caso in cui il ristorante chieda il codice del tavolo:

```mermaid
sequenceDiagram
  actor S as Staff (Sala, Cucina, Pass)
  actor C as Cliente
  actor T as Titolare (Conto)
  participant A as API
  participant D as PostgreSQL

  S->>A: POST /api/staff/tables/{tableId}/open
  A->>D: lock ristorante (SHARE) e tavolo (UPDATE), nuova visita ACTIVE con codice cifrato
  A-->>S: riepilogo del conto e codice del tavolo
  S-->>C: comunica il codice a voce
  C->>A: GET /api/public/qr/{token}/bootstrap (anonimo)
  A-->>C: ristorante, tavolo, menu, ID della visita aperta
  C->>A: POST /api/public/qr/{token}/join (ID visita e codice)
  A-->>C: Set-Cookie TavoloFlow.Guest
  C->>A: POST /api/public/orders (clientRequestId e righe)
  A->>D: lock ristorante e tavolo (SHARE), visita (UPDATE)
  A->>D: se clientRequestId esiste già restituisce quell'ordine, altrimenti lo salva, bill_version + 1
  loop ogni 10 secondi
    S->>A: GET /api/staff/orders (Cucina)
  end
  S->>A: POST /api/staff/orders/{id}/items/{itemId}/ready
  A->>D: lock visita (UPDATE), UPDATE condizionale da NEW a READY
  loop ogni 10 secondi
    S->>A: GET /api/staff/pass (Pass)
  end
  S->>A: POST /api/staff/orders/{id}/items/{itemId}/served
  loop ogni 30 secondi
    C->>A: GET /api/public/sessions/{id}/orders
  end
  T->>A: GET /api/staff/sessions/{id}/bill
  T->>A: POST /api/owner/sessions/{id}/checkout (versione e totale visti)
  A->>D: lock visita (UPDATE), ricalcola e confronta, chiude come PAID, cancella il codice
  A-->>T: conto chiuso
```

1. **Apertura.** Dalla Sala lo staff apre il tavolo. Il backend blocca la riga del ristorante in modalità condivisa e quella del tavolo in modo esclusivo, controlla che il tavolo non abbia già una visita aperta e crea la nuova visita con il codice cifrato. Se il ristorante non usa il codice, la risposta ha `joinCode: null`.
2. **Bootstrap.** Il cliente scansiona il QR. La pagina `/q/{token}` legge, senza nessun cookie, ristorante, tavolo, menu e l'ID della visita aperta, tutto in una sola transazione Repeatable Read. Il bootstrap non crea niente e non rivela mai il codice.
3. **Ingresso.** Il cliente inserisce il codice (oppure, se il ristorante non lo richiede, la pagina entra da sola). Se il codice è giusto, il backend risponde con il cookie Guest, legato a quella visita. Un rate limit per IP e per visita impedisce di indovinare il codice a forza di tentativi.
4. **Ordine.** Il frontend genera un `clientRequestId`, lo salva in `sessionStorage` insieme all'ordine e solo dopo manda la POST. Il backend, dopo i lock, cerca prima un ordine con lo stesso ID: se c'è, restituisce quello. Altrimenti controlla che il ristorante accetti ordini, che i piatti siano disponibili, che le opzioni scelte appartengano ancora al piatto, non siano esaurite e rispettino il minimo e il massimo di ogni gruppo, e che i prezzi (supplementi compresi) non siano cambiati, poi salva l'ordine con le copie dei piatti e incrementa `bill_version`, tutto nella stessa transazione.
5. **Cucina e Pass.** La Cucina interroga il server ogni 10 secondi e suona quando arriva un ordine nuovo. Segnare un piatto come pronto è un UPDATE condizionale (`WHERE status = 'NEW'`) sotto il lock della visita; dal Pass si segna poi `served_at` allo stesso modo. Il cliente vede lo stato dei piatti aggiornarsi ogni 30 secondi.
6. **Chiusura.** Il titolare conferma il conto mandando la versione e il totale che ha visto. Il backend blocca la visita, ricalcola tutto e, se nel frattempo qualcosa è cambiato, risponde `409 BILL_CHANGED` con il conto aggiornato. Se tutto coincide, chiude la visita come `PAID`, salva il totale, cancella il codice e segna come serviti i piatti pronti rimasti al Pass. Da questo momento il cookie del cliente non serve più: ogni sua richiesta risponde `SESSION_CLOSED`.

I dettagli di ogni passaggio (perché proprio quei lock, perché `clientRequestId`, perché `bill_version`, perché il polling) li spiego in «Decisioni di progettazione».

### Il flusso di un ordine online

Un ordine online fa un'altra strada fino all'accettazione; da lì in poi è una visita come le altre, con un solo ordine:

```mermaid
sequenceDiagram
  actor C as Cliente online
  actor S as Staff (Ordini online, Cucina, Pass)
  actor T as Titolare (Conto)
  participant A as API
  participant D as PostgreSQL
  participant V as Cloudflare Turnstile
  participant G as Geoapify
  participant P as Servizi push

  C->>A: GET /api/public/r/{slug}/bootstrap (anonimo)
  A-->>C: Ristorante, menu, stato e configurazione pubblica della verifica
  C->>A: GET ordering-context (cookie del browser)
  A-->>C: Ordine in attesa di questo browser nel ristorante, se presente
  opt Consegna con preventivo automatico
    C->>A: POST delivery-quote (indirizzo)
    A->>G: Cerca l’indirizzo e calcola il percorso in auto
    G-->>A: Punto trovato e distanza su strada
    A-->>C: Costo della fascia e preventivo firmato, valido 30 minuti
  end
  Note over C: Prepara clientRequestId alla conferma
  opt Verifica attiva
    C->>V: Carica il widget e completa la verifica legata alla richiesta
    V-->>C: Prova di verifica
  end
  Note over C: Salva l’intento completo prima della POST, senza la prova
  C->>A: POST requests (clientRequestId, form, piatti, preventivo, turnstileToken)
  A->>D: Cerca un risultato già salvato con questo clientRequestId
  alt Già presente
    A-->>C: Risultato originale, senza chiamare la verifica
  else Non ancora trovato
    opt Verifica attiva
      A->>V: Valida la prova con Siteverify, senza lock sul database
      V-->>A: Esito, hostname, azione e legame alla richiesta
    end
    A->>D: Transazione: lock ristorante, lock invio, contatore giornaliero, nuova ricerca duplicati
    A->>D: Solo primo invio, controlla posti per origine, disponibilità e menu, salva per 10 minuti
    A-->>C: Numero, scadenza e token dello stato
    opt Primo invio riuscito e transazione confermata
      A-)P: Invia nuovo ordine online ai dispositivi iscritti
    end
  end
  loop ogni 10 secondi
    S->>A: GET /api/staff/online/pending (banner e Ordini online)
  end
  S->>A: POST /api/staff/online/requests/{id}/accept (minuti e, per una consegna senza preventivo, fascia e costo)
  A->>D: lock ristorante (SHARE) e richiesta (UPDATE), nuova visita PICKUP o DELIVERY con il suo ordine
  loop ogni 10 secondi
    C->>A: GET /api/public/online-orders/{token}
  end
  Note over S,A: Per il ritiro programmato, la Cucina vede l'ordine dall'ora di preparazione
  S->>A: Cucina e Pass, come per i tavoli
  T->>A: POST /api/owner/sessions/{id}/checkout (oppure close-no-show)
```

1. **Menu.** La pagina `/r/{slug}` legge senza cookie il ristorante, il menu e lo stato degli ordini online, calcolato da una sola regola (`OnlineAvailability`): servizio sospeso, ordini online non attivi o telefono mancante, in pausa, fuori orario, troppi ordini in attesa, oppure aperto. Se non è aperto, il cliente può guardare il menu, ma non andare alla cassa.
2. **Ritiro o consegna.** Con il ritiro programmato attivo, il cliente sceglie una data disponibile e poi l'orario. Il titolare decide se aprire le prenotazioni fino a domani (impostazione iniziale) o fino a 7 giorni dopo, nel fuso del ristorante. Per la consegna vede le fasce, le soglie per la gratuità e l'eventuale ordine minimo. Con il preventivo automatico, quando tocca «Calcola la consegna» il frontend chiede il costo all'API, che interroga Geoapify fuori da ogni transazione e risponde con il costo della fascia e un preventivo firmato. Cambiando l'indirizzo, il preventivo non vale più. Se l'indirizzo non si trova con precisione, o Geoapify non risponde, si torna al listino e il costo lo conferma chi accetta (vedi «Costo di consegna per distanza»).
3. **Invio.** Alla conferma, il frontend genera prima `clientRequestId`, così Turnstile può legare la verifica a questa richiesta. L’intento completo viene ancora salvato in `sessionStorage` solo prima della POST; la prova viaggia con la richiesta e non viene conservata. Il backend cerca prima l’originale già salvato e, se lo trova, lo restituisce. Altrimenti verifica fuori dalla transazione, poi apre la transazione, blocca il ristorante, prende il lock di invio e il contatore giornaliero e cerca di nuovo i duplicati. Un duplicato restituisce il risultato originale e annulla l’incremento del contatore, senza consumare un nuovo numero. Il primo invio controlla anche posti in attesa per browser/IP, disponibilità, consegna, preventivo, codice sconto, piatti, prezzi ed eventuale orario di ritiro; poi salva la richiesta, con l'orario scelto e una copia del codice e della percentuale, in attesa di accettazione per 10 minuti. Il cliente apre la pagina di stato.
4. **Avviso.** Solo dopo il commit il numero dell'ordine entra in una coda in memoria, e un servizio in background manda le notifiche push. Lo staff con l'app aperta lo vede comunque dal banner, che interroga il server ogni 10 secondi e suona finché c'è un ordine da accettare.
5. **Accettazione.** Lo staff sceglie tra quanto sarà pronto (per una consegna senza preventivo, prima la fascia; con il preventivo, il costo è già quello e non si cambia). Il backend blocca la richiesta, controlla che sia ancora in attesa e, nella stessa transazione, crea la visita (`PICKUP` o `DELIVERY`), il suo unico ordine e le righe, copiate dalla richiesta. L'ordine nasce in quel momento. Per un ritiro programmato l'orario di ritiro resta quello scelto dal cliente, e lo staff sceglie di quanti minuti anticipare la preparazione. La Cucina vede l'ordine e può suonare dalla prima lettura all'ora d'inizio o dopo. Prima di allora lo staff può annullare la prenotazione con un conto a zero. Se invece lo staff rifiuta, o nessuno risponde in tempo, non nasce niente: la richiesta resta rifiutata o scaduta.
6. **Cucina, Pass e conto.** Da qui tutto va come per un tavolo: piatti pronti o annullati, «Servito» dal Pass (per una consegna vuol dire affidato a chi consegna), e il titolare chiude il conto al ritiro o alla consegna; se il cliente non si presenta, lo chiude come `NO_SHOW`. La pagina di stato del cliente si aggiorna ogni 10 secondi finché l'ordine non finisce.

## Decisioni di progettazione

In questa sezione spiego il perché delle scelte tecniche più importanti. Quasi tutte rispondono a due domande: cosa succede quando due persone fanno qualcosa nello stesso momento, e cosa succede quando la rete si interrompe a metà di un'operazione? In un ristorante capitano entrambe di continuo: più camerieri e più clienti usano l'app insieme, e il Wi-Fi non è sempre buono.

### Concorrenza: lock di riga e ordine dei lock

**Il problema.** Due camerieri toccano «Apri tavolo» sullo stesso tavolo nello stesso istante; un cliente invia un ordine proprio mentre il titolare chiude il conto; il titolare cambia un prezzo mentre un cliente sta ordinando quel piatto. Se ogni richiesta legge i dati, decide e poi scrive, due richieste parallele possono leggere entrambe lo stato vecchio e prendere decisioni incompatibili, per esempio aprire due visite sullo stesso tavolo.

**La scelta: lock di riga di PostgreSQL.** Dentro una transazione, prima di decidere, il service blocca le righe da cui dipende la decisione:

- `SELECT ... FOR SHARE` (lock condiviso): altre transazioni possono prendere lo stesso lock condiviso, ma nessuna può modificare la riga o bloccarla in modo esclusivo finché la transazione non finisce;
- `SELECT ... FOR UPDATE` (lock esclusivo): aspetta che gli altri lock sulla riga vengano rilasciati, poi blocca chiunque voglia modificarla o prendere un lock su di essa, anche solo condiviso.

Le letture normali, senza lock, non vengono bloccate: grazie a MVCC, PostgreSQL mostra loro l'ultima versione già confermata della riga.

EF Core non ha un'API LINQ per questi lock, quindi li scrivo in SQL con `FromSql`, che trasforma i valori interpolati in parametri e quindi è sicuro contro la SQL injection. Quelli su ristorante, tavolo, visita, piatto e richiesta online li ho raccolti in un solo file, `Data/RowLocks.cs`, con l'ordine dei lock scritto in cima al file, così sono facili da controllare (i pochi lock sugli account stanno direttamente nei service della piattaforma):

```csharp
db.DiningSessions.FromSql(
    $"SELECT * FROM dining_sessions WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE")
    .AsNoTracking().SingleOrDefaultAsync(ct);
```

Un lock resta attivo fino alla fine della transazione: per questo ogni service apre e chiude da solo la propria.

**L'ordine dei lock.** Se la transazione A blocca il tavolo e poi aspetta la visita, mentre la transazione B ha già bloccato la visita e aspetta il tavolo, nessuna delle due può andare avanti: è un deadlock. PostgreSQL se ne accorge e annulla una delle due, ma per l'utente è comunque un errore. Per evitarlo, tutte le operazioni prendono i lock nello stesso ordine:

```
ristorante → tavolo → visita          ristorante → piatto
ristorante → richiesta online         ristorante → lock d'invio → contatore del giorno
```

Ogni operazione prende solo un tratto di questa catena, sempre in questa direzione: chi parte dalla visita non torna mai indietro al tavolo o al ristorante. Il lock d'invio non blocca una riga: è un advisory lock di PostgreSQL (`pg_advisory_xact_lock`), cioè un lucchetto con un nome, qui ricavato dall'ID del ristorante, che si libera da solo alla fine della transazione.

| Operazione                                                                                                        | Lock, in ordine                                                      |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Aprire un tavolo                                                                                                  | ristorante SHARE → tavolo UPDATE                                     |
| Entrare nella visita (cliente)                                                                                    | ristorante SHARE → tavolo SHARE → visita SHARE                       |
| Inviare un ordine                                                                                                 | ristorante SHARE → tavolo SHARE → visita UPDATE                      |
| Inviare un ordine online                                                                                          | ristorante SHARE → lock d'invio → contatore del giorno               |
| Accettare un ordine online                                                                                        | ristorante SHARE → richiesta online UPDATE                           |
| Rifiutare un ordine online                                                                                        | solo richiesta online UPDATE                                         |
| Leggere gli ordini del tavolo o il conto                                                                          | visita SHARE                                                         |
| Piatto pronto o annullato, «Servito», chiusura del conto, costo di consegna                                       | solo visita UPDATE                                                   |
| Modificare il menu, comprese le opzioni e la loro disponibilità                                                   | ristorante UPDATE (eliminando un piatto, poi anche il piatto UPDATE) |
| Pausa dei nuovi ordini, sospensione del ristorante, abbonamento, impostazioni degli ordini online, servizi attivi | ristorante UPDATE                                                    |
| Rinominare, attivare o eliminare un tavolo                                                                        | tavolo UPDATE                                                        |

Perché l'ordine prende il ristorante in SHARE? Chi modifica il menu prende il ristorante in UPDATE, quindi mentre un ordine è in corso nessuno può cambiare prezzi, disponibilità o opzioni, e i prezzi e le opzioni copiati nell'ordine sono proprio quelli appena controllati. Due ordini da tavoli diversi, invece, prendono entrambi un lock SHARE: sono compatibili e vanno in parallelo.

Lo stesso vale per gli ordini online: invio e accettazione prendono il ristorante in SHARE, quindi menu e prezzi non cambiano a metà. Chi spegne gli ordini online dall'area amministratore prende invece il ristorante in UPDATE, e quindi aspetta che finiscano gli invii in corso: tra il controllo «ci sono ancora ordini online aperti?» e lo spegnimento non può arrivare una richiesta nuova.

Ordine, Cucina e chiusura del conto prendono tutti la stessa visita in UPDATE, quindi sulla stessa visita si mettono in fila. Se l'ordine arriva per primo, la chiusura trova il conto cambiato (`BILL_CHANGED`, vedi più sotto); se arriva prima la chiusura, l'ordine trova la visita chiusa (`SESSION_CLOSED`).

**L'UPDATE condizionale come seconda difesa.** Quando la Cucina segna un piatto come pronto, il service blocca la visita, rilegge la riga e poi non fa un semplice "salva": esegue un UPDATE che vale solo se la riga è ancora `NEW`, e controlla quante righe ha modificato (codice semplificato da `KitchenService`):

```csharp
var changed = await db.OrderItems
    .Where(i => i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId &&
        i.Status == OrderItemStatus.New)
    .ExecuteUpdateAsync(u => u.SetProperty(i => i.Status, OrderItemStatus.Ready)
        .SetProperty(i => i.ReadyAt, now), ct);
if (changed != 1) throw Changed(); // 409 ORDER_ITEM_CHANGED
```

Con il lock della visita, una seconda richiesta sullo stesso piatto arriva comunque dopo e trova già `READY`. La condizione nell'UPDATE serve nel caso in cui un giorno un'altra strada di scrittura dimenticasse il lock: anche allora nessuno sovrascriverebbe il risultato di un altro. L'ultima parola ce l'ha il database, con gli indici unici e i check constraint visti in «Modello dei dati».

**Come si testa.** Una gara tra due richieste non si può riprodurre sperando nel caso. Nei test di integrazione (`KitchenTests.cs`) c'è `LockGate`, una sottoclasse di `DbCommandInterceptor` di EF Core che ferma una transazione in un punto preciso; intanto il test manda l'altra richiesta e verifica che aspetti o venga rifiutata come previsto.

Le alternative erano il livello di isolamento Serializable, con transazioni da ripetere quando PostgreSQL rileva un conflitto, oppure una versione ottimistica su ogni tabella. Con i lock espliciti, invece, l'ordine degli eventi si capisce leggendo il codice e non serve ripetere niente.

### Versione ottimistica del conto (BillVersion)

**Il problema.** Il titolare apre il Conto di un tavolo, vede 45 € e va alla cassa. Nel frattempo un cliente ordina un'altra bibita, oppure la Cucina annulla un piatto. Quando il titolare conferma, il conto chiuso deve essere esattamente quello che ha visto e incassato. Qui un lock non basta: non posso tenere bloccata una riga del database per tutto il tempo in cui una persona guarda lo schermo.

**La scelta: una versione ottimistica.** Ogni visita ha `bill_version`, che parte da 1 e aumenta di 1 per ogni cosa che cambia l'importo: un nuovo ordine, l'annullamento di un piatto o, per una consegna, la correzione del costo di consegna. Una visita online nasce già con il suo ordine e la versione 1. Non cambia quando un piatto diventa pronto o servito, quando lo stesso ordine viene ripetuto con lo stesso `clientRequestId`, né con la chiusura.

Il frontend congela la versione e il totale mostrati nella conferma (il polling aggiorna lo schermo, ma non sostituisce in silenzio i valori da confermare) e li manda con il checkout:

```json
{ "expectedBillVersion": 7, "confirmedTotalCents": 4500 }
```

Il backend blocca la visita in UPDATE, ricalcola il conto dalle righe nel database e confronta. Se la versione o il totale sono diversi, risponde `409 BILL_CHANGED` e allega `currentBill`, il conto aggiornato: il frontend lo mostra e il titolare deve confermare di nuovo. La versione basterebbe a riconoscere un cambiamento; il totale è il valore che il titolare ha davvero confermato, e confrontare anche quello è un controllo in più. Seguono altri controlli, per esempio nessun piatto ancora da preparare (`ORDERS_PENDING`) e un totale maggiore di zero per un conto incassato. Se tutto va bene, la visita si chiude.

Se la stessa chiusura arriva di nuovo (stesso motivo, stessa versione, stesso totale) su una visita già chiusa, il backend restituisce il risultato salvato invece di un errore; una chiusura diversa, invece, non può riscrivere quella salvata.

Le due tecniche si completano: il lock pessimistico protegge i millisecondi della transazione, la versione ottimistica protegge i secondi o i minuti in cui decide una persona.

### Ordini idempotenti

**Il problema.** Il cliente tocca «Conferma e ordina» con un Wi-Fi debole. La richiesta arriva al server e l'ordine viene salvato, ma la risposta si perde per strada. Il telefono mostra un errore, il cliente tocca di nuovo e la cucina riceve due volte lo stesso ordine.

**La scelta: rendere la creazione dell'ordine idempotente**, cioè fare in modo che ripetere la stessa richiesta abbia lo stesso effetto di farla una volta sola.

1. Il browser genera un `clientRequestId`, un UUID v4 creato con `crypto.getRandomValues` (`lib/ids.ts`). A differenza di `crypto.randomUUID`, funziona anche senza HTTPS, per esempio quando provo l'app sulla rete locale.
2. Salva in `sessionStorage` l'ordine completo insieme all'ID, e solo dopo manda la POST. Da questo momento il carrello è bloccato finché non si sa com'è andata.
3. Il backend, dopo i lock e dopo aver controllato che la visita sia aperta e corrisponda al cookie, cerca **prima di tutto** un ordine con lo stesso ID nella visita:

   ```csharp
   var original = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == input.ClientRequestId, ct);
   if (original is not null)
   {
       await transaction.CommitAsync(ct);
       return new(OrderResponse.From(original), false); // 200: ordine già esistente
   }
   // solo alla prima richiesta: pausa degli ordini, disponibilità, prezzi, salvataggio (201)
   ```

   L'ordine dei controlli è importante. Se una ripetizione controllasse di nuovo prezzi e disponibilità, un cliente che riprova dopo che il piatto è finito riceverebbe un errore, anche se il suo ordine esiste già ed è in cucina.

4. L'indice unico `uq_order_one_per_request` su `(dining_session_id, client_request_id)` è l'ultima garanzia: anche con un bug nel codice, il database non accetterebbe un secondo ordine con lo stesso ID.

Il frontend non rimanda mai la POST da solo. Dopo un risultato sconosciuto cerca l'ordine con una GET (`/api/public/sessions/{id}/orders/by-request/{requestId}`); il cliente può ricontrollare con «Verifica esito ordine» oppure toccare «Riprova ordine originale», che rimanda lo stesso ID con lo stesso identico contenuto. È sempre il cliente a decidere.

Gli ordini online seguono la stessa idea, con qualche differenza. `clientRequestId` è unico nel ristorante (`uq_online_request_client_request`). Il backend cerca un risultato già salvato prima della verifica esterna. Se non lo trova, esegue la verifica e poi cerca di nuovo sotto lock, dopo aver preso il numero giornaliero. Anche un duplicato trovato a questo punto annulla l’incremento del contatore, senza lasciare buchi nei numeri. Non trovare un risultato alla prima lettura non significa che un altro invio ancora in corso sia fallito.

Il recupero usa una GET per ID (`/api/public/r/{slug}/requests/by-client-id/{id}`). Questo ID casuale è esso stesso una credenziale, quindi non va mandato in chiaro al verificatore. Anche «Riprova lo stesso ordine» parte da una GET: se trova l’originale lo apre; solo un 404, che significa non ancora trovato, permette di rimandare stesso ID e contenuto con una nuova prova. Il 404 non dimostra comunque che l’originale sia fallito: il controllo dei duplicati sotto lock impedisce ai tentativi concorrenti di creare un altro ordine.

Un’altra differenza voluta: dopo un risultato sconosciuto, se un nuovo tentativo viene rifiutato da un controllo successivo alla ricerca dei duplicati sotto lock (per esempio ordini in pausa, fuori orario, posti in attesa per browser o IP esauriti, consegna disattivata o menu cambiato), il rifiuto prova che l’originale con quell’ID non esiste e il carrello si sblocca. Verifica fallita, CSRF, limiti di frequenza e identificatore del browser mancante arrivano prima di questa prova e non permettono di scartare l’intento sconosciuto. `ONLINE_VERIFICATION_FAILED` (400) permette lo sblocco solo al primo invio esplicitamente rifiutato; 503 del verificatore, timeout e risposte perse conservano l’intento. Gli ordini al tavolo mantengono la regola prudente descritta sopra.

### Ordini online: una richiesta da accettare

**Il problema.** Un ordine online arriva da qualcuno che non è nel locale: può essere uno scherzo, il ristorante può non riuscire a prepararlo, e il cliente non è lì per sentirselo dire. Una volta accettato, però, l'ordine deve passare da Cucina, Pass e Conto come tutti gli altri, senza duplicare queste parti.

**La scelta: una richiesta separata, che diventa una visita solo se viene accettata.**

- **Una tabella a parte.** L'invio salva solo una riga di `online_requests`, con i piatti copiati in una colonna jsonb. Cucina, Pass, Conto e Storico non la vedono, perché leggono `dining_sessions` e `orders` come prima: un ordine sospetto non può arrivare in cucina per errore. Solo l'accettazione crea, nella stessa transazione, la visita (`PICKUP` o `DELIVERY`), il suo ordine e le righe. Un ordine rifiutato o scaduto resta una riga e basta: niente visite aperte per sempre, né piatti per sempre `NEW`.
- **Nessuna colonna di stato.** Una richiesta è accettata se ha `accepted_at`, rifiutata se ha `rejected_at`, altrimenti è in attesa fino a `expires_at` (10 minuti dopo l'invio) e scaduta da quel momento. La scadenza non la scrive nessuno: si ricava dall'ora, quindi non serve un lavoro in background, e nei test basta spostare il tempo con `TestClock`. La regola è scritta una volta sola, in `OnlineRequestState`, e chi legge le richieste in attesa la usa sempre con l'ora di `TimeProvider`, mai con `now()` di SQL. Se un punto se ne dimenticasse, venti richieste scadute basterebbero a bloccare per sempre i nuovi ordini.
- **L'ordine nasce all'accettazione.** Per gli ordini immediati entra in cucina alla creazione. Per un ritiro programmato, `kitchen_starts_at` è l'orario di ritiro meno i minuti scelti dallo staff. La colonna generata `kitchen_queue_at` unifica questi due casi per l'ordinamento, l'attesa e il suono. Il server ammette l'ordine in coda dall'ora prevista, senza un lavoro in background.
- **Un numero al giorno.** Ogni ristorante numera gli ordini online da 1 ogni giorno (`online_counters`): un numero facile da dire al telefono o da scrivere sul sacchetto. L'invio blocca il contatore del giorno con un `INSERT ... ON CONFLICT DO UPDATE`, ma a mezzanotte non basta: due invii vicini, o la riprova di uno stesso ordine, potrebbero bloccare i contatori di due giorni diversi senza aspettarsi. Per questo l'invio prende prima il lock d'invio del ristorante, così il controllo dei duplicati e il limite degli ordini in attesa non si sovrappongono mai. Ristoranti diversi non si aspettano.
- **Un limite, e una sola regola per «si può ordinare?».** Con 20 richieste in attesa il ristorante risulta `BUSY` e non accetta altri invii. Lo stato (`OnlineAvailability`) si calcola in un solo punto, usato dal menu del cliente, dall'invio e dalla pagina delle impostazioni.
- **Il costo di consegna entra nel conto.** All'inizio lo scriveva a mano chi accettava l'ordine, seguendo una nota del titolare, e il cliente lo scopriva solo dopo l'accettazione. Oggi segue le fasce per distanza del titolare e, quando possibile, il cliente lo vede prima di ordinare (vedi «Costo di consegna per distanza»). Se è sbagliato, il titolare lo corregge prima di chiudere, con la versione del conto.

Il prezzo da pagare: lo staff deve rispondere entro 10 minuti, anche nei momenti di punta, e un ordine scaduto è perso: il cliente deve chiamare o ordinare di nuovo. Per questo c'è il banner che suona su ogni pagina e, per i telefoni bloccati, le notifiche push (vedi «PWA per lo staff»).

### Limiti per origine e verifica degli ordini online

**Problema.** Accettare prima di mandare in cucina permette allo staff di rifiutare ordini sospetti, ma non impedisce invii ripetuti che occupano i posti in attesa o fanno suonare continuamente banner e notifiche a schermo bloccato. Il CSRF impedisce a un altro sito di usare il browser per mandare richieste; non ferma chi apre direttamente la pagina e la usa per fare ordini malevoli.

**Scelta: limitare le origini, poi aggiungere la verifica Turnstile ai nuovi invii.**

- **Un solo ordine in attesa per browser e ristorante.** Un identificatore casuale del browser, firmato dal server, sta in un cookie HttpOnly, SameSite=Strict, con scadenza a 30 giorni. `ordering-context` ritrova l’ordine in attesa nel ristorante corrente e la pagina offre il link per aprirlo. Non è un’impronta del dispositivo né una verifica d’identità: cancellando i cookie si può cambiare identificatore, quindi servono anche limiti IP.
- **Frequenza e posti in attesa hanno limiti separati.** Per impostazione predefinita, ogni IP può tentare 3 invii al minuto e 10 in dieci minuti, compresi JSON invalidi, errori CSRF e richieste ripetute. Ogni ristorante ammette inoltre al massimo 5 ordini in attesa dallo stesso IP, mantenendo il limite totale di 20. Accettazione, rifiuto o scadenza liberano i posti. Letture dello stato, recupero e nuovi invii hanno ciascuno limiti di frequenza separati.
- **Caricare Turnstile solo quando serve inviare.** È attivo per impostazione predefinita in produzione e disattivato in Development e Demo; è una configurazione dell’installazione, non un interruttore per ristorante. Il widget si carica alla conferma o nell’area di recupero di un esito sconosciuto, nella lingua del cliente. Scadenza, fine del tentativo o cambio di contesto rendono inutilizzabile la vecchia prova per l’invio; non invia mai un altro ordine automaticamente. Sfogliare menu, privacy o pagina di stato non lo carica.
- **La validità della verifica la decide il backend.** `OnlineVerification` manda la prova a un endpoint HTTPS Siteverify fisso, attende al massimo 5 secondi e non riprova automaticamente né segue redirect. Con chiavi vere devono corrispondere hostname, `action=online_order` e legame alla richiesta. Il legame è lo SHA-256 di `restaurantIdN:clientRequestIdN` (GUID minuscoli senza trattini), inviato come `cdata`: non espone l’ID originale usato per il recupero e impedisce di usare una prova per richieste o ristoranti diversi. La verifica non tiene lock sul database, quindi una risposta lenta di Cloudflare non lascia il ristorante bloccato.
- **Un fallimento non crea ordini né avvisi.** Una verifica rifiutata restituisce `ONLINE_VERIFICATION_FAILED`; un guasto del verificatore restituisce `ONLINE_VERIFICATION_UNAVAILABLE`. Senza una richiesta salvata con successo non si consumano numeri o posti in attesa e non partono notifiche. Carrello e risultati sconosciuti seguono le regole di recupero sopra; le GET degli ordini salvati non dipendono da Cloudflare. Prove e Secret key non finiscono in carrelli, snapshot o log, e al verificatore non mandiamo nomi, telefoni, indirizzi o piatti.

Il costo è una dipendenza esterna: con verifica attiva, sia il browser del cliente sia l’API devono raggiungere Cloudflare. Se non si può verificare, i nuovi invii vengono bloccati, senza lasciarli passare in silenzio. Prima del rilascio servono chiavi vere e configurazione del server; vedi i [passaggi per aggiornare una VPS esistente](self-hosting.md#primo-aggiornamento-a-una-versione-con-turnstile). Solo le coppie ufficiali di test riconosciute in Development accettano la risposta ufficiale con `example.com` e senza action/cdata.

Queste misure rendono più costosi gli invii automatici e l’occupazione ripetuta dei posti, ma non verificano che il telefono appartenga al cliente e non garantiscono ritiro o pagamento. Una persona può ancora fare un ordine malevolo, e clienti legittimi sullo stesso IP pubblico condividono i limiti. Il ristorante deve ancora valutare le richieste sospette, chiamare se serve e decidere se accettarle. Gli ordini accettati e non ritirati restano registrati come `NO_SHOW`: l’app non recupera le perdite del ristorante. Notifiche e squillo non cambiano.

### Sconti: prezzo scontato e codici sconto

**Il problema.** I ristoranti vogliono fare offerte: un piatto a un prezzo più basso per qualche settimana, oppure uno sconto per chi ordina direttamente dal loro link invece che da Glovo o Just Eat, che trattengono una commissione alta. Uno sconto, però, tocca i soldi: il prezzo controllato all'ordine, il totale del conto e quello registrato alla chiusura devono restare d'accordo, anche se un piatto viene annullato o il codice viene eliminato a metà.

**La scelta: due strumenti semplici, ognuno in un solo punto del codice.**

- **Il prezzo scontato è un prezzo.** `menu_items.sale_price_cents` è facoltativo e deve stare sotto il prezzo pieno (lo controlla anche un check constraint). Il server lo usa in un solo punto, `OrderOptions.Resolve`: il prezzo del piatto diventa quello scontato, e i supplementi delle opzioni si aggiungono interi. Il frontend fa lo stesso conto in `unitPriceCents`. Tutto il resto non cambia: il controllo del prezzo all'invio (`MENU_CHANGED`) copre anche l'inizio e la fine di un'offerta, e la riga dell'ordine salva solo il prezzo pagato. Non c'è una programmazione con date: il titolare svuota il campo quando l'offerta finisce.
- **Il codice sconto è una percentuale, mai un importo fisso.** Con una percentuale lo sconto segue da solo i piatti annullati, il conto non diventa mai negativo e non serve una regola di spesa minima. Il massimo è il 50%, così un conto con almeno un piatto resta positivo e si può chiudere come `PAID`.
- **Una copia nella richiesta, non una chiave esterna.** All'invio il server controlla il codice dopo il controllo dei duplicati (così una riprova dello stesso ordine riceve sempre la risposta originale) e lo copia, con la percentuale, in `online_requests`. Il cliente manda anche la percentuale che ha visto, come fa con il prezzo di ogni riga: se nel frattempo il codice è stato eliminato e ricreato con un'altra percentuale, l'ordine viene rifiutato invece di cambiare il totale di nascosto. Eliminare o far scadere un codice non tocca le richieste e i conti che l'hanno usato.
- **Lo sconto vive solo nel conto.** L'importo dell'ordine non cambia: lo sconto lo calcola `SessionSummaries.Project`, l'unico punto che calcola un conto, sui piatti non annullati, arrotondato per difetto al centesimo, senza toccare il costo di consegna. Alla chiusura il totale salvato lo comprende già, quindi lo Storico è giusto senza altro codice.
- **La scadenza è una data, non un lavoro in background.** L'ultimo giorno valido si confronta con la data locale del ristorante solo all'invio. Un ordine inviato alle 23:58 dell'ultimo giorno e accettato dopo mezzanotte tiene lo sconto: il cliente l'ha già visto.

Il prezzo da pagare: chiunque conosca il codice lo può usare, quante volte vuole, e lo scontrino lo emette ancora la cassa del ristorante, quindi lo staff deve ripetere lo stesso sconto alla cassa. Per questo il conto mostra la riga del codice e la conferma di chiusura lo ricorda.

### Costo di consegna per distanza

**Il problema.** Con il costo scritto a mano da chi accettava, il cliente lo scopriva solo dopo l'accettazione, quando la cucina aveva già iniziato e lui non poteva più annullare; e chi accettava doveva calcolarlo ogni volta. Un ristoratore mi ha fatto notare due cose: la distanza in linea d'aria non serve (fiumi, ponti, sensi unici), e i clienti non conoscono le «zone» inventate dal titolare. Prato poi è un solo comune: nessun nome di località distingue vicino e lontano.

**La scelta: fasce per distanza su strada, un preventivo firmato e, se il servizio di mappe non risponde, una persona.**

- **Fasce decise dal titolare.** Fino a cinque fasce (`delivery_tiers`), per esempio «fino a 3 km 2 €, fino a 6 km 4 €»; l'ultima è la distanza massima. In più un ordine minimo facoltativo, uno solo per ristorante, confrontato con i piatti dopo lo sconto e senza la consegna, perché serve a capire se il viaggio vale la pena. Ogni fascia può anche azzerare il costo se il totale dei piatti dopo lo sconto raggiunge la sua soglia. Le coordinate del ristorante il titolare le incolla da Google Maps: il GPS al chiuso e la posizione del computer possono sbagliare di centinaia di metri.
- **Il cliente vede le tariffe prima di ordinare.** Senza preventivo automatico la cassa mostra il listino e chi accetta sceglie la fascia, guardando il percorso dal ristorante che si apre con il pulsante «Percorso». All'accettazione il server confronta fascia e costo con le regole vigenti. Se manca la fascia o il costo è cambiato, ricarica le scelte con `DELIVERY_FEE_CHANGED`.
- **Preventivo automatico con Geoapify.** Quando il cliente tocca «Calcola la consegna», e solo allora, l'API cerca il punto dentro un cerchio attorno al ristorante (`/v1/geocode/search`) e calcola il percorso in auto (`/v1/routing`) senza traffico in tempo reale, così il calcolo della distanza resta stabile. Due chiamate per preventivo, nessuna zona precalcolata: cambiare fasce o coordinate non richiede il servizio esterno. Ho scelto Geoapify perché il piano gratuito non chiede la carta, l'azienda è nell'UE, il suo indirizzo europeo (`api-eu.geoapify.com`) tratta le richieste solo nell'UE e di norma conserva i log delle richieste al massimo 24 ore. Google chiede la carta e limita la conservazione dei risultati; i server pubblici di Nominatim e OSRM non sono per uso commerciale; ospitare un servizio di mappe mio costerebbe più manutenzione di tutta la funzione.
- **Solo risultati precisi.** Prima di scrivere il codice ho provato 27 indirizzi reali di Prato: 21 trovati al numero civico, uno solo alla via, due sbagliati (un errore di battitura, «Marni» invece di «Marini», finiva su un'altra via). Per questo il preventivo si fa solo se il risultato è un edificio o un luogo (`building`, `amenity`) con una confidenza sulla via di almeno 0,9 (`OnlineDelivery.QuotableMatches`, `MinStreetConfidence`): senza il civico, il punto di una via lunga come Via Pistoiese può essere a chilometri dalla casa. Tutto il resto vale «non trovato»: si torna al listino e alla persona.
- **Un preventivo firmato.** Il preventivo è firmato con Data Protection, come i codici dei tavoli, ed è legato al ristorante, all'indirizzo, alle coordinate del ristorante e a una scadenza di 30 minuti (`DeliveryQuotes`). All'invio il server non richiama Geoapify: controlla la firma e le coordinate attuali e verifica che la distanza rientri ancora nelle fasce, altrimenti `DELIVERY_QUOTE_INVALID`. Ricalcola il costo sui piatti dopo lo sconto. Se differisce da quello confermato, risponde `DELIVERY_FEE_CHANGED` e il cliente rivede il totale. Il cliente non può inventarsi un costo, e quello che ha visto è quello che paga: chi accetta non lo può cambiare. Un prezzo diverso concordato al telefono passa dalla correzione del costo nel Conto.
- **Il servizio esterno non decide se si può ordinare.** Il piano gratuito non ha garanzie, e i suoi limiti sono «morbidi»: oltre la soglia risponde ancora, ma un uso eccessivo può far bloccare l'account, cioè i preventivi di tutti i ristoranti. Per questo ci sono un limite per IP e due limiti al giorno, uno per ristorante e uno per tutta l'installazione, sotto la quota gratuita. Raggiunto un limite, o se Geoapify non risponde, si torna al listino: l'ordine si fa lo stesso. Senza chiave la funzione è spenta, anche in un'installazione self-hosted.

Il prezzo da pagare: l'indirizzo del cliente esce dal server (l'informativa privacy lo dice), il preventivo dipende da quanto bene OpenStreetMap conosce i civici, e un errore che Geoapify ritiene sicuro passa ancora, come «Piazza de' Medici» trovata come «Via Cancellieri». Per questo la cassa mostra il comune trovato, e il cliente può aggiungere comune o CAP all'indirizzo e ricalcolare.

### Scritture con risultato sconosciuto: recupero solo con GET

Il problema degli ordini vale per ogni scrittura: aprire un tavolo, segnare un piatto pronto, chiudere un conto, creare un ristorante. Quando la rete cade, o quando scade il timeout, il risultato è sconosciuto: la scrittura può essere andata a buon fine oppure no. Il timeout non è automatico: solo le operazioni che usano `withTimeout` (`lib/api.ts`) interrompono l'attesa dopo 15 secondi (`REQUEST_TIMEOUT_MS`), cioè quelle di Sala, Cucina, Pass, Conto, ordini online, notifiche push, abbonamenti e del cliente (ordini al tavolo e online, ingresso nella visita); le modifiche al menu e le operazioni dell'amministratore su ristoranti e account non lo usano.

Per le scritture più delicate uso lo stesso schema: apertura del tavolo e pausa dei nuovi ordini in Sala, piatto pronto o annullato in Cucina, chiusura del conto, ordini del cliente (al tavolo e online) e operazioni dell'amministratore su ristoranti e account.

```mermaid
flowchart TD
  A["Conferma della persona"] --> B["Salva in sessionStorage<br>l'intenzione minima"]
  B --> C["POST"]
  C -->|"successo"| D["Cancella l'intenzione<br>e mostra il risultato"]
  C -->|"rifiuto esplicito del server<br>(ordini e amministratore: solo al primo tentativo)"| E["Cancella l'intenzione<br>e mostra il motivo"]
  C -->|"timeout o errore di rete"| F["Risultato da verificare<br>le modifiche collegate restano bloccate"]
  C -->|"ordini e amministratore:<br>rifiuto dopo un risultato sconosciuto"| F
  F --> G["Rete tornata, pagina di nuovo visibile o ricaricata<br>GET della risorsa originale"]
  G -->|"operazione già fatta"| D
  G -->|"non risulta fatta"| H["Serve una nuova conferma<br>prima di un'altra POST"]
  H --> C
```

Ordini del cliente e operazioni dell'amministratore sono più prudenti. Se il risultato di una richiesta era già sconosciuto, il rifiuto di una riprova non dimostra che la prima richiesta sia fallita: l'intenzione resta, e per gli ordini il carrello resta bloccato. Al primo tentativo, poi, un ordine libera l'intenzione solo con i rifiuti che conosce, come `MENU_CHANGED` o `ORDERING_PAUSED` (`submissionFailure` in `orders/state.ts`). Anche una GET che risponde 404, per un ordine, vuol dire solo «non ancora trovato»: la prima POST potrebbe arrivare al server più tardi.

L’intenzione minima contiene identificativi, tipo di azione e, quando serve, il valore confermato, salvati con una chiave che include ristorante e account, come `tavoloflow:kitchen:{restaurantId}:{userId}`. Per esempio, la Cucina salva l’ID dell’ordine, quello della riga e "pronto"; la Sala salva `tableId` per l’apertura oppure `enabled` per la ricezione degli ordini. Solo il carrello salva l’ordine intero, perché una riprova deve mandare lo stesso contenuto.

**Perché solo GET.** Una GET non cambia niente, quindi si può ripetere quante volte serve. Una POST ripetuta in automatico, invece, potrebbe fare due volte la stessa cosa, per esempio riaprire un tavolo appena chiuso. Perciò, dopo un risultato sconosciuto, il frontend si limita a leggere lo stato della risorsa originale; se l'operazione non risulta fatta, deve confermarla di nuovo una persona.

**Perché `sessionStorage`.** Vale per una sola scheda e sparisce quando la scheda si chiude, così due schede non si confondono a vicenda. I marcatori contengono solo i dati minimi dell’operazione; l’ordine completo resta l’eccezione del carrello. Mai password o codici.

Le eccezioni allo schema sono sette:

- l'ordine del cliente, che si può riprovare a mano con lo stesso ID perché il backend è idempotente (vedi sopra);
- le scritture degli abbonamenti nell'area amministratore, che non salvano niente: ogni scrittura porta la versione dell'abbonamento letta prima, quindi ogni versione può essere consumata al massimo da una scrittura che modifica lo stato. I salvataggi senza cambiamenti possono riuscire più volte senza incrementarla. Dopo un risultato sconosciuto si rilegge e si conferma di nuovo;
- «Servito» sul Pass, che non salva niente: l'UPDATE vale solo per un piatto pronto e non ancora servito, quindi ripeterlo non fa danni, e la lista aggiornata mostra da sola se la scrittura è passata;
- accettare o rifiutare un ordine online, che non salvano niente per lo stesso motivo: valgono solo per una richiesta ancora in attesa, una ripetizione riceve `ONLINE_REQUEST_CHANGED`, e la lista aggiornata mostra cosa è successo;
- le impostazioni degli ordini online, che mandano il valore finale: durante il salvataggio il modulo è bloccato, e dopo un risultato sconosciuto basta la rilettura che la pagina fa comunque ogni 60 secondi;
- la correzione del costo di consegna, che porta con sé la versione del conto, quindi vale al massimo una volta; dopo qualsiasi risultato si rilegge il conto;
- l'iscrizione alle notifiche push e la sua cancellazione, che si possono ripetere senza danni: la Home mostra «attive» solo dopo la conferma del server, e la verifica successiva, o il prossimo accesso, registra di nuovo il dispositivo.

Le altre scritture (menu e foto, tavoli, login e password) non salvano nessuna intenzione. Nel menu e nei tavoli, per esempio, se la risposta si perde il form resta compilato e la pagina chiede di rileggere la lista e controllare prima di riprovare.

In Cucina e durante la chiusura del conto, quando la pagina viene nascosta, la rete cade o cambia l’utente, le richieste in corso vengono annullate con `AbortController` e le risposte in ritardo vengono scartate. La Sala si comporta diversamente: nasconde i codici quando perde visibilità o connessione, ma non annulla le scritture per questi eventi e può ancora acquisirne l’esito se il componente resta montato. Le annulla quando il componente viene smontato; per apertura e ricezione degli ordini, il timeout interrompe l’attesa dopo 15 secondi.

### Polling invece di WebSocket

**La scelta.** Cucina, Pass, Sala e Conto non ricevono notifiche dal server: lo interrogano a intervalli regolari con il `refetchInterval` di TanStack Query. L'unica cosa che il server manda di sua iniziativa sono le notifiche push dei nuovi ordini online, un promemoria in più per i telefoni bloccati (vedi «PWA per lo staff»): le pagine restano comunque basate sul polling.

| Pagina                                                          | Intervallo |
| --------------------------------------------------------------- | ---------- |
| Cucina, Pass, banner e pagina degli ordini online               | 10 secondi |
| Stato dell'ordine online (cliente), finché l'ordine non finisce | 10 secondi |
| Sala, Conto, ordini del tavolo e menu online (cliente)          | 30 secondi |
| Promemoria dell'abbonamento, Impostazioni ordini online         | 60 secondi |

Il polling si ferma quando la pagina è nascosta o il dispositivo è offline, e riparte quando torna visibile.

**Perché basta.** Un ristorante piccolo ha pochi dispositivi, e per la cucina 10 secondi di ritardo sono accettabili. In cambio il polling è molto più semplice di WebSocket o SignalR: nessuna connessione aperta da mantenere e da ricollegare dopo un'interruzione, nessuna configurazione particolare nel proxy, e ogni richiesta è una normale GET che passa dall'autenticazione e dalle regole di sempre. Dopo una caduta della rete, il polling successivo rimette tutto in pari.

**Letture leggere.** Visto che queste richieste si ripetono di continuo, leggono solo le visite aperte e non contano né scorrono mai lo storico di un ristorante. Per capire se è arrivato qualcosa di nuovo basta un "watermark": l'ultimo ingresso in cucina (`latestQueuedAt`) o del piatto pronto più recente (`latestReadyAt`), letta dall'estremità di un indice. Quando il watermark avanza rispetto alla lettura precedente, la Cucina o il Pass suonano (`watermarkAdvanced` in `lib/live-view.ts`). Al primo caricamento e quando la pagina torna visibile, la lettura fa solo da riferimento, senza suonare.

**Dati freschi prima di scrivere.** Una pagina che non si aggiorna da un po’ mostra dati vecchi, e decidere su dati vecchi è pericoloso, per esempio chiudere un conto che nel frattempo è cambiato. In Cucina, Pass, Ordini online e nella conferma del conto, le scritture sono bloccate se l’ultimo aggiornamento riuscito ha almeno 30 secondi o è precedente all’ultimo ritorno in primo piano della pagina (`syncIsFresh`). L’avviso però compare solo se il blocco dura almeno 3 secondi, oppure subito se si è offline o l’ultima richiesta è fallita (`syncIsStalled`): così un aggiornamento normale non fa lampeggiare avvisi. Le pagine degli abbonamenti, che si aggiornano ogni 60 secondi, usano invece una soglia di freschezza di 90 secondi. Questi controlli sono specifici delle singole funzionalità: la Sala non usa `syncIsFresh` per autorizzare apertura e ricezione degli ordini. Il banner degli ordini online usa la stessa regola per decidere se suonare: con dati vecchi o una lettura fallita smette di suonare, ma continua a mostrare il numero.

Per Cucina, Pass e ordini online il costo è un ritardo fino a 10 secondi (a telefono bloccato, per gli ordini online, ci sono le notifiche push), e il numero di richieste cresce con il numero di dispositivi accesi (vedi «Limiti attuali»).

### Cookie, CSRF e same-origin

**Perché cookie e non JWT.** Una scelta comune nelle SPA è un token JWT salvato in `localStorage` e mandato a mano in un header. Ho preferito i cookie di autenticazione di ASP.NET Core:

- sono `HttpOnly`: JavaScript non li può leggere, quindi nemmeno uno script malevolo iniettato nella pagina (XSS) può rubarli e usarli altrove;
- il browser li manda da solo, e con frontend e API sulla stessa origine non serve nessuna configurazione;
- si possono revocare: grazie al controllo di `credential_version` a ogni richiesta (vedi «Tre identità»), cambiare o reimpostare una password, o disattivare un account, invalida subito tutti i cookie vecchi. Un JWT di solito si verifica senza database, e per revocarlo prima della scadenza servirebbe comunque un controllo sul server: a quel punto il suo vantaggio principale sparisce.

La durata fissa, senza rinnovo automatico (vedi la tabella in «Tre identità»), è prevedibile: un tablet perso smette di funzionare al più tardi dopo 30 giorni, e subito se si cambia la password.

**Il prezzo dei cookie: il CSRF.** Proprio perché il browser allega i cookie da solo, un altro sito potrebbe approfittarne: una pagina malevola aperta dal titolare potrebbe contenere un form nascosto che fa una POST verso `https://app.esempio.it/api/...`, e il browser allegherebbe il cookie di login del titolare. Si chiama Cross-Site Request Forgery (CSRF). Le difese sono due:

1. `SameSite=Lax` sui cookie di login: il browser non li allega alle POST che partono da un altro sito.
2. Il token antiforgery di ASP.NET Core. Prima di ogni scrittura il frontend chiede un token nuovo all'endpoint `csrf` della propria identità e lo rimanda nell'header `X-CSRF-TOKEN`: costa una richiesta in più, ma evita di usare un token vecchio dopo un login, un logout o un cambio di identità. Il server lo confronta con il cookie antiforgery (`TavoloFlow.Csrf`, `HttpOnly` e `SameSite=Strict`) e con l'utente corrente. Un altro sito non può leggere la risposta che contiene il token, perché la same-origin policy del browser glielo impedisce, quindi non può costruire una richiesta valida. In più ogni token vale solo per l'identità per cui è stato chiesto (`BrowserCsrfScope`, vedi «Tre identità»). Vale anche per l'invio anonimo di un ordine online: il token si chiede a `/api/public/csrf`, nell'ambito Guest, e per questo il controller degli ordini online dichiara la policy `GuestAccess` oltre ad `[AllowAnonymous]` (vedi «Backend: moduli e percorso di una richiesta»).

Il controllo lo fa `CsrfValidationFilter`, registrato in modo globale perché `AddControllers` da solo non valida il token per le richieste JSON: così anche un endpoint nuovo è protetto senza fare niente.

### PWA per lo staff

**Perché una PWA e non un'app nativa.** Lo staff usa telefoni e tablet, spesso già presenti nel ristorante. Un'app nativa vorrebbe dire altro codice (Android e iOS), la pubblicazione negli store e aggiornamenti da far installare a ogni dispositivo. Con una PWA lo stesso codice React diventa un'app installabile: icona nella schermata Home, finestra a schermo intero, e gli aggiornamenti arrivano a tutti senza passare dagli store, alla successiva apertura o ricarica dell'app. Una pagina già aperta continua invece a usare la versione precedente: per questo il server conserva i file JavaScript e CSS di tutte le versioni (vedi [self-hosting](self-hosting.md#rilasciare-una-nuova-versione)).

**Solo `/staff`.** Il manifest (`/staff.webmanifest`) non è collegato in `index.html`: lo collega solo `StaffLayout`, che registra anche il service worker `/sw.js` con scope `/staff`. Così ai clienti su `/q/*`, `/r/*` e `/o/*`, che non hanno bisogno di installare niente, il browser non propone mai l'installazione. `id`, `start_url` e `scope` del manifest sono `/staff` senza barra finale, perché il router toglie la barra finale dagli URL e la pagina deve restare dentro lo scope.

**Un service worker che non mette niente in cache.** Il service worker gestisce solo il caricamento delle pagine: prova sempre prima la rete, e solo se il caricamento fallisce mostra una pagina offline scritta al suo interno. Non usa Cache Storage e lascia al browser tutte le altre richieste, comprese quelle a `/api`. Rinuncio al funzionamento offline, ma non devo mai preoccuparmi di dati vecchi o di una versione vecchia dell'app rimasta in cache, uno dei problemi più comuni delle PWA. Lo tengo per la pagina offline: senza service worker, chi apre l'app senza rete vedrebbe solo la pagina di errore del browser. Per l'installazione, invece, oggi non serve più: i [criteri attuali di Chrome](https://web.dev/articles/install-criteria) per proporla non chiedono un service worker.

**Cosa si guadagna installandola:**

- nell'app installata con Chrome (su Android o su computer), Cucina e Pass possono suonare appena aperti, senza che qualcuno tocchi lo schermo: le regole dell'autoplay dei browser lo permettono alle app installate;
- un interruttore tiene lo schermo acceso (Screen Wake Lock API), utile per il tablet in cucina;
- su iOS l'app installata non ha il pulsante Indietro del browser, quindi le pagine fuori dalle schede hanno un link per tornare indietro (`PageHeader`).

**Notifiche a schermo bloccato, solo per gli ordini online.** Il polling si ferma quando il telefono è bloccato o l'app è in background. Per la cucina va bene, perché chi lavora ha la pagina aperta; un ordine online invece aspetta che qualcuno lo accetti, e dopo 10 minuti scade. Per questo, e solo per questo, l'app usa Web Push: quando arriva un nuovo ordine online, i dispositivi che le hanno attivate ricevono una notifica di sistema con un suono, anche bloccati.

- **Cosa contiene.** Solo il numero dell'ordine e la lingua del dispositivo: «Nuovo ordine online #12». Niente nome, telefono o indirizzo del cliente, perché la notifica passa dai server di Apple, Google o Mozilla: il contenuto è cifrato per il singolo dispositivo, ma meno dati escono, meglio è. Il testo lo scrive il service worker nelle tre lingue, come la pagina offline.
- **Una chiave sola.** Il server firma ogni invio con una chiave VAPID. In `.env` ne serve una sola, la privata (`VAPID_PRIVATE_KEY`, 64 caratteri esadecimali come la password del database): la pubblica, con cui il browser si iscrive, l'API la ricava da quella.
- **Un'iscrizione per dispositivo.** Ogni dispositivo si attiva dalla Home con un tocco, che chiede il permesso delle notifiche. L'iscrizione (`push_subscriptions`) ricorda l'account, la sua `credential_version` e la scadenza del login: se la password cambia, l'account viene disattivato o il login scade, quel dispositivo non riceve più niente. Il controllo è una regola sola (`PushTargets`), usata prima di ogni invio e di ogni nuova iscrizione: così il cambio di password e gli altri punti che toccano le credenziali non devono sapere niente delle notifiche.
- **Uscita e nuovo accesso.** L'indirizzo del dispositivo viaggia nella richiesta di uscita: il server cancella l'iscrizione prima di togliere il cookie. Se manca il service worker dello staff o l'API Push, esci senza inviare un indirizzo del dispositivo. Un errore effettivo di lettura nel browser o di cancellazione ti lascia collegato e puoi riprovare; se la risposta si perde, controlli l'identità con una GET. Il browser tiene l'iscrizione per il prossimo accesso. Le notifiche già spedite possono ancora arrivare. Solo «Disattiva su questo dispositivo» cancella anche l'iscrizione del browser.
- **Conferma e recupero.** Un solo controller in `StaffLayout` coordina Home, uscita e iscrizione automatica. «Attive» compare solo dopo la conferma del server; un errore conserva l'iscrizione del browser e offre «Riprova». La verifica si ripete all'accesso, al cambio di lingua o password, tornando all'app, al focus e alla riconnessione. Se il browser cambia l'indirizzo, viene registrato alla prossima verifica. Le operazioni non si sovrappongono e le risposte di una vecchia identità vengono scartate; non ci sono timer di ritentativo o nuove iscrizioni in background nel service worker.
- **Solo un promemoria.** Il backend mette il numero dell'ordine in una coda in memoria solo dopo aver salvato l'ordine, e un `BackgroundService` lo invia senza riprovare. Se una notifica si perde, o il server si riavvia mentre è ancora in coda, non succede niente di grave: il banner e il suono nella pagina restano il meccanismo principale.
- **Log senza segreti.** Il client HTTP delle notifiche disabilita i logger predefiniti: scriverebbero anche il percorso dell'indirizzo, che contiene il token del dispositivo. Restano solo codice di risposta o tipo di errore.
- **Solo servizi conosciuti.** L'indirizzo a cui inviare lo sceglie il browser, quindi il server accetta solo quelli dei servizi di notifica conosciuti (Apple, Google, Mozilla, Microsoft) e non segue i redirect: altrimenti un account potrebbe far chiamare al server indirizzi interni.
- **iPhone.** Su iOS le notifiche esistono solo nell'app aggiunta alla schermata Home (iOS 16.4 o successivo), non in Safari. A schermo bloccato arriva una notifica con un suono, non una suoneria continua.

### Altri compromessi

- **Aprire un tavolo non è idempotente.** A differenza dell'ordine, l'apertura non ha un ID di richiesta. Se la risposta si perde, il frontend rilegge la Sala e lo staff decide se riaprire; una seconda apertura sullo stesso tavolo riceve `SESSION_ALREADY_ACTIVE`, e l'indice unico garantisce comunque una sola visita aperta per tavolo. Resta un rischio, che ho accettato consapevolmente per la prima versione: una richiesta vecchia che arriva in grande ritardo, quando il tavolo è già stato chiuso, e apre una visita che nessuno voleva, da chiudere poi senza incasso. Se nell'uso reale succedesse spesso, aggiungerei un ID di richiesta anche all'apertura. Per un ordine o un conto un rischio del genere non sarebbe accettabile, ed è per questo che lì ci sono `clientRequestId` e `bill_version`.
- **Menu: l'ultima modifica vince.** Se il titolare modifica lo stesso piatto da due dispositivi, vale l'ultimo salvataggio, senza avvisi di conflitto. Non è grave, perché quello che conta lo controlla l'ordine: il backend ricontrolla sempre prezzi, disponibilità e opzioni e, se qualcosa è cambiato, risponde `MENU_CHANGED` con l'elenco delle modifiche (per un'opzione esaurita o non più valida il motivo è `OPTIONS_CHANGED`).
- **Un formato di errore mio invece di ProblemDetails.** ASP.NET Core supporta un formato standard per gli errori (ProblemDetails, RFC 9457), ma il frontend era già costruito attorno al campo `code`. Generare tutto da un solo filtro costava meno che passare al formato standard, che per un'API pubblica resterebbe comunque la scelta più corretta.
- **I contatti si cancellano solo con un nuovo ordine.** Nome, telefono, indirizzo e impronte di browser/IP separate per ristorante, più vecchi di 30 giorni, vengono cancellati dal successivo invio online riuscito dello stesso ristorante, senza un lavoro pianificato in background. Se non arrivano altri ordini, i dati restano. Le impronte di browser/IP si cancellano già quando il ristorante accetta o rifiuta la richiesta; restano fino ai 30 giorni solo per le richieste scadute. L’informativa privacy descrive questo meccanismo, compresi i 7 giorni dei backup; resta da decidere prima del lancio se aggiungere una pulizia pianificata. L’implementazione attuale non garantisce una cancellazione automatica al trentesimo giorno.
- **Abbonamenti senza storico.** Nel progetto iniziale c'era una tabella di eventi degli abbonamenti, con lo storico delle modifiche, gli avvisi al titolare e un ID per ogni operazione contro i duplicati. L'ho eliminata quando è stato chiaro che la sola `subscription_version` bastava a impedire che due modifiche consumassero la stessa versione. Ho perso lo storico, ma per una prima versione non serviva.

## Limiti e cosa farei diversamente

### Limiti attuali

- **Pensato per una sola istanza.** Il rate limiter (`FixedWindowLimiter`) tiene i contatori in memoria, anche quelli giornalieri dei preventivi di consegna: si azzerano a ogni riavvio e, con più istanze dell'API, ognuna avrebbe i suoi. Per scalare servirebbe un archivio condiviso, per esempio Redis o lo stesso PostgreSQL. Lo stesso vale per la coda delle notifiche push, che sta in memoria.
- **Il codice del tavolo è corto.** Quattro caratteri da un alfabeto di 32 fanno circa un milione di combinazioni (2²⁰). Contro chi prova a indovinarlo lo protegge solo il rate limit, per IP e per visita: prima di un uso pubblico vero andrebbe rivalutato, magari con un codice più lungo.
- **Polling.** Il carico sul server cresce con il numero di dispositivi accesi: con molti ristoranti varrebbe la pena passare a WebSocket o a Server-Sent Events.
- **Test.** Il backend ha più di 500 test, in gran parte di integrazione, che girano su un PostgreSQL vero in Docker; il frontend ha solo test della logica pura con `node --test`. Nel repository mancano test dei componenti e test end-to-end. Tutti i test che ci sono girano a ogni push nella CI (`.github/workflows/ci.yml`).
- **Codici di errore allineati a mano.** La tabella con cui il frontend traduce i codici di errore nelle tre lingue (`lib/api-messages.ts`, vedi «Backend: moduli e percorso di una richiesta») va tenuta allineata a mano con il backend: TypeScript segnala una traduzione mancante, ma non un codice nuovo del backend.
- **Rilascio artigianale.** Una sola VPS, script di rilascio lanciati a mano, backup affidati a un timer di systemd, nessun sistema di monitoraggio o di allarme: se il server si ferma, me ne accorgo solo quando qualcuno se ne lamenta.
- **Frontend complesso in alcuni punti.** La gestione dei risultati sconosciuti (per esempio in `useCart`) è molto robusta, ma anche pesante da leggere e da mantenere per una prima versione.

### Cosa farei diversamente

- **Parlare con i ristoranti prima di scrivere codice.** Ho valutato l'idea con un'indagine veloce, e solo dopo il rilascio ho scoperto che quasi tutti volevano stampare le comande e che chi offriva già l'ordinazione con QR usava il servizio di un'azienda SaaS cinese (vedi «Perché questo progetto»). Qualche visita prima di iniziare mi avrebbe fatto progettare la stampa fin dall'inizio, o magari cambiare idea.
- **Rilasciare prima, con meno funzioni.** Ho aggiunto cose che per una prima versione non servivano: l'asporto l'ho sviluppato e poi tolto, la tabella di eventi degli abbonamenti l'ho eliminata. Un prodotto più piccolo, messo prima davanti ai clienti, mi avrebbe dato prima le informazioni che contavano.
- **Configurare la CI dal primo giorno.** L'ho aggiunta solo alla fine, quando ho reso pubblico il codice. Una GitHub Action che a ogni push lancia i test del backend e build, lint e test del frontend costa poco, e fin dall'inizio mi avrebbe tolto il pensiero di ricordarmi di farlo.
