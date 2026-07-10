import mongoose from 'mongoose';
import type { ReferralContext } from '../../src/domain/ports/common.js';

export function makeCtx(overrides: Partial<ReferralContext> = {}): ReferralContext {
  return {
    organizationId: new mongoose.Types.ObjectId().toString(),
    actorKind: 'system',
    ...overrides,
  };
}
