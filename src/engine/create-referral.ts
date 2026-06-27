import {
  multiTenantPlugin,
  softDeletePlugin,
  type PluginType,
} from '@classytic/mongokit';
import { resolveTenantConfig } from '@classytic/repo-core/tenant';
import { createReferralModels } from '../models/create-models.js';
import { ReferralCodeRepository } from '../repositories/referral-code.repository.js';
import { ReferralRepository } from '../repositories/referral.repository.js';
import { InProcessReferralBus } from '../events/in-process-bus.js';
import { ReferralCapabilityError } from '../domain/errors/referral.errors.js';
import type { ReferralConfig, ReferralEngine } from './engine-types.js';

/** Runtime capabilities the attribution verbs require at boot (PACKAGE_RULES "Runtime capabilities"). */
const REQUIRED_CAPABILITIES = ['getOrCreate', 'upsert'] as const;

/**
 * createReferral — the referral ATTRIBUTION engine. Codes + who-referred-whom
 * + conversion + review gate. No money (revenue) and no points (loyalty).
 */
export async function createReferral(config: ReferralConfig): Promise<ReferralEngine> {
  if (!config.connection) {
    throw new Error('createReferral: config.connection is required');
  }

  const tenant = resolveTenantConfig(config.tenant);
  const logger = config.logger ?? console;
  const events = config.eventTransport ?? new InProcessReferralBus({ logger });

  const modelsOptions: Parameters<typeof createReferralModels>[1] = { tenant };
  if (config.autoIndex !== undefined) modelsOptions.autoIndex = config.autoIndex;
  if (config.collectionPrefix !== undefined) {
    modelsOptions.collectionPrefix = config.collectionPrefix;
  }
  if (config.forceRecreate !== undefined) modelsOptions.forceRecreate = config.forceRecreate;
  const models = createReferralModels(config.connection, modelsOptions);

  const tenantPlugins: PluginType[] = (() => {
    if (!tenant.enabled || tenant.strategy !== 'field') return [];
    const extras = typeof config.tenant === 'object' ? config.tenant : undefined;
    return [
      multiTenantPlugin({
        tenantField: tenant.tenantField,
        fieldType: tenant.fieldType,
        contextKey: tenant.contextKey,
        required: tenant.required,
        ...(extras?.skipOperations !== undefined
          ? { skipOperations: extras.skipOperations }
          : {}),
        ...(extras?.skipWhen !== undefined ? { skipWhen: extras.skipWhen } : {}),
        ...(extras?.resolveContext !== undefined
          ? { resolveContext: extras.resolveContext }
          : {}),
        ...(extras?.allowDataInjection !== undefined
          ? { allowDataInjection: extras.allowDataInjection }
          : {}),
        ...(extras?.onMismatch !== undefined ? { onMismatch: extras.onMismatch } : {}),
      }),
    ];
  })();

  const softDelete = softDeletePlugin({ ttlDays: 2555 });
  const repoPlugins = config.repositoryPlugins ?? {};

  const referralCode = new ReferralCodeRepository({
    model: models.ReferralCode,
    plugins: [...tenantPlugins, softDelete, ...(repoPlugins.referralCode ?? [])],
    eventTransport: events,
    outbox: config.outbox,
    ...(config.codeLength !== undefined ? { codeLength: config.codeLength } : {}),
    logger,
  });

  const referral = new ReferralRepository({
    model: models.Referral,
    plugins: [...tenantPlugins, softDelete, ...(repoPlugins.referral ?? [])],
    eventTransport: events,
    outbox: config.outbox,
    logger,
  });

  // Boot gate (PACKAGE_RULES "Runtime capabilities") — codes + conversions are
  // idempotent via atomic getOrCreate; a backend without it would
  // double-attribute under concurrency. Fail loud at boot, not at runtime.
  const caps = referral.capabilities;
  if (!caps) {
    throw new ReferralCapabilityError(['capabilities descriptor (repo-core 0.6 / mongokit 3.16+)']);
  }
  const missing = REQUIRED_CAPABILITIES.filter((flag) => caps[flag] !== true);
  if (missing.length > 0) throw new ReferralCapabilityError(missing);

  const engine: ReferralEngine = {
    config: Object.freeze({ ...config }),
    models,
    repositories: { referralCode, referral },
    events,
    outbox: config.outbox,

    async resolveReferrer(code, ctx) {
      const found = await referralCode.lookupByCode(code, ctx);
      if (!found) return null;
      return { ownerRef: found.ownerRef, ownerModel: found.ownerModel, code: found.code };
    },

    async attributeSale(input, ctx) {
      const owner = await referralCode.lookupByCode(input.code, ctx);
      if (!owner) return null;
      return referral.recordConversion(
        {
          code: owner.code,
          referrerRef: owner.ownerRef,
          referrerModel: owner.ownerModel,
          ...(input.refereeRef !== undefined ? { refereeRef: input.refereeRef } : {}),
          ...(input.refereeModel !== undefined ? { refereeModel: input.refereeModel } : {}),
          sourceRef: input.sourceRef,
          sourceModel: input.sourceModel,
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
        ctx,
      );
    },

    async syncIndexes() {
      await Promise.all([models.ReferralCode.syncIndexes(), models.Referral.syncIndexes()]);
    },

    async destroy() {
      await events.close?.();
    },
  };

  return engine;
}
