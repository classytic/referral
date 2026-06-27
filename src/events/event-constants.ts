/**
 * REFERRAL_EVENTS — domain event constants. Prefix `referral:` per
 * PACKAGE_RULES §12. Hosts subscribe glob-style so typos are compile errors.
 */
export const REFERRAL_EVENTS = {
  CODE_CREATED: 'referral:code.created',
  CODE_DEACTIVATED: 'referral:code.deactivated',
  CONVERTED: 'referral:converted',
  APPROVED: 'referral:approved',
  REJECTED: 'referral:rejected',
} as const;

export type ReferralEventName = (typeof REFERRAL_EVENTS)[keyof typeof REFERRAL_EVENTS];
