/**
 * ReferralContext → mongokit options extractor, built on mongokit's typed
 * `createOptionsExtractor` (the hand-rolled variant drifts as canonical
 * fields are added). Forwards tenant + audit fields plus the repo-core 0.6
 * cancellation/retry contract (`signal`, `retryPolicy`).
 */
import { createOptionsExtractor } from '@classytic/mongokit';
import type { RetryPolicy } from '@classytic/repo-core/repository';
import type { ClientSession } from 'mongoose';
import type { ReferralContext } from '../domain/ports/common.js';

type CtxLike = ReferralContext & Record<string, unknown>;

export interface RepoOptions {
  organizationId?: string;
  actorId?: string;
  actorKind?: 'user' | 'system' | 'service';
  correlationId?: string;
  session?: ClientSession;
  idempotencyKey?: string;
  traceId?: string;
  requestId?: string;
  signal?: AbortSignal;
  retryPolicy?: RetryPolicy;
  [key: string]: unknown;
}

export const repoOptionsFromCtx = createOptionsExtractor<CtxLike>([
  'organizationId',
  'actorId',
  'actorKind',
  'correlationId',
  'session',
  'idempotencyKey',
  'traceId',
  'requestId',
  'signal',
  'retryPolicy',
]) as (ctx: ReferralContext) => RepoOptions;
