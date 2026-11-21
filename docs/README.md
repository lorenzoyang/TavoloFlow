# Documentation

Start with the [project README](../README.md) to run the local demo. The documentation has two layers:

- **Guides** tell the story of the project: why it exists, how it is built, how to run and deploy it.
  The maintainer writes them in Italian first; the English and Chinese versions are translations with
  the same file names under `en/` and `zh-CN/`. When they differ, the Italian version is the reference.
- **Reference** documents describe the product's intended behavior and the implementation contracts.
  They stay in English only, so that there is a single version to keep in sync with the code.

## Guides

| Guide             | Covers                                                                | Languages                                                                                                     |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Development notes | Why the project exists, architecture, request flow and design choices | [English](en/development-notes.md) · [Italiano](it/development-notes.md) · [中文](zh-CN/development-notes.md) |
| Local development | Docker demo, native development, tests and testing from a phone       | [English](en/local-development.md) · [Italiano](it/local-development.md) · [中文](zh-CN/local-development.md) |
| Self-hosting      | First deployment, releases, explicit migrations, backups and recovery | [English](en/self-hosting.md) · [Italiano](it/self-hosting.md) · [中文](zh-CN/self-hosting.md)                |
| Releasing         | Everyday releases with two scripts: build and upload, then install    | [English](en/releasing.md) · [Italiano](it/releasing.md) · [中文](zh-CN/releasing.md)                         |
| Learning notes    | The maintainer's own notes on the technologies, tied to this code     | [Italiano](it/learning-notes.md) (in progress)                                                                |

The [frontend README](../frontend/README.md) gives English frontend commands and configuration notes.
The [online ordering design notes](online-ordering.md) describe the design and its implementation
history in Chinese.
Use the self-hosting guide for production operations; the demo and development Compose projects are
separate from production.

## Reference (English only)

### Product and data model

- [Product requirements](reference/product-requirements.md): users, scope, visit lifecycle and
  acceptance criteria.
- [Database schema](reference/er-diagram.dbml) and [ER diagram](reference/er-diagram.png): the
  23-table persistence model. Deployed schema changes are defined by
  [EF migrations](../backend/TavoloFlow.Api/Data/Migrations/).

### Implementation contracts

| Document                                                          | Covers                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Accounts and platform](reference/accounts-platform.md)           | Three identities, cookies/CSRF, account initialization, restaurant administration and account recovery |
| [Menu, tables and public entrance](reference/menu-tables.md)      | Menu editing, photos, allergens, language fallback, fixed QR codes and anonymous bootstrap             |
| [Dining and ordering](reference/dining-ordering.md)               | Opening visits, guest access, carts, guest and staff ordering, and unknown results                    |
| [Kitchen and pass](reference/kitchen-pass.md)                     | Item processing, category screens, delivery, polling and audio                                         |
| [Billing and history](reference/billing-history.md)               | Bill confirmation, PAID/EMPTY/VOIDED/NO_SHOW closure and historical queries                            |
| [Restaurant subscriptions](reference/restaurant-subscriptions.md) | Service periods, offline fee collection, concurrency and reminders                                     |
| [Staff and administrator PWAs](reference/pwa.md)                  | Installation, staff offline page, order and renewal notifications                                       |
| [Online ordering](reference/online-ordering.md)                   | Link and hours, customer pages, scheduled pickup, delivery fees and lock-screen push                   |

These describe the current interfaces and their important invariants. Read controllers and DTOs for
exact wire types, services for transaction behavior, and tests for executable examples. Shared coding
and UI conventions live in [AGENTS.md](../AGENTS.md).

## Temporary maintainer notes

This temporary file preserves material for later review and is not an additional specification:

- [Data-layer learning material](temp-data-layer-notes.md): mapping, deletion and migration details
  retained for possible incorporation into the personal learning notes.

Historical stage-by-stage test counts and missing screenshot references have been removed from the
current guides. Their earlier versions remain in Git history; the validation sections describe what
to run and check, not a claim that all checks passed on the latest revision.
