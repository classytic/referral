/**
 * P8 dispatch — session-bound outbox save + event-transport publish.
 *
 * Contract:
 *   - Outbox save runs FIRST (durability); failures PROPAGATE so a caller's
 *     transaction rolls back (P8).
 *   - `transport.publish` failures are swallowed (logged) — the host's relay
 *     re-delivers from the durable row.
 *   - When the caller owns a transaction (`ctx.session` set), in-process
 *     publish is SKIPPED — publishing before the host commits would leak
 *     ghost events on rollback; the durable relay delivers post-commit.
 *
 * referral verbs are single-document writes, so this avoids payrun's
 * PENDING_EVENTS unit-of-work machinery — hosts that need a multi-write
 * transaction wire an outbox and let the relay publish.
 */
import type { ClientSession } from 'mongoose';
import type { DomainEvent, EventMeta, EventTransport } from '@classytic/primitives/events';
import type { OutboxStore } from '@classytic/primitives/outbox';
import { UnmanagedSessionError } from '../domain/errors/referral.errors.js';
import type { ReferralContext } from '../domain/ports/common.js';
import { createEvent } from './helpers.js';
import type { ReferralEventName } from './event-constants.js';

export interface DispatchChannels {
  eventTransport?: EventTransport | undefined;
  outbox?: OutboxStore | undefined;
  logger: { error(message: string, ...args: unknown[]): void };
}

export async function emitDomainEvent<T>(
  channels: DispatchChannels,
  resource: string,
  type: ReferralEventName,
  payload: T,
  ctx: ReferralContext,
  resourceId: string,
): Promise<void> {
  if (!channels.eventTransport && !channels.outbox) return;

  // §P8.1 guard: a host-owned session with NO outbox has no correct
  // delivery path — the pre-guard behavior silently dropped the event.
  // Fail fast BEFORE any side effect. Session + outbox is relay-only.
  if (ctx.session && !channels.outbox) throw new UnmanagedSessionError();

  const meta: Partial<EventMeta> = { resource, resourceId, source: 'referral' };
  if (ctx.idempotencyKey !== undefined) meta.idempotencyKey = ctx.idempotencyKey;

  const event: DomainEvent<T> = createEvent(type, payload, ctx, meta);

  if (channels.outbox) {
    try {
      const saveOptions: { session?: ClientSession } = {};
      if (ctx.session !== undefined) saveOptions.session = ctx.session as ClientSession;
      await channels.outbox.save(event, saveOptions);
    } catch (err) {
      channels.logger.error(`[referral] outbox.save failed for ${event.type}:`, err);
      throw err; // P8: MUST propagate — the caller's transaction must roll back.
    }
  }

  // Caller owns the transaction → defer to the durable relay (no ghost events).
  if (ctx.session) return;

  if (channels.eventTransport) {
    try {
      await channels.eventTransport.publish(event);
    } catch (err) {
      channels.logger.error(`[referral] publish failed for ${event.type}:`, err);
    }
  }
}
