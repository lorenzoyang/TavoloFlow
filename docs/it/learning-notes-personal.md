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

L'autenticazione risponde a "chi sei?", l'autorizzazione a "cosa puoi fare?". In ASP.NET Core il risultato dell'autenticazione è un `ClaimsPrincipal` in `HttpContext.User`: un insieme di claim (ID utente, ruolo, ristorante…) prodotto da uno *schema* di autenticazione. L'autorizzazione confronta questi claim con una *policy*. Quando fallisce ci sono due risposte diverse: **401** (*Challenge*) se il server non sa chi sei, perché manca il login o non è più valido, e **403** (*Forbid*) se sa chi sei ma non hai il permesso. C'è poi un terzo livello, che le policy non coprono: anche uno STAFF autenticato può toccare solo i dati del *suo* ristorante.

#### Cookie con ticket cifrato

HTTP non ha memoria: ogni richiesta deve portare la prova di chi la fa. Le soluzioni tipiche sono tre:

- una sessione lato server: il cookie contiene solo un ID casuale, e i dati stanno in una tabella;
- un JWT: un token firmato che il frontend tiene in memoria o in `localStorage` e manda nell'header `Authorization`;
- un cookie che contiene tutto il ticket, cifrato e firmato.

TavoloFlow usa la terza, che è il funzionamento standard di `AddCookie`. Va bene perché frontend e API stanno sulla stessa origine. Il cookie è `HttpOnly`: JavaScript non lo può leggere, quindi uno script iniettato (XSS) non può rubare il login, mentre un JWT in `localStorage` sì. E il browser lo manda da solo, senza codice nel frontend e senza CORS. I prezzi da pagare sono due. Proprio perché il browser lo manda da solo, serve la protezione CSRF. E un ticket che contiene già tutto è difficile da revocare prima della scadenza.

Ticket e cookie non sono la stessa cosa. Il **ticket** (`AuthenticationTicket`) è il dato: i claim, più `IssuedUtc`, `ExpiresUtc` e `IsPersistent`. Il **cookie** è il meccanismo HTTP con cui il browser conserva un valore e lo rimanda. Al login, `SignInAsync` serializza il ticket, lo cifra e lo firma con Data Protection, e il risultato (`CfDJ8…`) diventa il valore del cookie. A ogni richiesta il gestore del cookie fa il contrario.

Il browser vede solo una stringa illeggibile: se ne cambia un byte, la firma non corrisponde più e il cookie viene scartato. La cifratura usa uno *scopo* che contiene il nome dello schema, quindi il valore di un cookie Store copiato nel cookie Guest non si decifra.

Le scadenze, quindi, sono due:

- l'attributo `expires` del cookie serve al browser, che dopo quella data lo cancella. Il browser non lo rimanda mai al server: nella richiesta c'è solo `nome=valore`;
- `ExpiresUtc` dentro il ticket serve al server, che lo controlla a ogni richiesta. Il browser non può né leggerlo né cambiarlo.

Il cookie dell'ospite non ha `expires`: è un cookie di sessione, che di solito sparisce alla chiusura del browser. Il suo ticket invece scade dopo 12 ore. Se l'ospite lascia la scheda aperta fino al giorno dopo, il browser manda ancora il cookie, ma il server lo rifiuta.

| Attributo  | Valore                              | Effetto                                                                |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `HttpOnly` | sempre                              | JavaScript non lo legge                                                |
| `Secure`   | fuori da Development                | viaggia solo su HTTPS                                                  |
| `SameSite` | `Lax`                               | non parte con le richieste da altri siti, tranne la navigazione in GET |
| `Path`     | `/`, `/api/public`, `/api/platform` | il browser lo manda solo a quei percorsi                               |
| `Domain`   | assente                             | va solo a `app.qiaotavoloflow.it`, non agli altri sottodomini          |

La durata è fissa. Con `SlidingExpiration = false` (il default è `true`) il cookie non viene riemesso durante l'uso, quindi dopo 30 giorni dal login bisogna rifarlo.

#### Tre identità nello stesso browser

| Identità             | Percorsi          | Cookie (Path)                           | Durata                               | Come si ottiene        |
| -------------------- | ----------------- | --------------------------------------- | ------------------------------------ | ---------------------- |
| Store (OWNER, STAFF) | tutti gli altri   | `TavoloFlow.Store` (`/`)                | 30 giorni, persistente               | username e password    |
| Guest                | `/api/public/*`   | `TavoloFlow.Guest` (`/api/public`)      | ticket di 12 ore, cookie di sessione | QR e codice d'ingresso |
| Platform             | `/api/platform/*` | `TavoloFlow.Platform` (`/api/platform`) | 30 giorni, persistente               | username e password    |

