/**
 * Certification scenarios — the guarantees a production referral system must
 * hold under adversarial conditions:
 *
 *   1. Concurrency: N parallel conversions on one source → exactly ONE
 *      attribution (no double-credit), and N parallel code issuances for one
 *      owner → exactly ONE active code.
 *   2. Review gate (P7): an attached `ApprovalChain` blocks `approve` until the
 *      chain itself is approved.
 *   3. FSM integrity: terminal states reject further transitions.
 *   4. Event stream: every state change emits its durable domain event.
 *   5. Tenant isolation: codes + attributions never leak across organizations.
 *
 * These are the "fail this and it is not shippable" properties — the same bar a
 * bank/Stripe-grade attribution ledger is held to.
 */
import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@classytic/primitives/events';
import { createChain, applyDecision } from '@classytic/primitives/approval';
import { useIntegrationReferral } from '../helpers/lifecycle.js';
import { makeCtx } from '../helpers/fixtures.js';
import {
  InvalidReferralTransitionError,
  ReferralAwaitingApprovalError,
} from '../../src/domain/errors/referral.errors.js';

const REFERRER = 'user_referrer_cert';

describe('certification — concurrency & idempotency', () => {
  const getEngine = useIntegrationReferral();

  it('20 concurrent conversions on one source → exactly ONE attribution', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        engine.attributeSale(
          { code, refereeRef: 'buyer_1', refereeModel: 'user', sourceRef: 'order_race', sourceModel: 'Order' },
          ctx,
        ),
      ),
    );

    // Every call resolves to the SAME referral document (no torn writes).
    const ids = new Set(results.map((r) => String(r?._id)));
    expect(ids.size).toBe(1);

    // And the ledger holds exactly one row for that source.
    const list = await engine.repositories.referral.listForReferrer(REFERRER, ctx);
    expect(list.data).toHaveLength(1);
  });

  it('15 concurrent code issuances for one owner → exactly ONE active code', async () => {
    const engine = getEngine();
    const ctx = makeCtx();

    const docs = await Promise.all(
      Array.from({ length: 15 }, () =>
        engine.repositories.referralCode.generateCode('owner_race', 'organization', ctx),
      ),
    );

    const codes = new Set(docs.map((d) => d.code));
    expect(codes.size).toBe(1); // all converge on the single owner-unique active code
  });

  it('distinct sources each attribute independently (dedupe is per-source, not per-referrer)', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);

    await Promise.all(
      ['o1', 'o2', 'o3'].map((src) =>
        engine.attributeSale({ code, sourceRef: src, sourceModel: 'Order' }, ctx),
      ),
    );
    const list = await engine.repositories.referral.listForReferrer(REFERRER, ctx);
    expect(list.data).toHaveLength(3);
  });
});

describe('certification — review gate (P7 ApprovalChain)', () => {
  const getEngine = useIntegrationReferral();

  it('a pending approval chain blocks approve until the chain itself approves', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    const conv = await engine.attributeSale({ code, sourceRef: 'order_gated', sourceModel: 'Order' }, ctx);
    const id = String(conv?._id);

    // Attach a single-step manager-approval chain (host policy, P7 primitive).
    const pending = createChain({
      order: 'sequential',
      steps: [{ id: 'manager', approvers: [{ id: 'mgr_1' }] }],
    });
    await engine.repositories.referral.updateApprovals(id, pending, ctx);

    // Gate closed → approve must refuse.
    await expect(
      engine.repositories.referral.approve(id, { decidedBy: 'mgr_1' }, ctx),
    ).rejects.toBeInstanceOf(ReferralAwaitingApprovalError);

    // Manager decides → chain approved → persist it → now approve passes.
    const approvedChain = applyDecision(pending, {
      stepId: 'manager',
      approverId: 'mgr_1',
      decision: 'approved',
    });
    await engine.repositories.referral.updateApprovals(id, approvedChain, ctx);

    const approved = await engine.repositories.referral.approve(id, { decidedBy: 'mgr_1' }, ctx);
    expect(approved.status).toBe('approved');
  });

  it('a rejected approval chain keeps the gate closed', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    const conv = await engine.attributeSale({ code, sourceRef: 'order_rej', sourceModel: 'Order' }, ctx);
    const id = String(conv?._id);

    const chain = applyDecision(
      createChain({ order: 'sequential', steps: [{ id: 'manager', approvers: [{ id: 'mgr_1' }] }] }),
      { stepId: 'manager', approverId: 'mgr_1', decision: 'rejected' },
    );
    await engine.repositories.referral.updateApprovals(id, chain, ctx);

    await expect(
      engine.repositories.referral.approve(id, {}, ctx),
    ).rejects.toBeInstanceOf(ReferralAwaitingApprovalError);
  });
});

