# Repository Guidelines

## Project Structure & Module Organization

- `TavoloFlow.slnx` groups the backend projects; `global.json` specifies the .NET SDK.
- `backend/TavoloFlow.Api/` contains the ASP.NET Core 10 controller-based API. Startup lives in `Program.cs`; `Entities/` contains the nine persistence entities, and `Data/` contains `ApplicationDbContext`, EF Core mappings and migrations, and catalog deletion services. `Accounts/` implements development account initialization, store authentication and authorization; `Controllers/AuthController.cs` exposes the account endpoints. Ordering workflows are not yet implemented.
- `backend/TavoloFlow.Api.Tests/` contains data-layer and account integration tests using disposable PostgreSQL containers and `WebApplicationFactory`.
- `frontend/src/` contains the React/TypeScript application, account pages and API/query logic in `features/accounts/`, code-based TanStack routes in `router.tsx`, shared UI in `components/ui/`, utilities in `lib/`, and styles in `index.css`. Vite, Tailwind CSS, and shadcn configure the frontend.
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

## Coding Style & Naming Conventions

Use four-space indentation in C# and two spaces in TypeScript/TSX. Use PascalCase for C# types/methods and React components; use camelCase for JavaScript functions and variables. Prefer file-scoped C# namespaces and preserve nullable annotations. Use `@/` imports for frontend source paths. Match surrounding quote and semicolon conventions; no shared formatter is configured. Oxlint checks React hooks and TypeScript rules.

## Testing Guidelines

Backend tests use xUnit, Coverlet, and Testcontainers.PostgreSql. The existing integration tests require Docker and apply real migrations to a disposable PostgreSQL database, separate from the development database. Write meaningful assertions; name new classes `<Subject>Tests` and methods `Method_Scenario_ExpectedResult`. Collect coverage with `dotnet test TavoloFlow.slnx --collect:"XPlat Code Coverage"`; no minimum threshold is configured. No frontend test runner exists yet; run build/lint and manually verify affected UI flows.

## Commit & Pull Request Guidelines

History uses short, scoped messages such as `backend: docker postgresql setup` and `docs: er-diagram`; follow that pattern. PRs should describe behavior changes, link relevant issues, and record validation commands/results. Include screenshots for visible UI changes and configuration or schema notes where relevant.

## Security & Configuration

Keep credentials in ignored `.env` files, environment variables, or .NET user secrets. Commit only safe example values. Docker Compose settings do not automatically configure the API connection string. Store authentication uses an HttpOnly session cookie with a fixed 16-hour ticket and CSRF validation on controller writes. Use `CurrentAccount` for trusted restaurant identity and the store authorization policies for business endpoints; only self-account operations may bypass the first-password-change requirement. Data Protection keys must stay outside Git and persist across deployments.