Sono tre schemi cookie separati, e possono convivere: il proprietario che scansiona il QR di un suo tavolo resta OWNER e diventa anche ospite. Tutti e tre usano la stessa classe di ASP.NET, `CookieAuthenticationHandler`. `AddCookie("Guest", …)` registra il nome `Guest` con quella classe e salva le opzioni con quel nome: tra i tre schemi cambiano solo le opzioni.

Chi sceglie lo schema di una richiesta? In `Common/BrowserSecurity.cs` lo schema predefinito è `Browser`, registrato con `AddPolicyScheme`. Non ha un cookie suo. Per ogni operazione (Authenticate, Challenge, Forbid, SignIn, SignOut) chiama `ForwardDefaultSelector`, che guarda solo il percorso (`SchemeFor`), e passa l'operazione allo schema scelto. Così, per una richiesta a `/api/public/orders`, `UseAuthentication` legge solo `TavoloFlow.Guest`. L'inoltro in realtà sta nella classe base `AuthenticationHandler`, nel metodo `ResolveTarget`: `PolicySchemeHandler` esiste solo per usarlo.

C'è anche un secondo livello. Ogni policy del progetto indica il proprio schema, e in quel caso `UseAuthorization` autentica di nuovo con quello schema e sostituisce `HttpContext.User`. L'identità che vede il controller, quindi, la decide la policy dell'endpoint. Nel progetto percorso e policy coincidono sempre. Il gestore tiene in memoria il risultato per tutta la richiesta, quindi il cookie viene letto una volta sola. E siccome ogni policy indica il suo schema, un cookie Platform valido non soddisfa mai una policy Store.

#### Login e password

Una password non si salva mai in chiaro, e nemmeno cifrata, perché quello che è cifrato si può decifrare. Si salva un hash, cioè il risultato di una funzione a senso unico. Altre due regole:

- il **salt**, casuale e diverso per ogni password, fa sì che due password uguali abbiano hash diversi, e rende inutili le tabelle precalcolate;
- l'hash deve essere **lento**, così provare milioni di password su un database rubato costa troppo.

TavoloFlow non scrive niente di questo a mano: usa `PasswordHasher<T>` di ASP.NET Core Identity, cioè PBKDF2 con HMAC-SHA512 e 100.000 iterazioni, con salt e parametri salvati nella stessa stringa dell'hash.

`AccountService.AuthenticateAsync` ha due accorgimenti:

- se lo username non esiste, verifica comunque la password contro un hash finto (`UnknownAccountPassword`). Altrimenti "utente inesistente" risponderebbe subito e "password sbagliata" solo dopo il calcolo lento, e misurando i tempi si scoprirebbe quali username esistono (*timing attack*, *user enumeration*);
- utente inesistente, password sbagliata e account disattivato danno tutti lo stesso errore, `INVALID_CREDENTIALS`.

Prima di questi controlli, `AccountRateLimiter` limita i tentativi: 30 al minuto per IP e 10 ogni 5 minuti per username. Per il limite per IP serve l'IP reale (vedi `UseForwardedHeaders`). Il limite per username ha un rovescio: chi sbaglia apposta 10 volte blocca per qualche minuto il login di quell'utente.

Il cambio password fa un solo `UPDATE` condizionale. Scrive il nuovo hash, `MustChangePassword = false` e versione + 1, ma solo se nel database c'è ancora la versione letta prima. Se due cambi partono insieme, solo uno trova la versione giusta: è concorrenza ottimistica. Poi il controller chiama di nuovo `SignInAsync`: il cookie di questo browser ha ancora la versione vecchia, e alla richiesta successiva verrebbe rifiutato.

#### Controllo a ogni richiesta, revoca ed eventi

Il ticket descrive l'utente com'era al momento del login, ma da allora può essere cambiato qualcosa. Per questo `StoreCookieEvents` (`Accounts/StoreAuthentication.cs`) ridefinisce `ValidatePrincipal`, che il gestore chiama dopo aver decifrato un cookie non scaduto. Il metodo carica l'utente dal database e rifiuta il cookie se l'utente non esiste più, è disattivato, ha cambiato ruolo o username, o ha una `CredentialVersion` diversa da quella del ticket.

Rifiutare vuol dire due cose:

- `RejectPrincipal()`: la richiesta continua come anonima, quindi la policy risponde 401;
- `SignOutAsync`: il browser riceve l'ordine di cancellare il cookie.

Se invece è tutto in regola, il metodo aggiorna il claim `must_change_password` con il valore attuale e mette l'utente in `CurrentAccount`. È l'unica fonte da cui i controller prendono l'identità.

