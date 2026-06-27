/**
 * Domain errors — each implements `HttpError` from `@classytic/repo-core/errors`
 * so arc serializes them with a stable status + machine-readable `code`.
 * Codes extend hierarchically: `referral.<entity>.<problem>`.
 */
import type { HttpError } from '@classytic/repo-core/errors';

export class ReferralError extends Error implements HttpError {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

export class ReferralCodeNotFoundError extends ReferralError {
  constructor(code: string) {
    super(`Referral code "${code}" not found or inactive`, 'referral.code.not_found', 404);
  }
}

export class ReferralNotFoundError extends ReferralError {
  constructor(id: string) {
    super(`Referral ${id} not found`, 'referral.not_found', 404);
  }
}

/** A referrer cannot refer themselves. */
export class SelfReferralError extends ReferralError {
  constructor(ref: string) {
    super(`Self-referral is not allowed (${ref})`, 'referral.self_referral', 409);
  }
}

export class InvalidReferralTransitionError extends ReferralError {
  constructor(from: string, to: string) {
    super(`Invalid referral transition: ${from} → ${to}`, 'referral.invalid_transition', 409);
  }
}

/** An attached `ApprovalChain` (P7) is not yet fully approved. */
export class ReferralAwaitingApprovalError extends ReferralError {
  constructor(id: string, chainStatus: string) {
    super(
      `Referral ${id} cannot be approved yet — approval chain status is ${chainStatus}`,
      'referral.awaiting_approval',
      409,
    );
  }
}

export class VersionMismatchError extends ReferralError {
  constructor(id: string, expectedVersion: number) {
    super(
      `Concurrent modification on ${id} (expected version ${expectedVersion}) — retry.`,
      'referral.concurrency.version_mismatch',
      409,
    );
  }
}

/**
 * The backend does not declare the capabilities the engine needs. Attribution
 * relies on atomic `getOrCreate` (upsert) for idempotent codes + conversions;
 * without it, two concurrent conversions on one source would double-attribute.
 * Fail loud at boot rather than silently mis-attribute in production.
 */
export class ReferralCapabilityError extends ReferralError {
  constructor(missing: readonly string[]) {
    super(
      `[referral] backend missing required capabilities: ${missing.join(', ')}. ` +
        `Conversions + codes use atomic getOrCreate (upsert) for idempotency; ` +
        `the backend must support it (mongokit 3.16+ / repo-core 0.6+).`,
      'referral.engine.missing_capabilities',
      500,
    );
  }
}
