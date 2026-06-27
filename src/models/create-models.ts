import type { Connection, Model, Schema } from 'mongoose';
import {
  resolveTenantConfig,
  type ResolvedTenantConfig,
  type TenantConfig,
} from '@classytic/repo-core/tenant';
import {
  buildReferralCodeSchema,
  type ReferralCodeDocument,
} from './referral-code.model.js';
import { buildReferralSchema, type ReferralDocument } from './referral.model.js';
import { injectTenantField } from './inject-tenant.js';

export type ReferralModelName = 'ReferralCode' | 'Referral';

export interface ReferralModelBundle {
  ReferralCode: Model<ReferralCodeDocument>;
  Referral: Model<ReferralDocument>;
}

const REFERRAL_MODEL_NAMES = ['ReferralCode', 'Referral'] as const;

const DEFAULT_COLLECTIONS: Record<ReferralModelName, string> = {
  ReferralCode: 'referral_codes',
  Referral: 'referrals',
};

export class ReferralModelCollisionError extends Error {
  constructor(name: string) {
    super(
      `[referral] Mongoose model "${name}" already exists on this connection. ` +
        `For hot-reload / test fixtures, pass \`forceRecreate: true\`. For two ` +
        `referral engines, use two Mongoose connections (\`mongoose.createConnection(...)\`).`,
    );
    this.name = 'ReferralModelCollisionError';
  }
}

export interface CreateReferralModelsOptions {
  tenant?: ResolvedTenantConfig | TenantConfig | boolean;
  autoIndex?: boolean | Partial<Record<ReferralModelName, boolean>>;
  collectionPrefix?: string | undefined;
  forceRecreate?: boolean | undefined;
}

function isResolvedTenant(
  value: ResolvedTenantConfig | TenantConfig | boolean,
): value is ResolvedTenantConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    'strategy' in value &&
    'tenantField' in value
  );
}

export function createReferralModels(
  connection: Connection,
  options: CreateReferralModelsOptions = {},
): ReferralModelBundle {
  if (options.forceRecreate) {
    for (const name of REFERRAL_MODEL_NAMES) {
      if (connection.models[name]) connection.deleteModel(name);
    }
  } else {
    for (const name of REFERRAL_MODEL_NAMES) {
      if (connection.models[name]) throw new ReferralModelCollisionError(name);
    }
  }

  const tenant: ResolvedTenantConfig =
    options.tenant !== undefined && isResolvedTenant(options.tenant)
      ? options.tenant
      : resolveTenantConfig(options.tenant);

  const codeSchema = buildReferralCodeSchema();
  const referralSchema = buildReferralSchema();

  injectTenantField(codeSchema, tenant);
  injectTenantField(referralSchema, tenant);

  const prefix = options.collectionPrefix ?? '';
  const bundle: ReferralModelBundle = {
    ReferralCode: connection.model<ReferralCodeDocument>(
      'ReferralCode',
      codeSchema,
      prefix + DEFAULT_COLLECTIONS.ReferralCode,
    ),
    Referral: connection.model<ReferralDocument>(
      'Referral',
      referralSchema,
      prefix + DEFAULT_COLLECTIONS.Referral,
    ),
  };

  applyAutoIndex(bundle, options.autoIndex);
  return bundle;
}

function applyAutoIndex<T extends string>(
  models: Record<T, Model<unknown>>,
  autoIndex?: boolean | Partial<Record<T, boolean>>,
): void {
  if (autoIndex === undefined) return;
  for (const [name, model] of Object.entries(models) as [T, Model<unknown>][]) {
    const value = typeof autoIndex === 'boolean' ? autoIndex : autoIndex[name] ?? undefined;
    if (value !== undefined) {
      (model.schema as Schema).set('autoIndex', value);
    }
  }
}