`CredentialVersion` aumenta con il cambio e il reset della password e con l'attivazione o disattivazione dell'account, e tutti i cookie emessi prima diventano invalidi. Esempio: il proprietario resetta la password dello STAFF. Il tablet della cucina fa polling ogni 10 secondi: alla richiesta successiva riceve 401, e il frontend lo porta al login. È la stessa idea del `SecurityStamp` di ASP.NET Identity, che però di default viene ricontrollato ogni 30 minuti. Qui il costo è una query a ogni richiesta, e in cambio la revoca è immediata.

Il limite di questa scelta riguarda il logout, che cancella solo il cookie di quel browser. Il server non tiene un elenco dei login, quindi una copia del cookie fatta prima del logout funzionerebbe fino alla scadenza.

Il logout non può nemmeno aumentare la versione, perché ogni ristorante ha un solo account STAFF, condiviso da tutti i dispositivi: il logout dal telefono di un cameriere disconnetterebbe anche il tablet della cucina e quello del pass. Per un logout del singolo dispositivo servirebbe `options.SessionStore` (`ITicketStore`): il ticket resta sul server e il cookie contiene solo una chiave, cioè di nuovo una sessione lato server. Copiare un cookie HttpOnly richiede già il controllo del dispositivo, quindi per V1 il limite è accettato.

Guest crea i suoi eventi con `options.Events = new …`. Store invece indica `StoreCookieEvents` con `options.EventsType` e lo registra come scoped. Il motivo è che le opzioni dello schema vengono costruite una volta sola. Un'istanza messa lì vivrebbe quanto l'applicazione e terrebbe per sempre il `DbContext` della prima richiesta: si chiama *captive dependency*. Con `EventsType`, invece, il gestore prende `StoreCookieEvents` dai servizi di ogni richiesta. Serve anche per un secondo motivo: `ValidatePrincipal` e il controller devono ricevere la stessa istanza di `CurrentAccount`, quella della richiesta in corso.

Gli stessi eventi ridefiniscono `RedirectToLogin` e `RedirectToAccessDenied`. Il gestore del cookie è nato per siti con pagine HTML: senza login risponde con un 302 verso `/Account/Login`, e `fetch` seguirebbe il redirect senza mai vedere un 401. Da .NET 10 un controller con `[ApiController]` riceve già 401 o 403 invece del redirect, ma con il corpo vuoto. Le versioni del progetto scrivono invece un `ApiError` con il codice, e il frontend ne ha bisogno. Per esempio, la pagina dell'ospite rimostra il modulo d'ingresso quando riceve `GUEST_AUTH_REQUIRED`.

#### Policy: sicuro per default

| Policy                            | Schema   | Ruolo            | Primo cambio password | Usata da                                         |
| --------------------------------- | -------- | ---------------- | --------------------- | ------------------------------------------------ |
| `StoreStaff` (default e fallback) | Store    | OWNER o STAFF    | richiesto             | cucina, sala, conto, tavoli, menu                |
| `StoreAccount`                    | Store    | OWNER o STAFF    | non richiesto         | `/me`, cambio password, logout                   |
| `StoreOwner`                      | Store    | OWNER            | richiesto             | modifiche al menu, chiusura PAID, storico, staff |
| `GuestAccess`                     | Guest    | —                | —                     | ordini e accesso dell'ospite                     |
| `PlatformAdmin`                   | Platform | `PLATFORM_ADMIN` | —                     | `/api/platform`                                  |

In `Accounts/AccountServiceCollectionExtensions.cs` la default policy e la fallback policy sono entrambe `StoreStaff`:

- la default policy è quella usata da un `[Authorize]` senza nome;
- la fallback policy è quella usata dagli endpoint senza nessun attributo di autorizzazione.

Quindi, se un controller nuovo dimentica `[Authorize]`, resta comunque riservato allo staff. Per renderlo pubblico bisogna scrivere `[AllowAnonymous]`, come fanno il menu pubblico, i login e gli endpoint CSRF. Un errore produce un endpoint troppo chiuso, mai uno troppo aperto.

Più attributi `[Authorize]` si sommano in AND. `MenuController` ha `StaffPolicy` sulla classe e `OwnerPolicy` su molti metodi: per segnare un piatto come esaurito basta STAFF, per modificarlo serve OWNER. `[AllowAnonymous]` invece prevale su tutto.

Il primo cambio password è un requisito su misura:

