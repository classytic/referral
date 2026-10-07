# Changelog


## 0.2.1 — unreleased

### ⚠ Changed — string-key partial indexes are `{ $gte: '' }`, so lookups by key use them

A `{ $type: 'string' }` partial filter is never implied by an equality query, so a plain lookup by the
key could not use its own index. `$gte: ''` admits exactly the same rows (strings only) and is implied.
Renamed with a `_str` suffix (Mongo refuses one name with two filters): `code_1_str`.
**Deploy:** build the new indexes (they coexist with the old), then drop the old ones — be-prod:
`npm run db:ensure-indexes`, then `npm run db:retire-type-string-indexes -- --apply`.

## 0.2.0 - 2026-08-21

### Changed

- **Construction API:** `createReferral()` → `defineReferral(shape).bind(connection, runtime)` (Kernel Construction Standard). Pure describe phase; `.bind()` compiles schemas, wires repositories, runs the capability gate. `engine.dispose()` → `engine.close()`.
- **License:** relicensed from MIT to the **Classytic Source-Available License** (Community & Commercial). Evaluation/development use remains free; production use requires a commercial license. See `LICENSE`. Versions before 0.2.0 remain under MIT.
- `InProcessEventBus` is now a thin subclass of `@classytic/primitives/event-infra`'s shared implementation; `MemoryOutboxStore` re-exported from the shared runtime. No public API or wire-envelope change.
- Status transitions ride `applyTransition()` from mongokit — typed `InvalidReferralTransitionError` preserved, now thrown with accurate race context; version `$inc` uses the `inc` arg.
- **Peer floors raised:** `@classytic/mongokit >=3.22.0`, `@classytic/repo-core >=0.13.0`, `@classytic/primitives >=0.13.0`.

### Fixed

- `injectTenantField` no longer force-indexes the tenant field: the compound prepend makes the tenant the leading key of every index, so the bare single was a redundant prefix on every insert. A dedicated tenant index is still created when a schema declares no compounds.

## 0.1.0 — 2026-07-11

### Fixed (behavioral) — 2026-07-05 addendum

- **Silent event drop under host sessions (§P8.1).** `emitDomainEvent`
  returned early under `ctx.session` — correct with an outbox (relay-only),
  but with NO outbox the event vanished entirely. That shape now throws the
  new `UnmanagedSessionError` (`referral.session.unmanaged`) BEFORE any
  side effect; session + outbox remains legal durable-relay-only mode.
- **Stack floors raised** — peers `@classytic/mongokit >=3.18.0`,
  `@classytic/repo-core >=0.7.0`; suite verified against those versions.

Initial release — referral **attribution** engine (single responsibility).

- `createReferral()` engine — multi-tenant, collection-prefixable, model-collision guarded.
- `ReferralCode` repo — `generateCode` (idempotent per owner), `lookupByCode`, `deactivate`.
- `Referral` repo — `recordConversion` (idempotent per source, self-referral guard), `approve`/`reject` gated by `ApprovalChain` (`@classytic/primitives/approval`, P7), `updateApprovals`, `listForReferrer`.
- `engine.attributeSale({ code, sourceRef, ... })` — the checkout convenience: resolve code → referrer + record the conversion in one call.
- Zod event catalog (`referralEventDefinitions`): `referral:code.created`, `referral:converted`, `referral:approved`, `referral:rejected`.
- Does NOT move money (revenue) or award points (loyalty) — emits `referral:converted` for the host to reward however it likes.
