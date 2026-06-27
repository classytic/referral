/**
 * Zod-source event catalog (PACKAGE_RULES rule 18). One Zod schema per event
 * is the source of truth; hosts wire `referralEventDefinitions` into arc's
 * `EventRegistry`. Timestamps are `z.iso.datetime()` (rule 25).
 */
import { z } from 'zod';
import {
  createEvent as createPrimitiveEvent,
  type DomainEvent,
  type EventMeta,
} from '@classytic/primitives/events';
import { REFERRAL_EVENTS, type ReferralEventName } from './event-constants.js';

export type ReferralEventSchema = Record<string, unknown>;

export interface ReferralEventDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: ReferralEventName;
  version: number;
  description: string;
  zodSchema: TSchema;
  schema: ReferralEventSchema;
  create(payload: z.infer<TSchema>, meta?: Partial<EventMeta>): DomainEvent<z.infer<TSchema>>;
}

function defineReferralEvent<TSchema extends z.ZodType>(input: {
  name: ReferralEventName;
  resource: 'referral-code' | 'referral';
  description: string;
  version?: number;
  zodSchema: TSchema;
}): ReferralEventDefinition<TSchema> {
  const { name, resource, description, version = 1, zodSchema } = input;
  return {
    name,
    version,
    description,
    zodSchema,
    schema: z.toJSONSchema(zodSchema) as ReferralEventSchema,
    create(payload, meta) {
      return createPrimitiveEvent(name, payload, { resource, source: 'referral', ...meta });
    },
  };
}

const owner = { ownerRef: z.string(), ownerModel: z.string() };
const party = { referrerRef: z.string(), referrerModel: z.string() };

export const CodeCreated = defineReferralEvent({
  name: REFERRAL_EVENTS.CODE_CREATED,
  resource: 'referral-code',
  description: 'A shareable referral code was issued for an owner (creator/affiliate).',
  zodSchema: z.object({
    codeId: z.string(),
    code: z.string(),
    organizationId: z.string().optional(),
    ...owner,
  }),
});

export const CodeDeactivated = defineReferralEvent({
  name: REFERRAL_EVENTS.CODE_DEACTIVATED,
  resource: 'referral-code',
  description: 'A referral code was deactivated and can no longer attribute sales.',
  zodSchema: z.object({ codeId: z.string(), code: z.string() }),
});

export const Converted = defineReferralEvent({
  name: REFERRAL_EVENTS.CONVERTED,
  resource: 'referral',
  description: 'A referred sale was attributed to a referrer (the host then rewards them).',
  zodSchema: z.object({
    referralId: z.string(),
    code: z.string(),
    organizationId: z.string().optional(),
    ...party,
    refereeRef: z.string().optional(),
    refereeModel: z.string().optional(),
    sourceRef: z.string(),
    sourceModel: z.string(),
  }),
});

export const Approved = defineReferralEvent({
  name: REFERRAL_EVENTS.APPROVED,
  resource: 'referral',
  description: 'A referral passed its review gate (if any) and is eligible for reward.',
  zodSchema: z.object({
    referralId: z.string(),
    code: z.string(),
    ...party,
    approvedAt: z.iso.datetime(),
  }),
});

export const Rejected = defineReferralEvent({
  name: REFERRAL_EVENTS.REJECTED,
  resource: 'referral',
  description: 'A referral was rejected (fraud / ineligible) — no reward.',
  zodSchema: z.object({
    referralId: z.string(),
    code: z.string(),
    ...party,
    rejectedAt: z.iso.datetime(),
    reason: z.string().optional(),
  }),
});

export const referralEventDefinitions: ReadonlyArray<ReferralEventDefinition> = [
  CodeCreated,
  CodeDeactivated,
  Converted,
  Approved,
  Rejected,
];
