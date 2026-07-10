# Changelog

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
