import type { OperationContext } from '@classytic/primitives/context';
import type { RetryPolicy } from '@classytic/repo-core/repository';

/**
 * ReferralContext — operation context threaded through every domain verb.
 * Extends primitives' `OperationContext` (P3 — extend, never redeclare).
 *
 * `organizationId` is OPTIONAL here (unlike payrun's required form):
 * org-scoped subjects (creators) carry it; platform-level subjects
 * (referrers, when the engine runs `tenant: false`) do not. The
 * `multiTenantPlugin` enforces presence at runtime when tenancy is enabled.
 */
export interface ReferralContext extends OperationContext {
  // Narrow the inherited `IdLike` scope fields to `string` (no explicit
  // `| undefined` — that would not be assignable to the base `IdLike` under
  // exactOptionalPropertyTypes). `session` is inherited from OperationContext.
  organizationId?: string;
  actorId?: string;

  actorKind?: 'user' | 'system' | 'service' | undefined;

  /** Cooperative cancellation — threaded into every repo call. */
  signal?: AbortSignal | undefined;
  /** Driver round-trip retry policy — threaded into every repo call. */
  retryPolicy?: RetryPolicy | undefined;
}
