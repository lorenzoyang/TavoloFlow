# Appunti di apprendimento

<!-- La tua comprensione delle tecnologie, sempre legata al codice di TavoloFlow.
Per ogni argomento puoi usare questo schema:
- Cos'è, con parole mie
- Dove lo uso in TavoloFlow (file e riga)
- Cosa ho capito / un esempio provato a mano
- Domande ancora aperte -->

## Backend

Allora, ASP.NET Core, ha un'architettura simile diciamo a Express, Koa e certi altri framework del mondo JavaScript che si basano sul concetto di pipeline, e ha un file sorgente denominato Programs.cs come entry point del programma, quest'ultimo viene usato come file di configurazione a codice concentrato per l'intero programma, quindi da questo punto di vista, e' abbastanza diverso dal framework come Spring Boot con codice di configurazione sparso per tutto il programma e tale codice di configurazione e' sotto forma di annotazioni.

Abbiamo quindi un pipeline di middleware, in cui arrivano via via le richieste HTTP, e questi middleware sono semplicemente dei componenti che costituiscono questo pipeline e hanno solo il compito di processare elaborare le richieste HTTP in entrata e in uscita, si' anche le risposte HTTP passano lo stesso pipeline di middleware, quando una richiesta passa da una componente, viene o processato elaborato e poi passata alla prossima componente o non viene proprio toccato e direttamente passato alla prossima componente, e ogni componente puo anche decidere di non passarla alla prossima quindi stopparla qui. Dopo una lunga pipeline di middleware, le richieste dopo quindi un lavoro di processazione dai middlware dell'intero pipeline, devono per forza finire in qualche parte, per essere effettivamente usate dopo il lavoro di processazione/elaborazione, questi posti dove finiscono sono proprio endpoint dove vivono i cosidetti controllers, che fungono da interfaccia tra le richieste/risposte HTTP e business logic del progetto. C'e' pero' un altro pipeline in realta', filters, per ogni endpoint, prima della loro esecuzione delle azioni in base alle richieste/risposte HTTP ricevute, possono collocare delle operazioni in comune in questo pipeline dei filtri, per esempio se ogni controller prima di eseguire deve fare un controllo, invece di scrivere questo controllo ovunque, puo' semplicemente collocare questo controllo nel pipeline dei filters in cui se le richieste HTTP superano questo controllo, allora le richieste HTTP arrivano effettivamente al metodo del controller, altrimenti vengono eseguiti codice di errore. lo stesso vale anche per post esecuzione del metododo del controller in considerazione, dove possiamo collocare la logica in comune dopo l'esecuzione del metodo del controller, nel pipeline dei filters.

Il 

### ASP.NET Core: pipeline e middleware

### Dependency injection

### Controller, filtri e gestione degli errori

### Autenticazione e autorizzazione

### Rate limiting e Data Protection

### EF Core: DbContext e mapping

### EF Core: migrazioni

### EF Core: tracking e transazioni

## Database

### SQL di base

### Transazioni e livelli di isolamento

### Lock di riga: FOR SHARE e FOR UPDATE

### Indici e paginazione keyset

## Test

### xUnit

### Test di integrazione: Testcontainers e WebApplicationFactory

### Test di concorrenza

## Frontend

### TypeScript

### React: componenti, stato e hook

### TanStack Router

### TanStack Query

### Tailwind CSS e shadcn/ui

## Web

### HTTP, cookie e same-origin

### CSRF

### PWA e service worker

## Infrastruttura

### Docker e Docker Compose

### Caddy e HTTPS
