/**
 * Referral model specification — the ONE authoritative place the referral model
 * set is described.
 *
 * `defineReferralModels(config)` returns a connection-free mongokit `ModelBlueprint`;
 * `defineReferral` binds it during engine construction. Collision handling, tenant-field
 * injection, auto-index and collection naming live here once. A name collision surfaces as
 * mongokit's typed `ModelCollisionError` — there is no kernel-specific collision error.
 */
import {
  defineModels,
  type ExistingModelPolicy,
  type ModelBlueprint,
} from '@classytic/mongokit';
import type { ResolvedTenantConfig } from '@classytic/repo-core/tenant';
import type { Model } from 'mongoose';
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

const DEFAULT_COLLECTIONS: Record<ReferralModelName, string> = {
  ReferralCode: 'referral_codes',
  Referral: 'referrals',
};

export interface DefineReferralModelsConfig {
  /** Resolved tenant policy — the tenant field is injected into each schema. */
  tenant: ResolvedTenantConfig;
  /** Mongoose auto-index builds. Default (undefined) leaves the schema default; `false` in prod. */
  autoIndex?: boolean | Partial<Record<ReferralModelName, boolean>> | undefined;
  /** Collection-name prefix applied to every referral collection. */
  collectionPrefix?: string | undefined;
  /** On a name collision: `false` (default) throws; `true` re-registers (test/dev fixtures). */
  forceRecreate?: boolean | undefined;
}

/**
 * Describe the referral model set as a connection-free blueprint. Pure — builds no schema and
 * registers nothing until `.bind(connection)`.
 *
 * The referral kernel has NO optional model families: both `ReferralCode` and `Referral` are
 * always registered. (A family would appear as a conditional `ModelSpec` entry, as in kernels
 * with mode-gated collections.)
 */
export function defineReferralModels(
  config: DefineReferralModelsConfig,
): ModelBlueprint<ReferralModelBundle> {
  const prefix = config.collectionPrefix ?? '';
  // `replace` (test/dev) mirrors the old `forceRecreate`; mongokit refuses it under NODE_ENV=production.
  const existing: ExistingModelPolicy = config.forceRecreate
    ? { mode: 'replace', environment: 'test' }
    : { mode: 'throw' };

  const resolveAutoIndex = (name: ReferralModelName): boolean | undefined => {
    if (config.autoIndex === undefined) return undefined;
    return typeof config.autoIndex === 'boolean' ? config.autoIndex : config.autoIndex[name];
  };

  return defineModels<ReferralModelBundle>({
    models: [
      {
        name: 'ReferralCode',
        collection: prefix + DEFAULT_COLLECTIONS.ReferralCode,
        schema: () => {
          const schema = buildReferralCodeSchema();
          injectTenantField(schema, config.tenant);
          const autoIndex = resolveAutoIndex('ReferralCode');
          if (autoIndex !== undefined) schema.set('autoIndex', autoIndex);
          return schema;
        },
        existing,
      },
      {
        name: 'Referral',
        collection: prefix + DEFAULT_COLLECTIONS.Referral,
        schema: () => {
          const schema = buildReferralSchema();
          injectTenantField(schema, config.tenant);
          const autoIndex = resolveAutoIndex('Referral');
          if (autoIndex !== undefined) schema.set('autoIndex', autoIndex);
          return schema;
        },
        existing,
      },
    ],
    assemble: (models) =>
      Object.freeze({
        ReferralCode: models.get('ReferralCode') as Model<ReferralCodeDocument>,
        Referral: models.get('Referral') as Model<ReferralDocument>,
      }),
  });
}
