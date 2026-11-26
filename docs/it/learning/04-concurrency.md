# 4. Transazioni, concorrenza e idempotenza

Due membri del personale, su tablet diversi, vedono «in attesa». Entrambi hanno letto dati corretti, ma può valere una sola decisione. Prima di scegliere la protezione, scrivi l’**invariante di dominio**: una richiesta può produrre al massimo un esito di accettazione.

## Scegliere il meccanismo in base ai tempi

| Meccanismo | Garanzia | Limite |
| --- | --- | --- |
| Transazione | Le scritture vengono confermate o annullate insieme. L’isolamento regola cosa vedono le altre connessioni. | Due transazioni che leggono prima di scrivere possono leggere entrambe lo stato precedente. |
| Vincolo univoco | Il database impone l’unicità anche tra istanze applicative diverse. | Occorre decidere se al duplicato restituire l’esito precedente o un conflitto. |
| Lock di riga o advisory lock di transazione | Gli scrittori che seguono il protocollo attendono la risorsa e possono ricontrollarne lo stato. | Chi è in conflitto attende. Ordini di acquisizione diversi possono causare deadlock. |
| Versione applicativa | Verifica se lo stato coincide con quello confermato dall’utente. | L’utente può impiegare minuti a decidere. Verifica e scrittura devono comunque essere atomiche all’invio. |
| Chiave di idempotenza | Collega più invii dello stesso intento e permette di recuperare l’esito originale. | Due acquisti distinti richiedono chiavi diverse anche con piatti identici. |