describe('certification — FSM integrity (terminal states)', () => {
  const getEngine = useIntegrationReferral();

  it('approved is terminal — re-approve and reject both fail', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    const conv = await engine.attributeSale({ code, sourceRef: 'order_t1', sourceModel: 'Order' }, ctx);
    const id = String(conv?._id);

    await engine.repositories.referral.approve(id, {}, ctx);
    await expect(engine.repositories.referral.approve(id, {}, ctx)).rejects.toBeInstanceOf(
      InvalidReferralTransitionError,
    );
    await expect(engine.repositories.referral.reject(id, {}, ctx)).rejects.toBeInstanceOf(
      InvalidReferralTransitionError,
    );
  });

  it('rejected is terminal — cannot be approved afterwards', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    const conv = await engine.attributeSale({ code, sourceRef: 'order_t2', sourceModel: 'Order' }, ctx);
    const id = String(conv?._id);

    await engine.repositories.referral.reject(id, { reason: 'fraud' }, ctx);
    await expect(engine.repositories.referral.approve(id, {}, ctx)).rejects.toBeInstanceOf(
      InvalidReferralTransitionError,
    );
  });
});

describe('certification — event stream', () => {
  const getEngine = useIntegrationReferral();

  it('emits converted then approved with stable payloads', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const seen: DomainEvent[] = [];
    const off = await engine.events.subscribe('referral:*', async (e) => {
      seen.push(e);
    });

    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    const conv = await engine.attributeSale({ code, sourceRef: 'order_evt', sourceModel: 'Order' }, ctx);
    await engine.repositories.referral.approve(String(conv?._id), { decidedBy: 'mgr_1' }, ctx);
    await off();

    const types = seen.map((e) => e.type);
    expect(types).toContain('referral:converted');
    expect(types).toContain('referral:approved');

    const approvedEvt = seen.find((e) => e.type === 'referral:approved');
    expect(approvedEvt?.payload).toMatchObject({ referrerRef: REFERRER, code });
    expect((approvedEvt?.payload as { approvedAt?: string }).approvedAt).toBeTruthy();
  });
});

describe('certification — tenant isolation', () => {
  const getEngine = useIntegrationReferral();

  it('a code + attribution in org A is invisible to org B', async () => {
    const engine = getEngine();
    const orgA = makeCtx();
    const orgB = makeCtx();

    const { code } = await engine.repositories.referralCode.generateCode('shared_owner', 'user', orgA);

    // Org B cannot resolve org A's code…
    expect(await engine.resolveReferrer(code, orgB)).toBeNull();
    // …and the same string can be (re)issued independently inside org A only.
    expect(await engine.resolveReferrer(code, orgA)).not.toBeNull();

    // Attribute in A, then prove B's ledger view is empty.
    await engine.attributeSale({ code, sourceRef: 'order_iso', sourceModel: 'Order' }, orgA);
    const aList = await engine.repositories.referral.listForReferrer('shared_owner', orgA);
    const bList = await engine.repositories.referral.listForReferrer('shared_owner', orgB);
    expect(aList.data).toHaveLength(1);
    expect(bList.data).toHaveLength(0);
  });
});
