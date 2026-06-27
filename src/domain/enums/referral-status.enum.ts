/**
 * Referral lifecycle status.
 *
 *   converted → approved | rejected
 *
 * A referral is created already `converted` (the sale happened). A host that
 * wants a review gate (fraud, eligibility) approves/rejects it; the reward is
 * paid only on `approved`.
 */
export const REFERRAL_STATUS = {
  CONVERTED: 'converted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const satisfies Record<string, string>;

export const REFERRAL_STATUS_VALUES = ['converted', 'approved', 'rejected'] as const;

export type ReferralStatus = (typeof REFERRAL_STATUS_VALUES)[number];

const SET = new Set<string>(REFERRAL_STATUS_VALUES);
export const isReferralStatus = (v: unknown): v is ReferralStatus =>
  typeof v === 'string' && SET.has(v);

export const REFERRAL_TRANSITIONS: Record<ReferralStatus, readonly ReferralStatus[]> = {
  converted: ['approved', 'rejected'],
  approved: [], // terminal
  rejected: [], // terminal — a wrongful reject is handled by the host (new attribution), not a reopen
};

export function canReferralTransition(from: ReferralStatus, to: ReferralStatus): boolean {
  return REFERRAL_TRANSITIONS[from].includes(to);
}
