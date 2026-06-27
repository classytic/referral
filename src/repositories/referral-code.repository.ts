/**
 * ReferralCodeRepository — issue + resolve shareable referral codes.
 * `generateCode` is idempotent per owner (one active code each).
 */
import { randomBytes } from 'node:crypto';
import { Repository, isDuplicateKeyError, type PluginType } from '@classytic/mongokit';
import type { Model } from 'mongoose';
import type { EventTransport } from '@classytic/primitives/events';
import type { OutboxStore } from '@classytic/primitives/outbox';
import type { ReferralCodeDocument } from '../models/referral-code.model.js';
import type { ReferralContext } from '../domain/ports/common.js';
import { ReferralCodeNotFoundError } from '../domain/errors/referral.errors.js';
import { emitDomainEvent, type DispatchChannels } from '../events/dispatch.js';
import { REFERRAL_EVENTS } from '../events/event-constants.js';
import { repoOptionsFromCtx } from './repo-options.js';

// Unambiguous alphabet (no I, O, 0, 1) so codes are easy to share by voice.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return out;
}

export interface ReferralCodeRepositoryConfig {
  model: Model<ReferralCodeDocument>;
  plugins?: PluginType[];
  eventTransport?: EventTransport | undefined;
  outbox?: OutboxStore | undefined;
  codeLength?: number | undefined;
  logger?: { error(message: string, ...args: unknown[]): void } | undefined;
}

export class ReferralCodeRepository extends Repository<ReferralCodeDocument> {
  private readonly eventTransport: EventTransport | undefined;
  private readonly outbox: OutboxStore | undefined;
  private readonly pkgLogger: { error(message: string, ...args: unknown[]): void };
  private readonly codeLength: number;

  constructor(config: ReferralCodeRepositoryConfig) {
    super(config.model, config.plugins ?? []);
    this.eventTransport = config.eventTransport;
    this.outbox = config.outbox;
    this.pkgLogger = config.logger ?? console;
    this.codeLength = config.codeLength ?? 8;
  }

  /** Idempotent: returns the owner's existing active code or issues a new one. */
  async generateCode(
    ownerRef: string,
    ownerModel: string,
    ctx: ReferralContext,
  ): Promise<ReferralCodeDocument> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const { doc, created } = await this.getOrCreate(
          { ownerRef, ownerModel, active: true },
          {
            ...(ctx.organizationId !== undefined ? { organizationId: ctx.organizationId } : {}),
            code: makeCode(this.codeLength),
            ownerRef,
            ownerModel,
            active: true,
          },
          repoOptionsFromCtx(ctx),
        );
        if (created) {
          await emitDomainEvent(
            this.channels,
            'referral-code',
            REFERRAL_EVENTS.CODE_CREATED,
            {
              codeId: String(doc._id),
              code: doc.code,
              ...(doc.organizationId !== undefined
                ? { organizationId: String(doc.organizationId) }
                : {}),
              ownerRef: doc.ownerRef,
              ownerModel: doc.ownerModel,
            },
            ctx,
            String(doc._id),
          );
        }
        return doc;
      } catch (err) {
        // Code collision OR a concurrent same-owner insert — retry; the
        // owner-unique index makes the next getOrCreate return the winner.
        if (isDuplicateKeyError(err)) continue;
        throw err;
      }
    }
    throw new Error('[referral] could not allocate a unique code after retries');
  }

  /** Resolve a code to its (active) owner. Returns null when unknown/inactive. */
  async lookupByCode(
    code: string,
    ctx: ReferralContext,
  ): Promise<ReferralCodeDocument | null> {
    return await this.getOne(
      { code, active: true },
      { ...repoOptionsFromCtx(ctx), throwOnNotFound: false },
    );
  }

  async deactivate(code: string, ctx: ReferralContext): Promise<ReferralCodeDocument> {
    const existing = await this.lookupByCode(code, ctx);
    if (!existing) throw new ReferralCodeNotFoundError(code);
    const updated = await this.claim(
      String(existing._id),
      { field: 'active', from: true as never, to: false as never },
      { $inc: { version: 1 } },
      repoOptionsFromCtx(ctx),
    );
    const doc = updated ?? existing;
    await emitDomainEvent(
      this.channels,
      'referral-code',
      REFERRAL_EVENTS.CODE_DEACTIVATED,
      { codeId: String(doc._id), code: doc.code },
      ctx,
      String(doc._id),
    );
    return doc;
  }

  private get channels(): DispatchChannels {
    return { eventTransport: this.eventTransport, outbox: this.outbox, logger: this.pkgLogger };
  }
}
