# 3. EF Core e database relazionali

Lo storico può contenere decine di migliaia di conti, ma alla pagina servono soltanto i primi di un ristorante in un certo periodo. Caricare l’intera tabella prima di filtrarla può dare il risultato corretto con un costo elevato in rete, memoria e latenza. Leggendo una query EF chiediti dove si svolge il lavoro e quando si contatta il database.

## Dal modello a oggetti al piano di esecuzione

`ApplicationDbContext` rappresenta un’unità di lavoro con il database. Un `DbSet` è il punto di partenza per comporre query. La configurazione mappa proprietà, relazioni, colonne, vincoli e indici sul modello relazionale. Npgsql traduce nel dialetto SQL di PostgreSQL. Concatenare `Where`, `OrderBy` e `Select` costruisce di norma un’espressione `IQueryable`. L’enumerazione o un’operazione terminale come `ToArrayAsync`, `SingleOrDefaultAsync` o `LongCountAsync` richiede i risultati. Dopo un `ToList` anticipato, eventuali filtri sulla lista lavorano in memoria. [ApplicationDbContext.cs](../../../backend/TavoloFlow.Api/Data/ApplicationDbContext.cs) · [Come EF Core esegue una query](https://learn.microsoft.com/en-us/ef/core/querying/how-query-works)

`BillQueries.HistoryAsync` limita `sessions` per ristorante, stato e periodo, conta i risultati e aggiunge cursore, ordinamento e `limit + 1` alla query della pagina. Questo **SQL schematico** illustra l’accesso ai dati. La proiezione effettiva comprende anche il riepilogo del conto.

```sql
SELECT id, closed_at
FROM dining_sessions
WHERE restaurant_id = :restaurant
  AND status = 'CLOSED'
  AND closed_at >= :start_utc AND closed_at < :end_utc
  AND (closed_at, id) < (:last_time, :last_id)
ORDER BY closed_at DESC, id DESC
LIMIT :page_size_plus_one;
```

Nella prima pagina si omette il predicato sul cursore. Due conti possono chiudersi allo stesso istante, perciò `id` risolve i pareggi. Una riga in più indica se esiste un’altra pagina. Ripartire dall’ultima chiave può sfruttare un indice adatto meglio di un `OFFSET` profondo, ma rende meno immediato saltare a una pagina arbitraria. Conteggio e pagina condividono transazione `RepeatableRead` e snapshot nella stessa risposta. La pagina successiva apre una nuova richiesta HTTP e una nuova transazione. [BillQueries.cs](../../../backend/TavoloFlow.Api/Billing/BillQueries.cs) · [Paginazione con EF Core](https://learn.microsoft.com/en-us/ef/core/querying/pagination)

La proiezione specifica colonne o valori calcolati da restituire. Caricare le relazioni riga per riga può causare N+1 viaggi al database, mentre caricarle tutte insieme può moltiplicare le righe. Parti da ciò che mostra la pagina e scegli proiezioni, aggregazioni o query in blocco. L’ottimizzatore tiene conto dell’ordine delle colonne negli indici, della selettività e del volume. Esamina `ToQueryString()` prima dell’esecuzione e prova `EXPLAIN (ANALYZE, BUFFERS)` su SQL di lettura nel database locale. Tempo, righe e viaggi misurano costi diversi. [Query efficienti con EF Core](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying) · [Piani di esecuzione PostgreSQL](https://www.postgresql.org/docs/18/using-explain.html)

<a id="tracking"></a>

## Perché rileggere dopo il salvataggio?

| Operazione | Nel database | Nel DbContext corrente |
| --- | --- | --- |
| Query con tracking | Esegue SELECT | Tiene traccia di identità e stato. EF può riutilizzare l’istanza per la stessa chiave primaria. |
| Query `AsNoTracking` | Esegue comunque SELECT | Restituisce i valori letti, utili per viste e risposte. L’isolamento della transazione si configura separatamente. |
| Modifica di un’entità tracciata e `SaveChangesAsync` | Applica le modifiche pendenti | EF deduce le scritture dallo stato tracciato e lo aggiorna dopo il successo. |
| `ExecuteUpdateAsync` | Esegue subito un UPDATE sull’insieme selezionato | Aggira il tracking. Gli oggetti già caricati possono conservare valori vecchi. |

`OnlineSettingsService.SetDeliveryAsync` usa entrambe le modalità di scrittura. Nella transazione blocca il ristorante, aggiorna direttamente le proprietà di consegna e sostituisce le fasce tariffarie. `ResponseAsync(restaurantId, …)` rilegge il ristorante senza tracking e costruisce la risposta prima del commit. Restituendo l’oggetto iniziale si potrebbe indicare consegna disattivata quando è già attiva. Copiare a mano ogni proprietà rischia di lasciare indietro il prossimo campo aggiunto. Una lettura ulteriore allinea la risposta ai valori salvati. [OnlineSettingsService.cs](../../../backend/TavoloFlow.Api/Online/OnlineSettingsService.cs) · [Tracking delle modifiche in EF Core](https://learn.microsoft.com/en-us/ef/core/change-tracking/) · [Aggiornamenti per insieme in EF Core](https://learn.microsoft.com/en-us/ef/core/saving/execute-insert-update-delete)

## Regole di dominio nello schema

La chiave primaria identifica stabilmente una riga. La chiave esterna richiede che il riferimento esista. Quella composta tra piatto e categoria include l’ID del ristorante e impedisce abbinamenti tra locali diversi anche quando entrambe le righe esistono. `client_request_id` è univoco per ristorante anche con scritture concorrenti. Gli indici ordinari velocizzano l’accesso, quelli univoci impongono anche il vincolo di unicità. Ogni indice occupa spazio e va mantenuto durante le scritture. [MenuItemConfiguration.cs](../../../backend/TavoloFlow.Api/Data/Configurations/MenuItemConfiguration.cs) · [OnlineRequestConfiguration.cs](../../../backend/TavoloFlow.Api/Data/Configurations/OnlineRequestConfiguration.cs)

Una migrazione descrive l’evoluzione di un database esistente. Modificare l’entità, generare la migrazione e applicarla sono tre azioni distinte. Se cambia il significato dei dati esistenti occorre anche stabilire come valorizzarli. La CI confronta modello EF e snapshot delle migrazioni. I test applicano le migrazioni reali a PostgreSQL temporaneo. In produzione le migrazioni vengono applicate esplicitamente, quindi riavviare l’API non modifica lo schema. [Migrations](../../../backend/TavoloFlow.Api/Data/Migrations/) · [Guida ai rilasci](../releasing.md)

## Esercizio e autoverifica

In `HistoryAsync` individua `Where`, `LongCountAsync`, `Take` e `ToArrayAsync`. Aggiungere un predicato comporta un viaggio in più? La composizione da sola non esegue SQL. Conteggio e lettura della pagina sono due punti di esecuzione. Immagina tre conti chiusi nello stesso istante. Se il limite della pagina li divide e il cursore usa solo «prima dell’ultima ora», gli altri conti in parità possono essere saltati.

**Autoverifica** — Aggiungere `AsNoTracking` risolve qualsiasi lentezza?

<details>
<summary>Mostra la risposta</summary>

Riduce il costo del tracking. Filtri mancanti, ordinamento inefficiente e troppe righe trasferite richiedono ancora un esame di SQL, indici e proiezione.

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Quando viene eseguita una query con Entity Framework Core?»** Spiega composizione, esecuzione e materializzazione.

*Con IQueryable descrivo la query per passi. Quando chiamo per esempio ToArrayAsync, il provider traduce l’espressione supportata in SQL e legge i risultati. Nello storico applichiamo prima i filtri del ristorante e del periodo. Se materializzassi subito tutta la tabella, i filtri successivi lavorerebbero in memoria e trasferirei molte più righe.*

**Approfondimento** — Quante esecuzioni avvengono se `LongCountAsync` e `ToArrayAsync` usano la stessa variabile query?

**«A cosa serve un indice e come verifichi che una query ne tragga vantaggio?»** Parti dalla modalità di accesso e spiega benefici, costi e verifica.

*Parto dai filtri e dall’ordinamento reali. Un indice coerente con questi criteri può ridurre le righe da esaminare, ma occupa spazio e va aggiornato a ogni scrittura interessata. Controllo il piano di esecuzione e provo con dati rappresentativi. Per lo storico considero anche il secondo campo di ordinamento, così la paginazione rimane deterministica a parità di data.*

**Approfondimento** — Una ricerca veloce garantisce ID di richiesta univoci? Distingui indice ordinario e univoco.

[Indice del corso](../learning-notes.md) · [Capitolo successivo](04-concurrency.md)
