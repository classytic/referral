/**
 * Kernel Construction Standard conformance — the EXECUTABLE §11 invariant list.
 *
 * The suite lives in `@classytic/mongokit/kernel-conformance` (a kernel may never depend on
 * arc, and every kernel already depends on mongokit), and is RUN here rather than
 * copy-pasted: when the standard gains a check, this file gets it on the next install.
 *
 * Unit project — `mongoose.createConnection()` is never connected, which is all these checks
 * need: model registration, schema identity and the index-call spies are registry-level, and
 * an unconnected connection also guarantees mongoose's own `autoIndex` cannot muddy the
 * "bind performs no index I/O" observation.
 */
import { describeKernelConformance } from '@classytic/mongokit/kernel-conformance';
import type { EventTransport } from '@classytic/primitives/events';
import mongoose from 'mongoose';
import { describe, it } from 'vitest';
import type { ReferralBlueprint } from '../../src/engine/define-referral.js';
import type { ReferralEngine } from '../../src/engine/engine-types.js';
import * as kernel from '../../src/index.js';

/** Quiet the engine's default `console` logger for the conformance binds. */
const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

describeKernelConformance<ReferralBlueprint, ReferralEngine>({
  name: 'referral',
  runner: { describe, it },

  // A FACTORY, so the suite can watch `defineReferral` run and prove it registers nothing.
  // No `forceRecreate` — the collision check needs a real collision.
  blueprint: () => kernel.defineReferral({ tenant: false, autoIndex: false }),

  connect: async () => mongoose.createConnection(),

  bind: (blueprint, connection, ctx) =>
    blueprint.bind(connection, {
      logger: silentLogger,
      ...(ctx.transport ? { eventTransport: ctx.transport as unknown as EventTransport } : {}),
    }),

  expectedModelNames: ['ReferralCode', 'Referral'],
  moduleExports: kernel,

  /**
   * §11.5 — an unmet runtime requirement must fail the bind.
   *
   * This check used to be SKIPPED with a long "OPEN DEFECT" note, and the note was half right.
   * It correctly identified that referral's boot gate enforced nothing: `getOrCreate` and
   * `upsert` are properties of the mongo driver rather than of a deployment, so mongokit reports
   * them `true` unconditionally and no test (nor any real deployment) could leave them unmet.
   *
   * Its proposed remedy was wrong, though, and worth recording because it is a tempting mistake:
   * it suggested referral should require `transactions`, on the belief that `convert()` writes the
   * Referral row AND bumps a ReferralCode counter. It does not. `attributeSale` is one read
   * (`lookupByCode`) plus ONE atomic `getOrCreate`; the only `$inc` in the package is a version
   * bump inside `deactivate`, already guarded by `claim()`. Requiring `transactions` would have
   * invented a requirement no code path needs — decoration of the opposite kind.
   *
   * The genuine unmet-able requirement was the one the note listed second: an injected outbox
   * that does not enlist `ctx.session`. Enforcing THAT (defineReferral.bind) is what makes this
   * check exercisable, so the skip is gone.
   */
  bindWithUnmetRequirement: (connection) =>
    kernel.defineReferral({ tenant: false, autoIndex: false }).bind(connection, {
      logger: silentLogger,
      /**
       * A structurally valid `OutboxStore` that simply does not promise session enlistment —
       * `transactionalSave` absent, which is exactly the shape a hand-rolled host store has.
       * The bind must refuse it.
       */
      outbox: {
        save: async () => undefined,
      } as never,
    }),

  /**
   * The same gate, now under its OWN check id — because §11.5 passing here proves nothing
   * about the 32 other kernels whose runtime accepts an outbox, and only a handful verify the
   * flag. Referral is the case that motivated it: a ghost `referral.converted` naming an
   * attribution that never committed, which a downstream commission payout then acts on.
   *
   * Also the regression guard for the error's SHAPE. The capability error used to assert the
   * upsert/backend remedy unconditionally, so an outbox failure printed "the backend must
   * support it (mongokit 3.16+)" — the wrong layer entirely. The check requires the message to
   * name `transactionalSave`, so that cannot come back.
   */
  bindWithNonTransactionalOutbox: (connection) =>
    kernel.defineReferral({ tenant: false, autoIndex: false }).bind(connection, {
      logger: silentLogger,
      outbox: { save: async () => undefined } as never,
    }),

  skip: [
    {
      check: 'optional-modules-register-no-models',
      reason:
        'referral declares TWO models (`ReferralCode`, `Referral`) and no optional model ' +
        'families — src/models/create-models.ts says so in its own doc comment and its `models` ' +
        'array is a fixed pair with no conditional spec. A conversion row is meaningless without ' +
        'the code that produced it, so there is no smaller model set to describe and §11.10 has ' +
        'nothing to assert here.',
    },
  ],
});
