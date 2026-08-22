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

/**
 * Thrown when a host passes ctx.session (it owns the outer transaction)
 * but NO outbox is wired: publishing immediately would leak ghost events
 * on rollback, and the pre-guard behavior silently DROPPED the event.
 * Wire an OutboxStore — session + outbox is legal durable-relay-only
 * mode (§P8.1: the row commits with the host tx, the relay delivers).
 */
export class UnmanagedSessionError extends ReferralError {
  constructor() {
    super(
      'ctx.session provided but no OutboxStore is wired — events would be lost. ' +
        'Wire an outbox (durable relay delivers post-commit) or drop the session.',
      'referral.session.unmanaged',
      409,
    );
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
 * A required capability is missing — raised by `defineReferral.bind` for either of the two
 * things it verifies:
 *
 *  - **the BACKEND's** atomic `getOrCreate` / `upsert`, which is what makes codes + conversions
 *    idempotent; without it two concurrent conversions on one source double-attribute;
 *  - **an injected OUTBOX's** `transactionalSave`, without which events persist for mutations
 *    that later roll back.
 *
 * The message no longer asserts the upsert explanation for every case: it described the backend
 * reason unconditionally, so an outbox failure printed a misleading remedy ("the backend must
 * support it (mongokit 3.16+)") for a problem that has nothing to do with the backend or its
 * version. The missing-flag strings carry their own explanation instead.
 */
export class ReferralCapabilityError extends ReferralError {
  constructor(missing: readonly string[]) {
    super(
      `[referral] missing required capabilities: ${missing.join(', ')}. ` +
        `Referral fails loud at bind rather than mis-attributing (or emitting ghost events) ` +
        `in production.`,
      'referral.engine.missing_capabilities',
      500,
    );
  }
}
