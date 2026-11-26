# 2. ASP.NET Core e i livelli applicativi

Apri `OnlineOrderController.Submit` nell’IDE. Bastano poche righe per avviare l’intero invio. Metti un breakpoint sulla prima: la rotta è già stata individuata e i parametri hanno un valore. Alcune richieste non valide non arrivano fin qui. Capire cosa accade prima e dopo queste righe serve più che memorizzare i nomi degli attributi.

<a id="controller-service"></a>

## Come collaborano controller e servizio

**Il controller riceve l’input HTTP, il servizio esegue il caso d’uso e il controller ne traduce l’esito in una risposta HTTP.** Qui `Submit` ricava lo `slug` del ristorante dal percorso, `OnlineRequestInput` dal JSON e il contesto del browser da `HttpContext`. Chiama `requests.SubmitAsync` e usa i dati restituiti e il flag `Created` per scegliere 201 o 200. L’action `Menu` è ancora più semplice: restituisce la lettura del menu con 200. [OnlineOrderController.cs](../../../backend/TavoloFlow.Api/Controllers/OnlineOrderController.cs)

Leggi le due righe dell’action. La prima ricava dal contesto HTTP l’input del caso d’uso e con `ct` propaga la cancellazione. La seconda sceglie la risposta di successo visibile al client. Seguendo la prima nel servizio trovi prezzi e controllo della concorrenza. Nei test HTTP trovi invece il contratto della seconda per invio iniziale e ripetuto.

```csharp
var result = await requests.SubmitAsync(slug, input, browser.Require(HttpContext), ct);
return StatusCode(result.Created ? 201 : 200, result.Response);
```

| Regola da aggiungere | Dove collocarla e perché |
| --- | --- |
| URL pubblico, limite del corpo, codice di successo | Controller o configurazione HTTP. Sono scelte legate al trasporto. |
| Possibilità di ordinare, validità dei prezzi, scritture da annullare insieme | Il servizio coordina caso d’uso e transazione. Le stesse regole valgono anche da altri punti di ingresso. |
| Calcolo della consegna gratuita sopra una soglia | Una funzione di dominio può dipendere solo dai suoi argomenti. I casi d’uso la richiamano e i test coprono direttamente i valori limite. |
| Corpo degli errori e controlli CSRF comuni | I filtri globali uniformano il comportamento e lasciano ai controller parametri e risultati specifici. |

«Servizio» ha due significati comuni. Il contenitore DI di ASP.NET Core risolve servizi come orologi, contesti dati e oggetti di business. `OnlineRequestService` è in particolare un servizio applicativo che coordina operazioni di dominio. Un controller può ricevere più servizi e una regola può servire per invio, accettazione e correzione del conto. I nomi dei file aiutano a orientarsi, la responsabilità si capisce da chi governa la regola. [OnlineRequestService.cs](../../../backend/TavoloFlow.Api/Online/OnlineRequestService.cs) · [OnlineDelivery.cs](../../../backend/TavoloFlow.Api/Online/OnlineDelivery.cs)

## Il percorso di una richiesta nel framework

1. All’avvio `Program.cs` registra controller, configurazione della serializzazione, servizi e filtri, e compone la pipeline. Registrazione delle dipendenze ed elaborazione della singola richiesta avvengono in momenti distinti.
2. I middleware si eseguono in ordine. Ciascuno può chiamare il successivo ed elaborarne il risultato oppure rispondere subito. L’app considera prima le intestazioni dei proxy fidati. Sulle rotte applicative il routing precede limiti di frequenza, autenticazione e autorizzazione, così i passaggi successivi conoscono l’endpoint e i suoi metadati.
3. In MVC un filtro di autorizzazione può respingere subito una scrittura. Model binding e formatter JSON costruiscono i parametri da percorso, query string e corpo. `[ApiController]` e la configurazione della risposta per modelli non validi gestiscono gli errori di binding. Anche un ordine dalla struttura corretta può contenere un piatto esaurito.
4. L’action invoca il servizio e restituisce un risultato. MVC scrive la risposta HTTP. `ApiExceptionFilter` converte i rifiuti applicativi in errori con `code` e `requestId`. Le eccezioni impreviste hanno anche una gestione a livello di pipeline. L’interfaccia può tradurre lo stesso codice nelle tre lingue. [Program.cs](../../../backend/TavoloFlow.Api/Program.cs) · [ApiErrors.cs](../../../backend/TavoloFlow.Api/Common/ApiErrors.cs) · [Middleware di ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0)

