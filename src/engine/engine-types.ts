import type { Connection } from 'mongoose';
import type { MultiTenantOptions, PluginType } from '@classytic/mongokit';
import type { EventTransport } from '@classytic/primitives/events';
import type { OutboxStore } from '@classytic/primitives/outbox';
import type { TenantConfig } from '@classytic/repo-core/tenant';
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

export interface ReferralConfig {
  connection: Connection;
  tenant?: ReferralTenantOptions | boolean | undefined;
  eventTransport?: EventTransport | undefined;
  outbox?: OutboxStore | undefined;
  /** Generated code length (default 8). */
  codeLength?: number | undefined;
  repositoryPlugins?:
    | {
        referralCode?: PluginType[] | undefined;
        referral?: PluginType[] | undefined;
      }
    | undefined;
  autoIndex?: boolean | Partial<Record<ReferralModelName, boolean>> | undefined;
  collectionPrefix?: string | undefined;
  forceRecreate?: boolean | undefined;
  logger?: ReferralLogger | undefined;
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
  readonly config: Readonly<ReferralConfig>;
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

  syncIndexes(): Promise<void>;
  destroy(): Promise<void>;
}
