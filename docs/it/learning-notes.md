# Appunti di apprendimento

## Backend

ASP.NET Core ha un'architettura simile a Express, Koa e altri framework del mondo JavaScript che si basano sul concetto di pipeline. Il punto d'ingresso del programma è il file `Program.cs`, dove il programma viene assemblato esplicitamente nel codice: lì si registrano i servizi e si decide l'ordine dei middleware. Da questo punto di vista è abbastanza diverso da framework come Spring Boot, dove il codice di configurazione è sparso per tutto il programma sotto forma di annotazioni. Anche ASP.NET Core però ha le sue annotazioni, che in C# si chiamano attributi: stanno sui controller e sui DTO (`[HttpPost]`, `[Authorize]`, `[Required]`). E in TavoloFlow `Program.cs` non contiene tutto: chiama metodi come `AddDataLayer` o `AddStoreAccounts`, che ogni modulo definisce nella propria cartella.

Abbiamo quindi una pipeline di middleware, che le richieste HTTP attraversano una dopo l'altra. I middleware sono semplicemente i componenti che formano questa pipeline, e il loro compito è elaborare le richieste HTTP in entrata e le risposte in uscita: sì, anche le risposte attraversano la stessa pipeline, ma in ordine inverso. Quando una richiesta arriva a un componente, viene elaborata e poi passata al componente successivo, oppure passata direttamente senza essere toccata. Ogni componente può anche decidere di non passarla al successivo e fermarla lì, rispondendo subito (in TavoloFlow lo fa `UseHealthChecks` su `/health/ready`).

Le richieste che attraversano tutta la pipeline finiscono di solito in un endpoint, cioè in un metodo (azione) di un controller; se nessun endpoint corrisponde al percorso, la risposta è 404. I controller fanno da interfaccia tra le richieste/risposte HTTP e la logica di business del progetto. In realtà c'è anche un'altra pipeline, quella dei filtri, che esiste solo per le richieste arrivate a un controller. Lì si possono mettere le operazioni comuni a più endpoint: per esempio, se ogni controller deve fare un controllo prima di eseguire, invece di scriverlo ovunque lo si mette in un filtro. Se la richiesta supera il controllo arriva al metodo del controller, altrimenti il filtro restituisce subito una risposta di errore. Lo stesso vale dopo l'esecuzione del metodo del controller: nella pipeline dei filtri si può mettere la logica comune da eseguire dopo. In TavoloFlow, `CsrfValidationFilter` controlla il token CSRF prima del controller, e `ApiExceptionFilter` trasforma le `ApiException` lanciate dai servizi in una risposta JSON di errore.

### UseForwardedHeaders

`UseForwardedHeaders` aggiunge un middleware che gestisce due header delle richieste HTTP in arrivo. Il programma, per limitare il numero di tentativi di password, ha bisogno di conoscere l'indirizzo IP reale dell'utente. Il web server però conosce soltanto il proxy Caddy, l'unico a cui è collegato: ogni richiesta HTTP arriva quindi da questo proxy e, di conseguenza, l'indirizzo IP d'origine di ogni richiesta è quello di Caddy. Inoltre Caddy comunica con il web server in HTTP, perché sono entrambi sulla stessa rete Docker: si tratta di una comunicazione interna, che non esce dal server, quindi sicura. Però l'IP e il protocollo che vede il web server non rispecchiano la situazione reale. Per fortuna Caddy scrive l'IP e il protocollo reali della richiesta negli header `X-Forwarded-For` e `X-Forwarded-Proto`. Quello che fa questo middleware è semplicemente leggere questi due header e sovrascrivere con i loro valori l'IP e il protocollo che ASP.NET associa alla richiesta (in `HttpContext`):

```text
connection.RemoteIpAddress = <IP letto da X-Forwarded-For>;
request.Scheme = <valore letto da X-Forwarded-Proto>;
```

Poi, nei dettagli di implementazione, c'è anche la questione dei proxy fidati: di default l'unico proxy fidato è localhost. Quindi svuotiamo le liste predefinite e consideriamo Caddy come l'unico proxy fidato: usiamo i valori di `X-Forwarded-For` e `X-Forwarded-Proto` solo se la richiesta arriva da Caddy, e non da qualsiasi altro.

