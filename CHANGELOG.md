# Changelog

## 0.1.0 (unreleased)

Initial release — referral **attribution** engine (single responsibility).

- `createReferral()` engine — multi-tenant, collection-prefixable, model-collision guarded.
- `ReferralCode` repo — `generateCode` (idempotent per owner), `lookupByCode`, `deactivate`.
- `Referral` repo — `recordConversion` (idempotent per source, self-referral guard), `approve`/`reject` gated by `ApprovalChain` (`@classytic/primitives/approval`, P7), `updateApprovals`, `listForReferrer`.
- `engine.attributeSale({ code, sourceRef, ... })` — the checkout convenience: resolve code → referrer + record the conversion in one call.
- Zod event catalog (`referralEventDefinitions`): `referral:code.created`, `referral:converted`, `referral:approved`, `referral:rejected`.
- Does NOT move money (revenue) or award points (loyalty) — emits `referral:converted` for the host to reward however it likes.
