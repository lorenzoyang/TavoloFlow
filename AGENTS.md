# Repository Guidelines

## Project Structure & Module Organization

- `TavoloFlow.slnx` groups the backend projects; `global.json` specifies the .NET SDK.
- `backend/TavoloFlow.Api/` contains the ASP.NET Core 10 controller-based API. Startup lives in `Program.cs`; `Entities/` contains the nine persistence entities, and `Data/` contains `ApplicationDbContext`, EF Core mappings and migrations, and catalog deletion services. `Accounts/` implements development account initialization, store authentication and authorization; `Controllers/AuthController.cs` exposes the account endpoints. Ordering workflows are not yet implemented.
- `backend/TavoloFlow.Api.Tests/` contains data-layer and account integration tests using disposable PostgreSQL containers and `WebApplicationFactory`.
- `frontend/src/` contains the React/TypeScript application. `routes/` defines TanStack file-based routes; `router.tsx` creates the router from the generated `routeTree.gen.ts`. Account pages, shared account components, and API/query logic live in `features/accounts/`; shared shadcn UI lives in `components/ui/`, utilities in `lib/`, and theme variables in `index.css`.
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

Keep route files thin: URL/search configuration belongs in `routes/`, while forms and account state belong in `features/accounts/`. `AuthBoundary` observes the shared identity query; do not duplicate authentication requests in route loaders. The store layout sets available width, and pages choose their own card width. Add UI components using the existing shadcn configuration (Base UI, `base-nova`, `neutral`); use semantic theme colors and preserve labels, focus styles, and at least 44px account form controls. Navigation uses TanStack `Link` with `buttonVariants` from `components/ui/button-variants.ts`; keep style utilities separate from component exports for Fast Refresh. The `Route` export lint exception applies only to route files.

## Testing Guidelines

Backend tests use xUnit, Coverlet, and Testcontainers.PostgreSql. The existing integration tests require Docker and apply real migrations to a disposable PostgreSQL database, separate from the development database. Write meaningful assertions; name new classes `<Subject>Tests` and methods `Method_Scenario_ExpectedResult`. Collect coverage with `dotnet test TavoloFlow.slnx --collect:"XPlat Code Coverage"`; no minimum threshold is configured. No frontend test runner exists yet; run build/lint and manually verify affected UI flows.

## Commit & Pull Request Guidelines

History uses short, scoped messages such as `backend: docker postgresql setup` and `docs: er-diagram`; follow that pattern. PRs should describe behavior changes, link relevant issues, and record validation commands/results. Include screenshots for visible UI changes and configuration or schema notes where relevant.

## Security & Configuration

Keep credentials in ignored `.env` files, environment variables, or .NET user secrets. Commit only safe example values. Docker Compose settings do not automatically configure the API connection string. Store authentication uses an HttpOnly session cookie with a fixed 16-hour ticket and CSRF validation on controller writes. Use `CurrentAccount` for trusted restaurant identity and the store authorization policies for business endpoints; only self-account operations may bypass the first-password-change requirement. Data Protection keys must stay outside Git and persist across deployments.
