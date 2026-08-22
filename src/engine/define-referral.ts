import { Connection } from 'mongoose';
import type { ReferralEngine, ReferralRuntime, ReferralShape, ResolvedReferralConfig } from './engine-types.js';
import { assertNoLegacyTenantKeys, resolveTenantConfig } from '@classytic/repo-core/tenant';
import { defineReferralModels } from '../models/create-models.js';
import { ReferralCapabilityError } from '../domain/errors/referral.errors.js';
import { InProcessReferralBus } from '../events/in-process-bus.js';
import { multiTenantPlugin, softDeletePlugin } from '@classytic/mongokit';
import type { PluginType } from '@classytic/mongokit';
import { ReferralCodeRepository } from '../repositories/referral-code.repository.js';
import { ReferralRepository } from '../repositories/referral.repository.js';
export interface ReferralBlueprint {
  readonly id: 'referral';
  /** The model names this blueprint registers — known without a connection. */
  readonly modelNames: readonly string[];
  /**
   * Compile + register the models on `connection`, wire the engine, verify capabilities.
   * Synchronous: referral construction performs no async work.
   */
  bind(connection: Connection, runtime?: ReferralRuntime): ReferralEngine;
}

/** Repository capabilities asserted at bind. */
const REQUIRED_CAPABILITIES = ['getOrCreate', 'upsert'] as const;

export function defineReferral(shape: ReferralShape = {}): ReferralBlueprint {
  // `multiTenant` / `tenantFieldType` were renamed to `tenant` /
  // `tenant.fieldType`. Refused, not ignored: an unread key leaves scoping at
  // the default, which returns rows from the wrong scope without erroring.
  assertNoLegacyTenantKeys(shape, 'defineReferral', [['tenantFieldType', 'tenant.fieldType']]);
  const tenant = resolveTenantConfig(shape.tenant);
  const codeLength = shape.codeLength ?? 8;

  // Single source of truth for the referral model set (defineReferralModels).
  const modelBlueprint = defineReferralModels({
    tenant,
    ...(shape.autoIndex !== undefined ? { autoIndex: shape.autoIndex } : {}),
    ...(shape.collectionPrefix !== undefined ? { collectionPrefix: shape.collectionPrefix } : {}),
    ...(shape.forceRecreate !== undefined ? { forceRecreate: shape.forceRecreate } : {}),
  });

  return {
    id: 'referral',
    modelNames: modelBlueprint.modelNames,

    bind(connection: Connection, runtime: ReferralRuntime = {}): ReferralEngine {
      const logger = runtime.logger ?? console;

      /**
       * VERIFY (boot gate) — an injected outbox MUST enlist `ctx.session`.
       *
       * Checked FIRST, before the model blueprint binds, for two reasons. A cheaper error should
       * report before a costlier one (a model collision would otherwise surface first and hide
       * this), and a bind that throws here must not have mutated the connection's model registry.
       *
       * `OutboxWriteOptions.session` is best-effort BY CONTRACT, so a store that ignores it
       * persists events for mutations that later roll back — a ghost `referral.converted` naming
       * an attribution that never committed, which a downstream commission payout then acts on.
       * Referral had NO guard at all: not at boot and, unlike @classytic/access, not per-call
       * either, so the only signal was a payout for a sale that did not exist. Discovering that
       * from a reconciliation is far worse than at boot.
       *
       * This is also the ONLY requirement referral has that a runtime can actually leave unmet —
       * `getOrCreate` / `upsert` below are properties of the mongo driver, not of a deployment, so
       * mongokit reports them `true` unconditionally. That is what made the old boot gate shaped
       * like enforcement while enforcing nothing (AGENTS.md FAIL LOUD rule 4); this check is what
       * finally gives it something falsifiable, and the conformance suite now exercises it.
       */
      if (runtime.outbox && runtime.outbox.transactionalSave !== true) {
        throw new ReferralCapabilityError([
          'outbox.transactionalSave (the configured OutboxStore does not declare that save() ' +
            'enlists ctx.session — see @classytic/primitives/outbox)',
        ]);
      }

      // Ownership: a host-SUPPLIED transport is shared infrastructure (often Arc's bus across
      // every module) — we must NEVER close it, or closing referral would silence other domains.
      // We only own — and therefore only close — the default in-process bus we create here.
      const ownsTransport = runtime.eventTransport === undefined;
      const events = runtime.eventTransport ?? new InProcessReferralBus({ logger });

      const models = modelBlueprint.bind(connection);

      // Canonical plugin order: multiTenant first, then soft-delete, then host plugins.
      const tenantPlugins: PluginType[] = (() => {
        if (!tenant.enabled || tenant.strategy !== 'field') return [];
        const extras = typeof shape.tenant === 'object' ? shape.tenant : undefined;
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
      const repoPlugins = runtime.repositoryPlugins ?? {};

      const referralCode = new ReferralCodeRepository({
        model: models.ReferralCode,
        plugins: [...tenantPlugins, softDelete, ...(repoPlugins.referralCode ?? [])],
        eventTransport: events,
        outbox: runtime.outbox,
        codeLength,
        logger,
      });

      const referral = new ReferralRepository({
        model: models.Referral,
        plugins: [...tenantPlugins, softDelete, ...(repoPlugins.referral ?? [])],
        eventTransport: events,
        outbox: runtime.outbox,
        logger,
      });

      // VERIFY (boot gate) — codes + conversions are idempotent via atomic getOrCreate; a
      // backend without it would double-attribute under concurrency. Fail loud at boot.
      const caps = referral.capabilities;
      if (!caps) {
        throw new ReferralCapabilityError(['capabilities descriptor (repo-core 0.6 / mongokit 3.16+)']);
      }
      const missing = REQUIRED_CAPABILITIES.filter((flag) => caps[flag] !== true);
      if (missing.length > 0) throw new ReferralCapabilityError(missing);

      const resolved: ResolvedReferralConfig = {
        connection,
        tenant,
        codeLength,
        autoIndex: shape.autoIndex,
        collectionPrefix: shape.collectionPrefix,
        forceRecreate: shape.forceRecreate ?? false,
      };

      const close = async (): Promise<void> => {
        // Only close the transport we created. A supplied (shared) transport's lifecycle
        // belongs to the host — closing it would disable other modules.
        if (ownsTransport) await events.close?.();
      };

      return Object.freeze({
        config: Object.freeze(resolved),
        models,
        repositories: { referralCode, referral },
        events,
        outbox: runtime.outbox,

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

        close,
      } satisfies ReferralEngine);
    },
  };
}
