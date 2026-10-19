# Repository Guidelines

## Project Structure & Module Organization

- `TavoloFlow.slnx` groups the backend projects; `global.json` specifies the .NET SDK.
- `backend/TavoloFlow.Api/` contains the ASP.NET Core 10 controller-based API. Startup lives in `Program.cs`; `Data/` is reserved for persistence code. EF Core and Npgsql dependencies are installed, but database integration is not yet wired up.
- `backend/TavoloFlow.Api.Tests/` contains API tests.
- `frontend/src/` contains the React/TypeScript application, shared UI in `components/ui/`, utilities in `lib/`, and styles in `index.css`. Vite, Tailwind CSS, and shadcn configure the frontend.
- `docs/` contains product requirements and the DBML schema. Root `compose.yaml` defines local PostgreSQL.

## Build, Test, and Development Commands

Run backend and infrastructure commands from the repository root:

- `cp .env.example .env`: initialize local database settings; replace the password before starting PostgreSQL.
- `docker compose up -d db`: start PostgreSQL on localhost port 5432.
- `dotnet build TavoloFlow.slnx`: restore dependencies and build the backend solution.
- `dotnet run --project backend/TavoloFlow.Api --launch-profile https`: start the API at `https://localhost:7298`.
- `dotnet test TavoloFlow.slnx`: run backend tests.

From `frontend/`, run `npm install` to install dependencies, `npm run dev` for development, `npm run build` for TypeScript checking and production output, `npm run lint` for Oxlint, and `npm run preview` to preview the build.

## Coding Style & Naming Conventions

Use four-space indentation in C# and two spaces in TypeScript/TSX. Use PascalCase for C# types/methods and React components; use camelCase for JavaScript functions and variables. Prefer file-scoped C# namespaces and preserve nullable annotations. Use `@/` imports for frontend source paths. Match surrounding quote and semicolon conventions; no shared formatter is configured. Oxlint checks React hooks and TypeScript rules.

## Testing Guidelines

Backend tests use xUnit and Coverlet. Replace placeholder tests with meaningful assertions; name new classes `<Subject>Tests` and methods `Method_Scenario_ExpectedResult`. Collect coverage with `dotnet test TavoloFlow.slnx --collect:"XPlat Code Coverage"`; no minimum threshold is configured. No frontend test runner exists yet; run build/lint and manually verify affected UI flows.

## Commit & Pull Request Guidelines

History uses short, scoped messages such as `backend: docker postgresql setup` and `docs: er-diagram`; follow that pattern. PRs should describe behavior changes, link relevant issues, and record validation commands/results. Include screenshots for visible UI changes and configuration or schema notes where relevant.

## Security & Configuration

Keep credentials in ignored `.env` files, environment variables, or .NET user secrets. Commit only safe example values. Docker Compose settings do not automatically configure the API connection string.
