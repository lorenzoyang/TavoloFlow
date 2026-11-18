**English** · [Italiano](../it/development-notes.md) · [中文](../zh-CN/development-notes.md)

# Development notes

In these notes I tell how TavoloFlow was born and how it is built: why I developed it, what it does and doesn't do, which technologies I chose, how the architecture is organized, which design decisions I made and which limits I see today. I developed it mainly with AI agents such as Claude Code and Codex: I took part more in the design and in the decisions about the project's direction than in writing the code and in the implementation details.

It is my first full-stack web project. I started it after years of studying computer science, when I realized I had never built a real web app, and decided to make one. That decision, though, came right in the middle of the AI era: on one side I saw AI generate seemingly perfect code from a simple prompt, on the other I had in front of me the study of several frameworks, in huge dedicated books or in the official documentation. The ending was predictable: I decided to use AI to develop this project.

Thinking about it now, I don't think it was a problem. I already had the theoretical foundations from my studies, and the best way to learn to build a project and to use frameworks is precisely to build a real one: to discover the difficulties yourself and ask yourself (or the AI): "instead of doing this by hand, why can't I have something that does it for me?". That is how frameworks are born: to meet real needs. They are designed and built a certain way because they solve a set of problems that people used to run into often, and if you understand the needs and the difficulties they remove, you understand the framework much more easily and quickly. After all, they are products made of code too: only, instead of the business logic of an e-commerce site or a management system, their "business logic" solves problems that come up often when developing a certain kind of software.

So I had three roads in front of me. The first was to watch a tutorial and, together with an LLM chat, get a complete overview of what I was about to do, and then pick up the pieces I needed right away by reading the relevant parts of the documentation or of a dedicated book. The second was to dive into an existing open-source project similar to what I wanted to build, read its code while asking the AI questions, and study the corresponding parts in the documentation or in books, as in the first road. But then I asked myself: why not build a project of my own together with the AI, and then study my own project? A project developed with the help of AI doesn't have worse code than the projects you find at random on GitHub. Why not do it that way? That is where the third road came from, the one I chose.

At this point it is clear why I am starting to write these notes: input is not enough, I also have to produce some output. I have to get my hands dirty to consolidate memory and strengthen the neural connections, and so learn better and more deeply. And also to leave in this project something more my own, which sets it apart from a project generated entirely by AI.

## Why this project

At first I just wanted to build a full-stack project: a web app to publish online, on a server, with its own database and accessible to everyone, something I had never done before. I only had experience with serverless services such as Vercel and Cloudflare. But since I had to build a project anyway, why not make a genuinely useful one, maybe one that could earn me a bit of money?

That is how I got the idea of an ordering system based on scanning a QR code. From a first, not very thorough, survey it seemed a great idea, with a good market at least among Chinese restaurants, where few offered this service to their customers. At first I thought those few used a service provided by the point-of-sale companies, already built into their products.

Only after the release did I discover that the restaurants that didn't offer QR ordering to their customers either didn't need it, or didn't know a possible supplier: and that is where I came in. But the web app I built doesn't support printing kitchen tickets: when an order arrives, it can't print it on a connected printer. I didn't build it both because of the complexity, since I knew that sooner or later I would have to go back and read the code, and because the printers compatible with how the app works are expensive. They are cloud printers (for example those with Star CloudPRNT or Epson Server Direct Print) with a built-in system that periodically asks my server whether there are new orders; when there are, the server returns them in a format the printer can print. Without a printer to try it on, I wasn't sure I could build this feature, so for now the app doesn't offer it, even though almost every restaurant I visited needed it.

