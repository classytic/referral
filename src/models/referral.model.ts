/**
 * Referral — an attribution record: a sale (`sourceRef`) was driven by a
 * referrer (resolved from a code). Dedupe: at most one referral per source.
 * Optional `ApprovalChain` (P7) gates the reward (fraud/eligibility review).
 */
import { Schema, type Document, type Types } from 'mongoose';
import type { ApprovalChain } from '@classytic/primitives/approval';
import {
  REFERRAL_STATUS,
  REFERRAL_STATUS_VALUES,
  type ReferralStatus,
} from '../domain/enums/referral-status.enum.js';

export interface ReferralDocument extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId | string;

  code: string;
  referrerRef: string;
  referrerModel: string;
  /** The referred party (buyer), when known. */
  refereeRef?: string;
  refereeModel?: string;

  /** What the referral drove — an order / transaction. */
  sourceRef: string;
  sourceModel: string;

  status: ReferralStatus;
  reason?: string;
  /** Maker-checker review chain (P7) — `@classytic/primitives/approval`. */
  approvals?: ApprovalChain;
  decidedAt?: Date;
  decidedBy?: string;

  metadata?: Record<string, unknown>;

  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export function buildReferralSchema(): Schema<ReferralDocument> {
  const schema = new Schema<ReferralDocument>(
    {
      code: { type: String, required: true, trim: true },
      referrerRef: { type: String, required: true, trim: true, index: true },
      referrerModel: { type: String, required: true, trim: true },
      refereeRef: { type: String, trim: true },
      refereeModel: { type: String, trim: true },
      sourceRef: { type: String, required: true, trim: true },
      sourceModel: { type: String, required: true, trim: true },
      status: {
        type: String,
        enum: REFERRAL_STATUS_VALUES,
        default: REFERRAL_STATUS.CONVERTED,
        required: true,
        index: true,
      },
      reason: { type: String },
      approvals: { type: Schema.Types.Mixed },
      decidedAt: { type: Date },
      decidedBy: { type: String },
      metadata: { type: Schema.Types.Mixed },
      deletedAt: { type: Date, default: null },
      version: { type: Number, default: 0 },
    },
    { timestamps: true, minimize: false, optimisticConcurrency: true },
  );

  // Dedupe: ONE referral per source (a re-fired checkout can't double-attribute).
  schema.index(
    { sourceModel: 1, sourceRef: 1 },
    {
      unique: true,
      partialFilterExpression: { deletedAt: null },
      name: 'referral_unique_per_source',
    },
  );

  // List a referrer's referrals by status (reward eligibility).
  schema.index({ referrerRef: 1, status: 1 });

  return schema;
}
