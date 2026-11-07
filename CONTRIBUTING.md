# Contributing to TavoloFlow

Thanks for your interest. Issues and pull requests are welcome: bug reports, fixes, translations and
documentation improvements in particular.

## Before you start

- **Try the demo first.** `docker compose -f demo/compose.yaml up -d` starts a complete restaurant
  with sample data; see the [quick demo](README.md#quick-demo).
- **Check the scope.** TavoloFlow deliberately stays small: there are no order printers, online
  payments, split bills, stock management, takeaway or push notifications. The
  [product requirements](docs/reference/product-requirements.md) describe what is in and out. For a
  new feature, please open an issue to discuss it before writing code.
- **Read [AGENTS.md](AGENTS.md).** It holds the layout, the coding and UI conventions and the domain
  rules (lock order, state gates, recovery) that every change must keep.

## Development setup

The [local development guide](docs/en/local-development.md) covers the .NET SDK, Node 24, the
database and how to try the app from a phone.

## Checks

CI runs these on every pull request; please run them before opening one:

```bash
# Backend (Docker must be running for the tests)
dotnet tool restore
dotnet csharpier check .
dotnet build TavoloFlow.slnx
dotnet test TavoloFlow.slnx

# Frontend
cd frontend
npm ci
npm run format:check
npm run lint
node --test --test-isolation=none tests/*.test.ts
npm run build
```

## Guidelines

- **Every user-facing string in three languages.** Store, platform and guest copy lives in each
  feature's `messages.ts` in Chinese, Italian and English; a missing translation fails `tsc`. If you
  only know one or two of the languages, say so in the pull request and we will complete it.
- **Schema changes** need an EF Core migration; migrations are forward-only and never run at startup.
- **Behaviour changes** update the matching contract in `docs/reference/`.
- **Commits** use short, scoped messages, for example `backend: kitchen cursor fix` or
  `frontend: guest cart limits`.
- **Pull requests** describe the behaviour change, the commands you ran and, for visible UI changes,
  include screenshots (check phone width, 360px, in every language).

## Reporting security issues

Please do not open a public issue for a vulnerability. Use GitHub's
[private vulnerability reporting](https://github.com/lorenzoyang/TavoloFlow/security/advisories/new)
instead; [SECURITY.md](SECURITY.md) explains what to include and what is in scope.

## License

TavoloFlow is licensed under the [GNU Affero General Public License v3.0](LICENSE). By contributing,
you agree that your contributions are licensed under the same license.
