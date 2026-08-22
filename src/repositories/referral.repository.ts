/**
 * ReferralRepository — record attributions + run the optional review gate.
 * `recordConversion` is idempotent per source (dedupe) and blocks
 * self-referral. `approve` honors an attached `ApprovalChain` (P7).
 */
import { Repository, type PluginType } from '@classytic/mongokit';
import type { Model } from 'mongoose';
import type { EventTransport } from '@classytic/primitives/events';
import type { OutboxStore } from '@classytic/primitives/outbox';
import { isApproved, type ApprovalChain } from '@classytic/primitives/approval';
import type { OffsetPaginationResult } from '@classytic/repo-core/pagination';
import type { ReferralDocument } from '../models/referral.model.js';
import type { ReferralContext } from '../domain/ports/common.js';
import {
  REFERRAL_STATUS,
  canReferralTransition,
  type ReferralStatus,
} from '../domain/enums/referral-status.enum.js';
import {
  InvalidReferralTransitionError,
  ReferralAwaitingApprovalError,
  ReferralNotFoundError,
  SelfReferralError,
  VersionMismatchError,
} from '../domain/errors/referral.errors.js';
import { emitDomainEvent, type DispatchChannels } from '../events/dispatch.js';
import { REFERRAL_EVENTS } from '../events/event-constants.js';
import { repoOptionsFromCtx } from './repo-options.js';

export interface RecordConversionInput {
  code: string;
  referrerRef: string;
  referrerModel: string;
  refereeRef?: string | undefined;
  refereeModel?: string | undefined;
  sourceRef: string;
  sourceModel: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface ReferralRepositoryConfig {
  model: Model<ReferralDocument>;
  plugins?: PluginType[];
  eventTransport?: EventTransport | undefined;
  outbox?: OutboxStore | undefined;
  logger?: { error(message: string, ...args: unknown[]): void } | undefined;
}

export class ReferralRepository extends Repository<ReferralDocument> {
  private readonly eventTransport: EventTransport | undefined;
  private readonly outbox: OutboxStore | undefined;
  private readonly pkgLogger: { error(message: string, ...args: unknown[]): void };

  constructor(config: ReferralRepositoryConfig) {
    super(config.model, config.plugins ?? []);
    this.eventTransport = config.eventTransport;
    this.outbox = config.outbox;
    this.pkgLogger = config.logger ?? console;
  }