## Dependency injection, durata degli oggetti e cancellazione

Se il servizio aprisse da sé la connessione, leggesse l’orologio di sistema e contattasse il provider reale, per testare la chiusura del locale bisognerebbe controllare tutti e tre. L’iniezione nel costruttore dichiara le dipendenze, l’avvio sceglie le implementazioni. Il servizio riceve `TimeProvider` e `IOnlineVerification`, così i test controllano ora ed esito della verifica. Anche una classe concreta può essere iniettata direttamente. Un’interfaccia è utile dove serve sostituire l’implementazione. [Program.cs](../../../backend/TavoloFlow.Api/Program.cs) · [OnlineVerificationTests.cs](../../../backend/TavoloFlow.Api.Tests/OnlineVerificationTests.cs)

| Durata | Alla risoluzione o durante la richiesta | Significato nel progetto |
| --- | --- | --- |
| Transient | Nuova istanza a ogni risoluzione | Oggetto indipendente e di breve durata. Non usarlo per conservare lo stato di altri consumatori. |
| Scoped | Riutilizzata in uno scope, normalmente uno per richiesta web | È la durata predefinita di `AddDbContext`. Servizi che collaborano possono usare lo stesso contesto. |
| Singleton | Condivisa nell’intero contenitore dell’applicazione | Orologio e coda push servono più richieste. Lo stato mutabile condiviso richiede attenzione alla concorrenza. Un singleton non deve trattenere il DbContext di una richiesta. |

DbContext segue un’unità di lavoro breve. Il suo stato mutabile impedisce di eseguire operazioni in parallelo sulla stessa istanza. Lo scope determina riuso e rilascio. La transazione dipende dalle scritture che devono riuscire insieme. `CancellationToken` propaga la cancellazione all’I/O asincrono. Quando il chiamante smette di attendere, occorre ancora stabilire con il protocollo applicativo se ci sia stato un commit. [DataServiceCollectionExtensions.cs](../../../backend/TavoloFlow.Api/Data/DataServiceCollectionExtensions.cs) · [Configurazione e durata di DbContext](https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/)

## Esercizio e autoverifica

Usa «Vai alla definizione» su `SubmitAsync`. Individua chi legge il contesto del browser, apre la transazione, produce `Created` e sceglie il codice HTTP. Cerca `AddScoped<OnlineRequestService>` per tornare alla registrazione. Contesto HTTP e codice di risposta sono nel controller, transazione e decisione sulla creazione nel servizio, registrazione all’avvio.

**Autoverifica** — Una nuova regola richiede che piatti prima dello sconto più consegna siano rappresentabili esattamente in centesimi. Quale ingresso sfuggirebbe a un controllo nel solo controller?

<details>
<summary>Mostra la risposta</summary>

Anche l’accettazione da parte del personale deve controllare un preventivo salvato. Estrai la regola sugli importi e richiamala in ciascun caso d’uso quando sono disponibili valori affidabili. Il frontend può anticipare il messaggio. [OnlineStaffService.cs](../../../backend/TavoloFlow.Api/Online/OnlineStaffService.cs)

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Come dividi le responsabilità tra controller e servizio?»** Usa un ordine per spiegare responsabilità, risultato e riuso.

*Nel controller raccolgo i dati della richiesta e traduco il risultato in una risposta HTTP. Il servizio verifica se il ristorante può accettare la richiesta e coordina le scritture nella stessa transazione. Nel nostro caso restituisce anche se la richiesta è stata creata ora. In questo modo il controller può scegliere tra 201 e 200 e la regola sui prezzi resta riutilizzabile.*

**Approfondimento** — In quale altro caso serve la regola sull’importo? Considera l’accettazione di una consegna con preventivo precedente.

**«Perché registreresti un DbContext come scoped?»** Spiega unità di lavoro, concorrenza e rilascio.

*Il contesto tiene traccia delle entità caricate durante un’unità di lavoro. Con uno scope per richiesta i servizi che collaborano ricevono lo stesso contesto, che viene poi rilasciato. Condividerlo tra richieste concorrenti mescolerebbe stati diversi e creerebbe problemi di accesso simultaneo. Se devo rendere atomiche più scritture, definisco esplicitamente anche il confine della transazione.*

**Approfondimento** — Cosa condividono più richieste contemporanee del menu? Il contenitore può condividere l’orologio, mentre ogni richiesta ha il proprio contesto.

[Indice del corso](../learning-notes.md) · [Capitolo successivo](03-ef-core.md)
