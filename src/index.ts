/**
 * @classytic/referral — referral ATTRIBUTION engine.
 *
 * Codes + who-referred-whom + conversion + review gate. Single responsibility:
 * it answers "who drove this sale". It does NOT move money (that's
 * `@classytic/revenue`) or award points (that's `@classytic/loyalty`) — the
 * host turns a `referral:converted` into a split participant / commission /
 * points as it sees fit.
 */

// ── Engine ──────────────────────────────────────────────────────────────────
export { createReferral } from './engine/create-referral.js';
export type {
  ReferralConfig,
  ReferralEngine,
  ReferralRepositories,
  ReferralTenantOptions,
  ReferralLogger,
  AttributeSaleInput,
  ResolvedReferrer,
} from './engine/engine-types.js';

// ── Repositories ────────────────────────────────────────────────────────────
export { ReferralCodeRepository } from './repositories/referral-code.repository.js';
export type { ReferralCodeRepositoryConfig } from './repositories/referral-code.repository.js';
export { ReferralRepository } from './repositories/referral.repository.js';
export type {
  ReferralRepositoryConfig,
  RecordConversionInput,
} from './repositories/referral.repository.js';

// ── Models ──────────────────────────────────────────────────────────────────
export {
  createReferralModels,
  ReferralModelCollisionError,
} from './models/create-models.js';
export type { ReferralModelBundle, ReferralModelName } from './models/create-models.js';
export type { ReferralCodeDocument } from './models/referral-code.model.js';
export type { ReferralDocument } from './models/referral.model.js';

// ── Enums ─────────────────────────────────────────────────────────────────────
export {
  REFERRAL_STATUS,
  REFERRAL_STATUS_VALUES,
  isReferralStatus,
  canReferralTransition,
} from './domain/enums/referral-status.enum.js';
export type { ReferralStatus } from './domain/enums/referral-status.enum.js';

// ── Context ─────────────────────────────────────────────────────────────────
export type { ReferralContext } from './domain/ports/common.js';

// ── Errors ─────────────────────────────────────────────────────────────────────
export {
  ReferralError,
  ReferralCodeNotFoundError,
  ReferralNotFoundError,
  SelfReferralError,
  InvalidReferralTransitionError,
  ReferralAwaitingApprovalError,
  ReferralCapabilityError,
  VersionMismatchError,
} from './domain/errors/referral.errors.js';

// ── Events ─────────────────────────────────────────────────────────────────────
export { REFERRAL_EVENTS } from './events/event-constants.js';
export type { ReferralEventName } from './events/event-constants.js';
export { InProcessReferralBus } from './events/in-process-bus.js';
export { referralEventDefinitions } from './events/event-catalog.js';
export type { ReferralEventDefinition } from './events/event-catalog.js';

// ── Outbox (P4 re-export) ─────────────────────────────────────────────────────
export type {
  OutboxStore,
  OutboxWriteOptions,
  OutboxClaimOptions,
  OutboxAcknowledgeOptions,
  OutboxFailOptions,
} from './events/outbox-store.js';
export { InvalidOutboxEventError, OutboxOwnershipError } from './events/outbox-store.js';
