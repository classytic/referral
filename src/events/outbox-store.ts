/**
 * Outbox contract re-export (P4) — hosts import the durable-outbox types
 * from ONE referral-named place and drop their store straight into the engine
 * config. referral never ships a package-owned Mongo outbox (P5.5 / rule 16) —
 * durability belongs to the host app.
 */
export type {
  OutboxStore,
  OutboxWriteOptions,
  OutboxClaimOptions,
  OutboxAcknowledgeOptions,
  OutboxFailOptions,
} from '@classytic/primitives/outbox';
export { InvalidOutboxEventError, OutboxOwnershipError } from '@classytic/primitives/outbox';
