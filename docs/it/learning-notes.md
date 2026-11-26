# Imparare lo sviluppo full stack seguendo un ordine

[中文](../zh-CN/learning-notes.md) · [English](../en/learning-notes.md)

Conosci già processi, richieste di rete e tabelle relazionali e per la prima volta affronti un progetto web completo. Un cliente preme «Invia» sul telefono. Poco dopo in cucina compare un piatto. Che cosa è successo nel frattempo? Disegna tre colonne per browser, API HTTP e PostgreSQL. Dopo ogni capitolo aggiungi un messaggio, un cambio di stato o una procedura di recupero.

L’originale del corso è in cinese. Gli esempi seguono TavoloFlow con ASP.NET Core 10, EF Core 10, PostgreSQL 18, React 19, TanStack Query v5 e Router v1. Le versioni precise sono nelle dipendenze e nel lockfile. Per provare il progetto avvia Demo Ramen con la [guida allo sviluppo locale](local-development.md). Segui la sezione sugli ordini online per abilitare il servizio e impostare una fascia oraria che comprenda l’ora attuale. Puoi anche ricostruire gli scenari su carta leggendo codice e test.

## Percorso di lettura

| Tappa | Capitolo | Che cosa dovresti saper fare a libro chiuso |
| --- | --- | --- |
| 1 | [HTTP e l’invio di un ordine](learning/01-http.md) | Disegnare i messaggi del primo invio, di un duplicato e di una risposta persa. |
| 2 | [ASP.NET Core e i livelli applicativi](learning/02-aspnet-core.md) | Collocare una nuova regola e spiegare chi crea le dipendenze. |
| 3 | [EF Core e database relazionali](learning/03-ef-core.md) | Ricavare la forma della query SQL e spiegare quando oggetto e riga possono divergere. |
| 4 | [Transazioni, concorrenza e idempotenza](learning/04-concurrency.md) | Ricostruire due richieste concorrenti e spiegare perché la protezione funziona. |
| 5 | [React e stato nel browser](learning/05-react.md) | Prevedere l’interfaccia dopo un render, un evento asincrono e un aggiornamento in background. |
| 6 | [TanStack Query e dati del server](learning/06-query.md) | Scegliere chiavi per account diversi e prevedere quando si vedrà la cache o partirà una GET. |
| 7 | [TanStack Router e URL](learning/07-router.md) | Decidere cosa inserire nell’URL e cosa sopravvive a ricarica, indietro e cambio di ristorante. |
| 8 | [Identità, test e ambienti di esecuzione](learning/08-runtime.md) | Individuare dove si autorizza un’operazione e il test che ne verifica il comportamento. |

Alla prima lettura, raggruppa i capitoli 1–2, 3–4, 5–7 e infine 8. Parti ogni volta da un caso riuscito, cambia una condizione e **scrivi la tua previsione prima di leggere il codice o avviare i test**. Nome e asserzioni di un test spesso orientano meglio di un costruttore. Per l’intero flusso cerca `AcceptedSession_UsesTheExistingKitchenPassAndBillPaths`. Segui accettazione, cucina e conto, poi torna all’invio del cliente. [OnlineStaffTests.cs](../../backend/TavoloFlow.Api.Tests/OnlineStaffTests.cs)

## Parti dalla domanda che ti interessa

| Domanda durante la lettura del codice | Da dove partire |
| --- | --- |
| Il controller gestisce HTTP e il servizio le regole di business? | [Le responsabilità in Submit](learning/02-aspnet-core.md#controller-service) |
| Perché rileggere il database dopo aver salvato le impostazioni di consegna? | [Tracking e aggiornamenti diretti](learning/03-ef-core.md#tracking) |
| Perché disabilitare il pulsante non basta con due dispositivi? | [Due invii con lo stesso ID](learning/04-concurrency.md#two-submissions) |
| Perché il nome che sto scrivendo sopravvive all’aggiornamento del menu? | [La bozza in modifica](learning/05-react.md#draft) |
| Perché tornando in cucina parte una richiesta se c’è già la cache? | [Ciclo di vita della cache](learning/06-query.md#cache) |
| Perché il carrello rimane quando esco dal checkout? | [Rotte annidate e durata del componente](learning/07-router.md#nested) |
| Perché un utente autenticato potrebbe non poter vedere un conto? | [Identità, permessi e appartenenza dei dati](learning/08-runtime.md#identity) |

## Ripasso per i colloqui in Italia

Gli esercizi sono pensati per posizioni junior .NET, React e full stack in Italia. Tra le competenze richieste dalle aziende figurano ASP.NET Web API, ORM, SQL, React, TypeScript e Git. Database, framework e modalità di colloquio variano. I requisiti orientano gli esercizi, ma il campione è troppo piccolo per stimare la frequenza delle domande. [Posizioni Blumatica](https://www.blumatica.it/azienda/lavora-con-noi/) · [Profili junior Trinaware](https://www.trinaware.it/azienda/lavora-con-noi)

| Argomento da esercitare a voce | Domande e risposte di esempio |
| --- | --- |
| Semantica HTTP e recupero dopo un timeout | [Capitolo 1](learning/01-http.md#interview) |
| Controller, servizi e dependency injection | [Capitolo 2](learning/02-aspnet-core.md#interview) |
| ORM, SQL e indici | [Capitolo 3](learning/03-ef-core.md#interview) |
| Concorrenza, idempotenza e transazioni | [Capitolo 4](learning/04-concurrency.md#interview) |
| Snapshot del render, effetti ed eventi | [Capitolo 5](learning/05-react.md#interview) |
| Stato del server e coerenza della cache | [Capitolo 6](learning/06-query.md#interview) |
| Stato nell’URL e rotte annidate | [Capitolo 7](learning/07-router.md#interview) |
| Autenticazione, autorizzazione e test di integrazione | [Capitolo 8](learning/08-runtime.md#interview) |

**Prova una simulazione a libro chiuso.** *Il cliente preme due volte “Ordina” e la prima risposta va persa. Come eviti di creare due ordini?* Rispondi in un minuto e disegna due POST e una GET di recupero. Hai citato l’ID originale, l’unicità nel database, la notifica dopo il commit e il significato di una prima GET senza risultato? Quando il cliente vede «ricevuto», l’ordine è già in cucina? [Contratto di invio e accettazione](../reference/online-ordering.md)
