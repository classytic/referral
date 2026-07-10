import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createReferral } from '../../src/engine/create-referral.js';
import type { ReferralConfig, ReferralEngine } from '../../src/engine/engine-types.js';

export function useIntegrationReferral(
  overrides: Partial<ReferralConfig> = {},
): () => ReferralEngine {
  let mongo: MongoMemoryReplSet;
  let connection: Connection;
  let engine: ReferralEngine;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: 'referral-test' });
    connection = mongoose.connection;
    engine = await createReferral({
      connection,
      tenant: { fieldType: 'objectId' },
      forceRecreate: true,
      ...overrides,
    });
    await Promise.all([
      engine.models.ReferralCode.createIndexes(),
      engine.models.Referral.createIndexes(),
    ]);
  }, 30_000);

  afterEach(async () => {
    if (!connection?.db) return;
    for (const c of await connection.db.collections()) await c.deleteMany({});
  });

  afterAll(async () => {
    await engine?.destroy();
    await mongoose.disconnect();
    await mongo?.stop();
  });

  return () => engine;
}