- `PasswordChangedRequirement` è vuoto, fa solo da segnaposto;
- `PasswordChangedHandler` lo considera soddisfatto solo se il claim `must_change_password` vale `"false"`;
- lo includono `StoreStaff` e `StoreOwner`, ma non `StoreAccount`. Così chi ha una password temporanea può vedere chi è e cambiarla, ma non lavorare;
- `AccountAuthorizationResultHandler` trasforma questo fallimento in `403 PASSWORD_CHANGE_REQUIRED`, e il frontend sa che deve mostrare la pagina di cambio password, non "accesso negato".

#### Autorizzazione sui dati (multi-tenant)

Le policy dicono "sei STAFF", ma non di quale ristorante. Se ci si fermasse lì, uno STAFF del ristorante A potrebbe cancellare un piatto di un ordine del ristorante B cambiando l'ID nell'URL. Questo errore si chiama IDOR, o *Broken Object Level Authorization*, ed è il primo rischio della OWASP API Security Top 10. TavoloFlow lo evita su tre livelli:

1. **Il ristorante lo decide il server.** I controller passano ai servizi `current.RequireUser().RestaurantId`, già verificato nel database. Nessun DTO contiene un `restaurantId` scelto dal client.
2. **Ogni query filtra anche per ristorante**, per esempio `i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId` in `KitchenService`. Un oggetto di un altro ristorante non viene trovato, e la risposta è 404 (`ORDER_ITEM_NOT_FOUND`), non 403: un 403 confermerebbe che quell'ID esiste.
3. **Il database lo impone.** Le chiavi esterne includono il ristorante: un `OrderItem` punta al suo ordine con la coppia `(OrderId, RestaurantId)`. Così una riga non può finire sotto l'ordine di un altro ristorante, nemmeno per un bug.

#### Ospiti: un permesso su una visita

L'ospite non ha un account. Il cookie Store dice "sei l'utente X", e il server controlla la riga di quell'utente. Il cookie Guest dice "questo browser può agire sulla visita S1 del tavolo 5", e il server controlla la riga della visita. Tutti gli ospiti dello stesso tavolo sono uguali, quindi `GuestAccess` chiede solo un'autenticazione Guest, senza ruoli.

Per entrare servono due prove:

- **il QR del tavolo** contiene un token di 32 byte casuali (256 bit), impossibile da indovinare. Però resta lo stesso finché il tavolo esiste, quindi prova solo che hai visto il QR, oggi o la settimana scorsa;
- **il codice d'ingresso** di 4 caratteri nasce a ogni apertura del tavolo, e lo mostrano lo staff o un compagno di tavolo. Prova che fai parte del gruppo seduto adesso.

Il join (`GuestService.JoinAsync`):

1. trova il tavolo dal QR: ristorante e tavolo non arrivano mai dal client;
2. applica la regola d'ingresso: rifiuta se il ristorante è sospeso o il tavolo disattivato;
3. controlla che la visita indicata sia ACTIVE e appartenga a quel tavolo;
4. verifica il codice, se il ristorante lo richiede.

Solo allora scrive nel cookie `restaurant_id`, `table_id`, `session_id` e un `NameIdentifier` casuale.

Gli ospiti non hanno un `ValidatePrincipal`. La validità di un ospite non dipende da un account ma dallo stato della visita, e cambia secondo l'operazione: durante una pausa degli ordini, per esempio, l'ospite può ancora leggere i suoi ordini, ma non ordinare. Per questo i controlli stanno nei servizi, sotto i lock delle righe. `RequireTarget` confronta la visita indicata nella richiesta con quella del cookie (se sono diverse: 403 `GUEST_SESSION_MISMATCH`). Poi il servizio rilegge la visita, che deve essere ACTIVE e ancora legata al tavolo. Dopo la chiusura del conto il cookie resta valido per qualche ora, ma ogni operazione trova la visita CLOSED.

Sul codice d'ingresso (`Dining/JoinCodes.cs`):

- **20 bit bastano grazie ai limiti.** L'alfabeto ha 32 simboli (senza 0, 1, I e O), quindi 32⁴ ≈ 1 milione di combinazioni, circa 20 bit. Da solo sarebbe poco, ma `GuestRateLimiter` permette 60 join al minuto per IP e 30 ogni 5 minuti per visita. In una visita di 3 ore sono circa 1.080 tentativi, cioè lo 0,1% di probabilità di indovinare. Il limite è per visita, e non solo per IP, perché cambiare IP è facile.
- **È cifrato, non hashato.** Lo staff deve poterlo rileggere per mostrarlo in sala, quindi serve un valore reversibile. Un hash, del resto, non proteggerebbe niente: con un milione di combinazioni, chi ha il database lo trova subito. Lo scopo della cifratura contiene ristorante, tavolo e visita, quindi un codice cifrato copiato su un'altra visita non si decifra.
- **Il confronto dura sempre lo stesso tempo.** `CryptographicOperations.FixedTimeEquals` impiega lo stesso tempo qualunque carattere sia sbagliato. Un confronto normale si fermerebbe al primo carattere diverso, e il tempo di risposta rivelerebbe quanti caratteri sono giusti.