Ricollega ACID al ristorante. Sessione e ordine creati insieme illustrano l’atomicità. Vincoli e servizi tutelano la coerenza. Le transazioni operano su versioni visibili secondo l’isolamento. Le richieste successive leggono i dati confermati, con garanzie di durabilità legate alla configurazione del database. PostgreSQL usa MVCC per fornire alle letture una versione dei dati. In Read Committed, livello predefinito, ogni SELECT ordinaria vede lo snapshot confermato all’inizio dell’istruzione. Repeatable Read mantiene stabile lo snapshot delle letture nella transazione. Per scritture concorrenti si scelgono aggiornamenti condizionali, lock o gestione del conflitto in base all’invariante. [Isolamento delle transazioni in PostgreSQL](https://www.postgresql.org/docs/18/transaction-iso.html) · [Lock espliciti in PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html)

<a id="two-submissions"></a>

## Due invii del cliente portano entrambi A

1. Le richieste X e Y possono entrambe non trovare A fuori dalla transazione. La lettura veloce permette di restituire a basso costo un risultato esistente. L’assenza osservata non basta per creare una riga.
2. X prende il lock condiviso sulla riga del ristorante, poi il lock di transazione sugli invii di quel ristorante e assegna il numero giornaliero. Sotto lock cerca di nuovo A, verifica limiti di attesa, menu, preventivo e sconto, scrive il record e conferma.
3. Se Y arriva alla transazione, X ha terminato quando Y ottiene lo stesso lock. Y assegna un numero, ricontrolla A, trova il record e annulla il proprio incremento del contatore prima di restituire il risultato originale. Se la lettura veloce aveva già trovato A, evita anche l’attesa.
4. Solo il primo commit riuscito accoda una notifica push. Una richiesta annullata non la genera. Rimane un intervallo tra commit e accodamento. La notifica è best effort e l’elenco persistente delle richieste in attesa fa fede.

Perché aggiungere un lock per ristorante all’indice univoco? I limiti di attesa per browser e IP riguardano **ID di richiesta diversi** e possono attraversare la mezzanotte locale. Il contatore giornaliero serializza gli aggiornamenti di una sola giornata e non copre un controllo tra due giorni. Gli invii dello stesso locale attendono brevemente, quindi la verifica esterna precede la sezione critica. [OnlineRequestService.cs](../../../backend/TavoloFlow.Api/Online/OnlineRequestService.cs) · [OnlineRequestConfiguration.cs](../../../backend/TavoloFlow.Api/Data/Configurations/OnlineRequestConfiguration.cs)

## Un operatore accetta mentre l’altro rifiuta

Due intenti distinti agiscono **sullo stesso record esistente**. Entrambi possono vedere WAITING: la fase si ricava da accettazione, rifiuto e scadenza. X ottiene `FOR UPDATE` sulla richiesta, ricontrolla la fase, crea sessione, ordine e righe e conferma. Quando Y ottiene il lock legge la nuova fase e riceve un conflitto. Se arriva prima Y, vale il rifiuto. Un ordine di acquisizione coerente riduce le attese circolari. I lock gestiti dal database funzionano anche tra processi diversi. [OnlineRequestState.cs](../../../backend/TavoloFlow.Api/Online/OnlineRequestState.cs) · [OnlineStaffService.cs](../../../backend/TavoloFlow.Api/Online/OnlineStaffService.cs) · [RowLocks.cs](../../../backend/TavoloFlow.Api/Data/RowLocks.cs) · [OnlineStaffTests.cs](../../../backend/TavoloFlow.Api.Tests/OnlineStaffTests.cs)

## Il cliente chiede il conto mentre la cucina annulla un piatto

Il titolare conferma versione V e 1400 centesimi. La cucina annulla un piatto e nella stessa transazione cambiano importo e versione. Quando arriva la vecchia conferma, il servizio blocca la sessione, rilegge il conto e verifica `expectedBillVersion` e importo. Con `BILL_CHANGED` l’interfaccia può mostrare il nuovo conto e richiedere conferma. Una ripetizione identica a una chiusura già riuscita può restituirne il risultato salvato. Il lock copre i millisecondi sul server, la versione i secondi o minuti che il titolare trascorre leggendo. [BillingService.cs](../../../backend/TavoloFlow.Api/Billing/BillingService.cs) · [BillingTests.cs](../../../backend/TavoloFlow.Api.Tests/BillingTests.cs)

## Esercizio e autoverifica

Dalla radice del repository esegui il comando seguente con .NET SDK e Docker disponibili. La fixture crea un PostgreSQL temporaneo e applica le migrazioni.

```bash
dotnet test TavoloFlow.slnx --filter 'FullyQualifiedName~Submit_ConcurrentRepeats_StoreOneRequest|FullyQualifiedName~AcceptAndReject_Racing_ExactlyOneWins|FullyQualifiedName~Checkout_ConfirmationAndRepeatedRequests_ClosesExactlyOnceWithoutChangingVersion'
```

Prevedi tre esiti. Ad A corrisponde una sola richiesta. Riesce soltanto una tra accettazione e rifiuto. Ripetere la chiusura conserva il primo risultato. Individua le asserzioni sulle risposte e quelle sullo stato persistito.

**Autoverifica** — Cosa accadrebbe spostando il controllo del limite fuori dal lock e lasciando solo l’indice univoco sulla richiesta?

<details>
<summary>Mostra la risposta</summary>

Due ID diversi potrebbero vedere entrambi l’ultimo posto libero e inserire due righe. L’indice univoco sarebbe comunque rispettato.

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Perché una transazione da sola può non bastare contro una race condition?»** Descrivi l’ordine delle letture, poi come rendere seriale la decisione finale.

*Due transazioni possono leggere entrambe una richiesta ancora in attesa e prendere decisioni incompatibili. Nel nostro flusso blocchiamo la riga della richiesta prima di decidere. Quando il secondo operatore ottiene il lock, rilegge lo stato e trova la decisione già presa. La transazione serve anche a salvare insieme la decisione, la sessione e le righe dell’ordine.*

**Approfondimento** — Perché non tenere il lock dall’apertura della pagina? Considera attese, disconnessioni e altri operatori.

**«Come rendi idempotente la creazione di un ordine?»** Parti dall’identità del singolo acquisto, poi spiega il recupero dopo una risposta persa.

*Il client genera una chiave per il singolo tentativo di acquisto e la conserva prima di inviare il POST. Il server cerca la chiave nel ristorante corretto e, se la trova, restituisce il risultato salvato. Un vincolo univoco protegge i dati e un controllo nella transazione gestisce gli arrivi simultanei. In caso di risposta persa il client può iniziare con una lettura.*

**Approfondimento** — Perché non usare un hash dei piatti? Lo stesso cliente può davvero voler acquistare un’altra porzione.

[Indice del corso](../learning-notes.md) · [Capitolo successivo](05-react.md)