Serve un proxy fidato perché `X-Forwarded-For` e `X-Forwarded-Proto` sono header di testo come tutti gli altri: chiunque può scriverli a mano in una richiesta. Se il middleware credesse sempre al loro contenuto, un attaccante potrebbe mettere un IP diverso a ogni tentativo di password, e il limite dei tentativi non scatterebbe mai. Per questo il middleware, per decidere se fidarsi, non guarda il contenuto degli header ma l'IP della connessione TCP, cioè chi ha aperto davvero la connessione verso il web server. Questo IP non si può falsificare, perché per aprire una connessione TCP le risposte devono tornare davvero a quell'indirizzo. Caddy ha un IP fisso nella rete Docker (`172.30.80.2`), e il web server lo legge dalla configurazione (`ReverseProxy:KnownProxies`, in `Operations/DeploymentHosting.cs`).

`X-Forwarded-For` può contenere più IP separati da virgole: ogni proxy aggiunge il suo in fondo, a destra. Con `ForwardLimit = 1` il middleware legge solo l'ultimo valore a destra, cioè quello scritto da Caddy, l'unico proxy davanti al web server. In realtà Caddy, di default, scarta già gli header `X-Forwarded-*` mandati dal client e scrive i propri. `ForwardLimit = 1` è quindi una seconda protezione, dal lato del web server: anche se un valore falso arrivasse più a sinistra, non verrebbe usato.

In locale non c'è Caddy e `ReverseProxy:KnownProxies` non è configurato: la configurazione esce subito con un `return` e il middleware resta spento. L'IP è quello di localhost, e in locale va bene. Il `return` serve anche per sicurezza: senza, svuoteremmo le due liste predefinite senza aggiungere nessun proxy, e quando entrambe le liste sono vuote il middleware si fida di chiunque.

### Authentication e Authorization

### Docker

Con `DataProtection__KeyRingPath: /var/tavoloflow/keys` dico al programma in quale cartella tenere le chiavi di Data Protection: lì legge quelle che ci sono e scrive quelle nuove. Il `__` della variabile d'ambiente diventa `:` nella configurazione, quindi il programma legge `DataProtection:KeyRingPath`. Non è una sola chiave: ogni chiave è un file `key-<guid>.xml`, circa ogni 90 giorni ne arriva una nuova e le vecchie restano per decifrare quello che era stato cifrato prima.

Questo percorso non è virtuale: esiste davvero, ma nel filesystem del container. Il programma lo usa come una cartella normale e non sa nemmeno di essere in Docker.

Nel `compose.yaml` dichiaro i volumi dandogli un nome, e poi sta a Docker allocare lo spazio sul disco dell'host per salvarli. Poi aggancio i percorsi del filesystem del container ai volumi dichiarati, con `nome:percorso`:

```yaml
api:
  environment:
    DataProtection__KeyRingPath: /var/tavoloflow/keys
  volumes:
    - protection_keys:/var/tavoloflow/keys

volumes:
  protection_keys:
```

Il nome `protection_keys` appartiene al volume, non al percorso. Docker può scegliere un posto dell'host per un volume e un altro posto per un altro volume (di solito sotto `/var/lib/docker/volumes/`), e dal punto di vista del container si vede solo il percorso `/var/tavoloflow/keys`, che sull'host potrebbe trovarsi in un posto qualsiasi.

Quando il container viene distrutto, per esempio a ogni nuovo rilascio, quello che viene distrutto è il container con il suo filesystem e il collegamento tra il percorso del container e il volume, non il volume stesso. Al riavvio il collegamento viene ricreato dalle righe del `compose.yaml`, e Docker ritrova lo stesso volume per nome (Compose gli aggiunge davanti il nome del progetto, per esempio `tavoloflow-demo_protection_keys`). Il volume viene cancellato solo con `docker compose down -v` o `docker volume rm`.

Il programma e Docker non si parlano: il percorso in `KeyRingPath` e quello del volume devono essere uguali. Se fossero diversi, il programma scriverebbe le chiavi nel filesystem del container e le perderebbe al rilascio successivo, senza nessun errore.
