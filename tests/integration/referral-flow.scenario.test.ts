/**
 * Scenario — the attribution lifecycle: issue a code, resolve it, attribute a
 * sale (with dedupe + self-referral guard), and run the approve/reject gate.
 */
import { describe, expect, it } from 'vitest';
import { useIntegrationReferral } from '../helpers/lifecycle.js';
import { makeCtx } from '../helpers/fixtures.js';
import { SelfReferralError } from '../../src/domain/errors/referral.errors.js';

const REFERRER = 'user_referrer_1';
const BUYER = 'user_buyer_1';

describe('referral attribution flow', () => {
  const getEngine = useIntegrationReferral();

  it('issues an idempotent code per owner and resolves it', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const a = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    const b = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    expect(a.code).toBe(b.code); // same owner → same active code
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const resolved = await engine.resolveReferrer(a.code, ctx);
    expect(resolved).toMatchObject({ ownerRef: REFERRER, ownerModel: 'user' });
    expect(await engine.resolveReferrer('NOSUCHCODE', ctx)).toBeNull();
  });

  it('attributes a sale and dedupes by source', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);

    const r1 = await engine.attributeSale(
      { code, refereeRef: BUYER, refereeModel: 'user', sourceRef: 'order_1', sourceModel: 'Order' },
      ctx,
    );
    expect(r1).not.toBeNull();
    expect(r1?.referrerRef).toBe(REFERRER);
    expect(r1?.status).toBe('converted');

    // Re-firing the same source returns the SAME referral (idempotent).
    const r2 = await engine.attributeSale(
      { code, refereeRef: BUYER, refereeModel: 'user', sourceRef: 'order_1', sourceModel: 'Order' },
      ctx,
    );
    expect(String(r2?._id)).toBe(String(r1?._id));

    const list = await engine.repositories.referral.listForReferrer(REFERRER, ctx);
    expect(list.data).toHaveLength(1);
  });

  it('returns null for an unknown code (sale proceeds, no attribution)', async () => {
    const engine = getEngine();
    const r = await engine.attributeSale(
      { code: 'UNKNOWN1', sourceRef: 'order_2', sourceModel: 'Order' },
      makeCtx(),
    );
    expect(r).toBeNull();
  });

  it('blocks self-referral', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    await expect(
      engine.attributeSale(
        { code, refereeRef: REFERRER, refereeModel: 'user', sourceRef: 'order_3', sourceModel: 'Order' },
        ctx,
      ),
    ).rejects.toBeInstanceOf(SelfReferralError);
  });

  it('runs the approve / reject gate', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);

    const conv = await engine.attributeSale(
      { code, sourceRef: 'order_ok', sourceModel: 'Order' },
      ctx,
    );
    const approved = await engine.repositories.referral.approve(String(conv?._id), { decidedBy: 'mgr' }, ctx);
    expect(approved.status).toBe('approved');

    const conv2 = await engine.attributeSale(
      { code, sourceRef: 'order_bad', sourceModel: 'Order' },
      ctx,
    );
    const rejected = await engine.repositories.referral.reject(
      String(conv2?._id),
      { reason: 'fraud' },
      ctx,
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.reason).toBe('fraud');
  });

  it('deactivates a code so it no longer resolves', async () => {
    const engine = getEngine();
    const ctx = makeCtx();
    const { code } = await engine.repositories.referralCode.generateCode(REFERRER, 'user', ctx);
    await engine.repositories.referralCode.deactivate(code, ctx);
    expect(await engine.resolveReferrer(code, ctx)).toBeNull();
  });
});
