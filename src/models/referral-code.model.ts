/**
 * ReferralCode — a shareable code owned by a referrer (a creator, affiliate,
 * or user). `lookupByCode` resolves it at checkout to attribute a sale.
 */
import { Schema, type Document, type Types } from 'mongoose';

export interface ReferralCodeDocument extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId | string;

  code: string;
  ownerRef: string;
  ownerModel: string;

  active: boolean;
  label?: string;
  metadata?: Record<string, unknown>;

  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export function buildReferralCodeSchema(): Schema<ReferralCodeDocument> {
  const schema = new Schema<ReferralCodeDocument>(
    {
      code: { type: String, required: true, trim: true },
      ownerRef: { type: String, required: true, trim: true, index: true },
      ownerModel: { type: String, required: true, trim: true },
      active: { type: Boolean, default: true },
      label: { type: String, trim: true },
      metadata: { type: Schema.Types.Mixed },
      deletedAt: { type: Date, default: null },
      version: { type: Number, default: 0 },
    },
    { timestamps: true, minimize: false, optimisticConcurrency: true },
  );

  // The lookup key — codes are unique per tenant (organizationId auto-prepended).
  schema.index(
    { code: 1 },
    {
      unique: true,
      partialFilterExpression: { deletedAt: null, code: { $type: 'string' } },
      name: 'referral_unique_code',
    },
  );

  // At most one active code per owner → `generateCode` is idempotent.
  schema.index(
    { ownerModel: 1, ownerRef: 1 },
    {
      unique: true,
      partialFilterExpression: { active: true, deletedAt: null },
      name: 'referral_unique_active_code_per_owner',
    },
  );

  return schema;
}
