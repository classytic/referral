# @classytic/referral

Referral **attribution** engine for MongoDB — shareable codes, who-referred-whom, conversion tracking, dedupe + self-referral guard, and an optional approve/reject review gate.

**Single responsibility.** It answers *"who drove this sale"* — nothing more. It does **not** move money (that's `@classytic/revenue` — make the referrer a split participant) and does **not** award points (that's `@classytic/loyalty`). It emits `referral:converted`; the host rewards however it likes. Clean bounded context, composable.

## Install

```sh
npm i @classytic/referral
```

Peers: `@classytic/mongokit >=3.16`, `@classytic/primitives >=0.7.1`, `@classytic/repo-core >=0.6`, `mongoose >=9.4`, `zod >=4`.

## Quick start

```ts
import { createReferral } from '@classytic/referral';

const referral = await createReferral({
  connection: mongoose.connection,
  tenant: { fieldType: 'objectId' },
});

// A creator/affiliate gets a shareable code (idempotent per owner).
const { code } = await referral.repositories.referralCode.generateCode(creatorId, 'user', ctx);

// At checkout: resolve the code → referrer and record the attribution in one call.
const r = await referral.attributeSale(
  { code, refereeRef: buyerId, refereeModel: 'user', sourceRef: orderId, sourceModel: 'Order' },
  ctx,
);
// r === null → unknown code (sale just proceeds). Otherwise a Referral (status 'converted').

// Optional review gate (fraud/eligibility) before rewarding:
await referral.repositories.referral.approve(String(r._id), { decidedBy: mgrId }, ctx);
```

## How the host rewards the referrer

`attributeSale` returns the referrer; turn that into whatever reward fits:

- **Money cut** (recommended): add the referrer as a `referrer` participant in your `@classytic/revenue` split → settlement → wallet → payout.
- **Affiliate % with tiers/clawbacks**: feed it to `@classytic/commission`.
- **Points** (refer-a-friend): `@classytic/loyalty`.

## API

- `referralCode`: `generateCode(ownerRef, ownerModel, ctx)` (idempotent), `lookupByCode(code, ctx)`, `deactivate(code, ctx)`.
- `referral`: `recordConversion(input, ctx)` (idempotent per source, self-referral guard), `approve` / `reject` (gated by `ApprovalChain` from `@classytic/primitives/approval`, P7), `updateApprovals`, `listForReferrer`.
- `engine`: `resolveReferrer(code, ctx)`, `attributeSale(input, ctx)`, `syncIndexes()`, `destroy()`.
- Events: `referral:code.created` / `code.deactivated` / `converted` / `approved` / `rejected` (`referralEventDefinitions` for arc's registry).

## Conventions

Built on `@classytic/primitives` + `@classytic/repo-core` per `PACKAGE_RULES.md`. ESM-only, subpath `exports`, `verbatimModuleSyntax`, no sourcemaps/declaration maps. Multi-tenant, soft-delete, dedupe via partial-unique indexes. Tests follow `testing-infrastructure.md` (unit + integration + tenant probe).
