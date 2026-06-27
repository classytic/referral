/**
 * Zod validators — `@classytic/referral/schemas/referral`.
 */
import { z } from 'zod';
import { codeSchema, metadataSchema, modelSchema, refSchema } from './common.js';

/** POST /referral/codes */
export const generateCodeSchema = z.object({
  ownerRef: refSchema,
  ownerModel: modelSchema,
});

/** POST /referral/attribute (checkout) */
export const attributeSaleSchema = z.object({
  code: codeSchema,
  refereeRef: refSchema.optional(),
  refereeModel: modelSchema.optional(),
  sourceRef: refSchema,
  sourceModel: modelSchema,
  metadata: metadataSchema.optional(),
});

/** POST /referral/:id/reject */
export const rejectReferralSchema = z.object({
  reason: z.string().max(500).optional(),
  decidedBy: refSchema.optional(),
});

export type GenerateCodeBody = z.infer<typeof generateCodeSchema>;
export type AttributeSaleBody = z.infer<typeof attributeSaleSchema>;
export type RejectReferralBody = z.infer<typeof rejectReferralSchema>;
