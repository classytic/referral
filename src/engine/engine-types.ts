import type { Connection } from 'mongoose';
import type { MultiTenantOptions, PluginType } from '@classytic/mongokit';
import type { EventTransport } from '@classytic/primitives/events';
import type { OutboxStore } from '@classytic/primitives/outbox';
import type { ResolvedTenantConfig, TenantConfig } from '@classytic/repo-core/tenant';
import type { ReferralContext } from '../domain/ports/common.js';
import type { ReferralModelBundle, ReferralModelName } from '../models/create-models.js';
import type { ReferralDocument } from '../models/referral.model.js';
import type { ReferralCodeRepository } from '../repositories/referral-code.repository.js';
import type { ReferralRepository } from '../repositories/referral.repository.js';

export type ReferralTenantOptions = TenantConfig &
  Pick<
    MultiTenantOptions,
    'skipOperations' | 'skipWhen' | 'resolveContext' | 'allowDataInjection' | 'onMismatch'
  >;

export interface ReferralLogger {
  error(message: string, ...args: unknown[]): void;
}

/**
 * DESCRIBE-time shape — everything that determines the persistence SHAPE and needs no
 * connection or I/O to inspect. Nothing here opens a socket or reads a secret.
 */
export interface ReferralShape {
  /** Tenant policy. `false`/omitted = platform-wide; an object configures the tenant field + plugin. */
  tenant?: ReferralTenantOptions | boolean | undefined;
  /** Generated code length (default 8). */
  codeLength?: number | undefined;
  /** Mongoose auto-index builds. Default leaves the schema default; pass `false` in prod. */
  autoIndex?: boolean | Partial<Record<ReferralModelName, boolean>> | undefined;
  /** Collection-name prefix applied to every referral collection. */
  collectionPrefix?: string | undefined;
  /** On a model-name collision: default throws; `true` re-registers (test/dev fixtures). */
  forceRecreate?: boolean | undefined;
}

/**
 * BIND-time runtime collaborators — the live connection is the first `bind` arg; these are the
 * rest. A transport, outbox, logger or extra plugins belong here, not in the shape.
 */
export interface ReferralRuntime {
  eventTransport?: EventTransport | undefined;
  outbox?: OutboxStore | undefined;
  logger?: ReferralLogger | undefined;
  repositoryPlugins?:
    | {
        referralCode?: PluginType[] | undefined;
        referral?: PluginType[] | undefined;
      }
    | undefined;
}

/** Resolved configuration exposed on the engine (frozen). */
export interface ResolvedReferralConfig {
  connection: Connection;
  tenant: ResolvedTenantConfig;
  codeLength: number;
  autoIndex: boolean | Partial<Record<ReferralModelName, boolean>> | undefined;
  collectionPrefix: string | undefined;
  forceRecreate: boolean;
}

export interface ReferralRepositories {
  referralCode: ReferralCodeRepository;
  referral: ReferralRepository;
}

export interface AttributeSaleInput {
  code: string;
  refereeRef?: string | undefined;
  refereeModel?: string | undefined;
  sourceRef: string;
  sourceModel: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface ResolvedReferrer {
  ownerRef: string;
  ownerModel: string;
  code: string;
}

export interface ReferralEngine {
  readonly config: Readonly<ResolvedReferralConfig>;
  readonly models: ReferralModelBundle;
  readonly repositories: ReferralRepositories;
  readonly events: EventTransport;
  readonly outbox: OutboxStore | undefined;

  /** Resolve a code to its active referrer (null if unknown/inactive). */
  resolveReferrer(code: string, ctx: ReferralContext): Promise<ResolvedReferrer | null>;

  /**
   * The checkout convenience: resolve `code` → referrer and record the
   * attribution for `sourceRef` in one call. Returns the `Referral`, or `null`
   * when the code is unknown (no attribution — the sale just proceeds).
   * Idempotent per source; throws `SelfReferralError` if the referee is the
   * referrer.
   */
  attributeSale(input: AttributeSaleInput, ctx: ReferralContext): Promise<ReferralDocument | null>;

  /** Build/align indexes. Call once per deploy when booted `autoIndex: false`. */
  syncIndexes(): Promise<void>;

  /** Release resources owned by this engine. Idempotent. The kernel-standard lifecycle name. */
  close(): Promise<void>;
}
