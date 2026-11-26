# 7. TanStack Router e URL

Il titolare copia l’indirizzo di un conto su un altro dispositivo autenticato e autorizzato e si aspetta di ritrovare quel conto. Un cliente che sta scrivendo nome e telefono vuole tornare al menu e continuare più tardi. In entrambi i casi occorre conservare stato, ma cambiano durata e destinatari.

## Quanto deve durare lo stato e chi può vederlo?

| Stato | Dove risiede | Comportamento osservabile |
| --- | --- | --- |
| Ristorante del menu aperto | Parametro di percorso `/r/$slug` | Copiare, ricaricare o aprire direttamente il link individua il locale. |
| Conto selezionato nell’elenco | Parametro di ricerca `sessionId` | La selezione entra nella cronologia o nei preferiti. L’altro dispositivo deve poter accedere al conto. |
| Pannello carrello aperto sul telefono | Stato di una voce di cronologia con lo stesso URL | Indietro chiude prima il pannello. Copiando l’URL non si trasferisce l’azione di apertura. |
| Contatti in corso di compilazione | Stato locale del modulo. All’invio il protocollo di recupero salva l’intento confermato. | Si può continuare tra menu e checkout. Nome e telefono rimangono fuori dalla barra degli indirizzi. |
| Menu o dettagli del conto già letti | Cache di Query, con il record autorevole sul server | La pagina può mostrare la copia e rileggere secondo identità e strategia della query. |

