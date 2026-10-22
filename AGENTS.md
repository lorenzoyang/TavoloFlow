# Repository Guidelines

## Project Structure & Module Organization

- `TavoloFlow.slnx` groups the backend projects; `global.json` specifies the .NET SDK.
- `backend/TavoloFlow.Api/` contains the ASP.NET Core 10 controller-based API. Startup lives in `Program.cs`; `Entities/` contains the nine persistence entities, and `Data/` contains `ApplicationDbContext`, EF Core mappings and migrations, and catalog deletion services. `Accounts/` implements development account initialization, store authentication and authorization; `Controllers/AuthController.cs` exposes the account endpoints. `Menus/` implements menu maintenance, availability, language rules and anonymous menu reading; `Tables/` implements table maintenance. The corresponding controllers expose store and public APIs separately. Opening tables, guest authorization and ordering workflows are not yet implemented.
- `backend/TavoloFlow.Api.Tests/` contains data-layer, account, menu, table and public-menu integration tests using disposable PostgreSQL containers and `WebApplicationFactory`.
- `frontend/src/` contains the React/TypeScript application. `routes/` defines TanStack file-based routes; `router.tsx` creates the router from the generated `routeTree.gen.ts`. Account pages and identity queries live in `features/accounts/`; menu maintenance lives in `features/menu/`, table maintenance and QR generation in `features/tables/`, and anonymous guest browsing in `features/public-menu/`. Shared HTTP/CSRF/error handling lives in `lib/api.ts`; shared shadcn UI lives in `components/ui/`, utilities in `lib/`, and theme variables in `index.css`.
- `docs/` contains product requirements and the DBML schema. Root `compose.yaml` defines local PostgreSQL.

## Build, Test, and Development Commands

Run backend and infrastructure commands from the repository root:

- `cp .env.example .env`: initialize local database settings; replace the password before starting PostgreSQL.
- `docker compose up -d db`: start PostgreSQL on localhost port 5432.
- `dotnet build TavoloFlow.slnx`: restore dependencies and build the backend solution.
- `dotnet run --project backend/TavoloFlow.Api --launch-profile https`: start the API at `https://localhost:7298`.
- `dotnet run --project backend/TavoloFlow.Api --launch-profile http`: start the API at `http://localhost:5093` for the Vite `/api` proxy.
- `dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-dev-accounts`: explicitly initialize Development accounts after configuring `DevelopmentSeed` and applying migrations; see `docs/store-accounts.md`.
- `dotnet test TavoloFlow.slnx`: run backend tests.

From `frontend/`, run `npm install` to install dependencies, `npm run dev` for development, `npm run build` for TypeScript checking and production output, `npm run lint` for Oxlint, and `npm run preview` to preview the build.

The build runs `vite build && tsc -b`: Vite generates the route tree before TypeScript checks route types. Commit `src/routeTree.gen.ts` with route changes; never edit it manually. It is excluded from lint. The TanStack Router Vite plugin must precede the React plugin and enables automatic route code splitting.

## Coding Style & Naming Conventions

Use four-space indentation in C# and two spaces in TypeScript/TSX. Use PascalCase for C# types/methods and React components; use camelCase for JavaScript functions and variables. Prefer file-scoped C# namespaces and preserve nullable annotations. Use `@/` imports for frontend source paths. Match surrounding quote and semicolon conventions; no shared formatter is configured. Oxlint checks React hooks and TypeScript rules.

Keep route files thin: URL/search configuration belongs in `routes/`, while forms and feature state belong in the corresponding `features/` directory. `AuthBoundary` observes the shared identity query; do not duplicate authentication requests in route loaders. Public menu routes do not use `AuthBoundary` or request `/me`. The store layout sets available width, and pages choose their own card width. Menu/table editing keeps its local form snapshot during background refresh; private query keys include restaurant and account IDs. Public queries use the `public` prefix and survive account changes; `publicRequest` omits credentials and store-auth failure handling. Writes have no automatic retry or offline queue. Add UI components using the existing shadcn configuration (Base UI, `base-nova`, `neutral`); use semantic theme colors and preserve labels, focus styles, and at least 44px account form controls. Navigation uses TanStack `Link` with `buttonVariants` from `components/ui/button-variants.ts`; keep style utilities separate from component exports for Fast Refresh. The `Route` export lint exception applies only to route files.

