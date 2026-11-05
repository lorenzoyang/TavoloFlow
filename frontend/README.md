# Qiao TavoloFlow frontend

React 19 and TypeScript SPA with Vite, TanStack Router/Query and shadcn/ui on Base UI (`base-nova`).
The product name is Qiao TavoloFlow; repository paths and internal identifiers retain TavoloFlow.
For the ready-to-run Docker demo, start with the [root README](../README.md#quick-demo).

## Commands

Run from this directory with Node 24:

| Command                                             | Purpose                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm ci`                                            | Install the locked dependency set                                         |
| `npm run dev`                                       | Serve `http://localhost:5173`, proxying `/api` to `http://localhost:5093` |
| `npm run build`                                     | Run Vite, generate route tree and production output, then `tsc -b`        |
| `npm run lint`                                      | Oxlint checks                                                             |
| `npm run format` / `npm run format:check`           | Write/check Prettier formatting                                           |
| `node --test --test-isolation=none tests/*.test.ts` | Run pure TypeScript logic tests with Node's runner                        |
| `npm run preview`                                   | Preview production output at `http://localhost:4173`                      |

The API must run separately for native development. Vite uses strict port 5173 rather than silently
switching ports. `vite build` generates `src/routeTree.gen.ts` before TypeScript checks route types;
commit generated route changes and never edit that file manually. Router plugin precedes React and
uses automatic route code splitting.

## Structure and state

- `src/routes/`: URL/search configuration; route files stay thin.
- `src/features/`: feature APIs/query keys/types, pure `state.ts`, lifecycle hooks and page/view components.
- `src/components/`: shared page composites; `ui/` holds generated/adapted shadcn controls.
- `src/lib/`: scoped HTTP/CSRF, formatting, languages, query lifecycle and device preferences.
- `public/`: favicon, app icons, staff manifest and navigation-only service worker.

Store, Guest, Platform and anonymous requests use separate helpers in `lib/api.ts`. Anonymous menu
reads omit credentials. Protected query keys isolate identities and restaurant/account/visit data;
writes have no automatic retry or offline queue. The domain documents describe their recovery rules.

Node-tested pure modules use relative `.ts` imports rather than browser/React runtime dependencies or
`@/` aliases. Other source imports use `@/`. Shared UI, touch controls, state colors, responsive detail
views and confirmation conventions are in [AGENTS.md](../AGENTS.md#ui-conventions).

## Interface languages and themes

Regular store and platform pages support zh/it/en, sharing `tavoloflow:staff-language` in localStorage.
A valid saved value wins; otherwise select the first supported primary language from
`navigator.languages`, then English. Logout preserves the device choice. Guest menu language is saved
separately per restaurant and initially uses the owner's menu preference.

`lib/language.ts` defines the common Language type. Feature dictionaries contain all three translations;
shared staff components read the device preference, while guest callers pass guest labels explicitly.
Server error codes map to localized client text. Dish names follow the selected interface language
before the shared name-fallback chain; descriptions follow the resolved language.

Restaurant themes apply through `<html data-theme>` to signed-in staff and loaded guest menus,
including portals. Sign-in, first password change and platform pages use the default theme. Brand
palettes never redefine state colors. The PWA's standalone offline HTML follows the same saved-choice,
browser-language and English fallback rule without loading app assets; see
[PWA behavior](../docs/reference/pwa.md#service-worker-behavior).

## Deployment and QR origin

A deployment uses one public origin, for example `https://app.example.com`. Guest `/q/*`, store
`/staff/*`, platform `/platform/*` and `/api` all use it, and `/` redirects to `/staff`. Other sites on
the parent domain stay separate: no shared parent-domain cookies or CORS bridge is needed.

For a standalone frontend production build:

```bash
cp .env.production.example .env.production
npm run build
```

`VITE_PUBLIC_BASE_URL` controls public links and QR codes only. It must be an HTTP(S) origin without
credentials, path, query or fragment. Unset uses the browser origin. It is embedded at build time;
changing the server environment does not rewrite built QR URLs. Local `.env.production` is ignored by
Git; Vite development does not read it. For phone access, use `.env.local` with the reachable LAN origin
and `npm run dev -- --host 0.0.0.0`. See [QR behavior](../docs/reference/menu-tables.md#qr-images-and-printable-cards)
and the [phone testing guide](../docs/en/local-development.md#part-4-testing-from-a-phone).

Production releases build inside Docker from the repository root, without host environment files:

```bash
PUBLIC_ORIGIN=https://app.example.com bash deploy/build-release.sh
```

PUBLIC_ORIGIN is required and has no default. It must be lowercase HTTPS without port/path/trailing
slash; it is embedded as VITE_PUBLIC_BASE_URL and recorded in `public-origin.txt`. Server DOMAIN must
match or installation stops. Pass the same origin on subsequent builds.
Existing paper QR codes retain their old URLs and need reprinting or redirection after a host change.
The [self-hosting guide](../docs/en/self-hosting.md) owns the complete release procedure.

## Staff PWA

Install from the `/staff` business entry. Only StaffLayout links the manifest, including at login;
guest and platform routes do not. Registration runs only in production builds in a secure context.
Use `npm run build` followed by `npm run preview` to test installation and offline navigation locally.
The worker caches no API, page or assets and provides no offline write queue. See the
[PWA contract](../docs/reference/pwa.md) and [documentation index](../docs/README.md).