L’URL è stato condiviso tra browser e utente. Codificarvi una scelta le dà significato alla ricarica, alla condivisione e nella cronologia, e richiede di considerare visibilità e validazione. `push` aggiunge una voce, `replace` sostituisce quella corrente, con effetti diversi sul tasto Indietro. Metadati temporanei possono stare nello stato della voce. Due voci possono avere lo stesso identico URL. [useHistorySheet.ts](../../../frontend/src/lib/useHistorySheet.ts) · [Parametri di ricerca](https://tanstack.com/router/v1/docs/framework/react/guide/search-params)

## Dall’URL a una pagina tipizzata

Segui tre passaggi in `staff.orders.tsx`. `createFileRoute("/staff/orders")` dichiara la corrispondenza. `validateSearch: billingSearch` riceve l’input a runtime, controlla il formato UUID di `sessionId` e per una selezione non valida restituisce `undefined`. `Route.useSearch()` espone il tipo validato e la pagina chiama `navigate({ search: { sessionId } })` per cambiare selezione. Link condiviso e interfaccia hanno così un’unica fonte. Un UUID ben formato richiede comunque controlli di esistenza e autorizzazione sul server. [staff.orders.tsx](../../../frontend/src/routes/staff.orders.tsx) · [state.ts](../../../frontend/src/features/billing/state.ts)

Il plugin genera `routeTree.gen.ts` a partire da `routes/` e `createRouter` usa l’albero per trovare le rotte. TypeScript può verificare segmenti, nomi dei parametri e parametri di ricerca dichiarati, rilevando errori nell’editor o in compilazione. Un URL digitato arriva a runtime e va ancora validato. `Link` rappresenta una destinazione cliccabile. `navigate` imperativo è utile per passare alla pagina di stato appena determinata da un’operazione riuscita. La build genera l’albero con Vite prima del controllo dei tipi. [router.tsx](../../../frontend/src/router.tsx) · [vite.config.ts](../../../frontend/vite.config.ts) · [Routing basato sui file](https://tanstack.com/router/v1/docs/framework/react/routing/file-based-routing)

<a id="nested"></a>

## Perché la rotta annidata mantiene il carrello

Il percorso `/r/demo-ramen/checkout` seleziona sia il menu padre sia il checkout figlio. Il padre carica il menu, crea `useOnlineCart` ed espone `OnlineCheckoutContext`. Il figlio si inserisce nell’`Outlet` e legge carrello e modulo dal provider. Entrando nel checkout il menu viene nascosto ma il padre rimane montato e conserva stato e nodi delle immagini. La posizione di scorrimento viene registrata per il ritorno. Tornando normalmente al menu il modulo sopravvive, mentre le righe escono dalla fase di conferma e i prezzi verranno ricontrollati al checkout successivo. [r.$slug.tsx](../../../frontend/src/routes/r.$slug.tsx) · [OnlineMenuPage.tsx](../../../frontend/src/features/online-order/OnlineMenuPage.tsx) · [r.$slug.checkout.tsx](../../../frontend/src/routes/r.$slug.checkout.tsx)

Prevedi cosa accade con tre modi diversi di navigare.

- **Indietro dal checkout.** La rotta figlia esce dall’albero, il menu padre mantiene la stessa istanza.
- **Ricarica completa.** JavaScript riparte e l’albero React precedente scompare. Da `sessionStorage` si possono ripristinare carrello e intento pendente di quel ristorante. Entrando direttamente nel checkout senza un carrello verificato si torna al menu per ricontrollarlo.
- **Cambio di slug del ristorante.** Il padre assegna `key={slug}` a `OnlineMenuPage`. Cambiando locale si ricrea il componente e si legge il carrello per il nuovo ID. [useOnlineCart.ts](../../../frontend/src/features/online-order/useOnlineCart.ts) · [OnlineCheckoutPage.tsx](../../../frontend/src/features/online-order/OnlineCheckoutPage.tsx)

## Come si dividono il lavoro Router e Query

Router traduce la posizione in pagina, parametri validati e gerarchia di componenti. Query organizza i dati asincroni con chiavi e osservatori. Selezionare un conto cambia l’URL e indica alla pagina quali dettagli osservare. Una modifica della cucina può invalidare le query interessate senza cambiare URL. Router offre i loader, ma il layout del personale usa `AuthBoundary` per osservare l’identità condivisa, così login, logout e credenziali scadute aggiornano insieme le pagine. Richiederla a parte in ogni loader introdurrebbe un’altra via di sincronizzazione. Il frontend sceglie cosa mostrare e l’API verifica i permessi su ogni operazione protetta. [AuthBoundary.tsx](../../../frontend/src/features/accounts/AuthBoundary.tsx) · [queries.ts](../../../frontend/src/features/accounts/queries.ts)

## Esercizio e autoverifica

Accetta un ordine online nella demo locale e selezionalo in Conto come titolare. Annota l’indirizzo, ricarica e modifica a mano `sessionId` in `hello`. `billingSearch` passa la selezione valida alla pagina e tratta il valore invalido come assente, evitando di usarlo come UUID per i dettagli. Alla larghezza di un telefono apri il pannello del carrello, entra nel checkout e torna indietro. Confronta indirizzo e UI. Il pannello cambia la cronologia mantenendo l’URL, mentre il checkout ha un percorso proprio.

**Autoverifica** — Copiando l’URL del menu su un altro dispositivo si recupera il telefono in corso di compilazione?

<details>
<summary>Mostra la risposta</summary>

Il link individua il ristorante. La bozza appartiene alla pagina originale e l’intento di recupero allo storage della scheda. Ognuno ha il proprio ambito.

</details>

<a id="interview"></a>

## Domande da colloquio in italiano

**«Quando metteresti uno stato nell’URL?»** Parti da ricarica, condivisione e Indietro, poi spiega la validazione a runtime.

*Metto nell’URL le scelte che devono sopravvivere a un aggiornamento della pagina o che ha senso condividere. Nella lista dei conti il parametro sessionId identifica la selezione. Lo valido all’ingresso perché chiunque può modificare l’indirizzo. I dati personali digitati nel checkout restano nel modulo. Anche con un identificativo valido, l’API controlla l’accesso del ristorante.*

**Approfondimento** — Come si può chiudere il pannello del carrello con Indietro senza creare un nuovo URL condivisibile?

**«Che vantaggio dà una rotta annidata nel checkout?»** Spiega corrispondenza padre-figlio, durata dei componenti e ricarica completa.

*Il menu rimane montato mentre la rotta figlia mostra il checkout nel suo outlet. Il componente padre possiede il carrello e lo passa tramite context. Tornando al menu ritrovo la stessa istanza e posso continuare a modificare l’ordine. Un ricaricamento completo ricrea l’albero React, quindi per recuperare una richiesta già inviata mi affido ai dati salvati nella scheda.*

**Approfondimento** — Perché cambiare appositamente la key del menu padre al cambio di ristorante?

[Indice del corso](../learning-notes.md) · [Capitolo successivo](08-runtime.md)