## Testing Guidelines

Backend tests use xUnit, Coverlet, and Testcontainers.PostgreSql. The existing integration tests require Docker and apply real migrations to a disposable PostgreSQL database, separate from the development database. Write meaningful assertions; name new classes `<Subject>Tests` and methods `Method_Scenario_ExpectedResult`. Collect coverage with `dotnet test TavoloFlow.slnx --collect:"XPlat Code Coverage"`; no minimum threshold is configured. No frontend test framework is installed. With Node 24, run `node --test --test-isolation=none tests/*.test.ts` from `frontend/` for pure language, QR URL and query-scope logic; also run build/lint and manually verify affected UI flows.

## Commit & Pull Request Guidelines

History uses short, scoped messages such as `backend: docker postgresql setup` and `docs: er-diagram`; follow that pattern. PRs should describe behavior changes, link relevant issues, and record validation commands/results. Include screenshots for visible UI changes and configuration or schema notes where relevant.

## Security & Configuration

Keep credentials in ignored `.env` files, environment variables, or .NET user secrets. Commit only safe example values. Docker Compose settings do not automatically configure the API connection string. Store authentication uses an HttpOnly session cookie with a fixed 16-hour ticket and CSRF validation on controller writes. Use `CurrentAccount` for trusted restaurant identity and the store authorization policies for business endpoints; only self-account operations may bypass the first-password-change requirement. Data Protection keys must stay outside Git and persist across deployments.

## Menu Rules

Menu content and availability writes derive the restaurant from `CurrentAccount` and lock its restaurant row before category/item rows. Default language is a stable OWNER preference (`zh`/`it`/`en`), updated only through its setting endpoint, even on empty menus; content changes never repair or replace it. Reads use a repeatable-read snapshot and derive read-only `availableLanguages` from loaded names. General name fallback is default → Italian → Chinese → English, deduplicated; the staff UI explicitly selects Chinese before this chain. Descriptions follow the resolved name language. Item content DTOs exclude availability; the dedicated availability endpoint updates only that field. Every item content save requires allergen review, even when sold out. Keep price inputs in decimal strings and send integer cents within JavaScript’s safe range. `CatalogDeletionService.DeleteMenuItemAsync` always owns its transaction and locks the restaurant before the item; do not wrap it in an outer transaction. Table deletion also owns its transaction. Preserve historical order snapshots. See `docs/menu-management.md` for contracts and learning exercises.

## Tables and Public Menu Rules

Table labels are trimmed, 1–50 characters, and unique per restaurant with case-sensitive comparison. Rename and enabled-state writes update only their own field under the table row lock. QR tokens are server-generated random 32-byte Base64URL values and remain fixed until physical deletion; no rotation endpoint exists. Reuse the deletion service without an outer transaction; active sessions prevent deletion, while closed sessions retain snapshots with a null table link. Public bootstrap resolves ownership only from the QR token and reads entrance plus menu in one Repeatable Read transaction; `MenuReader` does not start its own transaction. It exposes no join codes, orders or account information and creates no sessions. Suspended restaurants and disabled tables still expose their menu with an explanatory status. Guest UI always offers zh/it/en, remembers explicit choices per restaurant, and otherwise uses the owner's preference. A confirmed invalid QR replaces cached menu data; network failures keep earlier data with a warning. QR PNGs are generated locally with `qrcode`; optional `VITE_PUBLIC_BASE_URL` must be an HTTP(S) origin. See `docs/tables-public-menu.md` for contracts, LAN setup and learning exercises.