Then, as if that weren't enough, after discovering that practically all potential customers needed to print orders, I made another discovery: the restaurants that already offered QR ordering didn't use, as I had first thought, a feature built into the point-of-sale system, but relied on a Chinese SaaS company. Given all this, I decided to make it open source, so that it can be useful to others too, but without switching it off: I still offer it as a hosted service at [qiaotavoloflow.it](https://qiaotavoloflow.it) to restaurants that don't want to deal with a server.

## What it does

TavoloFlow is a QR-code table ordering system that also takes online orders. Every table has a fixed QR code: the guest scans it with their phone, orders from the menu and the order arrives in the kitchen. Customers who aren't at the restaurant order from its online link instead, to collect in store or, if the restaurant delivers, to receive at home; an online order reaches the kitchen only after the staff accept it. These are two separate services: the platform administrator turns them on for each restaurant, even just one of the two. Payment stays the same as always, at the till, at pickup or on delivery: the app only records that the bill has been paid. There are four kinds of users, and each has its own part of the app.

**Guest**, from their own phone, without installing anything and without signing up:

- scans the QR code and browses the menu in Chinese, Italian or English, with photos, allergens and sold-out dishes; a dish on sale shows its regular price struck through above the sale price;
- joins the table's visit opened by the staff, entering the table code (four characters) if the restaurant requires it;
- for dishes with options (size, sugar, toppings, spice level…) first chooses them in a panel: required choices are never preselected, and extras are added to the price;
- builds a cart, with a note for each dish, and sends the order; they can order several times during the meal;
- sees the orders of the whole table and the status of each dish: received, ready, cancelled;
- if the restaurant offers online ordering, also orders from home, from the restaurant's link (`/r/{link}`): same menu and same options, then "Checkout", where they choose pickup or delivery and enter name, phone and, for delivery, the address. For delivery they see the fees by distance and any minimum order; if the restaurant uses automatic quotes, they see the exact delivery fee as soon as they enter the address. Here they can also enter a coupon code from the restaurant: if it is valid, they see the discount on the dishes and the new total straight away. They can't choose a time: the order is made as soon as possible;
- follows the online order on a status page (`/o/{token}`): waiting for confirmation, accepted with the expected time, ready, collected or delivered. If the restaurant doesn't answer within 10 minutes, the order expires and the page puts the restaurant's phone first.

**Staff**, from a phone or tablet; the staff area can be installed as an app (PWA):

- **Floor** (only with QR dine-in, like Tables): sees the tables and their bills, opens a table when guests arrive and tells them the code; pauses or resumes new orders; closes without payment a table with no orders or with every dish cancelled;
- **Kitchen**: receives new orders with an alert sound, refreshed every 10 seconds; sees them in the Dishes (grouped by dish), Orders and Done views; each screen reopens the last choice between Dishes and Orders and, in the Dishes view, can show only some menu categories (for example a screen just for drinks); sees the options the guest chose under each dish; marks each dish as ready or cancels it; accepted online orders appear together with the tables' ones, as "Pickup #12" or "Delivery #12";
- **Pass**: on a tablet at the counter, shows the ready dishes to take to the tables; when a dish reaches the table, you tap "Served";
- **Menu**: marks a dish, or a single option (for example a topping that ran out), as sold out or available again;
- **Online orders**: accepts an order by choosing when it will be ready (for a delivery without a fee already calculated, after picking the band, looking at the route from the restaurant that opens by tapping the address) or rejects it, with an optional reason. While an order waits for acceptance, every staff page shows a banner at the top that rings. Here they also see the accepted orders not yet closed, with the customer's phone and address;
- in **Online ordering settings** pauses online orders, until the end of the slot or for the rest of the day;
- from Home turns on the **lock-screen notifications** of new online orders on each device;
- the interface is in Chinese, Italian or English, chosen per device; until someone chooses, it follows the browser language.

**Owner**: everything the staff does, plus:

- manages the menu: categories, dishes in three languages, prices, allergens, photos, and the option groups shared by dishes (size, sugar, toppings, spice level…), with extra prices, their own allergens and templates already translated into the three languages; a new group can also start as a copy of an existing one. A set menu is a dish with required groups (for example "choose a drink"), and their options can be taken from dishes, ticking several at once: names and allergens are copied only once, so if the dish changes later, the option stays as it was. Can put a dish on sale with a sale price, which applies both at the table and online, and end the sale by clearing the field;
- manages the tables and downloads their QR code and the printable table card;
- in the Bill section closes the visit after payment, and in Bill history browses closed bills;
- in Bill also closes online orders: "Collected, check payment" or "Delivered, check payment" after payment, or "Customer didn't come" or "Not delivered"; while the order is open they can correct the delivery fee;
- in **Online ordering settings** sets the public phone, the weekly hours (at most two slots a day) and delivery: the restaurant's location, up to five fee bands by road distance, an optional minimum order and a note in three languages; creates and deletes **coupons** for online orders: a percentage off the dishes (1 to 50%), valid until an optional last day, to share on Instagram, on flyers or in delivery bags;
- resets the staff account's password and sees the status of their own subscription.

**Platform administrator**, that is whoever offers the service to restaurants:

- creates a restaurant together with its two accounts (owner and staff), with temporary passwords; later can deactivate these accounts or reset their password;
- suspends or reactivates a restaurant, chooses its color theme, decides whether the table code is required, permanently deletes a suspended restaurant;
- for each restaurant turns on QR dine-in, online ordering or both, and sets the online link (`/r/…`);
- manages the owner's contact, the annual fee and the subscription periods, and records the payment of each period, received outside the app;
- their interface is also in Chinese, Italian or English, with the same per-device choice as the staff.

## What it doesn't do (and why)

- **Online payments.** Handling payments means fees, payment data security and refunds: too much for a first version.
- **Fiscal receipts.** TavoloFlow replaces neither the till nor the fiscal register: the receipt is still issued by the restaurant's point-of-sale system.
- **Printing kitchen tickets.** For the reasons explained above: it needs a compatible cloud printer, and I didn't have one to try it on.
- **Push notifications for kitchen, pass and bills.** These pages update by asking the server at regular intervals (polling). For a small restaurant it is enough, and much simpler. The only push notification is the one for new online orders, which must arrive even when the phone is locked (see "A PWA for staff").
- **Offline operation.** The app doesn't store pages or data on the device to use them without a network: orders and bills must always be up to date. If the connection drops, an already open page shows the latest data with a warning, but blocks operations (for example closing a bill) until a refresh succeeds; if a page is opened without a network, the staff area only shows a page saying so.
- **Personal accounts for every waiter.** Each restaurant has a single, shared staff account, plus the owner's. For a small restaurant that is enough, and there is no need to know who did what.
- **Delivery through external platforms.** Online orders exist, with pickup in store or delivery by the restaurant itself, but without platforms like Glovo or Deliveroo, without online payment and without a booked time: the customer pays at pickup or on delivery, and the delivery fee follows distance bands set by the owner (see "Delivery fee by distance"). A first version of takeaway had been developed and then removed, to keep the first version simple; today's one was redesigned from scratch.
- **Loyalty programmes and per-customer discounts.** Coupon codes are shared: anyone who knows the code can use it, as often as they like. Without customer accounts there is no way to say "once each" or "first order only" (the phone is not verified, and it is deleted after 30 days). At the table there are no codes: there the till gives the discount, as always.
- **Split bills and sales statistics.** Each visit has a single bill, and apart from the history of closed bills there are no reports.
- **All you can eat.** No ordering rounds or per-person limits: the restaurants I had in mind (ramen, Chinese food, bubble tea) work à la carte.

## Choosing the tech stack

At first, actually, I built a prototype of this idea with TypeScript, Hono and a React SPA, all on Cloudflare, without a database of my own but with the one Cloudflare offers (D1), under the illusion of keeping maintenance costs to a minimum. With a detailed prompt I had the AI generate the project, but the result was completely incomprehensible to me. Never having built a project, I didn't know the problems and difficulties you run into, and so I didn't know which problems all the tools, libraries and frameworks the AI had introduced were solving. I immediately had a cognitive overload and gave up; I only used it to get an overview of what my project was supposed to become.

So I moved to something more stable. Thinking about stability and about value on the job market, Java and C# came to mind. I know both, but C# is more expressive and has a more uniform ecosystem, a lower barrier to entry and a more "batteries-included" framework. In the end I chose C# with .NET, so ASP.NET Core as the web framework for the backend and EF Core as the ORM, with Npgsql as the PostgreSQL provider. "Batteries-included" really shows here: cookie authentication, policy-based authorization, data protection (Data Protection, used among other things to protect cookies and encrypt each visit's code), and dependency injection are all built into the framework, and the backend uses no external library for these things. For rate limiting I instead use `Common/FixedWindowLimiter`, the project’s own in-memory implementation, without ASP.NET Core’s rate limiting middleware. Besides Npgsql there are two third-party libraries: SkiaSharp, to resize and convert dish photos, and Lib.Net.Http.WebPush, which signs and encrypts push notifications (see "A PWA for staff"). EF Core offers no API for row locks (`SELECT ... FOR UPDATE`), so in those places I use hand-written SQL. For tests I use xUnit: in integration classes with `PostgreSqlFixture`, Testcontainers starts a throwaway PostgreSQL in Docker. HTTP tests use `WebApplicationFactory` to start the API in memory and send it requests as a browser would; data-layer tests use the `DbContext` directly. There are also pure tests without a database. I format the C# code with CSharpier, the C# equivalent of Prettier.

For the database I chose PostgreSQL simply because it is the most used open-source database, and also one of the most powerful.

For the frontend, having just finished studying the basics of React, I chose React, which is also a great fit for this web app: it is essentially an SPA, and the staff area also works as a PWA. The rest of the stack:

- **TypeScript**, to have types on the frontend too and find errors at build time;
- **Vite**, for the development server and the build;
- **TanStack Router**, for routes defined as files, with typed parameters and query strings: a link to a page that doesn't exist, or with a wrong parameter, doesn't compile;
- **TanStack Query**, for data coming from the server: it keeps the cache, handles the polling of the kitchen and the bills, and reloads data after every change;
- **Tailwind CSS** and **shadcn/ui** (on Base UI), for styling and components: shadcn copies the components into the project instead of installing them as a library, so they can be changed freely;
- **qrcode**, to generate the table QR codes directly in the browser;
- **Oxlint** and **Prettier**, for linting and formatting, and Node's built-in test runner to test the pure logic without installing a test framework.

For deployment I use **Docker Compose** on a VPS, with **Caddy** as the reverse proxy, which obtains the HTTPS certificate by itself. Database migrations don't run when the API starts: at each release I apply them explicitly with an EF Core migrations bundle. All the steps are in the [self-hosting](self-hosting.md) guide.

## Architecture

In this section I describe how TavoloFlow is built: what the pieces are, where each one's code lives and how data moves from one part to another. The reasons behind the most important choices (locks, versions, idempotency, polling…) are in the next section, "Design decisions".

### Overview

```mermaid
flowchart LR
  G["Table guest<br>/q/{token}"] --> C
  O["Online customer<br>/r/{slug}, /o/{token}"] --> C
  S["Staff and owner<br>/staff/*"] --> C
  P["Administrator<br>/platform/*"] --> C
  C["Caddy<br>HTTPS and SPA files"] -->|"/api/*"| A["ASP.NET Core API"]
  A --> D[("PostgreSQL")]
  A --> K["Data Protection keys<br>(folder on disk)"]
  A -.->|"push notifications"| N["Push services<br>Apple, Google, Mozilla, Microsoft"]
```

Everything goes through a single address. The browser only talks to Caddy, which does two things:

- it returns the static files of the SPA, that is those produced by `vite build`: an almost empty `index.html` plus the JavaScript and CSS files in `assets/`. The browser downloads them and runs React, which builds the page directly on the device: this is so-called client-side rendering (CSR);
- it forwards to the API (ASP.NET Core's web server, Kestrel) every request starting with `/api`.

In development this role is played by the Vite proxy, which sends `/api` to `http://localhost:5093`. Frontend and API are therefore on the same origin (same scheme, domain and port): cookies don't have to travel from one domain to another and there is no CORS to configure.

A minimal explanation of CORS: it is a browser rule. When a page's JavaScript makes a request, the browser compares the page's origin (where it loaded `index.html` from, for example `https://app.example.com`) with the origin of the URL being called. If they are the same, as here (`https://app.example.com/api/...`), the request is "same-origin" and CORS doesn't come into play. That Caddy then forwards the request to the API inside the server, the browser doesn't even know. If instead the API lived on another domain, for example `api.example.com`, the server would have to answer with specific headers (`Access-Control-Allow-Origin` and others), otherwise the browser would block the response, and cookies would also be harder to handle.

A few points to keep in mind:

- **One API process, three kinds of users.** The same ASP.NET Core application serves guests (at the table and online), staff and administrators. Each has its own cookie, and the backend understands which one to use by looking at the request URL's path, that is the part after the domain, for example `/api/public/orders` (see "Three identities" below).
- **Three containers in production:** `db` (PostgreSQL), `api` and `caddy`. Only Caddy exposes ports to the outside (80 and 443): the database and the API can only be reached from Docker's internal network.
- **One call to the outside.** The API depends on no external service, with one exception: the push notifications of new online orders, which go from the API to Apple's, Google's, Mozilla's or Microsoft's push services. If they don't arrive, the app works anyway.
- **The Data Protection keys** live in a persistent folder. Data Protection is ASP.NET Core's system for encrypting and signing data, and these are its secret keys. The login cookie, in fact, doesn't point to a session stored on the server: it directly contains the account's "ticket" (see "Three identities"), encrypted and signed with these keys, so the browser can neither read it nor forge it. The same keys also protect the CSRF tokens (explained in "Cookies, CSRF and same-origin") and the table codes stored in the database. If the keys lived only inside the container, they would be lost at every new release: everyone would have to sign in again and the codes of open visits could no longer be read. That is why the folder is set in `DataProtection:KeyRingPath` and lives on a persistent volume.

### Data model

The database has twenty tables. The complete schema is in [`er-diagram.dbml`](../reference/er-diagram.dbml), and there is also an [image](../reference/er-diagram.png). Grouped by topic:

| Group               | Tables                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts            | `platform_users` (administrators), `restaurant_users` (one owner and one staff account per restaurant)                                                                                                                                                                                |
| Restaurant and menu | `restaurants`, `menu_categories`, `menu_items`, `menu_item_images` (the photo bytes, kept apart so menu reads don't load them), `menu_option_groups` and `menu_options` (the options shared by dishes), `menu_item_option_groups` (which dishes use which group), `restaurant_tables` |
| Service             | `dining_sessions`, `orders`, `order_items`                                                                                                                                                                                                                                            |
| Online orders       | `online_hours` (the weekly hours), `online_counters` (the last order number of each day), `online_requests` (customers' orders, to be accepted), `online_coupons` (the coupon codes), `delivery_tiers` (the delivery fee bands)                                                                                                                                       |
| Notifications       | `push_subscriptions` (the devices that receive lock-screen notifications)                                                                                                                                                                                                             |
| Subscription        | `restaurant_subscription_periods`                                                                                                                                                                                                                                                     |

The central concept is the **visit** (`DiningSession`, table `dining_sessions`). When guests arrive, the staff opens the table from Floor and an `ACTIVE` visit is born, with its own (encrypted) table code and a bill version number, `bill_version`. Guests have no accounts: to the system, a guest is just "a browser that joined this visit".

With online ordering the visit also has a **channel** (`channel`): `DINE_IN` for the table, `PICKUP` and `DELIVERY` for online orders to collect or to deliver. An online visit is born only when the staff accept the order, has neither table nor code, has a single order and, for a delivery, also the delivery fee (`delivery_fee_cents`). Before acceptance the customer's order is only a row of `online_requests` (see "Online orders: a request to accept"); if the customer accepted an automatic quote, the row also keeps fee and distance (`delivery_fee_cents`, `delivery_distance_meters`), and acceptance carries that fee into the visit.

Each order belongs to a visit and has one or more lines (`order_items`), one per dish, with the quantity and an optional note. Each line has its own status: it is born `NEW`, then the kitchen moves it to `READY` or `CANCELLED`; when the dish reaches the table, the Pass fills in `served_at`. The order also has a summary status: `NEW` while at least one line is `NEW`, then `PROCESSED` (that is the difference between the Kitchen's Orders and Done views).

When the visit closes (after payment, or without payment if there were no orders or they were all cancelled), it becomes `CLOSED` and stores the reason (`PAID`, `EMPTY` or `VOIDED`; for online orders also `NO_SHOW`, when the customer doesn't collect or the delivery fails), the total and the closing time. A closed visit never reopens: the next guests get a new visit.

The frontend makes things more convenient, but guarantees nothing. Some rules, moreover, aren't checked only by the C# code: the database guarantees them directly, so they stay true even if one day the code had a bug.

| Rule                                      | How PostgreSQL guarantees it                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A table has at most one open visit        | partial unique index `uq_active_session_per_table` on `table_id`, only for rows with `status = 'ACTIVE'`                                                                                                                                                                                 |
| A guest request creates at most one order | unique index `uq_order_one_per_request` on `(dining_session_id, client_request_id)`; for online orders `uq_online_request_client_request` on `(restaurant_id, client_request_id)`                                                                                                        |
| Data of different restaurants never mixes | every business table has `restaurant_id` (except `menu_item_images`, which reaches the restaurant through its dish) and the foreign keys are composite, `(id, restaurant_id)`: an order can only point to a visit of the same restaurant, a line only to an order of the same restaurant |
| Status and fields are always consistent   | check constraints such as `ck_session_lifecycle`: an `ACTIVE` visit has the encrypted code and no closing data, a `CLOSED` one has time, reason and total, and the code is cleared; `ck_order_item_lifecycle` does the same for lines                                                    |
| The channel decides the fields            | `ck_session_dine_in` and `ck_session_online`: a table visit always has the table's name (and, while open, the table and the code), an online visit never has a table or a code; `ck_session_delivery_fee`: the delivery fee is always there on deliveries and never on other channels    |
| Delivery has a starting point             | `ck_restaurant_delivery_ready`: with delivery on, the restaurant always has its coordinates; that there is at least one band is checked when the settings are saved, because bands live in another table |
| Only allowed values                       | enums are stored as uppercase text (`ACTIVE`, `READY`…) and a check constraint lists the valid values                                                                                                                                                                                    |

Order history, on the other hand, is not protected by the database. Each line stores a copy (snapshot) of the dish's name, price and allergens: if the dish later changes price, the line stays as it was. The same goes for the chosen options: the line saves them in `options_snapshot` (a jsonb column), with the group and option names and the extra price. The line's unit price already includes the extras (and starts from the sale price if the dish was on sale), so the bill is always unit price × quantity, and the saved allergens are the dish's plus those of the chosen options. An online request also saves its dishes as a copy, in the jsonb column `lines`; when the staff accept it, a single function (`OrderLineSnapshot.ToOrderItem`) turns it into the order's lines. But PostgreSQL doesn't prevent a direct UPDATE of these copies or of closed bills: that they don't change is guaranteed by the services, which never modify them. Deleting a dish or a table also goes through a service, `CatalogDeletionService`: first it clears the reference (`menu_item_id` in the lines, `table_id` in closed visits), then it deletes, and the copy stays. Here the database only acts as a check: the foreign key doesn't allow deleting a dish or a table that is still referenced.

Other conventions:

- **Money in integer cents** (`long`, `*_cents` columns), never decimal numbers. The maximum is the largest integer JavaScript represents exactly (2⁵³ − 1, `InputRules.MaxSafeCents`), so the browser loses no precision.
- **Times in UTC** (`timestamptz`), shown in the restaurant's time zone (Europe/Rome). Only subscription periods and the day an online order belongs to (`business_date`) use plain dates (`date`).
- **snake_case names**, mapped by hand in `Data/Configurations/`, one class per entity.
- **One database for all restaurants** (multi-tenant): they all live in the same tables, separated by `restaurant_id`. Deleting a restaurant removes all its rows with `ON DELETE CASCADE`.
- **Migrations** in `Data/Migrations/`, generated by EF Core and forward-only; they never run at startup (see "Choosing the tech stack").

### Backend: modules and the path of a request

The backend is a single project, `backend/TavoloFlow.Api/`, organized by topic rather than by kind of class:

| Folder               | Contents                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Program.cs`         | the starting point: registers the services and the middleware pipeline. With an option like `--seed-dev-accounts` it becomes a one-off command instead, which runs and exits (`Operations/MaintenanceCommands.cs`)                                                       |
| `Controllers/`       | 20 controller classes in 19 files, all very thin                                                                                                                                                                                                                         |
| `Common/`            | cross-cutting code: the error format (`ApiError`, `ApiException` and the global filter), identity selection and CSRF (`BrowserSecurity`), cursor paging, enums as text, input rules and the rate limiter                                                                 |
| `Accounts/`          | login, logout (which also removes the device's notification subscription) and password change for owner and staff                                                                                                                                                        |
| `Menus/`             | menu management, availability, dish photos, option groups (`MenuOptionService`), reading the public menu; every menu write goes through the same lock (`MenuWrites`)                                                                                                     |
| `Tables/`            | tables and QR tokens                                                                                                                                                                                                                                                     |
| `Dining/`            | opening a table, the Floor, the encrypted table code, the shared bill summary, pausing new orders                                                                                                                                                                        |
| `Guests/`            | the guest joining the visit, and their cookie                                                                                                                                                                                                                            |
| `Ordering/`          | idempotent order creation, checking and pricing the chosen options (`OrderOptions`), the line check shared with online orders (`OrderLines`), the table's orders                                                                                                         |
| `Kitchen/`           | the Kitchen queue, dish ready or cancelled, the Pass, with the names of online orders                                                                                                                                                                                    |
| `Billing/`           | the bill, the four closures (`PAID`, `VOIDED`, `EMPTY` and, online only, `NO_SHOW`), delivery fee correction, Bill history                                                                                                                                               |
| `Platform/`          | administrator area: restaurants, services and online link, accounts, subscriptions                                                                                                                                                                                       |
| `Online/`            | online ordering: settings, menu, submission and recovery, acceptance and rejection; `OnlineAvailability` decides whether ordering is allowed and `OnlineRequestState` handles waiting and expiry; browser/IP source limits and Turnstile verification through `OnlineVerification`; delivery fee: bands, minimum order and automatic quotes with Geoapify (`OnlineDelivery`, `DeliveryQuotes`) |
| `Push/`              | lock-screen notifications: the VAPID key, device subscriptions, the in-memory queue and sending (`PushSender`, the only `BackgroundService`)                                                                                                                             |
| `Data/`, `Entities/` | `ApplicationDbContext`, the EF Core mappings and migrations, the row locks (`RowLocks`), the deletion service; the 18 entities                                                                                                                                           |

Each module has an `XxxContracts.cs` file with the DTOs (what goes into and comes out of the API) and the error factories, for example `DiningErrors.SessionClosed()`, plus one or more services with the rules and the transactions.

Dependencies between modules almost always follow the path of a visit: `Guests` uses `Dining`; `Ordering` uses `Guests` and `Dining`; `Kitchen` uses `Ordering` and `Dining`; `Billing` uses `Dining` and `Kitchen` (only to reuse the order format in the bill response); `Platform` uses `Accounts`. Online ordering added two links in both directions. `Online` uses `Ordering` (the same dish and price check), `Menus` and `Dining` (the bill summary), while `Dining` and `Kitchen` use `Online`'s response types to show the number, name and expected time. `Online` queues `Push` notifications, and `Push` uses `Online`'s error when a restaurant has no online ordering. In addition `Accounts` uses `Push` (sign-out removes the device's subscription) and `Platform` uses `Online` (online ordering can't be turned off while an order is still open). `Common/` depends on no business module.

**Thin controllers.** A controller does only three things: it declares who can call the endpoint, takes the trusted identity and calls the service. For example, marking a dish as ready:

```csharp
[ApiController]
[Authorize(Policy = StoreAuthentication.StaffPolicy)]
public sealed class KitchenController(KitchenService kitchen, CurrentAccount current) : ControllerBase
{
    [HttpPost("api/staff/orders/{id:guid}/items/{itemId:guid}/ready")]
    public async Task<IActionResult> Ready(Guid id, Guid itemId, CancellationToken ct) =>
        Ok(await kitchen.ReadyAsync(current.RequireUser().RestaurantId, id, itemId, ct));
}
```

The restaurant ID never comes from the client: it comes from the cookie, through `CurrentAccount`. So a staff member can't touch another restaurant's data even by changing the IDs in the URL: the service looks up the order filtering by restaurant too, doesn't find it and answers 404.

Services are registered as scoped: each request has its own instance, which shares the request's `DbContext`. Each service opens and closes its own transactions, and reads the time from an injected `TimeProvider` instead of `DateTime.UtcNow`, so tests can move time forward.

**The path of a request.** Here is what a request goes through, in the order `Program.cs` assembles the pieces:

```mermaid
flowchart TD
  R["HTTP request"] --> FH["UseForwardedHeaders<br>real IP and scheme behind Caddy"]
  FH --> NS["Cache-Control: no-store<br>on all /api responses<br>(dish photos replace it with a one-year cache)"]
  NS --> EX["UseExceptionHandler<br>unexpected error → 500 INTERNAL_ERROR"]
  EX --> HS["Outside development<br>HSTS and redirect to HTTPS"]
  HS --> AU["UseAuthentication<br>the Browser scheme picks the cookie from the path"]
  AU --> AZ["UseAuthorization<br>the endpoint's policy, Store Staff by default"]
  AZ --> CS["CsrfValidationFilter<br>writes must carry the CSRF token"]
  CS --> MB["Model binding and validation<br>error → 400 VALIDATION_FAILED"]
  MB --> CT["Controller → service"]
  CT -->|"ApiException"| EF["ApiExceptionFilter<br>→ ApiError JSON"]
```

- **Authentication.** It reads the cookie of the identity the path belongs to and builds `HttpContext.User`. For staff and administrators it also rechecks the account in the database (`ValidatePrincipal`, see "Three identities").
- **Authorization.** Each controller declares a policy: `StoreStaff`, `StoreOwner`, `StoreAccount` (valid even before the first password change, only for operations on one's own account), `GuestAccess` or `PlatformAdmin`. An endpoint without `[Authorize]` falls into the fallback policy, which is Store Staff: a new endpoint is protected even if you forget to declare one. Login, the public menu, joining the visit, the online ordering pages and submission and requesting the CSRF token are opened explicitly with `[AllowAnonymous]`. An anonymous controller under `/api/public` must still declare its identity's policy, `GuestAccess`, too: with `[AllowAnonymous]` alone authorization uses the fallback policy, which authenticates with the Store scheme, and in a browser that also holds the staff login the customer's CSRF token no longer matches the identity. A test in `OnlineOrderingTests` checks it with every identity together in the same browser. The 401 and 403 responses are written by the cookie events, before the MVC filters, but in the same JSON format.
- **CSRF.** `CsrfValidationFilter` is registered on all controllers: every POST, PUT, PATCH and DELETE must carry the `X-CSRF-TOKEN` header obtained by the same identity, otherwise the response is 400 `CSRF_VALIDATION_FAILED` (see "Cookies, CSRF and same-origin").
- **Errors.** A service rejects a request by throwing an `ApiException` with an HTTP status, a code and a message. The global `ApiExceptionFilter` always turns it into the same JSON:

  ```json
  {
    "code": "SESSION_CLOSED",
    "message": "本次用餐已结束。",
    "requestId": "0HN…:00000001",
    "errors": null
  }
  ```

  Some codes add fields: for example `BILL_CHANGED` also carries `currentBill`, the updated bill. The server's messages are in English and meant for developers; the frontend doesn't show them, but in all three languages picks the text based on `code` (`lib/api-messages.ts`).

### Frontend: how features are organized

The frontend (`frontend/src/`) is a single SPA with one area per kind of user: `/q/{token}` for the table guest, `/r/{slug}` (menu and order) and `/o/{token}` (order status) for the online customer, `/staff/*` for owner and staff, `/platform/*` for the administrator.

**Routes.** With TanStack Router, routes are files in `routes/`, and the file name is the URL: `staff.kitchen.tsx` becomes `/staff/kitchen`, `q.$token.tsx` becomes `/q/{token}` with the `token` parameter. From these files the Vite plugin generates `routeTree.gen.ts`, which is never edited by hand. `staff.tsx` and `platform.tsx` are layout routes: they wrap all the pages of their area (for staff, `StaffLayout` shows the navigation, makes the area installable as a PWA and holds the push notification controller). Route files stay very thin and hand over to the feature right away:

```tsx
export const Route = createFileRoute("/staff/kitchen")({
  component: KitchenPage,
});
```

**Features.** The real code lives in `features/`, one folder per part of the product:

| Feature         | Pages                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `public-menu`   | the guest menu, `/q/{token}`                                                                                                      |
| `guests`        | the guest joining the visit, with the table code                                                                                  |
| `orders`        | option picker, cart, sending the order, the table's orders                                                                        |
| `online-order`  | the online customer's pages: menu and checkout, `/r/{slug}`, privacy notice and order status, `/o/{token}`                        |
| `accounts`      | login, password change, Home, navigation, PWA installation                                                                        |
| `dining`        | Floor, `/staff/floor`                                                                                                             |
| `kitchen`       | Kitchen, `/staff/kitchen`                                                                                                         |
| `pass`          | Pass, `/staff/pass`                                                                                                               |
| `online`        | Online orders, `/staff/online`, the banner that rings on every staff page, and Online ordering settings, `/staff/online-settings` |
| `push`          | Home's "Lock-screen notifications" section and the controller that keeps browser and server aligned                               |
| `billing`       | Bill, `/staff/orders`, and Bill history, `/staff/history`                                                                         |
| `menu`          | Menu, `/staff/menu`, with the Dishes and Options tabs                                                                             |
| `tables`        | Tables & QR, `/staff/tables`                                                                                                      |
| `subscriptions` | the owner's Subscription, `/staff/subscription`, and subscription periods for the administrator                                   |
| `platform`      | administrator area, `/platform/*`, and Staff account, `/staff/settings`                                                           |

Each feature has more or less the same shape:

- `api.ts`: all of the feature's server calls, the query keys and the response types. Components and hooks never write a URL;
- `state.ts`: pure logic, without React or browser APIs (validation, cart rules, recovery after a network error), tested with `node --test`;
- `use<Feature>.ts`: hooks for polling, for stopping when the page is hidden or offline and for discarding late responses;
- `*Page.tsx` and `*Views.tsx`: rendering;
- `messages.ts`: the interface text, one object per language (Chinese, Italian and English). Each language has the same type as the Chinese object, so if a translation is missing the project doesn't compile.

Shared code lives in `lib/` (`api.ts` with the request functions, price and time formatting, languages, themes…), in `components/` (the common page pieces: `PageHeader`, `Notice`, `ConfirmDialog`, `MasterDetail`…) and in `components/ui/`, where the shadcn/ui components live.

**Where data lives.** The frontend has three kinds of state, and each has its own place:

| Kind                 | Where                | Examples                                                                                                       |
| -------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Server data          | TanStack Query cache | menu, Floor, Kitchen queue, bills                                                                              |
| Tab-local intentions | `sessionStorage`     | cart (the online one too), identifiers of operations awaiting confirmation                                     |
| Device data          | `localStorage`       | interface language, Kitchen sound, view and hidden categories, the token of the customer's latest online order |

The first piece of each query key says which identity the data belongs to: `public` (anonymous menu), `guest`, `platform`, `["auth", "me"]` (the staff identity); everything else counts as private restaurant data. When the staff signs in or out, `lib/query-scope.ts` clears only the staff cache, and the guest's or administrator's data open in the same tab stays.

### Three identities: staff, guest, platform

The same browser can hold up to three identities at once, for example the owner trying the guest menu on their own phone. Each has its own cookie, and they don't get in each other's way:

| Identity | Who              | API paths                          | Cookie                                      | Lifetime                                     | In the backend           |
| -------- | ---------------- | ---------------------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------ |
| Store    | owner and staff  | all of `/api` except the two below | `TavoloFlow.Store`, path `/`                | fixed 30 days, survives closing the browser  | `CurrentAccount`         |
| Guest    | guest at a table | `/api/public/*`                    | `TavoloFlow.Guest`, path `/api/public`      | fixed 12 hours, gone when the browser closes | `GuestIdentity`          |
| Platform | administrator    | `/api/platform/*`                  | `TavoloFlow.Platform`, path `/api/platform` | fixed 30 days, survives closing the browser  | `CurrentPlatformAccount` |

No cookie renews itself with use: when it expires you have to sign in again (or, for the guest, join the visit again). They are all `HttpOnly`, so JavaScript can't read them.

**The path decides the identity.** Everything rests on a single function, `BrowserSecurity.SchemeFor(path)`:

```csharp
public static string SchemeFor(PathString path) =>
    path.StartsWithSegments("/api/platform") ? PlatformScheme :
    path.StartsWithSegments("/api/public") ? GuestScheme : StoreScheme;
```

Two pieces use it:

1. The default authentication scheme, `Browser`, reads no cookie: it looks at the path and hands the request to the right scheme (Store, Guest or Platform), which reads its own cookie and builds `HttpContext.User`.
2. CSRF: each token is bound to the identity of the path it was requested for (`store`, `guest` or `platform`), so a token obtained as a guest isn't valid for a staff write.

Cookie paths help too: the browser sends the Guest cookie only to requests under `/api/public` and the Platform cookie only under `/api/platform`.

**What is in the cookie and what gets rechecked.**

- Store and Platform: the cookie contains the account ID, the role and the credential version (`credential_version`), plus the restaurant ID for staff. On every request `ValidatePrincipal` rereads the account from the database: if it has been deactivated or the version has changed (password change or reset), the cookie is rejected. So changing a password signs out all other devices immediately.
- Guest: the cookie contains restaurant, table and visit, plus a random identifier generated at every join, to which the CSRF token is bound. It only proves that "this browser joined this visit"; whether the visit is still open is checked by every guest service, on every request. After closing, the cookie stays in the browser, but every request answers `SESSION_CLOSED`.

**Online customers have no login identity.** The `/r/{slug}` and `/o/{token}` pages use no login cookie: recovery relies on the random `clientRequestId` after a network failure and the order status token. Submission requires a Guest-scoped CSRF token from `/api/public/csrf` and the `TavoloFlow.OnlineBrowser` cookie. The latter is only a server-signed random browser marker used to limit waiting orders at the same restaurant; it does not mean the customer is signed in or their phone is verified. With Turnstile enabled, new submissions also require a verification proof.

**In the frontend**, `lib/api.ts` has a family of functions for each identity: `request`/`write` for staff, `publicRequest` for anonymous reads (without cookies, such as the public menu, order recovery and status), `publicWrite` for anonymous online submissions (same-origin requests carrying CSRF and browser-marker cookies), `guestRequest`/`guestWrite` for table guests, and `platformRequest`/`platformWrite` for administrators. The online `ordering-context` query also carries same-origin cookies to find this browser’s waiting order at this restaurant. Before each write, the frontend requests a fresh CSRF token from its identity’s `csrf` endpoint and sends it in the `X-CSRF-TOKEN` header.

Why cookies and not JWT tokens, and how the CSRF protection works, I explain in "Cookies, CSRF and same-origin".

### The full flow of a visit

To see how all the parts work together, here is a visit from opening the table to closing the bill, for a restaurant that requires the table code:

```mermaid
sequenceDiagram
  actor S as Staff (Floor, Kitchen, Pass)
  actor C as Guest
  actor T as Owner (Bill)
  participant A as API
  participant D as PostgreSQL

  S->>A: POST /api/staff/tables/{tableId}/open
  A->>D: lock restaurant (SHARE) and table (UPDATE), new ACTIVE visit with encrypted code
  A-->>S: bill summary and table code
  S-->>C: tells the code out loud
  C->>A: GET /api/public/qr/{token}/bootstrap (anonymous)
  A-->>C: restaurant, table, menu, ID of the open visit
  C->>A: POST /api/public/qr/{token}/join (visit ID and code)
  A-->>C: Set-Cookie TavoloFlow.Guest
  C->>A: POST /api/public/orders (clientRequestId and lines)
  A->>D: lock restaurant and table (SHARE), visit (UPDATE)
  A->>D: if clientRequestId already exists return that order, otherwise save it, bill_version + 1
  loop every 10 seconds
    S->>A: GET /api/staff/orders (Kitchen)
  end
  S->>A: POST /api/staff/orders/{id}/items/{itemId}/ready
  A->>D: lock visit (UPDATE), conditional UPDATE from NEW to READY
  loop every 10 seconds
    S->>A: GET /api/staff/pass (Pass)
  end
  S->>A: POST /api/staff/orders/{id}/items/{itemId}/served
  loop every 30 seconds
    C->>A: GET /api/public/sessions/{id}/orders
  end
  T->>A: GET /api/staff/sessions/{id}/bill
  T->>A: POST /api/owner/sessions/{id}/checkout (version and total seen)
  A->>D: lock visit (UPDATE), recompute and compare, close as PAID, clear the code
  A-->>T: bill closed
```

1. **Opening.** From Floor the staff opens the table. The backend locks the restaurant row in shared mode and the table row exclusively, checks that the table doesn't already have an open visit and creates the new visit with the encrypted code. If the restaurant doesn't use the code, the response has `joinCode: null`.
2. **Bootstrap.** The guest scans the QR code. The `/q/{token}` page reads, without any cookie, restaurant, table, menu and the ID of the open visit, all in a single Repeatable Read transaction. The bootstrap creates nothing and never reveals the code.
3. **Joining.** The guest enters the code (or, if the restaurant doesn't require it, the page joins by itself). If the code is right, the backend answers with the Guest cookie, bound to that visit. A rate limit per IP and per visit prevents guessing the code by brute force.
4. **Order.** The frontend generates a `clientRequestId`, saves it in `sessionStorage` together with the order and only then sends the POST. After the locks, the backend first looks for an order with the same ID: if there is one, it returns it. Otherwise it checks that the restaurant accepts orders, that the dishes are available, that the chosen options still belong to the dish, aren't sold out and respect each group's minimum and maximum, and that the prices (extras included) haven't changed, then saves the order with the dish copies and increments `bill_version`, all in the same transaction.
5. **Kitchen and Pass.** The Kitchen asks the server every 10 seconds and plays a sound when a new order arrives. Marking a dish as ready is a conditional UPDATE (`WHERE status = 'NEW'`) under the visit lock; from the Pass, `served_at` is then set the same way. The guest sees the dishes' status update every 30 seconds.
6. **Closing.** The owner confirms the bill by sending the version and the total they saw. The backend locks the visit, recomputes everything and, if something has changed in the meantime, answers `409 BILL_CHANGED` with the updated bill. If everything matches, it closes the visit as `PAID`, stores the total, clears the code and marks as served the ready dishes still waiting at the Pass. From this moment the guest's cookie is no longer any use: every request answers `SESSION_CLOSED`.

The details of each step (why exactly those locks, why `clientRequestId`, why `bill_version`, why polling) are in "Design decisions".

### The flow of an online order

An online order takes another road until acceptance; from then on it is a visit like the others, with a single order:

```mermaid
sequenceDiagram
  actor C as Online customer
  actor S as Staff (Online orders, Kitchen, Pass)
  actor T as Owner (Bill)
  participant A as API
  participant D as PostgreSQL
  participant V as Cloudflare Turnstile
  participant G as Geoapify
  participant P as Push services

  C->>A: GET /api/public/r/{slug}/bootstrap (anonymous)
  A-->>C: Restaurant, menu, ordering status and public verification settings
  C->>A: GET ordering-context (browser cookie)
  A-->>C: This browser’s waiting order at this restaurant, if any
  opt Delivery with automatic quotes
    C->>A: POST delivery-quote (address)
    A->>G: Find the address and compute the drive route
    G-->>A: Matched point and road distance
    A-->>C: Band fee and signed quote, valid 30 minutes
  end
  Note over C: Prepare clientRequestId at confirmation
  opt Verification enabled
    C->>V: Load widget and complete verification bound to this request
    V-->>C: Verification proof
  end
  Note over C: Save the full intent before POST, without the proof
  C->>A: POST requests (clientRequestId, form, dishes, quote, turnstileToken)
  A->>D: Look for a committed result with this clientRequestId
  alt Already exists
    A-->>C: Original order result, without calling verification
  else Not found yet
    opt Verification enabled
      A->>V: Validate proof through Siteverify, without database locks
      V-->>A: Result, hostname, action and request binding
    end
    A->>D: Transaction: restaurant lock, submission lock, daily counter, duplicate recheck
    A->>D: First submission only, check source slots, availability and menu, save for 10 minutes
    A-->>C: Number, expiry and order status token
    opt First submission succeeded and transaction committed
      A-)P: Send new online order notification to subscribed devices
    end
  end
  loop every 10 seconds
    S->>A: GET /api/staff/online/pending (banner and Online orders)
  end
  S->>A: POST /api/staff/online/requests/{id}/accept (minutes and, for a delivery without a quote, fee)
  A->>D: lock restaurant (SHARE) and request (UPDATE), new PICKUP or DELIVERY visit with its order
  loop every 10 seconds
    C->>A: GET /api/public/online-orders/{token}
  end
  S->>A: Kitchen and Pass, as for tables
  T->>A: POST /api/owner/sessions/{id}/checkout (or close-no-show)
```

1. **Menu.** The `/r/{slug}` page reads without cookies the restaurant, the menu and the online ordering status, computed by a single rule (`OnlineAvailability`): service suspended, online ordering off or phone missing, paused, outside hours, too many waiting orders, or open. If it isn't open, the customer can browse the menu but not check out.
2. **Delivery fee.** If the customer chooses delivery, they see the bands and any minimum order. With automatic quotes, when they leave the address field the frontend asks the API for the fee; the API queries Geoapify outside any transaction and answers with the band's fee and a signed quote. Changing the address makes the quote stale. If the address can't be found precisely, or Geoapify doesn't answer, the price list applies and whoever accepts confirms the fee (see "Delivery fee by distance").
3. **Submission.** At confirmation, the frontend first generates `clientRequestId` so Turnstile can bind verification to this request. The full intent is still saved to `sessionStorage` only before POST; the proof travels with the request and is not saved. The backend first looks for the committed original and returns it if found. Otherwise it verifies outside the transaction, then starts a transaction, locks the restaurant, acquires the submission lock and daily counter, and checks duplicates again. A duplicate returns the original result and rolls back the counter, so no new number is consumed. A first submission also checks browser/IP waiting slots, availability, delivery, the quote, coupons, dishes and prices, then saves the request, including a copy of the coupon code and discount percentage, to wait for acceptance for 10 minutes. The customer opens the status page.
4. **Alert.** Only after the commit does the order number enter an in-memory queue, and a background service sends the push notifications. Staff with the app open see it anyway from the banner, which asks the server every 10 seconds and rings while an order waits for acceptance.
5. **Acceptance.** The staff choose when it will be ready (for a delivery without a quote, the band first; with a quote, the fee is already set and can't change). The backend locks the request, checks that it is still waiting and, in the same transaction, creates the visit (`PICKUP` or `DELIVERY`), its only order and the lines, copied from the request. The order is born at that moment, so for the Kitchen it is a new order like the others, and it rings. If the staff reject it instead, or nobody answers in time, nothing is born: the request stays rejected or expired.
6. **Kitchen, Pass and bill.** From here everything goes as for a table: dishes ready or cancelled, "Served" from the Pass (for a delivery it means handed to whoever delivers), and the owner closes the bill at pickup or on delivery; if the customer doesn't show up, they close it as `NO_SHOW`. The customer's status page refreshes every 10 seconds until the order ends.

## Design decisions

In this section I explain the reasons behind the most important technical choices. Almost all of them answer two questions: what happens when two people do something at the same moment, and what happens when the network drops halfway through an operation? In a restaurant both happen all the time: several waiters and several guests use the app together, and the Wi-Fi is not always good.

### Concurrency: row locks and lock order

**The problem.** Two waiters tap "Open table" on the same table at the same instant; a guest sends an order right while the owner closes the bill; the owner changes a price while a guest is ordering that dish. If each request reads the data, decides and then writes, two parallel requests can both read the old state and make incompatible decisions, for example open two visits on the same table.

**The choice: PostgreSQL row locks.** Inside a transaction, before deciding, the service locks the rows the decision depends on:

- `SELECT ... FOR SHARE` (shared lock): other transactions can take the same shared lock, but none can modify the row or lock it exclusively until the transaction ends;
- `SELECT ... FOR UPDATE` (exclusive lock): waits for the other locks on the row to be released, then blocks anyone who wants to modify it or take a lock on it, even a shared one.

Normal reads, without locks, are not blocked: thanks to MVCC, PostgreSQL shows them the latest already-committed version of the row.

EF Core has no LINQ API for these locks, so I write them in SQL with `FromSql`, which turns interpolated values into parameters and is therefore safe against SQL injection. The ones on restaurant, table, visit, dish and online request are collected in a single file, `Data/RowLocks.cs`, with the lock order written at the top of the file, so they are easy to check (the few locks on accounts live directly in the platform services):

```csharp
db.DiningSessions.FromSql(
    $"SELECT * FROM dining_sessions WHERE restaurant_id = {restaurantId} AND id = {id} FOR UPDATE")
    .AsNoTracking().SingleOrDefaultAsync(ct);
```

A lock stays active until the end of the transaction: that is why each service opens and closes its own.

**Lock order.** If transaction A locks the table and then waits for the visit, while transaction B has already locked the visit and waits for the table, neither can move on: it's a deadlock. PostgreSQL notices and aborts one of the two, but for the user it is still an error. To avoid it, all operations take locks in the same order:

```
restaurant → table → visit          restaurant → dish
restaurant → online request         restaurant → submission lock → the day's counter
```

Each operation takes only a stretch of this chain, always in this direction: whoever starts from the visit never goes back to the table or the restaurant. The submission lock doesn't lock a row: it is a PostgreSQL advisory lock (`pg_advisory_xact_lock`), that is a named lock, here derived from the restaurant ID, that is released by itself at the end of the transaction.

| Operation                                                                                              | Locks, in order                                                     |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Opening a table                                                                                        | restaurant SHARE → table UPDATE                                     |
| Joining the visit (guest)                                                                              | restaurant SHARE → table SHARE → visit SHARE                        |
| Sending an order                                                                                       | restaurant SHARE → table SHARE → visit UPDATE                       |
| Sending an online order                                                                                | restaurant SHARE → submission lock → the day's counter              |
| Accepting an online order                                                                              | restaurant SHARE → online request UPDATE                            |
| Rejecting an online order                                                                              | online request UPDATE only                                          |
| Reading the table's orders or the bill                                                                 | visit SHARE                                                         |
| Dish ready or cancelled, "Served", closing the bill, delivery fee                                      | visit UPDATE only                                                   |
| Changing the menu, options and their availability included                                             | restaurant UPDATE (when deleting a dish, then also the dish UPDATE) |
| Pausing new orders, suspending the restaurant, subscription, online ordering settings, active services | restaurant UPDATE                                                   |
| Renaming, enabling or deleting a table                                                                 | table UPDATE                                                        |

Why does the order take the restaurant in SHARE? Whoever changes the menu takes the restaurant in UPDATE, so while an order is in progress nobody can change prices, availability or options, and the prices and options copied into the order are exactly the ones just checked. Two orders from different tables, instead, both take a SHARE lock: they are compatible and run in parallel.

The same goes for online orders: submission and acceptance take the restaurant in SHARE, so menu and prices don't change halfway. Whoever turns online ordering off from the administrator area takes the restaurant in UPDATE instead, and so waits for the submissions in progress to finish: between the check "are there still open online orders?" and turning it off, no new request can arrive.

Order, Kitchen and bill closing all take the same visit in UPDATE, so on the same visit they queue up. If the order arrives first, the closing finds the bill changed (`BILL_CHANGED`, see below); if the closing arrives first, the order finds the visit closed (`SESSION_CLOSED`).

**The conditional UPDATE as a second line of defense.** When the Kitchen marks a dish as ready, the service locks the visit, rereads the line and then doesn't simply "save": it runs an UPDATE that applies only if the line is still `NEW`, and checks how many rows it changed (simplified code from `KitchenService`):

```csharp
var changed = await db.OrderItems
    .Where(i => i.RestaurantId == restaurantId && i.OrderId == id && i.Id == itemId &&
        i.Status == OrderItemStatus.New)
    .ExecuteUpdateAsync(u => u.SetProperty(i => i.Status, OrderItemStatus.Ready)
        .SetProperty(i => i.ReadyAt, now), ct);
if (changed != 1) throw Changed(); // 409 ORDER_ITEM_CHANGED
```

With the visit lock, a second request on the same dish arrives later anyway and finds it already `READY`. The condition in the UPDATE is there in case another write path one day forgot the lock: even then, nobody would overwrite someone else's result. The last word belongs to the database, with the unique indexes and check constraints seen in "Data model".

**How it is tested.** A race between two requests can't be reproduced by hoping for luck. In the integration tests (`KitchenTests.cs`) there is `LockGate`, a subclass of EF Core's `DbCommandInterceptor` that stops a transaction at a precise point; meanwhile the test sends the other request and checks that it waits or is rejected as expected.

The alternatives were the Serializable isolation level, with transactions to retry when PostgreSQL detects a conflict, or an optimistic version on every table. With explicit locks, instead, the order of events can be understood by reading the code and nothing needs to be retried.

### Optimistic bill version (BillVersion)

**The problem.** The owner opens a table's Bill, sees €45 and goes to the till. Meanwhile a guest orders another drink, or the Kitchen cancels a dish. When the owner confirms, the closed bill must be exactly the one they saw and collected. A lock is not enough here: I can't keep a database row locked for as long as a person looks at the screen.

**The choice: an optimistic version.** Each visit has `bill_version`, which starts at 1 and goes up by 1 for everything that changes the amount: a new order, the cancellation of a dish or, for a delivery, the correction of the delivery fee. An online visit is born already with its order and version 1. It doesn't change when a dish becomes ready or served, when the same order is repeated with the same `clientRequestId`, or with the closing.

The frontend freezes the version and the total shown in the confirmation (polling updates the screen, but doesn't silently replace the values to confirm) and sends them with the checkout:

```json
{ "expectedBillVersion": 7, "confirmedTotalCents": 4500 }
```

The backend locks the visit in UPDATE, recomputes the bill from the rows in the database and compares. If the version or the total differs, it answers `409 BILL_CHANGED` and attaches `currentBill`, the updated bill: the frontend shows it and the owner has to confirm again. The version alone would be enough to recognize a change; the total is the value the owner actually confirmed, and comparing it too is an extra check. Other checks follow, for example no dish still to prepare (`ORDERS_PENDING`) and a total greater than zero for a paid bill. If everything is fine, the visit closes.

If the same closing arrives again (same reason, same version, same total) on an already closed visit, the backend returns the stored result instead of an error; a different closing, instead, can't rewrite the stored one.

The two techniques complement each other: the pessimistic lock protects the milliseconds of the transaction, the optimistic version protects the seconds or minutes in which a person decides.

### Idempotent orders

**The problem.** The guest taps "Confirm and place order" on weak Wi-Fi. The request reaches the server and the order is saved, but the response gets lost on the way. The phone shows an error, the guest taps again and the kitchen receives the same order twice.

**The choice: make order creation idempotent**, that is make repeating the same request have the same effect as doing it once.

1. The browser generates a `clientRequestId`, a UUID v4 created with `crypto.getRandomValues` (`lib/ids.ts`). Unlike `crypto.randomUUID`, it also works without HTTPS, for example when I try the app on the local network.
2. It saves the complete order together with the ID in `sessionStorage`, and only then sends the POST. From this moment the cart is locked until we know how it went.
3. After the locks and after checking that the visit is open and matches the cookie, the backend looks **first of all** for an order with the same ID in the visit:

   ```csharp
   var original = await Orders(guest).SingleOrDefaultAsync(o => o.ClientRequestId == input.ClientRequestId, ct);
   if (original is not null)
   {
       await transaction.CommitAsync(ct);
       return new(OrderResponse.From(original), false); // 200: order already exists
   }
   // only on the first request: ordering pause, availability, prices, saving (201)
   ```

   The order of the checks matters. If a repeat checked prices and availability again, a guest retrying after the dish ran out would get an error, even though their order already exists and is in the kitchen.

4. The unique index `uq_order_one_per_request` on `(dining_session_id, client_request_id)` is the final guarantee: even with a bug in the code, the database wouldn't accept a second order with the same ID.

The frontend never resends the POST by itself. After an unknown result it looks for the order with a GET (`/api/public/sessions/{id}/orders/by-request/{requestId}`); the guest can check again with "Check order result" or tap "Retry original order", which resends the same ID with exactly the same content. It is always the guest who decides.

Online orders follow the same idea, with a few differences. `clientRequestId` is unique within a restaurant (`uq_online_request_client_request`). The backend first looks for a committed result before external verification. If it is not found, verification runs, then a second duplicate check runs under the locks after taking the daily number. A duplicate found at this point rolls back the counter too, leaving no numbering gap. Not finding a result in the first lookup does not mean another submission still in flight has failed.

Recovery uses a GET by ID (`/api/public/r/{slug}/requests/by-client-id/{id}`). This random ID is itself a credential, so it must not be sent unchanged to the verifier. Manual “Retry the same order” also starts with a GET: if found, it opens the original; only a not-found-yet 404 allows the same ID and content to be sent again with a fresh proof. A 404 still does not prove the original request failed; the duplicate check under the lock prevents concurrent retries from creating another order.

Another deliberate difference: after an unknown result, a retry rejected by a check performed after the duplicate check under the lock (for example paused ordering, closed hours, full browser or IP waiting slots, delivery off or a changed menu) proves that no original with this ID exists, so the cart unlocks. Verification failure, CSRF, rate limits and a missing browser marker happen before that proof and cannot justify discarding the unknown intent. `ONLINE_VERIFICATION_FAILED` (400) allows unlocking only on a first, explicitly rejected submission; verification-unavailable 503s, timeouts and lost responses retain the intent. Table orders still follow the cautious rule above.

### Online orders: a request to accept

**The problem.** An online order comes from someone who isn't at the restaurant: it may be a prank, the restaurant may be unable to make it, and the customer isn't there to be told. Once accepted, though, the order must go through Kitchen, Pass and Bill like all the others, without duplicating those parts.

**The choice: a separate request, which becomes a visit only if it is accepted.**

- **A table of its own.** Submission saves only a row of `online_requests`, with the dishes copied into a jsonb column. Kitchen, Pass, Bill and History don't see it, because they read `dining_sessions` and `orders` as before: a suspicious order can't reach the kitchen by mistake. Only acceptance creates, in the same transaction, the visit (`PICKUP` or `DELIVERY`), its order and the lines. A rejected or expired order stays just a row: no visits open forever, no dishes `NEW` forever.
- **No status column.** A request is accepted if it has `accepted_at`, rejected if it has `rejected_at`, otherwise it waits until `expires_at` (10 minutes after submission) and is expired from that moment. Nobody writes the expiry: it is derived from the time, so no background job is needed, and in tests it is enough to move time with `TestClock`. The rule is written only once, in `OnlineRequestState`, and whoever reads waiting requests always uses it with the time from `TimeProvider`, never with SQL's `now()`. If one place forgot it, twenty expired requests would be enough to block new orders forever.
- **The order is born at acceptance.** So its creation time is the moment it enters the kitchen: the Kitchen's sorting, the grouping by dish and the sound work without any change.
- **One number a day.** Each restaurant numbers its online orders from 1 every day (`online_counters`): a number that is easy to say on the phone or write on the bag. Submission locks the day's counter with an `INSERT ... ON CONFLICT DO UPDATE`, but at midnight that isn't enough: two close submissions, or the retry of the same order, could lock the counters of two different days without waiting for each other. That is why submission first takes the restaurant's submission lock, so the duplicate check and the limit of waiting orders never overlap. Different restaurants don't wait for each other.
- **A limit, and a single rule for "can customers order?".** With 20 waiting requests the restaurant is `BUSY` and accepts no more submissions. The status (`OnlineAvailability`) is computed in a single place, used by the customer's menu, the submission and the settings page.
- **The delivery fee goes into the bill.** At first whoever accepted the order typed it, following a note from the owner, and the customer only found out after acceptance. Today it follows the owner's distance bands and, when possible, the customer sees it before ordering (see "Delivery fee by distance"). If it is wrong, the owner corrects it before closing, with the bill version.

The price: the staff must answer within 10 minutes, even at peak times, and an expired order is lost: the customer has to call or order again. That is why there is the banner that rings on every page and, for locked phones, push notifications (see "A PWA for staff").

### Source limits and verification for online orders

**Problem.** Requiring acceptance before an order reaches the kitchen lets staff reject suspicious orders, but it does not stop repeated submissions filling waiting slots or constantly triggering the banner and lock-screen notifications. CSRF prevents another site from borrowing the browser to send requests; it does not stop someone opening the order page directly and abusing it.

**Approach: limit sources, then add Turnstile verification for new submissions.**

- **One waiting order per browser and restaurant.** A server-signed random browser marker lives in an HttpOnly, SameSite=Strict cookie expiring after 30 days. `ordering-context` finds its waiting order at the current restaurant and the page links back to it. This is neither a device fingerprint nor identity verification; clearing cookies can replace the marker, so IP limits are also needed.
- **Separate frequency limits from waiting slots.** By default, each IP can attempt 3 submissions per minute and 10 per ten minutes, including invalid JSON, failed CSRF and repeated requests. Each restaurant also allows at most 5 waiting orders from the same IP, while keeping its overall cap of 20. Acceptance, rejection or expiry releases slots. Status reads, recovery reads and new submissions each have separate frequency budgets.
- **Load Turnstile only when submission is needed.** It defaults to enabled in production and disabled in Development and Demo; it is a deployment setting, not a restaurant switch. The widget loads at confirmation or in the recovery area for an unknown result and follows the customer’s language. Expiry, the end of an attempt or a change in request context invalidates the old proof for submission; it never automatically submits another order. Browsing the menu, privacy or status pages does not load it.
- **The backend decides whether verification is valid.** `OnlineVerification` sends the proof to a fixed Siteverify HTTPS endpoint, waits at most 5 seconds and neither retries automatically nor follows redirects. Real keys require matching hostname, `action=online_order` and request binding. The binding is SHA-256 of `restaurantIdN:clientRequestIdN` (lowercase GUIDs without hyphens), sent as `cdata`; it keeps the original recovery ID private and prevents one proof from serving different requests or restaurants. Verification holds no database locks, so a slow Cloudflare response does not keep the restaurant locked.
- **Failure creates no order or reminder.** Rejected verification returns `ONLINE_VERIFICATION_FAILED`; verifier failure returns `ONLINE_VERIFICATION_UNAVAILABLE`. Without a successfully saved request, no number or waiting slot is consumed and no notification is sent. Carts and unknown results follow the recovery rules above; GET queries for committed orders do not depend on Cloudflare. Proofs and the Secret key never enter carts, order snapshots or logs, and we send no names, phones, addresses or dishes to the verifier.

The cost is an external service dependency: with verification enabled, both the customer’s browser and the API must reach Cloudflare. Failed verification blocks new submissions rather than silently allowing them. Before deployment, obtain real keys and complete the server settings; see the [existing VPS upgrade steps](self-hosting.md#first-upgrade-to-a-version-with-turnstile). Only recognised official test-key pairs in Development accept the official `example.com` response without action/cdata.

These measures increase the cost of automated orders and repeated slot occupation, but do not verify that a phone belongs to the customer or guarantee collection or payment. A person can still place a malicious order, and legitimate customers sharing a public IP also share its limits. The restaurant must still assess suspicious requests, call if necessary and decide whether to accept. Accepted orders that are not collected are still recorded as `NO_SHOW`; the app does not recover the restaurant’s losses. Notifications and ringing are unchanged.

### Discounts: sale prices and coupons

**The problem.** Restaurants want to run offers: a dish at a lower price for a few weeks, or a discount for customers who order straight from their link instead of from Glovo or Just Eat, which take a high commission. A discount touches money, though: the price checked at ordering time, the bill total and the total recorded at closing must keep agreeing, even if a dish is cancelled or the code is deleted halfway.

**The choice: two simple tools, each in one place in the code.**

- **A sale price is a price.** `menu_items.sale_price_cents` is optional and must stay below the regular price (a check constraint enforces it too). The server uses it in one place only, `OrderOptions.Resolve`: the dish's price becomes the sale price, and option extras are added in full. The frontend does the same sum in `unitPriceCents`. Nothing else changes: the price check at submission (`MENU_CHANGED`) also covers the start and end of an offer, and the order line stores only the price paid. There is no date schedule: the owner clears the field when the offer ends.
- **A coupon is a percentage, never a fixed amount.** With a percentage the discount follows cancelled dishes by itself, the bill never goes negative and no minimum-spend rule is needed. The maximum is 50%, so a bill with at least one dish stays positive and can close as `PAID`.
- **A copy in the request, not a foreign key.** At submission the server checks the code after the duplicate check (so a retry of the same order always gets the original answer) and copies it, with its percentage, into `online_requests`. The customer also sends the percentage they saw, as they do with each line's price: if the code was deleted and created again with another percentage in the meantime, the order is refused instead of quietly changing the total. Deleting or expiring a code doesn't touch the requests and bills that used it.
- **The discount lives only in the bill.** The order's amount doesn't change: the discount is computed by `SessionSummaries.Project`, the only place that computes a bill, on the dishes not cancelled, rounded down to the cent, without touching the delivery fee. At closing the stored total already includes it, so the History is right with no extra code.
- **Expiry is a date, not a background job.** The last valid day is compared with the restaurant's local date only at submission. An order sent at 23:58 on the last day and accepted after midnight keeps the discount: the customer has already seen it.

The price to pay: anyone who knows the code can use it, as often as they like, and the receipt is still issued by the restaurant's till, so staff must give the same discount there. That's why the bill shows the coupon line and the closing confirmation reminds them.

### Delivery fee by distance

**The problem.** With the fee typed by whoever accepted, the customer only found it out after acceptance, when the kitchen had already started and they could no longer cancel; and whoever accepted had to work it out every time. A restaurant owner pointed out two things to me: straight-line distance is useless (rivers, bridges, one-way streets), and customers don't know the "zones" the owner makes up. Prato is also a single comune: no place name tells near from far.

**The choice: bands by road distance, a signed quote and, when the maps service doesn't answer, a person.**

- **Bands set by the owner.** Up to five bands (`delivery_tiers`), for example "up to 3 km €2, up to 6 km €4"; the last one is the maximum distance. Plus an optional minimum order, one per restaurant, compared with the dishes after the coupon and without the delivery fee, because it tells whether the trip is worth it. The owner pastes the restaurant's coordinates from Google Maps: indoor GPS and a computer's location can be off by hundreds of metres.
- **The customer sees the fees before ordering.** Without automatic quotes checkout shows the price list and whoever accepts picks the band, looking at the route from the restaurant that opens by tapping the address. The server accepts any valid fee: if the owner changes the bands while someone is accepting, the acceptance doesn't fail.
- **Automatic quotes with Geoapify.** As soon as the customer enters the address, the API looks for the point inside a circle around the restaurant (`/v1/geocode/search`) and computes the drive route (`/v1/routing`) without live traffic, so the same address always has the same price. Two calls per quote and no precomputed zones: changing bands or coordinates needs no external service. I chose Geoapify because the free plan needs no card, the company is in the EU and keeps request logs for at most 24 hours. Google needs a card and limits storing results; the public Nominatim and OSRM servers aren't for commercial use; hosting my own maps service would cost more maintenance than the whole feature.
- **Only precise results.** Before writing the code I tried 27 real addresses in Prato: 21 found at the house number, one only at the street, two wrong (a typo, "Marni" instead of "Marini", landed on another street). So a quote is made only when the result is a building or a place (`building`, `amenity`) with a street confidence of at least 0.9 (`OnlineDelivery.QuotableMatches`, `MinStreetConfidence`): without the house number, the point of a long street like Via Pistoiese can be kilometres from the house. Everything else counts as "not found": back to the price list and the person.
- **A signed quote.** The quote is signed with Data Protection, like the table codes, and bound to the restaurant, the address and a 30-minute expiry (`DeliveryQuotes`). At submission the server doesn't call Geoapify again: it checks the signature and works out the band again with the current bands, otherwise `DELIVERY_QUOTE_INVALID`. The customer can't make up a fee, and what they saw is what they pay: whoever accepts can't change it. A different price agreed on the phone goes through the fee correction in the Bill.
- **The external service doesn't decide whether people can order.** The free plan has no guarantees, and its limits are "soft": past the quota it still answers, but heavy overuse can get the account restricted, which means every restaurant's quotes. That's why there is a per-IP limit and two daily limits, one per restaurant and one for the whole installation, below the free quota. When a limit is reached, or Geoapify doesn't answer, it's back to the price list: the order goes through anyway. Without a key the feature is off, in a self-hosted installation too.

The price to pay: the customer's address leaves the server (the privacy notice says so), the quote depends on how well OpenStreetMap knows house numbers, and a mistake Geoapify is confident about still gets through, like "Piazza de' Medici" found as "Via Cancellieri". That's why checkout shows the town found, and the customer can add the town or postcode to the address and calculate again.

### Writes with an unknown result: recovery by GET only

The order problem applies to every write: opening a table, marking a dish ready, closing a bill, creating a restaurant. When the network drops, or the timeout expires, the result is unknown: the write may or may not have succeeded. The timeout isn't automatic: only operations that use `withTimeout` (`lib/api.ts`) stop waiting after 15 seconds (`REQUEST_TIMEOUT_MS`), that is those of Floor, Kitchen, Pass, Bill, online orders, push notifications, subscriptions and the guest (table and online orders, joining the visit); menu changes and the administrator's operations on restaurants and accounts don't use it.

For the most delicate writes I use the same pattern: opening a table and pausing new orders on Floor, dish ready or cancelled in Kitchen, closing the bill, guest orders (at the table and online) and the administrator's operations on restaurants and accounts.

```mermaid
flowchart TD
  A["The person confirms"] --> B["Save the minimal intention<br>in sessionStorage"]
  B --> C["POST"]
  C -->|"success"| D["Clear the intention<br>and show the result"]
  C -->|"explicit rejection by the server<br>(orders and administrator: first attempt only)"| E["Clear the intention<br>and show the reason"]
  C -->|"timeout or network error"| F["Result to verify<br>related changes stay locked"]
  C -->|"orders and administrator:<br>rejection after an unknown result"| F
  F --> G["Network back, page visible again or reloaded<br>GET of the original resource"]
  G -->|"operation already done"| D
  G -->|"not done"| H["A new confirmation is needed<br>before another POST"]
  H --> C
```

Guest orders and administrator operations are more cautious. If a request's result was already unknown, the rejection of a retry doesn't prove the first request failed: the intention stays, and for orders the cart stays locked. On the first attempt, moreover, an order releases the intention only for the rejections it understands, such as `MENU_CHANGED` or `ORDERING_PAUSED` (`submissionFailure` in `orders/state.ts`). Even a GET answering 404, for an order, only means "not found yet": the first POST might reach the server later.

The minimal intention contains identifiers, the kind of action and, when needed, the confirmed value, saved under a key that includes restaurant and account, such as `tavoloflow:kitchen:{restaurantId}:{userId}`. For example, Kitchen saves the order ID, the line ID and "ready"; Floor saves `tableId` for opening or `enabled` for accepting orders. Only the cart saves the whole order, because a retry must send the same content.

**Why GET only.** A GET changes nothing, so it can be repeated as often as needed. An automatically repeated POST, instead, might do the same thing twice, for example reopen a table that was just closed. So, after an unknown result, the frontend only reads the state of the original resource; if the operation doesn't appear done, a person has to confirm it again.

**Why `sessionStorage`.** It is valid for a single tab and disappears when the tab closes, so two tabs don't confuse each other. Markers contain only the operation’s minimum data; the complete order remains the cart’s exception. Never passwords or codes.

There are seven exceptions to the pattern:

- the guest's order, which can be retried by hand with the same ID because the backend is idempotent (see above);
- subscription writes in the administrator area, which save nothing: each write carries the subscription version read earlier, so each version can be consumed by at most one write that changes state. Saves without changes can succeed several times without incrementing it. After an unknown result you reread and confirm again;
- "Served" on the Pass, which saves nothing: the UPDATE applies only to a dish that is ready and not yet served, so repeating it does no harm, and the refreshed list shows by itself whether the write went through;
- accepting or rejecting an online order, which save nothing for the same reason: they apply only to a request still waiting, a repeat gets `ONLINE_REQUEST_CHANGED`, and the refreshed list shows what happened;
- the online ordering settings, which send the final value: the form is locked during the save, and after an unknown result the reread the page does every 60 seconds anyway is enough;
- the delivery fee correction, which carries the bill version, so it applies at most once; after any result the bill is reread;
- the push notification subscription and its removal, which can be repeated harmlessly: Home shows "on" only after the server confirms, and the next check, or the next sign-in, registers the device again.

The other writes (menu and photos, tables, login and passwords) save no intention. In the menu and tables, for example, if the response gets lost the form stays filled in and the page asks you to reread the list and check before retrying.

In Kitchen and during bill closure, when the page is hidden, the network drops or the user changes, in-flight requests are aborted with `AbortController` and late responses are discarded. Floor behaves differently: it hides codes when it loses visibility or connectivity, but does not abort writes for these events and can still accept their results if the component remains mounted. It aborts them when the component unmounts; for opening and accepting orders, the timeout stops waiting after 15 seconds.

### Polling instead of WebSocket

**The choice.** Kitchen, Pass, Floor and Bill receive no notifications from the server: they ask it at regular intervals with TanStack Query's `refetchInterval`. The only thing the server sends on its own is the push notifications of new online orders, an extra reminder for locked phones (see "A PWA for staff"): the pages are still based on polling.

| Page                                                           | Interval   |
| -------------------------------------------------------------- | ---------- |
| Kitchen, Pass, the online orders banner and page               | 10 seconds |
| Online order status (customer), until the order ends           | 10 seconds |
| Floor, Bill, the table's orders and the online menu (customer) | 30 seconds |
| Subscription reminders, Online ordering settings               | 60 seconds |

Polling stops when the page is hidden or the device is offline, and restarts when it becomes visible again.

**Why it is enough.** A small restaurant has few devices, and for the kitchen a 10-second delay is acceptable. In return polling is much simpler than WebSocket or SignalR: no open connection to maintain and to reconnect after an interruption, no special configuration in the proxy, and every request is a normal GET that goes through the usual authentication and rules. After a network outage, the next poll brings everything back in sync.

**Lightweight reads.** Since these requests repeat constantly, they read only open visits and never count or scan a restaurant's history. To know whether something new has arrived, a "watermark" is enough: the time of the newest order (`latestCreatedAt`) or of the newest ready dish (`latestReadyAt`), read from the end of an index. When the watermark moves forward compared to the previous read, Kitchen or Pass plays a sound (`watermarkAdvanced` in `lib/live-view.ts`). On first load and when the page becomes visible again, the read only serves as a baseline, without a sound.

**Fresh data before writing.** A page that hasn’t refreshed for a while shows old data, and deciding on old data is dangerous, for example closing a bill that has changed in the meantime. In Kitchen, Pass, Online orders and bill confirmation, writes are blocked if the last successful refresh is at least 30 seconds old or predates the page’s last return to the foreground (`syncIsFresh`). The warning, though, appears only if the block lasts at least 3 seconds, or immediately if you are offline or the last request failed (`syncIsStalled`): that way a normal refresh doesn’t make warnings flash. Subscription pages, which refresh every 60 seconds, instead use a freshness threshold of 90 seconds. These checks are specific to each feature: Floor does not use `syncIsFresh` to authorize opening and accepting orders. The online orders banner uses the same rule to decide whether to ring: with old data or a failed read it stops ringing, but keeps showing the number.

For Kitchen, Pass and online orders the cost is a delay of up to 10 seconds (with the phone locked, online orders have push notifications), and the number of requests grows with the number of devices switched on (see "Current limits").

### Cookies, CSRF and same-origin

**Why cookies and not JWT.** A common choice in SPAs is a JWT token saved in `localStorage` and sent by hand in a header. I preferred ASP.NET Core's authentication cookies:

- they are `HttpOnly`: JavaScript can't read them, so not even a malicious script injected into the page (XSS) can steal them and use them elsewhere;
- the browser sends them by itself, and with frontend and API on the same origin no configuration is needed;
- they can be revoked: thanks to the `credential_version` check on every request (see "Three identities"), changing or resetting a password, or deactivating an account, immediately invalidates all old cookies. A JWT is usually verified without the database, and to revoke it before it expires you would need a server-side check anyway: at that point its main advantage disappears.

The fixed lifetime, without automatic renewal (see the table in "Three identities"), is predictable: a lost tablet stops working after 30 days at the latest, and immediately if the password is changed.

**The price of cookies: CSRF.** Precisely because the browser attaches cookies by itself, another site could take advantage of it: a malicious page opened by the owner could contain a hidden form that sends a POST to `https://app.example.com/api/...`, and the browser would attach the owner's login cookie. This is called Cross-Site Request Forgery (CSRF). There are two defenses:

1. `SameSite=Lax` on the login cookies: the browser doesn't attach them to POSTs coming from another site.
2. ASP.NET Core's antiforgery token. Before every write the frontend asks its own identity's `csrf` endpoint for a fresh token and sends it back in the `X-CSRF-TOKEN` header: it costs one extra request, but avoids using an old token after a login, a logout or a change of identity. The server compares it with the antiforgery cookie (`TavoloFlow.Csrf`, `HttpOnly` and `SameSite=Strict`) and with the current user. Another site can't read the response containing the token, because the browser's same-origin policy prevents it, so it can't build a valid request. In addition, each token is valid only for the identity it was requested for (`BrowserCsrfScope`, see "Three identities"). This also applies to the anonymous submission of an online order: the token is requested from `/api/public/csrf`, in the Guest scope, and that is why the online ordering controller declares the `GuestAccess` policy in addition to `[AllowAnonymous]` (see "Backend: modules and the path of a request").

The check is done by `CsrfValidationFilter`, registered globally because `AddControllers` alone doesn't validate the token for JSON requests: that way even a new endpoint is protected without doing anything.

### A PWA for staff

**Why a PWA and not a native app.** Staff use phones and tablets, often already in the restaurant. A native app would mean more code (Android and iOS), publishing in the stores and updates to install on every device. With a PWA the same React code becomes an installable app: an icon on the home screen, a full-screen window, and updates reach everyone without going through the stores, the next time the app is opened or reloaded. An already open page, instead, keeps using the previous version: that is why the server keeps the JavaScript and CSS files of every version (see [self-hosting](self-hosting.md#releasing-a-new-version)).

**Only `/staff`.** The manifest (`/staff.webmanifest`) is not linked in `index.html`: only `StaffLayout` links it, and it also registers the service worker `/sw.js` with scope `/staff`. So guests on `/q/*`, `/r/*` and `/o/*`, who don't need to install anything, are never offered the installation. The manifest's `id`, `start_url` and `scope` are `/staff` without a trailing slash, because the router removes the trailing slash from URLs and the page must stay within the scope.

**A service worker that caches nothing.** The service worker handles only page loads: it always tries the network first, and only if the load fails does it show an offline page written inside it. It doesn't use Cache Storage and leaves all other requests to the browser, including those to `/api`. I give up offline operation, but I never have to worry about old data or an old version of the app stuck in a cache, one of the most common PWA problems. I keep it for the offline page: without a service worker, whoever opens the app without a network would see only the browser's error page. For installation, instead, it is no longer needed today: [Chrome's current criteria](https://web.dev/articles/install-criteria) for offering it don't require a service worker.

**What you gain by installing it:**

- in the app installed with Chrome (on Android or on a computer), Kitchen and Pass can play sounds as soon as they open, without anyone touching the screen: browsers' autoplay rules allow it for installed apps;
- a switch keeps the screen on (Screen Wake Lock API), useful for the kitchen tablet;
- on iOS the installed app has no browser Back button, so pages outside the tabs have a link to go back (`PageHeader`).

**Lock-screen notifications, only for online orders.** Polling stops when the phone is locked or the app is in the background. For the kitchen that is fine, because whoever is working has the page open; an online order, instead, waits for someone to accept it, and expires after 10 minutes. For this, and only for this, the app uses Web Push: when a new online order arrives, the devices that turned them on receive a system notification with a sound, even when locked.

- **What it contains.** Only the order number and the device language: "New online order #12". No customer name, phone or address, because the notification goes through Apple's, Google's or Mozilla's servers: the content is encrypted for the single device, but the less data leaves, the better. The service worker writes the text in the three languages, like the offline page.
- **A single key.** The server signs every push with a VAPID key. `.env` needs only one, the private key (`VAPID_PRIVATE_KEY`, 64 hexadecimal characters like the database password): the API derives the public key, the one the browser subscribes with, from it.
- **One subscription per device.** Each device turns them on from Home with a tap, which asks for the notification permission. The subscription (`push_subscriptions`) remembers the account, its `credential_version` and the sign-in expiry: if the password changes, the account is deactivated or the sign-in expires, that device receives nothing more. The check is a single rule (`PushTargets`), used before every send and every new subscription: that way the password change and the other places that touch credentials don't need to know anything about notifications.
- **Sign-out and new sign-in.** The device's address travels in the sign-out request: the server deletes the subscription before removing the cookie. If the staff service worker or the Push API is missing, you sign out without sending a device address. An actual browser read error or deletion error leaves you signed in and you can retry; if the response gets lost, you check the identity with a GET. The browser keeps the subscription for the next sign-in. Notifications already sent can still arrive. Only "Turn off for this device" also removes the browser's subscription.
- **Confirmation and recovery.** A single controller in `StaffLayout` coordinates Home, sign-out and automatic registration. "On" appears only after the server confirms; an error keeps the browser's subscription and offers "Retry sync". The check runs again at sign-in, on a language or password change, when returning to the app, on focus and on reconnection. If the browser changes the address, it is registered at the next check. Operations don't overlap and responses from an old identity are discarded; there are no retry timers or background subscriptions in the service worker.
- **Only a reminder.** The backend puts the order number in an in-memory queue only after saving the order, and a `BackgroundService` sends it without retrying. If a notification gets lost, or the server restarts while it is still queued, nothing serious happens: the banner and the sound on the page remain the main mechanism.
- **Logs without secrets.** The notifications' HTTP client disables the default loggers: they would also write the address's path, which contains the device token. Only the response code or the error type remain.
- **Only known services.** The browser chooses the address to send to, so the server accepts only those of the known notification services (Apple, Google, Mozilla, Microsoft) and doesn't follow redirects: otherwise an account could make the server call internal addresses.
- **iPhone.** On iOS notifications exist only in the app added to the Home Screen (iOS 16.4 or later), not in Safari. With the screen locked one notification arrives with one sound, not continuous ringing.

### Other trade-offs

- **Opening a table is not idempotent.** Unlike the order, opening has no request ID. If the response gets lost, the frontend rereads the Floor and the staff decide whether to open again; a second opening on the same table gets `SESSION_ALREADY_ACTIVE`, and the unique index guarantees a single open visit per table anyway. One risk remains, which I accepted consciously for the first version: an old request arriving very late, when the table has already been closed, opening a visit nobody wanted, to be closed later without payment. If it happened often in real use, I would add a request ID to opening too. For an order or a bill such a risk wouldn't be acceptable, and that is why `clientRequestId` and `bill_version` exist there.
- **Menu: the last change wins.** If the owner edits the same dish from two devices, the last save wins, without conflict warnings. It isn't serious, because what matters is checked by the order: the backend always rechecks prices, availability and options and, if something changed, answers `MENU_CHANGED` with the list of changes (for an option that is sold out or no longer valid the reason is `OPTIONS_CHANGED`).
- **An error format of my own instead of ProblemDetails.** ASP.NET Core supports a standard error format (ProblemDetails, RFC 9457), but the frontend was already built around the `code` field. Generating everything from a single filter cost less than switching to the standard format, which for a public API would still be the more correct choice.
- **Contact details are cleared only by a new order.** Online customers’ names, phones, addresses and restaurant-specific browser/IP digests older than 30 days are cleared by the next successful online submission at the same restaurant, without a scheduled background job. If a restaurant gets no further orders, the data remains. Browser/IP digests are already cleared when the restaurant accepts or rejects the request; only expired requests keep them until the 30-day cleanup. The privacy page describes this mechanism, including the 7 days of backups; whether to add scheduled cleanup is decided before launch. The current implementation does not guarantee automatic deletion on day 30.
- **Subscriptions without history.** The initial design had a subscription events table, with the history of changes, notices to the owner and an ID for each operation against duplicates. I removed it when it became clear that `subscription_version` alone was enough to prevent two changes from consuming the same version. I lost the history, but for a first version it wasn't needed.

## Limits and what I would do differently

### Current limits

- **Designed for a single instance.** The rate limiter (`FixedWindowLimiter`) keeps its counters in memory, including the daily delivery quote ones: they reset at every restart and, with several API instances, each would have its own. To scale you would need a shared store, for example Redis or PostgreSQL itself. The same goes for the push notification queue, which lives in memory.
- **The table code is short.** Four characters from an alphabet of 32 make about a million combinations (2²⁰). Against someone trying to guess it, only the rate limit protects it, per IP and per visit: before real public use it should be reconsidered, perhaps with a longer code.
- **Polling.** The load on the server grows with the number of devices switched on: with many restaurants it would be worth moving to WebSocket or Server-Sent Events.
- **Tests.** The backend has more than 500 tests, mostly integration tests, which run on a real PostgreSQL in Docker; the frontend has only pure-logic tests with `node --test`. The repository lacks component tests and end-to-end tests. All the existing tests run on every push in CI (`.github/workflows/ci.yml`).
- **Error codes kept in sync by hand.** The table the frontend uses to translate error codes into the three languages (`lib/api-messages.ts`, see "Backend: modules and the path of a request") has to be kept in sync with the backend by hand: TypeScript flags a missing translation, but not a new backend code.
- **Hand-made release process.** A single VPS, release scripts run by hand, backups left to a systemd timer, no monitoring or alerting system: if the server stops, I only notice when someone complains.
- **A complex frontend in places.** Handling unknown results (for example in `useCart`) is very robust, but also heavy to read and maintain for a first version.

### What I would do differently

- **Talk to restaurants before writing code.** I evaluated the idea with a quick survey, and only after the release did I discover that almost everyone wanted to print kitchen tickets and that those who already offered QR ordering used a Chinese SaaS company's service (see "Why this project"). A few visits before starting would have made me design printing from the beginning, or maybe change my mind.
- **Release earlier, with fewer features.** I added things a first version didn't need: I developed takeaway and then removed it, I deleted the subscription events table. A smaller product, put in front of customers sooner, would have given me sooner the information that mattered.
- **Set up CI from day one.** I only added it at the end, when I made the code public. A GitHub Action that on every push runs the backend tests and the frontend build, lint and tests costs little, and from the start it would have spared me having to remember to do it.
