[English](../en/local-development.md) · **Italiano** · [中文](../zh-CN/local-development.md)

# Eseguire TavoloFlow in locale

Questa guida è per chi vuole far girare TavoloFlow sul proprio computer: per vederlo all'opera in pochi minuti, per modificarne il codice o per provarlo da un telefono vero. Come metterlo online su un server lo spiego nella guida al [self-hosting](self-hosting.md); com'è fatto all'interno, nelle [note di sviluppo](development-notes.md).

Ci sono tre modi, dal più semplice al più completo:

- la **demo** (Parte 1): un solo comando Docker e un ristorante di prova già pronto, senza installare né .NET né Node;
- l'**ambiente di sviluppo** (Parte 2): il database in Docker, l'API e il frontend avviati a mano, con il frontend che si aggiorna mentre lo modifichi; la Parte 3 spiega come lanciare i test;
- il **telefono** (Parte 4): l'ambiente di sviluppo raggiungibile da un telefono nella stessa rete Wi-Fi, per scansionare un QR vero.

Io ho sviluppato tutto su Windows 11 con WSL2 (Ubuntu) e Docker Desktop. I comandi della Parte 2 sono per Bash, quindi per Linux, macOS o WSL; la demo si avvia anche da PowerShell su Windows.

## Panoramica

|              | Demo                     | Sviluppo                                         | Dal telefono                                    |
| ------------ | ------------------------ | ------------------------------------------------ | ----------------------------------------------- |
| Cosa serve   | Git, Docker              | Git, Docker, .NET SDK 10, Node 24                | l'ambiente di sviluppo e la stessa rete Wi-Fi   |
| Indirizzo    | `http://127.0.0.1:8080`  | `http://localhost:5173`                          | `http://IP-DEL-COMPUTER:5173`                   |
| Dati         | il ristorante Demo Ramen | quelli che crei tu, oppure gli stessi della demo | quelli dell'ambiente di sviluppo                |
| Quando serve | vedere l'app, mostrarla  | modificare il codice, lanciare i test            | provare il QR e la pagina del cliente sul serio |

```mermaid
flowchart LR
  subgraph Demo["Demo · demo/compose.yaml"]
    B1["Browser<br>127.0.0.1:8080"] --> W["web<br>Caddy e file della SPA"]
    W -->|"/api/*"| A1["api<br>ASP.NET Core"]
    A1 --> D1[("db<br>PostgreSQL 18")]
    I["init<br>migrazioni e dati"] -.-> D1
  end
  subgraph Dev["Sviluppo"]
    B2["Browser<br>localhost:5173"] --> V["Vite<br>npm run dev"]
    V -->|"proxy /api/*"| A2["API<br>dotnet run · localhost:5093"]
    A2 --> D2[("db in Docker<br>127.0.0.1:5432")]
  end
```

