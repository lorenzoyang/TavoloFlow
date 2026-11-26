# 5. React e stato nel browser

Il titolare sta cambiando il nome di un piatto, passa a un’altra scheda per guardare una foto e torna. Intanto il menu si è aggiornato. Quale nome deve restare nel campo? Entrano in gioco dati del server, bozza e modo in cui React riconosce lo stesso modulo.

## Dall’interfaccia dichiarativa al commit

Un componente descrive l’interfaccia a partire da props e stato. Il montaggio iniziale o un aggiornamento di stato può **innescare** il lavoro. Durante il **render** React chiama i componenti e calcola il nuovo albero. Al **commit** applica al DOM le modifiche necessarie. Deve poter ripetere il render senza conseguenze esterne. Inviare un ordine durante il render trasformerebbe un calcolo in un acquisto. Un nuovo render può lasciare intatta gran parte del DOM. [Render e commit in React](https://react.dev/learn/render-and-commit)

Sotto lo stesso genitore, tipo, posizione e `key` aiutano React ad associare i componenti tra due alberi e decidere se conservarne lo stato. Con chiavi basate sulla posizione, un riordino può lasciare il vecchio input accanto a un altro piatto. Usare l’ID del piatto lega i due elementi. Cambiare volutamente la key del modulo può invece azzerare i campi passando a un altro elemento. [Conservare e reimpostare lo stato](https://react.dev/learn/preserving-and-resetting-state) · [MenuEditorSheet.tsx](../../../frontend/src/features/menu/MenuEditorSheet.tsx)

## Snapshot, closure ed eventi asincroni

Ogni render riceve uno snapshot dello stato. Il gestore è una funzione creata in quel render. Grazie alla closure JavaScript mantiene accesso ai binding locali presenti alla creazione. Supponi che `quantity` valga 1 in questo render e prevedi il risultato.

```tsx
function addTwo() {
  setQuantity(quantity + 1)
  setQuantity(quantity + 1)
}
```

Entrambe le chiamate passano 2, quindi il valore successivo è 2. Per incrementare due volte il risultato precedente nella coda, passa due volte `setQuantity(q => q + 1)` e otterrai 3. Un `await` sospende il seguito della funzione asincrona. Nel frattempo possono esserci altri eventi e render, ma alla ripresa la vecchia closure conserva lo stato catturato. Anche mutare direttamente un oggetto compromette lo snapshot precedente. Le regole pure del carrello restituiscono un nuovo stato e l’hook gestisce render e salvataggio. [Lo stato come snapshot](https://react.dev/learn/state-as-a-snapshot) · [Accodare aggiornamenti di stato](https://react.dev/learn/queueing-a-series-of-state-updates) · [state.ts](../../../frontend/src/features/orders/state.ts)

| Cosa conservare | Dove e perché | Esempio nel progetto |
| --- | --- | --- |
| Un valore locale subito visibile all’utente | Stato. Per più componenti che lo modificano, usa il genitore comune. I dati scendono e gli eventi risalgono. | Asporto o consegna, campi del checkout. |
| Un valore ricavabile dagli input attuali | Calcolalo al render. Una seconda copia richiederebbe sincronizzazione. Misura i calcoli costosi prima di memorizzarne il risultato. | Totale da righe, sconto e fascia di consegna. |
| Ultimo valore per un callback o identificatore di timer | Un ref mantiene l’identità tra render. Cambiare `current` da solo non aggiorna la UI. | `useOnlineCart` legge l’intento pendente attuale durante il recupero asincrono. |
| Un modello per più discendenti | Sposta la proprietà nel genitore e distribuisci il valore con props o Context. È il provider a fornirlo. | Il menu padre passa il suo carrello al checkout. |
| Dati necessari dopo la ricarica | Scegli archivio, ambito d’identità e controlli al ripristino. | La scheda conserva carrello e intento pendente per ristorante. |

Un hook personalizzato incapsula un comportamento con un ciclo di vita. Se menu e checkout chiamassero entrambi `useOnlineCart`, ognuno avrebbe stato, timer e tracciamento propri. Chiamarlo una volta nel genitore e passarne il risultato condivide davvero la stessa istanza. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts) · [checkout-context.ts](../../../frontend/src/features/online-order/checkout-context.ts)

<a id="draft"></a>

## Aggiornamento in background durante una modifica

All’apertura di un piatto l’editor conserva il record selezionato come valore iniziale. I campi nome usano `defaultValue` e da quel momento il DOM mantiene il testo digitato. React gestisce interazioni come allergeni e opzioni. Quando la query in background restituisce un nuovo menu, il modulo mantiene la propria identità. Valori iniziali e testo digitato hanno durate distinte. La foto può mostrare l’ultimo dato del server mentre il nome rimane in bozza. Si accetta una bozza temporaneamente datata e il server controlla le regole al salvataggio. Un effetto che reimpostasse il modulo a ogni modifica del menu cancellerebbe il lavoro anche dopo un semplice ritorno alla scheda. [MenuPage.tsx](../../../frontend/src/features/menu/MenuPage.tsx) · [MenuForms.tsx](../../../frontend/src/features/menu/MenuForms.tsx)

## Effetti, eventi e TypeScript essenziale

«Il cliente ha premuto Invia» identifica un evento che giustifica la POST. «Finché una richiesta è pendente, controllane lo stato esterno» si presta a un effetto. L’effetto di recupero di `useOnlineCart` pianifica GET e rimuove i timer quando cambia l’ID o il componente viene smontato. Le dipendenze indicano i valori reattivi letti durante la sincronizzazione. Ometterne una può lasciare valori obsoleti, omettere la pulizia può duplicare i timer. Il livello HTTP riceve un `AbortSignal` e il callback verifica comunque che l’operazione sia ancora attuale prima di aggiornare la schermata. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts) · [operations.ts](../../../frontend/src/lib/operations.ts) · [Sincronizzare con gli effetti](https://react.dev/learn/synchronizing-with-effects)

`MenuEditor` è un’unione discriminata tramite `kind`. Dopo `editor.kind === "item-order"` TypeScript sa che quel ramo contiene `snapshot` e può rilevare accessi errati in compilazione. Valori da URL, HTTP e storage richiedono controlli a runtime. `restoreOnlineCart` verifica ristorante, formato e coerenza tra intento pendente e righe. Un’asserzione come `as OnlineCart` non esegue questi controlli. [MenuEditorSheet.tsx](../../../frontend/src/features/menu/MenuEditorSheet.tsx) · [state.ts](../../../frontend/src/features/online-order/state.ts)

## Esercizio e autoverifica

Nella demo locale apri un piatto come titolare, modifica il nome e lascia aperto il modulo. Cambia scheda e torna. Osserva la rilettura del menu in Network e controlla il campo. La bozza rimane. Scarta la modifica, chiudi e riapri per ritrovare il nome salvato. Cerca nel codice `defaultValue` e la key di `ItemForm`.

**Autoverifica** — Cosa accade conservando soltanto in un ref lo stato «invio in corso»?

<details>
<summary>Mostra la risposta</summary>

Il codice può consultare il ref per sapere se c’è un’operazione, ma modificarlo da solo non ridisegna il pulsante. Un indicatore visibile richiede un aggiornamento che inneschi un render.

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Perché subito dopo setState leggo ancora il valore precedente?»** Spiega snapshot del render e coda degli aggiornamenti.

*Il gestore dell’evento appartiene a un render preciso e vede i valori di quel render. Il setter accoda un aggiornamento che React userà per il render successivo. Se il nuovo valore dipende dal precedente, uso la forma funzionale del setter. Quando invece mi serve conservare un riferimento senza aggiornare l’interfaccia, per esempio l’identità di un’operazione, posso usare un ref.*

**Approfondimento** — Inserire `await` in un gestore aggiorna automaticamente lo stato catturato?

**«Quando useresti un effetto e quando un gestore di eventi?»** Confronta l’invio con il recupero.

*Invio l’ordine nel gestore della conferma, perché la causa è una scelta esplicita del cliente. Uso invece un effetto per mantenere sincronizzata la pagina con un sistema esterno: finché esiste una richiesta in sospeso, avvio un controllo periodico in lettura. Quando cambia la richiesta o esco dalla pagina, elimino il timer. Così un nuovo render non equivale a un nuovo acquisto.*

**Approfondimento** — Serve un effetto per copiare il nuovo totale da pagare in uno stato separato?

[Indice del corso](../learning-notes.md) · [Capitolo successivo](06-query.md)