#### CSRF

Il browser allega i cookie da solo. Se l'OWNER è loggato e apre una pagina malevola, quella pagina può contenere un form che si invia da solo verso l'API, e il browser fa la richiesta con il cookie dell'OWNER. Questo è il *Cross-Site Request Forgery*: l'attaccante non legge niente, ma fa eseguire scritture a nome dell'utente. Le scritture con corpo JSON sono più difficili da falsificare, ma gli endpoint senza corpo (logout, piatto pronto, cancellazione) si colpiscono con un form normale.

`SameSite=Lax` non basta. Per il browser "sito" vuol dire dominio registrabile, quindi `app.qiaotavoloflow.it` e il sito marketing `qiaotavoloflow.it` sono lo stesso sito: da una pagina vulnerabile del sito marketing i cookie partirebbero. Sono però origini diverse, perché l'origine è schema + host + porta. Ed è sull'origine che si basano i token antiforgery.

I token antiforgery hanno due metà (`Common/BrowserSecurity.cs`):

- un cookie `TavoloFlow.Csrf` (HttpOnly, `SameSite=Strict`), che il browser manda da solo;
- un token di richiesta, che il frontend ottiene con `GET /api/auth/csrf` e rimanda nell'header `X-CSRF-TOKEN`.

`CsrfValidationFilter` è registrato su tutti i controller e accetta una scrittura (cioè qualsiasi metodo tranne GET, HEAD e OPTIONS) solo se le due metà corrispondono. Una pagina di un'altra origine può far partire la richiesta, ma le mancano due cose:

- non può leggere la risposta di `GET /csrf`: lo vieta la same-origin policy, e il server non abilita CORS;
- non può aggiungere un header personalizzato. Un form non può farlo, e una `fetch` da un'altra origine manderebbe prima una richiesta di controllo (*preflight*) che il server non approva.

Il token è legato a due cose:

- **all'utente.** Contiene un valore ricavato dal `NameIdentifier`, quindi un token preso da anonimo non vale dopo il login, e quello di un utente non vale per un altro. Per questo il frontend chiede un token nuovo prima di ogni scrittura (`write()` in `frontend/src/lib/api.ts`): un'altra scheda può aver fatto logout e poi login come OWNER, e un token conservato sarebbe ancora quello dello STAFF;
- **all'area.** `BrowserCsrfScope` ci aggiunge `store`, `guest` o `platform` secondo il percorso. Quindi ogni identità ha il suo endpoint (`/api/auth/csrf`, `/api/public/csrf`, `/api/platform/auth/csrf`), e un token Store non vale su `/api/public/orders`.

Anche il login è protetto, contro il *login CSRF*: senza protezione, una pagina malevola potrebbe collegare il tablet del ristorante all'account dell'attaccante.

Un'alternativa diffusa è il *double-submit cookie*, usato per esempio da Angular: il token sta in un cookie leggibile da JavaScript, e il frontend lo copia nell'header. ASP.NET invece tiene il cookie HttpOnly e manda il token nel corpo JSON di `/csrf`. L'idea è la stessa: solo una pagina della tua origine può leggere il token e rimetterlo in un header.

#### Domande da colloquio

1. Che differenza c'è tra 401 e 403? Quando il progetto restituisce 404 invece di 403, e perché?
2. Perché un cookie HttpOnly e non un JWT in `localStorage`? Cosa si paga con questa scelta?
3. Che differenza c'è tra cookie e ticket? Perché il cookie dell'ospite e il suo ticket scadono in momenti diversi?
4. Come si revoca un cookie che vale 30 giorni? Cosa succede al tablet della cucina dopo il reset della password dello STAFF?
5. Perché il logout non invalida le copie del cookie? E perché non aumenta `CredentialVersion`?
6. Perché `StoreCookieEvents` usa `EventsType` e non `options.Events`?
7. Cosa vuol dire "sicuro per default" con la fallback policy? Come funziona il requisito del primo cambio password?
8. Cos'è un IDOR, e con quali tre livelli il progetto lo evita?
9. Perché il codice d'ingresso è cifrato e la password hashata? Perché 20 bit bastano?
10. Perché qui `SameSite=Lax` non basta contro il CSRF? Perché il frontend chiede un token nuovo prima di ogni scrittura?

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
