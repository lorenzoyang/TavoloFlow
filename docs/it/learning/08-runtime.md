# 8. Identità, test e ambienti di esecuzione

L’ID di un conto arriva al server tramite URL. Il titolare chiede: «E se qualcun altro conosce quell’ID?». Distingui pagina nel browser, persona identificata dal server e ristorante proprietario della riga. Quale test dimostrerebbe che questi livelli collaborano correttamente?

<a id="identity"></a>

## Identità, permessi e appartenenza dei dati

1. **L’autenticazione** risponde a «Chi rappresenta questa richiesta?». Al login del personale il server crea un ticket con i claim di identità, lo protegge con ASP.NET Core Data Protection e lo consegna in un cookie HttpOnly. Le richieste successive della stessa origine portano il cookie. Dopo aver validato il ticket, il server controlla nel database stato dell’account e versione delle credenziali, così disattivazioni e cambi hanno effetto. Chiavi Data Protection persistenti consentono di leggere i ticket ancora validi dopo un riavvio. [StoreAuthentication.cs](../../../backend/TavoloFlow.Api/Accounts/StoreAuthentication.cs)
2. **L’autorizzazione** risponde a «Quali azioni può eseguire questa identità?». Il controller dei conti richiede un’identità del personale e confermare l’incasso richiede anche OWNER. Su un endpoint protetto, credenziali assenti o non valide comportano tipicamente 401. Se l’identità è valida ma manca il ruolo o non è soddisfatta la policy, si può ricevere 403. Nascondere il pulsante aiuta l’utente e il server decide se l’operazione procede. [BillingController.cs](../../../backend/TavoloFlow.Api/Controllers/BillingController.cs)
3. **L’appartenenza dei dati** risponde a «Di quale ristorante è questo record?». Il servizio ricava l’ID del ristorante da `CurrentAccount` verificato. Query e lock includono gli ID del ristorante e della risorsa. Anche due OWNER possono operare soltanto sui rispettivi locali. Una risorsa fuori ambito può risultare introvabile come una inesistente. [RowLocks.cs](../../../backend/TavoloFlow.Api/Data/RowLocks.cs) · [BillingTests.cs](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

Nello stesso browser si possono aprire la pagina QR di un ospite e l’amministrazione della piattaforma. L’app distingue le identità Store, Guest e Platform. La lettura del menu pubblico omette le credenziali, mentre l’invio pubblico richiede token antiforgery e cookie del relativo ambito. Una sessione del personale non attribuisce privilegi da dipendente a un ordine anonimo. `AuthBoundary` osserva la copia locale dell’identità, le policy sul server governano le richieste reali e test diversi coprono i due compiti. [BrowserSecurity.cs](../../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs) · [api.ts](../../../frontend/src/lib/api.ts)

## Perché serve protezione CSRF anche con un cookie di accesso

Il browser può allegare automaticamente i cookie in base alla destinazione e alle relative regole. Un ticket valido dimostra che la richiesta porta le credenziali di quell’identità. Per le scritture il server si aspetta anche un token emesso per l’ambito corrente. Il frontend lo ottiene e lo invia in `X-CSRF-TOKEN`. Il filtro MVC `CsrfValidationFilter` verifica la coppia per i metodi interessati. `HttpOnly` limita la lettura del cookie dagli script. `SameSite` limita alcuni invii tra siti. L’autorizzazione controlla l’azione specifica. Poiché personale, ospiti e piattaforma possono condividere il browser, conta anche associare e selezionare l’ambito corretto. [BrowserSecurity.cs](../../../backend/TavoloFlow.Api/Common/BrowserSecurity.cs) · [Protezione antiforgery in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)

## Quali prove servono per una funzionalità?

| Proprietà da verificare | Dove guardare | Cosa attraversa il test |
| --- | --- | --- |
| Dopo il timeout il carrello conserva ID e dati originali. | [Test del carrello online](../../../frontend/tests/online-order.test.ts) | Node verifica `createOnlineIntent`, serializzazione, ripristino e classificazione degli errori con input e output precisi. |
| Due invii concorrenti creano una sola richiesta. | [Test di integrazione degli invii](../../../backend/TavoloFlow.Api.Tests/OnlineOrderingTests.cs) | `WebApplicationFactory` ospita l’app, il client invia HTTP e PostgreSQL reale applica migrazioni, transazioni, unicità e lock. |
| Un rifiuto o un duplicato non provoca notifiche aggiuntive. | [Limiti di consegna e asserzioni sul push](../../../backend/TavoloFlow.Api.Tests/OnlineDeliveryQuoteTests.cs) | Applicazione e database seguono il percorso reale. Un sostituto osservabile della consegna esterna permette di verificare quando viene invocata. |
| Indietro sul telefono chiude prima il carrello. | [Demo locale](../local-development.md) | Interagire con il browser permette di osservare cronologia, focus e resa grafica, aspetti che i test delle funzioni pure non coprono. |

Scegli i sostituti secondo la proprietà da verificare. Un orologio controllabile rende ripetibile la scadenza esatta, un preventivo simulato elimina la dipendenza dalla rete esterna. Una raccolta in memoria al posto di PostgreSQL non dimostra `FOR UPDATE`, indici univoci o visibilità delle transazioni. Leggi le asserzioni distinguendo tre proprietà: la POST è riuscita, è stato salvato un solo record e il browser ha mostrato il risultato corretto. [AccountTestHost.cs](../../../backend/TavoloFlow.Api.Tests/AccountTestHost.cs) · [PostgreSqlFixture.cs](../../../backend/TavoloFlow.Api.Tests/PostgreSqlFixture.cs)

## Seguire la richiesta dallo sviluppo alla produzione

| Ambiente | Come si raggiunge l’API | Cosa osservare |
| --- | --- | --- |
| Sviluppo locale | Vite serve le pagine e inoltra `/api` ad ASP.NET Core. PostgreSQL può partire a parte con Compose. | Percorsi della stessa origine in Network. Gli aggiornamenti a caldo riducono l’attesa durante lo sviluppo. |
| Demo locale | Un progetto Compose distinto riunisce web, API, database e inizializzazione una tantum. | Init applica migrazioni e dati di esempio per riprodurre il ristorante. Le immagini contengono codice e dipendenze, i volumi conservano i dati oltre la vita dei container. |
| Produzione | Vite ha prodotto file statici. Caddy termina TLS, serve i file e fa da reverse proxy all’API. Kestrel esegue l’applicazione. | L’accesso diretto a una pagina applicativa usa l’entry point frontend, l’API restituisce il proprio stato HTTP. Le intestazioni del proxy fidato recuperano informazioni originali. Database e chiavi vanno conservati. |
| CI | GitHub Actions esegue i controlli previsti su push e PR con processi di test e database temporaneo. | Formattazione, tipi e build, coerenza delle migrazioni e asserzioni di dominio individuano regressioni diverse. |

Leggi il proxy di Vite e lo smistamento di Caddy per spiegare perché lo stesso percorso API relativo funziona nei due ambienti. Il rilascio in produzione applica esplicitamente le migrazioni. Build del frontend, riavvio dell’API ed evoluzione dello schema hanno cicli di vita distinti. [vite.config.ts](../../../frontend/vite.config.ts) · [compose.yaml](../../../demo/compose.yaml) · [Caddyfile](../../../deploy/Caddyfile) · [ci.yml](../../../.github/workflows/ci.yml) · [Guida all’installazione](../self-hosting.md)

## Esercizio e autoverifica

Esegui i test backend del capitolo 4 dalla radice del repository. Poi da `frontend/` esegui il comando seguente con Node 24. Cerca nell’output `a saved cart restores only for its restaurant` e `an understood rejection frees the cart`. Apri i test e individua le asserzioni che conservano l’ID originale e distinguono l’esito incerto.

```bash
node --test --test-isolation=none tests/online-order.test.ts
```

I test delle regole frontend possono passare senza server HTTP. Il test di integrazione della contesa sui lock richiede PostgreSQL in Docker.

**Autoverifica** — La deduplicazione riuscita degli invii di un ristorante dimostra che un altro ristorante non può leggerne il conto?

<details>
<summary>Mostra la risposta</summary>

Sono invarianti diversi. Per verificare l’ambito delle query usa account e risorse di ristoranti distinti. Cerca `Endpoints_IdentityCsrfAndTenant_RejectUnauthorizedAccess`. [BillingTests.cs](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Qual è la differenza tra autenticazione e autorizzazione in un’applicazione multi-tenant?»** Descrivi controlli concreti su identità, permesso e appartenenza del record.

*L’autenticazione identifica l’utente della richiesta. L’autorizzazione stabilisce se il suo ruolo può compiere l’azione, per esempio chiudere un conto. In un sistema con più ristoranti verifico anche l’appartenenza del dato: ricavo il ristorante dall’identità verificata e lo includo nella query insieme all’identificativo del conto. Due titolari possono avere lo stesso ruolo e accedere a dati diversi.*

**Approfondimento** — Se l’utente cambia `sessionId` nel frontend, quale controllo rimane efficace?

**«Quando useresti un test di integrazione con un database reale?»** Indica le proprietà che richiedono il sistema reale e le dipendenze sostituibili.

*Lo uso quando il risultato dipende dal comportamento del database, per esempio da un vincolo univoco o dall’attesa su una riga bloccata. Avvio PostgreSQL in un container temporaneo, applico le migrazioni e invio due richieste attraverso l’API. Verifico sia le risposte sia i dati finali. Per rendere il test ripetibile posso invece controllare l’orologio e sostituire il servizio di notifiche.*

**Approfondimento** — Se entrambe le chiamate HTTP riescono, serve controllare il database? Verifica il numero di record e l’identità dei risultati restituiti.

## Risposta di esempio alla domanda finale

Registra la tua risposta di un minuto alla domanda finale dell’indice prima di leggere questa. Per ogni frase individua un test frontend o backend che potrebbe verificarla.

*Prima del POST il browser salva i dati confermati e l’identificativo del tentativo. Se la risposta si perde, il cliente può aver visto un errore anche se il database ha già registrato la richiesta. Al ritorno la pagina cerca il risultato con un GET. Se ancora non lo trova, il primo invio potrebbe essere in corso. Un nuovo tentativo esplicito riusa la stessa chiave. Il server controlla di nuovo dentro la transazione e il vincolo univoco protegge i dati anche con richieste concorrenti. Solo il primo inserimento confermato genera una notifica. A quel punto il ristorante ha ricevuto la richiesta. L’ordine per la cucina nasce quando il personale la accetta.*

Se ti chiedono cosa accade quando due operatori accettano contemporaneamente, passa ai lock di riga e ai controlli di stato. Se ti chiedono quando si aggiorna la cucina, spiega sottoscrizioni attive, polling e freschezza dopo il rientro. Un unico caso completo permette di approfondire sia il database sia il frontend.

[Indice del corso](../learning-notes.md) · [Capitolo precedente](07-router.md)