  /** Attribute a sale to a referrer. Idempotent per source; rejects self-referral. */
  async recordConversion(
    input: RecordConversionInput,
    ctx: ReferralContext,
  ): Promise<ReferralDocument> {
    if (input.refereeRef !== undefined && input.refereeRef === input.referrerRef) {
      throw new SelfReferralError(input.referrerRef);
    }

    const { doc, created } = await this.getOrCreate(
      { sourceModel: input.sourceModel, sourceRef: input.sourceRef },
      {
        ...(ctx.organizationId !== undefined ? { organizationId: ctx.organizationId } : {}),
        code: input.code,
        referrerRef: input.referrerRef,
        referrerModel: input.referrerModel,
        ...(input.refereeRef !== undefined ? { refereeRef: input.refereeRef } : {}),
        ...(input.refereeModel !== undefined ? { refereeModel: input.refereeModel } : {}),
        sourceRef: input.sourceRef,
        sourceModel: input.sourceModel,
        status: REFERRAL_STATUS.CONVERTED,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
      repoOptionsFromCtx(ctx),
    );

    if (created) {
      await emitDomainEvent(
        this.channels,
        'referral',
        REFERRAL_EVENTS.CONVERTED,
        {
          referralId: String(doc._id),
          code: doc.code,
          ...(doc.organizationId !== undefined
            ? { organizationId: String(doc.organizationId) }
            : {}),
          referrerRef: doc.referrerRef,
          referrerModel: doc.referrerModel,
          ...(doc.refereeRef !== undefined ? { refereeRef: doc.refereeRef } : {}),
          ...(doc.refereeModel !== undefined ? { refereeModel: doc.refereeModel } : {}),
          sourceRef: doc.sourceRef,
          sourceModel: doc.sourceModel,
        },
        ctx,
        String(doc._id),
      );
    }
    return doc;
  }

  async approve(
    id: string,
    options: { decidedBy?: string | undefined } = {},
    ctx: ReferralContext = {},
  ): Promise<ReferralDocument> {
    const ref = await this.load(id, ctx);
    if (ref.approvals && !isApproved(ref.approvals)) {
      throw new ReferralAwaitingApprovalError(id, ref.approvals.status);
    }
    return this.transition(ref, REFERRAL_STATUS.APPROVED, {
      decidedAt: new Date(),
      ...(options.decidedBy !== undefined ? { decidedBy: options.decidedBy } : {}),
    }, REFERRAL_EVENTS.APPROVED, ctx);
  }

  async reject(
    id: string,
    options: { reason?: string | undefined; decidedBy?: string | undefined } = {},
    ctx: ReferralContext = {},
  ): Promise<ReferralDocument> {
    const ref = await this.load(id, ctx);
    return this.transition(ref, REFERRAL_STATUS.REJECTED, {
      decidedAt: new Date(),
      ...(options.reason !== undefined ? { reason: options.reason } : {}),
      ...(options.decidedBy !== undefined ? { decidedBy: options.decidedBy } : {}),
    }, REFERRAL_EVENTS.REJECTED, ctx);
  }

  /** Persist an `ApprovalChain` after the host calls `applyDecision()` (P7). */
  async updateApprovals(
    id: string,
    chain: ApprovalChain,
    ctx: ReferralContext = {},
  ): Promise<ReferralDocument> {
    const ref = await this.load(id, ctx);
    const updated = await this.claimVersion(
      String(ref._id),
      { from: ref.version },
      { $set: { approvals: chain } },
      { ...repoOptionsFromCtx(ctx), idField: '_id' },
    );
    if (!updated) throw new VersionMismatchError(id, ref.version);
    return updated;
  }

  async listForReferrer(
    referrerRef: string,
    ctx: ReferralContext,
  ): Promise<OffsetPaginationResult<ReferralDocument>> {
    return (await this.getAll(
      { filters: { referrerRef }, sort: { createdAt: -1 } },
      repoOptionsFromCtx(ctx),
    )) as OffsetPaginationResult<ReferralDocument>;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async transition(
    ref: ReferralDocument,
    to: ReferralStatus,
    patch: Record<string, unknown>,
    event: (typeof REFERRAL_EVENTS)[keyof typeof REFERRAL_EVENTS],
    ctx: ReferralContext,
  ): Promise<ReferralDocument> {
    const machine = {
      name: 'referral',
      assertTransition: (_id: string, from: string, to2: string) => {
        if (!canReferralTransition(from as ReferralStatus, to2 as ReferralStatus)) {
          throw new InvalidReferralTransitionError(from as ReferralStatus, to2 as ReferralStatus);
        }
      },
    };
    const updated = (await this.applyTransition(
      String(ref._id),
      machine,
      { from: ref.status, to, set: patch, inc: { version: 1 }, history: false },
      repoOptionsFromCtx(ctx) as never,
    ).catch((err: unknown) => {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'TRANSITION_RACE_LOST' || code === 'TRANSITION_TARGET_MISSING') {
        throw new InvalidReferralTransitionError(ref.status, to);
      }
      throw err;
    })) as ReferralDocument;

    const decidedAt =
      updated.decidedAt instanceof Date ? updated.decidedAt.toISOString() : new Date().toISOString();
    await emitDomainEvent(
      this.channels,
      'referral',
      event,
      {
        referralId: String(updated._id),
        code: updated.code,
        referrerRef: updated.referrerRef,
        referrerModel: updated.referrerModel,
        ...(to === REFERRAL_STATUS.APPROVED ? { approvedAt: decidedAt } : {}),
        ...(to === REFERRAL_STATUS.REJECTED
          ? { rejectedAt: decidedAt, ...(updated.reason ? { reason: updated.reason } : {}) }
          : {}),
      },
      ctx,
      String(updated._id),
    );
    return updated;
  }

  private async load(id: string, ctx: ReferralContext): Promise<ReferralDocument> {
    const ref = await this.getById(id, { ...repoOptionsFromCtx(ctx), throwOnNotFound: false });
    if (!ref) throw new ReferralNotFoundError(id);
    return ref;
  }

  private get channels(): DispatchChannels {
    return { eventTransport: this.eventTransport, outbox: this.outbox, logger: this.pkgLogger };
  }
}
