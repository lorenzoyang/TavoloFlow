# Documentation

Start with the [project README](../README.md) to run the local demo. This directory separates the
product's intended behavior from implementation contracts and the maintainer's personal notes.
The consolidated product and feature documents are in English; existing personal guides are in Italian.

## Product and data model

- [Product requirements](product-requirements.md): users, scope, visit lifecycle and acceptance criteria.
- [Database schema](er-diagram.dbml) and [ER diagram](er-diagram.png): the eleven-table persistence model.
  Deployed schema changes are defined by [EF migrations](../backend/TavoloFlow.Api/Data/Migrations/).

## Implementation contracts

| Document                                                | Covers                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Accounts and platform](accounts-platform.md)           | Three identities, cookies/CSRF, account initialization, restaurant administration and account recovery |
| [Menu, tables and public entrance](menu-tables.md)      | Menu editing, photos, allergens, language fallback, fixed QR codes and anonymous bootstrap             |
| [Dining and ordering](dining-ordering.md)               | Opening visits, guest access, code-free joining, carts, idempotent ordering and unknown results        |
| [Kitchen and pass](kitchen-pass.md)                     | Item processing, category screens, delivery, polling and audio                                         |
| [Billing and history](billing-history.md)               | Bill confirmation, PAID/EMPTY/VOIDED closure and historical queries                                    |
| [Restaurant subscriptions](restaurant-subscriptions.md) | Service periods, offline fee collection, concurrency and reminders                                     |
| [Staff PWA](pwa.md)                                     | Installation, navigation-only worker, offline page and tablet setup                                    |

These describe the current interfaces and their important invariants. Read controllers and DTOs for
exact wire types, services for transaction behavior, and tests for executable examples. Shared coding
and UI conventions live in [AGENTS.md](../AGENTS.md).

## Running and understanding the project

The following maintained guides are in Italian:

- [Development notes](it/development-notes.md): architecture, request flow, identities and design choices.
- [Local development](it/local-development.md): Docker demo, native development, tests and phone access.
- [Self-hosting](it/self-hosting.md): first deployment, releases, explicit migrations, backups and recovery.
- [Learning notes](it/learning-notes.md): the maintainer's personal learning outline.

The [frontend README](../frontend/README.md) gives English frontend commands and configuration notes.
Use the self-hosting guide for production operations; the demo and development Compose projects are
separate from production.

## Temporary maintainer notes

This temporary file preserves material for later review and is not an additional specification:

- [Data-layer learning material](temp-data-layer-notes.md): mapping, deletion and migration details
  retained for possible incorporation into the personal learning notes.

Historical stage-by-stage test counts and missing screenshot references have been removed from the
current guides. Their earlier versions remain in Git history; the validation sections describe what
to run and check, not a claim that all checks passed on the latest revision.
