/**
 * Thin typed wrapper around `@classytic/primitives/events.createEvent`
 * (PACKAGE_RULES rule 14: `createEvent(type, payload, ctx?, meta?)`).
 * Narrows `type` to `ReferralEventName` and fills meta from the referral context.
 */
import {
  createEvent as createPrimitivesEvent,
  type DomainEvent,
  type EventMeta,
} from '@classytic/primitives/events';
import type { ReferralContext } from '../domain/ports/common.js';
import type { ReferralEventName } from './event-constants.js';

export function createEvent<T>(
  type: ReferralEventName,
  payload: T,
  ctx?: ReferralContext,
  meta?: Partial<EventMeta>,
): DomainEvent<T> {
  return createPrimitivesEvent(type, payload, {
    ...(ctx?.actorKind === 'user' && ctx.actorId !== undefined
      ? { userId: String(ctx.actorId) }
      : {}),
    ...(ctx?.organizationId !== undefined
      ? { organizationId: String(ctx.organizationId) }
      : {}),
    ...(ctx?.correlationId !== undefined ? { correlationId: ctx.correlationId } : {}),
    ...meta,
  });
}
