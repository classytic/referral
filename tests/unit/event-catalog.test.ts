import { describe, expect, it } from 'vitest';
import { REFERRAL_EVENTS } from '../../src/events/event-constants.js';
import {
  referralEventDefinitions,
  Converted,
  Approved,
} from '../../src/events/event-catalog.js';

describe('referral event catalog', () => {
  it('covers every REFERRAL_EVENTS constant (no-drift invariant)', () => {
    const defined = new Set(referralEventDefinitions.map((d) => d.name));
    expect(Object.values(REFERRAL_EVENTS).filter((n) => !defined.has(n))).toEqual([]);
  });

  it('has no orphan definitions (catalog ⊆ constants)', () => {
    const names = new Set<string>(Object.values(REFERRAL_EVENTS));
    expect(referralEventDefinitions.filter((d) => !names.has(d.name))).toEqual([]);
  });

  it('every definition exposes a JSON schema arc can register', () => {
    for (const def of referralEventDefinitions) {
      expect(def.version).toBeGreaterThanOrEqual(1);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.schema).toBeTypeOf('object');
    }
  });

  it('Converted requires source + referrer', () => {
    expect(
      Converted.zodSchema.safeParse({
        referralId: 'r1',
        code: 'ABC',
        referrerRef: 'u1',
        referrerModel: 'user',
        sourceRef: 'order_1',
        sourceModel: 'Order',
      }).success,
    ).toBe(true);
    expect(Converted.zodSchema.safeParse({ referralId: 'r1', code: 'ABC' }).success).toBe(false);
  });

  it('Approved requires an ISO datetime', () => {
    const base = { referralId: 'r1', code: 'ABC', referrerRef: 'u1', referrerModel: 'user' };
    expect(Approved.zodSchema.safeParse({ ...base, approvedAt: '2026-06-27T10:00:00Z' }).success).toBe(true);
    expect(Approved.zodSchema.safeParse({ ...base, approvedAt: 'nope' }).success).toBe(false);
  });
});