In tutti e due i casi il browser vede un solo indirizzo, come in produzione: nella demo l'ingresso è Caddy, in sviluppo il proxy di Vite (vedi la [panoramica dell'architettura](development-notes.md#panoramica)). Frontend e API stanno sulla stessa origine, quindi non serve configurare CORS.

**Demo su `127.0.0.1`, sviluppo su `localhost`.** Se le fai girare insieme, non aprirle tutte e due da `localhost`. Il browser lega i cookie al nome dell'host, non alla porta: per lui `localhost:8080` e `localhost:5173` sono lo stesso sito, e i cookie di login delle due app, che hanno gli stessi nomi (`TavoloFlow.Store`, `TavoloFlow.Csrf`…), si sovrascriverebbero a vicenda. Il risultato sono logout continui ed errori CSRF. `127.0.0.1` e `localhost` invece sono due host diversi, ognuno con i suoi cookie. In alternativa basta usare due profili del browser.

## Parte 1: la demo

### Avviarla

Servono solo Git e Docker con Compose v2. Su Windows basta Docker Desktop con i container Linux, e i comandi si lanciano direttamente da PowerShell: non servono .NET, Node, Bash né un file `.env`.

```bash
git clone https://github.com/lorenzoyang/TavoloFlow.git
cd TavoloFlow
docker compose -f demo/compose.yaml up -d --build
```

La prima volta Docker scarica le immagini di base e compila API e frontend: ci vuole qualche minuto. Quando il comando finisce, apri <http://127.0.0.1:8080>.

| Ruolo                            | Utente             | Password | Dove si entra                          |
| -------------------------------- | ------------------ | -------- | -------------------------------------- |
| Titolare                         | `demo.ramen.owner` | `123456` | <http://127.0.0.1:8080/staff/login>    |
| Staff                            | `demo.ramen.staff` | `123456` | <http://127.0.0.1:8080/staff/login>    |
| Amministratore della piattaforma | `demo.admin`       | `123456` | <http://127.0.0.1:8080/platform/login> |

A differenza di un ristorante vero, gli account della demo non devono cambiare la password al primo accesso. Sono password pubbliche: vanno bene solo sul tuo computer.

L'interfaccia segue la lingua del browser. Per averla in italiano scegli «Italiano» sotto il logo nella pagina di accesso, oppure più tardi nella Home, nella scheda dell'account.

### Cosa contiene

Il ristorante **Demo Ramen**: tema LACQUER, euro e fuso orario di Roma, menu predefinito in inglese con nomi e descrizioni in tre lingue. Servizio e ordini sono attivi, e i clienti devono inserire il codice del tavolo. Il ristorante usa solo il QR al tavolo: gli ordini online sono spenti, ma si accendono in pochi passaggi (vedi «Provare gli ordini online»).

- 8 tavoli, da T01 a T08, tutti liberi; i token dei QR vengono generati a caso durante l'inizializzazione;
- 4 categorie e 12 piatti, con prezzi, descrizioni, allergeni di esempio e una foto ciascuno; i Gyoza alla piastra sono in offerta (5,00 € invece di 6,00 €);
- 2 gruppi di opzioni: **Piccantezza** (obbligatoria, su tutti i ramen) e **Aggiunte** (fino a tre, con supplemento, sui ramen tranne quello vegano);
- un periodo di abbonamento di un anno da 199 €, già pagato (si vede nell'area amministratore e nella pagina Abbonamento del titolare);
- nessuna visita, nessun ordine, nessun conto: si comincia aprendo un tavolo.

Il ristorante e i piatti sono inventati, allergeni compresi, e le foto sono generate con l'AI (i dettagli sono in [`demo/images/README.md`](../../demo/images/README.md)).

### Un giro di cinque minuti

1. Entra come **titolare**. Dalla Home apri **Tavoli e QR**, tocca **«QR»** sul tavolo T01 e poi **«Copia link»**: è l'indirizzo che il cliente aprirebbe scansionando il QR.
2. Vai in **Sala**, scegli T01 e conferma con **«Apri tavolo»**. Compare il codice del tavolo, di quattro caratteri.
3. In un'altra scheda incolla il link: sei il cliente. Inserisci il codice e tocca **«Verifica codice»**, metti qualche piatto con **«Aggiungi al carrello»** (per un ramen si apre prima un pannello: scegli la **Piccantezza**, che è obbligatoria, ed eventualmente fino a tre **Aggiunte**, poi tocca **«Aggiungi · € …»**), poi **«Controlla ordine»** e **«Conferma e ordina»**.
4. Torna all'area staff e apri **Cucina**: l'ordine è arrivato, con le opzioni scelte sotto ogni piatto. Segna i piatti con **«Pronto»**. Per il suono il browser vuole prima un tocco sulla pagina.
5. Dalla Home apri **Pass** e segna i piatti con **«Servito»**.
6. Apri **Conto**, scegli T01 e tocca **«Incassa e libera il tavolo»**; spunta la conferma e chiudi con **«Incassato, libera tavolo»**. Il conto chiuso lo ritrovi in **Storico conti**, dalla Home.
7. Come titolare apri **Menu** e la scheda **Opzioni**: ci sono i due gruppi della demo, chiusi; toccane uno per vedere le sue opzioni. Prova **«Nuovo gruppo»** partendo da un modello, per esempio Formato per le bevande, o copiando un gruppo esistente per cambiarne la regola; nel modulo, **«Aggiungi dai piatti…»** trasforma in opzioni i piatti che spunti, come serve per un menu fisso. Oppure apri **Aggiunte** e segna un'aggiunta come esaurita con il suo interruttore: il cliente non potrà più sceglierla. Per mettere un piatto in offerta, modificalo e scrivi un **«Prezzo scontato (facoltativo)»** più basso del prezzo: il menu del cliente mostra il prezzo pieno barrato; per togliere l'offerta svuota il campo.
8. Se vuoi, entra anche come amministratore da `/platform/login`, nello stesso browser: le identità di cliente, staff e amministratore hanno cookie separati e non si disturbano (vedi [«Tre identità»](development-notes.md#tre-identità-staff-cliente-piattaforma)).

Tutte le schede normali di un browser condividono lo stesso login dell'area staff: per usare insieme titolare e staff serve un altro profilo, un altro browser o una finestra anonima.

### Provare gli ordini online

Nella demo gli ordini online sono spenti. Per accenderli bastano un paio di minuti, con gli account della demo:

1. Entra come **amministratore** da `/platform/login` e apri **Demo Ramen**. Nella sezione **Funzioni**, accanto a «Link online», tocca **«Imposta»**, scrivi per esempio `demo-ramen`, tocca **«Controlla e continua»** e conferma. Poi accendi l'interruttore **«Ordini online»** e conferma. Il link va impostato prima: senza, l'interruttore resta disattivato.
2. Entra come **titolare**. Dalla Home apri **Impostazioni ordini online**: inserisci il telefono e tocca **«Salva telefono»**; poi, in **Orari**, aggiungi per oggi una fascia che comprenda l'ora attuale (la fine è l'ultimo momento in cui si può ordinare) e tocca **«Salva orari»**. In alto lo stato deve diventare **«Aperti»**; altrimenti, lì sotto c'è il motivo. Per provare anche la consegna, nella sezione **Consegna a domicilio** attiva **«Offri la consegna»** in alto, incolla in **«Posizione del ristorante»** delle coordinate, per esempio `43.88015, 11.09612`, tocca **«Aggiungi fascia»**, scrivi per esempio `3` km e `2` € e tocca **«Salva consegna»**: senza posizione e almeno una fascia la consegna non si attiva. L’etichetta accanto al titolo passa ad **«Attiva»** solo dopo il salvataggio. Per provare un codice sconto, in **Codici sconto** scrivi per esempio `ESTATE10` e `10` e tocca **«Aggiungi codice»**.
3. In una finestra anonima o in un altro profilo, così non c'è il login dello staff, apri il link che compare in **Link online**, per esempio <http://127.0.0.1:8080/r/demo-ramen>. Aggiungi qualche piatto, apri il carrello e tocca **«Vai alla cassa»**. Se hai creato un codice, scrivilo in **«Codice sconto (facoltativo)»** e tocca **«Applica»**: il totale mostra lo sconto. Inserisci nome e telefono e invia con **«Invia l’ordine»**. Si apre la pagina di stato dell'ordine.
4. Torna all'area staff: in alto in ogni pagina compare il banner con l'ordine da accettare (anche qui, per il suono il browser vuole prima un tocco sulla pagina). Tocca **«Apri»**, oppure dalla Home **Ordini online**, e accetta toccando uno dei tempi (10, 20, 30 o 45 min). La pagina di stato del cliente mostra l'ordine accettato con l'orario previsto.
5. Ora l'ordine è in **Cucina** come «Ritiro #1»: segna i piatti con **«Pronto»** e, dal **Pass**, con **«Servito»**. Infine, come titolare, apri **Conto**, scegli «Ritiro #1» e tocca **«Ritirato, verifica incasso»**; spunta la conferma e chiudi con **«Ritirato e incassato»**.

Se passano più di 10 minuti prima dell'accettazione, l'ordine scade: la pagina di stato lo dice e mostra il telefono del ristorante. Gli orari seguono il fuso orario del ristorante (Roma), non quello del computer.

Per provare i limiti antiabuso, riapri il menu nello stesso browser mentre l’ordine è in attesa: puoi modificare il carrello, ma prima di andare alla cassa devi attendere o aprire l’ordine precedente. L’accettazione, il rifiuto o la scadenza liberano il posto. Il sito richiede un cookie proprio del browser, valido 30 giorni. Per IP si possono tentare 3 invii al minuto e 10 in dieci minuti, con al massimo 5 ordini in attesa nello stesso ristorante; le letture hanno limiti separati. Per simulare più clienti usa profili browser distinti, che sullo stesso Wi-Fi condividono comunque l’IP. Le notifiche non cambiano. Impostazioni e verifiche sono nel [contratto tecnico](../reference/online-ordering.md#submission-and-query-abuse-protection). [Esempio del messaggio su telefono](../images/online-waiting-it.webp).

### Com'è fatta

La demo è un progetto Compose a parte, [`demo/compose.yaml`](../../demo/compose.yaml), con quattro container:

| Servizio | Cosa fa                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| `db`     | PostgreSQL 18, con i dati nel volume `postgres_data`                                                       |
| `init`   | applica le migrazioni con `efbundle`, poi importa i dati con `--seed-demo`; finito il lavoro, si chiude    |
| `api`    | l'API ASP.NET Core, con le chiavi di Data Protection nel volume `protection_keys`                          |
| `web`    | Caddy, senza HTTPS, con i file della SPA già compilati; è l'unico container con una porta sul tuo computer |

- **L'ordine di avvio lo decide Compose.** `init` parte quando `db` è pronto (`condition: service_healthy`), `api` solo quando `init` è finito senza errori (`service_completed_successfully`), `web` quando l'API risponde su `/health/ready`. Per questo `docker compose ps -a` mostra `init` come `Exited (0)`: è normale, ha finito il suo lavoro.
- **Le regole sono quelle della produzione.** Le migrazioni le applica un passo esplicito, non l'API all'avvio. La rete `database` è `internal`, e la porta di `web` è pubblicata solo su `127.0.0.1`: dalla rete locale la demo non si raggiunge. La differenza principale è che l'API gira in ambiente Development, l'unico in cui `--seed-demo` funziona.
- **I dati si importano una volta sola.** Se nel database c'è già un ristorante o un amministratore, `--seed-demo` non fa niente e lo scrive nel log: non sovrascrive mai le tue modifiche. Importa tutto in un'unica transazione, e le foto passano dalla stessa elaborazione degli upload veri (`MenuImages`).
- **I QR usano l'indirizzo che hai aperto.** Il frontend della demo è compilato con `VITE_PUBLIC_BASE_URL` vuoto, quindi i link dei QR prendono l'origine corrente del browser, porta compresa.

### Gestirla

Dalla cartella del repository:

```bash
# Stato dei container: -a mostra anche init, che ha già finito
docker compose -f demo/compose.yaml ps -a
# Gli ultimi log
docker compose -f demo/compose.yaml logs --tail 100 init api web
# Fermarla: dati, password cambiate e chiavi restano nei volumi
docker compose -f demo/compose.yaml down
# Riavviarla
docker compose -f demo/compose.yaml up -d
```

**Azzerarla.** Con `-v`, `down` cancella anche i volumi di questo progetto Compose (`tavoloflow-demo`): database e chiavi. Al riavvio `init` trova un database vuoto e reimporta i dati iniziali, con le password originali. Gli altri progetti, compreso il database di sviluppo della Parte 2, non vengono toccati.

```bash
docker compose -f demo/compose.yaml down -v
docker compose -f demo/compose.yaml up -d --build
```

Dopo un azzeramento i vecchi login e i vecchi link dei tavoli non valgono più: i token dei QR sono nuovi.

**Un'altra porta.** Se la 8080 è già occupata:

```bash
DEMO_PORT=8081 docker compose -f demo/compose.yaml up -d --build
```

Da PowerShell si imposta prima la variabile, con `$env:DEMO_PORT = "8081"`, e poi si lancia lo stesso comando.

### Modificare i dati della demo

I dati stanno in [`demo/data/`](../../demo/data/): `restaurant.json`, `accounts.json`, `tables.json` e `menu.json`. Le foto stanno in [`demo/images/`](../../demo/images/), in WebP 640×640, e i prompt con cui le ho generate in `demo/image-prompts.json`. In `menu.json`, `optionGroups` elenca i gruppi di opzioni; ognuno indica in `items` le chiavi dei piatti che lo usano.

Questi file vengono copiati nell'immagine di `init` durante la build, quindi dopo una modifica serve `--build`. E valgono solo per un database vuoto: per vederli su una demo già avviata bisogna azzerarla. Il seeder è severo: un campo JSON che non conosce fa fallire l'importazione, e il motivo si legge nei log di `init`.

## Parte 2: l'ambiente di sviluppo

### Cosa serve

| Strumento  | Versione                               | A cosa serve                                                              |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------- |
| .NET SDK   | 10, almeno la 10.0.112 (`global.json`) | backend e test                                                            |
| Node.js    | 24                                     | frontend; i test girano con il test runner di Node, che esegue TypeScript |
| Docker     | con Compose v2                         | il database di sviluppo e i test di integrazione                          |
| Git e Bash |                                        | su Linux, macOS o WSL                                                     |

Nel mio caso: WSL2 con Ubuntu e Docker Desktop, con l'integrazione WSL attiva.

### 1. Il database

```bash
# Dalla cartella del repository
cp .env.example .env
# Sostituisci POSTGRES_PASSWORD con una password tua
nano .env
docker compose up -d db
```

[`compose.yaml`](../../compose.yaml) avvia solo PostgreSQL 18, sulla porta 5432 ma solo su `127.0.0.1`: dalla rete locale non si vede. I dati stanno nel volume `postgres_data` del progetto Compose `tavoloflow`.

Il file `.env` lo legge solo Docker Compose, per creare il database: l'API non lo legge. E, come in produzione, la password vale solo alla prima creazione del volume: se la cambi dopo, PostgreSQL non lo sa.

### 2. Collegare l'API al database

```bash
# Installa gli strumenti .NET del repository, alle versioni fissate: dotnet-ef e CSharpier
dotnet tool restore
# La stringa di connessione: nome del database, utente e password uguali a quelli del .env
dotnet user-secrets set 'ConnectionStrings:Default' \
  'Host=localhost;Port=5432;Database=tavoloflow_dev;Username=tavoloflow;Password=LA_TUA_PASSWORD' \
  --project backend/TavoloFlow.Api
```

Gli **user secrets** sono il modo di .NET per tenere i segreti di sviluppo fuori dal repository. Finiscono in un file JSON nella tua cartella utente (`~/.microsoft/usersecrets/<UserSecretsId>/secrets.json`, dove l'ID è quello scritto in `TavoloFlow.Api.csproj`), e ASP.NET Core li legge solo in ambiente Development. `dotnet user-secrets list --project backend/TavoloFlow.Api` mostra cosa hai impostato.

Nel repository non c'è nessuna stringa di connessione: se manca, l'API si ferma all'avvio con un messaggio che lo dice. Al posto degli user secrets puoi usare una variabile d'ambiente, `ConnectionStrings__Default`: nei nomi delle variabili d'ambiente, il doppio trattino basso sostituisce i due punti.

### 3. Le migrazioni

```bash
dotnet ef database update --project backend/TavoloFlow.Api
```

Crea le tabelle applicando le migrazioni di `backend/TavoloFlow.Api/Data/Migrations`. L'API non le applica mai da sola all'avvio, nemmeno in sviluppo: è la stessa regola della produzione (vedi [«Le migrazioni»](self-hosting.md#le-migrazioni) nella guida al self-hosting). Quando un `git pull` porta nuove migrazioni, il comando va rieseguito.

### 4. I dati iniziali

Un database appena migrato è vuoto: nessun ristorante, nessun account. Per riempirlo si usa il programma dell'API stesso, che funziona anche come strumento a riga di comando ([`Operations/MaintenanceCommands.cs`](../../backend/TavoloFlow.Api/Operations/MaintenanceCommands.cs)): con un'opzione come `--seed-demo` esegue quel comando e si chiude, senza avviare il server.

**Il modo più veloce: i dati della demo.** Lo stesso comando che usa il container `init` funziona anche sul database di sviluppo:

```bash
# Dalla cartella del repository, su un database vuoto
Demo__DataPath="$PWD/demo" dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-demo
```

Ottieni lo stesso Demo Ramen della Parte 1, con gli stessi account e le stesse password, il ristorante già attivo e gli ordini accesi: puoi fare subito il giro di cinque minuti. `Demo__DataPath` dice al comando dove trovare `data/` e `images/`, e il profilo `http` imposta l'ambiente Development, l'unico in cui il comando funziona. Se nel database c'è già un ristorante o un amministratore, non importa niente e lo scrive nel log.

**Da zero, come in produzione.** Se vuoi seguire il percorso vero di un nuovo ristorante, crea solo il primo amministratore della piattaforma:

```bash
dotnet user-secrets set 'PlatformBootstrap:Username' 'admin' --project backend/TavoloFlow.Api
# Da 6 a 128 caratteri
dotnet user-secrets set 'PlatformBootstrap:Password' 'UNA_PASSWORD' --project backend/TavoloFlow.Api
dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-platform-admin
```

Poi, con l'app avviata (passo 5):

1. entra in `/platform/login`, tocca **«Nuovo ristorante»** (sul telefono solo **«+»**) e crea il ristorante con **«Crea ristorante e due account»**; annota le due password temporanee, che compaiono una volta sola;
2. il ristorante nasce sospeso: aprilo con **«Apri il ristorante»** e attivalo con **«Attiva servizio»**, nell'avviso in cima alla pagina;
3. il titolare entra in `/staff/login`, cambia la password e prepara menu e tavoli;
4. in **Sala** accende **«Ordini dal QR»**: riattivare il servizio non riaccende gli ordini.

Esiste anche `--seed-dev-accounts`, che crea un ristorante con titolare e staff a partire dalle impostazioni `DevelopmentSeed:*`. Il ristorante però nasce sospeso, e va attivato da un amministratore della piattaforma, da creare comunque con `--seed-platform-admin` ([`accounts-platform.md`](../reference/accounts-platform.md), in inglese): i due modi sopra sono più comodi.

### 5. Avviare API e frontend

Servono due terminali, tutti e due aperti nella cartella del repository.

```bash
# Terminale 1: l'API su http://localhost:5093
dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

```bash
# Terminale 2: il frontend su http://localhost:5173
cd frontend
# Solo la prima volta, o quando cambia package-lock.json
npm ci
npm run dev
```

Poi apri <http://localhost:5173/staff/login>, oppure `/platform/login`.

- **Il browser parla solo con Vite.** Vite serve il frontend e, grazie al proxy configurato in [`vite.config.ts`](../../frontend/vite.config.ts), inoltra all'API sulla porta 5093 tutto quello che comincia con `/api`.
- **Il frontend si aggiorna da solo, il backend no.** Le modifiche al codice React compaiono subito nel browser (hot module replacement). Dopo una modifica al backend, invece, ferma l'API con Ctrl+C e riavviala.
- **Le porte sono fisse.** `vite.config.ts` usa `strictPort`: se la 5173 è occupata, Vite si ferma con un errore invece di scegliere un'altra porta in silenzio. Così l'indirizzo resta sempre lo stesso, ed è importante per la Parte 4.

### Cose utili

- **La descrizione delle API.** In Development l'API pubblica il documento OpenAPI di tutti gli endpoint su <http://localhost:5093/openapi/v1.json>. Per provare le richieste a mano c'è [`TavoloFlow.Api.http`](../../backend/TavoloFlow.Api/TavoloFlow.Api.http), che si esegue da Visual Studio, Rider o VS Code con l'estensione REST Client. Ricorda che ogni scrittura vuole un token CSRF (vedi [«Cookie, CSRF e same-origin»](development-notes.md#cookie-csrf-e-same-origin)).
- **Le chiavi di Data Protection.** In sviluppo `DataProtection:KeyRingPath` non è impostato, quindi ASP.NET Core tiene le chiavi nella cartella dell'utente (su Linux e WSL in `~/.aspnet/DataProtection-Keys`). Se le cancelli, tutti i login e i codici dei tavoli aperti smettono di valere: è lo stesso motivo per cui in produzione stanno su un volume.
- **Una nuova migrazione.** Dopo aver cambiato un'entità o la sua configurazione:

  ```bash
  dotnet ef migrations add NomeDellaModifica --project backend/TavoloFlow.Api --output-dir Data/Migrations
  # Controlla che modello e migrazioni coincidano: non devono restare modifiche in sospeso
  dotnet ef migrations has-pending-model-changes --project backend/TavoloFlow.Api
  dotnet ef database update --project backend/TavoloFlow.Api
  ```

- **Ripartire da zero.** `docker compose down -v` cancella il volume del database di sviluppo, e solo quello: la demo ha un progetto Compose suo. Poi si ricomincia da `docker compose up -d db` e dal passo 3.
- **La PWA.** Con `npm run dev` il service worker non viene registrato, per non disturbare l'aggiornamento automatico. Per provare l'installazione e la pagina offline serve una build: `npm run build && npm run preview`, su <http://localhost:4173>, con l'API avviata (i dettagli sono in [`pwa.md`](../reference/pwa.md), in inglese).
- **Le notifiche push.** In sviluppo sono spente, e nella demo anche: senza chiave l'API non le offre e la Home non mostra la sezione «Notifiche a schermo bloccato». Per provarle, aggiungi la chiave e un contatto ai segreti locali e riavvia l'API:

  ```bash
  dotnet user-secrets set 'WebPush:PrivateKey' "$(openssl rand -hex 32)" --project backend/TavoloFlow.Api
  dotnet user-secrets set 'WebPush:Subject' 'mailto:tu@esempio.it' --project backend/TavoloFlow.Api
  ```

  Servono tutti e due: con uno solo l'API non parte. Le notifiche passano dal service worker, quindi anche qui serve la build (`npm run build && npm run preview`). In Chrome sul computer apri <http://localhost:4173/staff>, attiva le notifiche dalla Home, metti il browser in background e fai un ordine online da un'altra finestra (prima accendi gli ordini online come in «Provare gli ordini online»): deve arrivare «Nuovo ordine online #N». I servizi di notifica sono veri (Google per Chrome), quindi il computer deve essere online.

- **Verifica del recupero push.** Dopo aver attivato le notifiche, simula un errore alla PUT dell'iscrizione: la Home deve mostrare il fallimento, non «attive». Ripristina la rete e torna all'app: deve confermare la sincronizzazione senza un nuovo permesso. Se la cancellazione dell'iscrizione fallisce durante l'uscita, devi restare collegato e poter riprovare. Dopo un'uscita riuscita un nuovo ordine deve notificare gli altri dispositivi; accedendo di nuovo su questo dispositivo le notifiche riprendono. Quelle già inviate possono ancora arrivare.

### Provare Turnstile in sviluppo

Development e Demo hanno Turnstile disattivato per impostazione predefinita e non richiedono un account Cloudflare. Per provare la verifica, ferma l’API con `Ctrl+C` nel suo terminale, poi esegui **dalla radice del repository sul tuo computer**:

```bash
Turnstile__Enabled=true \
Turnstile__SiteKey=1x00000000000000000000AA \
Turnstile__SecretKey=1x0000000000000000000000000000000AA \
dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

È la sintassi di Bash / WSL: il `\` a fine riga continua il comando e non deve avere spazi dopo. Le variabili valgono solo per questo processo API e non vengono scritte in un file; il profilo `http` usa Development. Vite continua a girare normalmente in un altro terminale. Non servono chiavi in `frontend/.env.local`: ricarica la pagina degli ordini online per leggere la configurazione pubblica.

Questa coppia di [chiavi ufficiali di test](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) passa sempre. Richiede internet, ma funziona su localhost e sui telefoni nella rete locale senza `Turnstile__Hostname`. **Le chiavi di test sono vietate in produzione** e non dimostrano l’efficacia contro i bot. I nomi `TURNSTILE_*` del server sono per il Compose di produzione; avviando direttamente l’API si usano i nomi `Turnstile__*` con doppio underscore mostrati sopra.

Il widget appare solo alla conferma o nel recupero di un invio incerto. Usa le chiavi corrispondenti nella tabella ufficiale per simulare rifiuto, interazione o token già usato; dopo le modifiche riavvia l’API e ricarica la pagina cliente. Solo le coppie di test riconosciute in Development accettano la risposta ufficiale con `example.com` e senza action/cdata; le chiavi vere controllano sempre hostname, azione e legame alla richiesta. Con chiavi vere in sviluppo serve anche `Turnstile__Hostname`, autorizzando nel pannello l’hostname effettivamente usato. Le Secret key vere vanno nei segreti locali o in una configurazione d’ambiente protetta, mai in Git.

In un ristorante di prova, controlla in quest’ordine:

1. Sfogliare `/r/{slug}`, l’informativa privacy o `/o/{token}` non carica il widget. Compare solo dopo aver aggiunto piatti e aperto la conferma; l’invio resta bloccato finché la verifica non è completata.
2. Attendi la scadenza della prova o simula una verifica fallita: la vecchia prova non deve più autorizzare l’invio. Se il widget si aggiorna da solo, attendi il completamento della nuova verifica. Un rifiuto del server conserva carrello e campi e non crea ordini o notifiche. La prova resta in memoria e non entra nell’intento in `sessionStorage`.
3. Negli strumenti per sviluppatori del browser blocca `https://challenges.cloudflare.com/*`, poi rientra nella conferma: deve apparire la verifica non disponibile, con possibilità di riprovare o chiamare il ristorante e carrello conservato. Rimuovi il blocco e premi «Ripeti verifica» per recuperare, senza inviare automaticamente un ordine.
4. Simula la perdita della risposta all’invio: la pagina deve conservare l’intento sconosciuto e recuperare automaticamente solo con GET. Anche «Riprova lo stesso ordine» parte da GET; se trova l’ordine non serve una nuova verifica, mentre solo un risultato non ancora trovato permette di rimandare stesso ID e contenuto con una nuova prova. Verifica fallita o non disponibile non devono cancellare un intento già sconosciuto; non fare un altro ordine al posto del controllo.
5. A 360px passa tra cinese, italiano e inglese e controlla che pulsanti, messaggi e azioni telefoniche non escano dallo spazio disponibile. Dopo un cambio lingua o la conferma di un’altra richiesta, i callback del vecchio widget non devono abilitare l’invio.

I test di integrazione usano un servizio simulato per successo, rifiuto, timeout, legame errato, invii ripetuti e recupero concorrente. Non servono chiavi Cloudflare vere o chiamate al verificatore; i test del database richiedono comunque Docker. Per eseguirli da soli dalla radice del repository:

```bash
dotnet test TavoloFlow.slnx --filter 'FullyQualifiedName~OnlineVerificationTests'
```

Dopo la prova, ferma l’API con `Ctrl+C`. Per continuare lo sviluppo senza verifica, disattivala esplicitamente all’avvio normale:

```bash
Turnstile__Enabled=false dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

Ricarica la pagina cliente: il widget non deve più caricarsi. Chiavi vere di produzione e aggiornamento di una VPS esistente sono nella [guida di self-hosting](self-hosting.md#primo-aggiornamento-a-una-versione-con-turnstile). Le prove locali non sostituiscono il collaudo sul dominio reale dopo il rilascio.

[Esempio a 360px: messaggio dell’app quando il provider non è disponibile](../images/online-verification-it.webp) (SDK simulato; non mostra il widget Cloudflare).

### Provare il preventivo automatico della consegna

Senza chiave Geoapify il preventivo automatico è spento, come nella demo: alla cassa la consegna mostra il listino delle fasce e chi accetta sceglie la fascia. Per provarlo serve una chiave gratuita di [Geoapify](https://www.geoapify.com/) (**My projects → API keys**). Mettila nei segreti locali e riavvia l’API:

```bash
dotnet user-secrets set 'Geoapify:ApiKey' 'LA_TUA_CHIAVE' --project backend/TavoloFlow.Api
```

Poi, come titolare, configura la consegna come in «Provare gli ordini online», ma con le coordinate di un punto reale: sul computer, in Google Maps fai clic destro sul punto e clicca le coordinate in cima al menu per copiarle; sul telefono tieni premuto su un punto della mappa senza scritte (sul nome di un locale si apre la sua scheda) e copia «latitudine, longitudine». Aggiungi qualche fascia, per esempio 3, 6 e 10 km. Alla cassa scegli **«Consegna»** e scrivi un indirizzo vero con il civico e tocca **«Calcola la consegna»**: compare «Consegna a … · costo …», e il totale comprende la consegna. Un indirizzo oltre l’ultima fascia risulta fuori zona; uno senza civico o scritto male mostra il listino, e l’ordine si può inviare lo stesso. Nell’area staff, l’ordine con preventivo mostra costo e distanza, senza fasce da scegliere.

Ogni preventivo consuma due crediti del piano gratuito, che ne ha 3000 al giorno. I test di integrazione non ne usano: un servizio simulato risponde al posto di Geoapify, e l’host dei test ignora la chiave nei segreti locali. Per eseguirli da soli, dalla radice del repository:

```bash
dotnet test TavoloFlow.slnx --filter 'FullyQualifiedName~OnlineDeliveryQuoteTests'
```

Per spegnere di nuovo il preventivo, togli la chiave e riavvia l’API:

```bash
dotnet user-secrets remove 'Geoapify:ApiKey' --project backend/TavoloFlow.Api
```

## Parte 3: test e controlli

### Backend

```bash
# Tutti i test: Docker deve essere avviato
dotnet test TavoloFlow.slnx
# Una sola classe di test (aggiungi .NomeDelMetodo per un solo test)
dotnet test TavoloFlow.slnx --filter "FullyQualifiedName~KitchenTests"
# Formattazione del codice C#
dotnet csharpier check .
```

La suite comprende test puri senza database, come `PasswordPolicyTests` e `SubscriptionSummaryTests`, e test di integrazione. Ogni classe con `PostgreSqlFixture` avvia con Testcontainers un suo PostgreSQL usa e getta (`postgres:18-alpine`) e ci applica le migrazioni vere. I test HTTP usano `WebApplicationFactory` per chiamare l’API; quelli del livello dati usano direttamente il `DbContext`. I test non toccano né il database di sviluppo né quello della demo. Il comando completo richiede Docker; alla prima esecuzione dei test di integrazione viene scaricata l’immagine di PostgreSQL.

`dotnet csharpier format .` corregge la formattazione con CSharpier, l'equivalente di Prettier per C#, con la stessa larghezza di riga (100 caratteri, in `.csharpierrc.json`). Le migrazioni di EF Core sono escluse in `.csharpierignore`, perché sono codice generato. In VS Code, con l'estensione CSharpier, i file C# vengono formattati a ogni salvataggio (`.vscode/settings.json`).

### Frontend

```bash
cd frontend
# I test della logica pura
node --test --test-isolation=none tests/*.test.ts
# Build di produzione e controllo dei tipi
npm run build
# Lint e formattazione
npm run lint
npm run format:check
```

Per il frontend non c'è un framework di test per i componenti React. La logica che vale la pena testare (regole del carrello, recupero degli ordini, lingue, temi…) sta in moduli puri, come i `state.ts` delle feature e alcuni file di `lib/`, e il test runner integrato di Node 24 la esegue direttamente, togliendo al volo i tipi di TypeScript. Per questo quei moduli importano gli altri con percorsi relativi e l'estensione `.ts`, invece dell'alias `@/`.

`npm run build` esegue `vite build && tsc -b`: prima Vite rigenera `src/routeTree.gen.ts`, l'albero delle route di TanStack Router, e compila; poi TypeScript controlla i tipi, route comprese. Se aggiungi una route, anche `routeTree.gen.ts` va nel commit. `npm run format` corregge la formattazione con Prettier.

### Il pacchetto di rilascio

Anche l'installazione di produzione si può provare in locale, con lo smoke test descritto nella guida al self-hosting ([«Costruire il pacchetto di release»](self-hosting.md#3-costruire-il-pacchetto-di-release)).

## Parte 4: provare dal telefono

Il momento in cui il cliente scansiona il QR si prova davvero solo con un telefono. Ma nessuna delle configurazioni viste finora si raggiunge dal telefono:

- sul telefono, `localhost` è il telefono stesso, non il tuo computer;
- Vite ascolta solo su `localhost` (`host: "localhost"` in `vite.config.ts`), e la demo pubblica la sua porta solo su `127.0.0.1`;
- se usi WSL2 in modalità NAT, quella predefinita, Linux ha anche un suo indirizzo interno (`172.x.x.x`) che dal Wi-Fi non si vede: si vede solo quello di Windows.

Dal telefono quindi si usa l'ambiente di sviluppo. Su Linux e macOS bastano due accorgimenti: Vite deve ascoltare su tutte le interfacce di rete, e i QR devono contenere l'indirizzo del computer. Su WSL ne serve un terzo: Windows deve inoltrare la porta a Linux (passo 3, che su Linux e macOS si salta).

Con WSL il percorso di una richiesta del telefono è questo; su Linux e macOS il passaggio da Windows non c'è:

```mermaid
flowchart LR
  T["Telefono<br>stessa rete Wi-Fi"] -->|"http://IP-WINDOWS:5173"| W["Windows<br>port forwarding e firewall"]
  W -->|"IP-WSL:5173"| V["Vite in WSL<br>--host 0.0.0.0"]
  V -->|"proxy /api/*"| A["API<br>localhost:5093"]
```

L'API resta su `localhost`: il telefono parla solo con Vite, che le inoltra `/api` come sempre.

### 1. L'indirizzo del computer

Telefono e computer devono stare sulla stessa rete Wi-Fi. Ti serve l'indirizzo del computer in quella rete, quello che userà il telefono:

- **su Linux:** `hostname -I`;
- **su macOS:** `ipconfig getifaddr en0`, se sei collegato in Wi-Fi;
- **su WSL:** l'indirizzo di **Windows**, non quello di Linux: in PowerShell `ipconfig`, alla voce «Indirizzo IPv4» della scheda Wi-Fi.

Nei comandi qui sotto è `192.168.1.36`.

### 2. Vite e l'indirizzo dei QR

In `frontend/.env.local`, un file ignorato da Git (il modello è `frontend/.env.example`):

```dotenv
VITE_PUBLIC_BASE_URL=http://192.168.1.36:5173
```

Poi avvia Vite su tutte le interfacce:

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

Senza `VITE_PUBLIC_BASE_URL`, i QR usano l'indirizzo della pagina in cui li generi, cioè `localhost`, e il telefono non saprebbe dove andare: l'interfaccia lo segnala con «Questo link usa un indirizzo locale che i telefoni non raggiungono». Lo stesso vale per il link e il QR degli ordini online, in «Impostazioni ordini online». Vite legge la variabile all'avvio e la scrive nel codice del frontend. Quando salvi `.env.local` si riavvia da solo, ma la pagina aperta va ricaricata.

### 3. Solo su WSL: port forwarding e firewall

Su Linux e macOS salta questo passo: Vite gira direttamente sul computer, che ha già l'indirizzo della rete Wi-Fi. Se il telefono non riesce a collegarsi, al massimo va aperta la porta 5173 nel firewall del sistema: per esempio `sudo ufw allow 5173/tcp` su Ubuntu, se usi ufw; su macOS basta consentire le connessioni in entrata a `node` quando il sistema lo chiede.

Su WSL servono tre cose.

**Il profilo di rete.** Nelle impostazioni di Windows della tua rete Wi-Fi scegli il profilo **Privata**: la regola del firewall qui sotto vale solo per le reti private.

**L'IP di WSL.** Nel terminale WSL `hostname -I`, oppure la riga `Network` che Vite stampa all'avvio con `--host`. Nei comandi è `172.28.94.85`. Di solito cambia a ogni riavvio di Windows o di WSL.

**L'inoltro della porta.** In PowerShell **da amministratore**, con i tuoi indirizzi:

```powershell
$tavoloWindowsIp = "192.168.1.36"
$tavoloWslIp = "172.28.94.85"
# Solo se esiste già un inoltro per questo indirizzo, per esempio verso il vecchio IP di WSL
netsh interface portproxy delete v4tov4 listenaddress=$tavoloWindowsIp listenport=5173
# Le connessioni a Windows sulla porta 5173 vanno a WSL sulla porta 5173
netsh interface portproxy add v4tov4 listenaddress=$tavoloWindowsIp listenport=5173 connectaddress=$tavoloWslIp connectport=5173
```

Siccome l'IP di WSL cambia, dopo un riavvio l'inoltro va rifatto, con `delete` e poi `add` con il nuovo indirizzo. `netsh interface portproxy show v4tov4` mostra gli inoltri attivi.

**La regola del firewall.** Sempre da amministratore, una volta sola:

```powershell
New-NetFirewallRule -DisplayName "TavoloFlow Dev 5173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private -RemoteAddress LocalSubnet
```

La regola apre la porta 5173 solo sulle reti private e solo ai dispositivi della stessa sottorete: al telefono sì, al resto di internet no.

### 4. La prova

1. Sul computer apri `http://localhost:5173/staff/login`, entra come titolare (con i dati della demo è già tutto pronto) e apri un tavolo in **Sala**.
2. In **Tavoli e QR** tocca **«QR»** sullo stesso tavolo: il link sotto il QR deve cominciare con `http://192.168.1.36:5173`.
3. Scansiona il QR con il telefono, inserisci il codice del tavolo e manda un ordine. Se vuoi ripartire senza cookie vecchi, apri il link in una finestra anonima.
4. Se hai acceso gli ordini online, scansiona dal telefono anche il QR di «Impostazioni ordini online» e prova un ordine da ritirare.

### Cosa non si può provare così

Un indirizzo come `http://192.168.1.36:5173` non è HTTPS, quindi per il browser del telefono non è un contesto sicuro. Alcune funzioni del browser ne hanno bisogno:

- **l'installazione della PWA** e il service worker, e quindi anche **le notifiche push**;
- **lo schermo sempre acceso** di Cucina e Pass (Screen Wake Lock);
- **la copia automatica** di link e codici: l'app se ne accorge e chiede di copiarli a mano.

Tutto il resto funziona. Per esempio, gli ID degli ordini sono generati con `crypto.getRandomValues` proprio perché, a differenza di `crypto.randomUUID`, funziona anche senza HTTPS ([`lib/ids.ts`](../../frontend/src/lib/ids.ts)).

Per provare la PWA su un telefono Android c'è un trucco: con il debug USB e il port forwarding di `chrome://inspect`, il telefono apre `localhost:4173` della build di preview, e `localhost` conta come contesto sicuro (vedi [`pwa.md`](../reference/pwa.md)). Così si provano anche le notifiche push a telefono bloccato, con la chiave configurata come in «Cose utili». Per l'iPhone, che le notifiche le offre solo all'app aggiunta alla schermata Home, e per la prova finale serve l'HTTPS vero del [self-hosting](self-hosting.md).

### Pulizia

Quando non ti serve più, togli `VITE_PUBLIC_BASE_URL` da `frontend/.env.local`, così i QR generati in sviluppo tornano a usare l'indirizzo della pagina.

Su WSL, rimuovi anche l'inoltro e la regola del firewall, da PowerShell da amministratore:

```powershell
# In una nuova sessione la variabile non esiste più: reimpostala
$tavoloWindowsIp = "192.168.1.36"
netsh interface portproxy delete v4tov4 listenaddress=$tavoloWindowsIp listenport=5173
Remove-NetFirewallRule -DisplayName "TavoloFlow Dev 5173"
```

## Problemi comuni

| Cosa succede                                                                 | Cosa controllare                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In WSL, `docker` risponde «permission denied» o non trova il server          | Docker Desktop è avviato, e nelle sue impostazioni è attiva l'integrazione con la tua distribuzione WSL                                                                                                                                               |
| La demo non risponde, `init` non è `Exited (0)`                              | `docker compose -f demo/compose.yaml logs init`                                                                                                                                                                                                       |
| La porta 8080 è occupata                                                     | `DEMO_PORT`, vedi «Gestirla»                                                                                                                                                                                                                          |
| Vite si ferma: la porta 5173 è occupata                                      | un altro `npm run dev` ancora aperto; con `strictPort` Vite non sceglie un'altra porta                                                                                                                                                                |
| L'API non parte e chiede `ConnectionStrings:Default`                         | la stringa di connessione negli user secrets (passo 2) o nella variabile `ConnectionStrings__Default`                                                                                                                                                 |
| L'API non riesce a collegarsi a PostgreSQL per la password                   | la password negli user secrets deve essere quella del `.env` con cui è stato creato il volume; se poi hai cambiato il `.env`, rimetti quella vecchia o ricrea il volume con `docker compose down -v` (cancella i dati)                                |
| Errori su tabelle o colonne che non esistono                                 | `dotnet ef database update` dopo l'ultimo `git pull`                                                                                                                                                                                                  |
| `--seed-demo` dice che il database contiene già dati                         | importa solo in un database vuoto: usa i dati che hai o ricrea il volume                                                                                                                                                                              |
| Logout continui, errori CSRF                                                 | demo e sviluppo aperti tutti e due da `localhost`: apri la demo da `127.0.0.1`                                                                                                                                                                        |
| In Sala compare «Il servizio del ristorante non è ancora attivo o è sospeso» | il ristorante è sospeso: l'amministratore lo attiva con «Attiva servizio»                                                                                                                                                                             |
| Il cliente vede il menu ma non può ordinare                                  | gli ordini sono in pausa: in Sala, «Ordini dal QR»                                                                                                                                                                                                    |
| Nella Home non ci sono «Ordini online» e «Impostazioni ordini online»        | il ristorante non ha gli ordini online: l'amministratore imposta il link e poi accende «Ordini online» in Funzioni (vedi «Provare gli ordini online»)                                                                                                 |
| Verifica attivata, ma nessun widget alla conferma | Controlla che le variabili raggiungano il processo API come `Turnstile__*`, non solo il `.env` della radice o il frontend. Riavvia l’API e ricarica la pagina cliente. Development e Demo disattivano la verifica per impostazione predefinita. |
| L’API segnala una configurazione Turnstile errata, o la verifica di test fallisce sempre | Controlla che le chiavi di test corrispondano ai tipi della tabella ufficiale e che l’ambiente sia Development. Le chiavi vere richiedono anche `Turnstile__Hostname`, uguale all’hostname del browser e a quello autorizzato nel pannello. |
| Il widget non si carica, o l’invio segnala verifica non disponibile | Browser e API devono raggiungere Cloudflare: controlla rete ed estensioni che bloccano le richieste. Per un ordine sconosciuto fai prima la GET senza cancellare l’intento originale. Per la produzione vedi la guida di self-hosting. |
| Alla cassa la consegna mostra sempre il listino invece del costo | Controlla la chiave `Geoapify:ApiKey` nei segreti locali (poi riavvia l’API), la posizione e le fasce del ristorante, e che l’indirizzo abbia il civico. Se Geoapify risponde con un errore, i log dell’API riportano lo stato HTTP. |
| La pagina degli ordini online fa solo guardare il menu                       | lo stato in «Impostazioni ordini online» dice perché: manca il telefono o gli orari, pausa, fuori orario o troppi ordini in attesa; gli orari seguono il fuso del ristorante                                                                          |
| I QR contengono `localhost`                                                  | `VITE_PUBLIC_BASE_URL` in `frontend/.env.local`, poi ricarica la pagina (Vite si riavvia da solo)                                                                                                                                                     |
| Il telefono non apre la pagina                                               | stessa rete Wi-Fi e Vite avviato con `--host 0.0.0.0`; su Linux e macOS il firewall del sistema; su WSL profilo di rete privato, regola del firewall e IP di WSL ancora uguale a quello del port forwarding (`netsh interface portproxy show v4tov4`) |
