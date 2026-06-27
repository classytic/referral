/**
 * Mongoose adapter around `@classytic/repo-core/tenant.resolveTenantConfig`.
 * Thin (rule P11) — repo-core owns resolution; this handles schema mutations
 * only: adds the tenant field with the engine-configured type, and prepends
 * the tenant key to every existing compound index (rule 36).
 */
import mongoose, { type Schema } from 'mongoose';
import type { ResolvedTenantConfig } from '@classytic/repo-core/tenant';

export function injectTenantField(schema: Schema, tenant: ResolvedTenantConfig): void {
  const isFieldStrategy = tenant.strategy === 'field';
  const isObjectId = tenant.fieldType === 'objectId';

  schema.add({
    [tenant.tenantField]: {
      type: isObjectId ? mongoose.Schema.Types.ObjectId : String,
      ...(tenant.enabled && tenant.required ? { required: true } : {}),
      index: true,
      ...(isObjectId && tenant.ref ? { ref: tenant.ref } : {}),
    },
  });

  if (!tenant.enabled || !isFieldStrategy) return;

  const existingIndexes = (
    schema as unknown as {
      _indexes: Array<[Record<string, unknown>, Record<string, unknown>]>;
    }
  )._indexes;
  if (existingIndexes && existingIndexes.length > 0) {
    for (const indexEntry of existingIndexes) {
      const fields = indexEntry[0];
      if (fields[tenant.tenantField] !== undefined) continue;
      const newFields: Record<string, unknown> = { [tenant.tenantField]: 1 };
      for (const [key, val] of Object.entries(fields)) {
        newFields[key] = val;
      }
      indexEntry[0] = newFields;
    }
  }
}
