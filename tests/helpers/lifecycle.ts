import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { defineReferral } from '../../src/engine/define-referral.js';
import type {
  ReferralEngine,
  ReferralRuntime,
  ReferralShape,
} from '../../src/engine/engine-types.js';

export function useIntegrationReferral(
  shapeOverrides: Partial<ReferralShape> = {},
  runtimeOverrides: ReferralRuntime = {},
): () => ReferralEngine {
  let mongo: MongoMemoryReplSet;
  let connection: Connection;
  let engine: ReferralEngine;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { dbName: 'referral-test' });
    connection = mongoose.connection;
    engine = defineReferral({
      tenant: { fieldType: 'objectId' },
      forceRecreate: true,
      ...shapeOverrides,
    }).bind(connection, runtimeOverrides);
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
    await engine?.close();
    await mongoose.disconnect();
    await mongo?.stop();
  });

  return () => engine;
}
