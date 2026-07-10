/**
 * Probe — confirms multiTenantPlugin is wired on every referral repo (rule 31).
 */
import { describe, expect, it } from 'vitest';
import { useIntegrationReferral } from '../helpers/lifecycle.js';

describe('multiTenantPlugin wiring probe (referral)', () => {
  const getEngine = useIntegrationReferral();

  it('throws on referralCode.findAll without organizationId', async () => {
    const engine = getEngine();
    await expect(engine.repositories.referralCode.findAll({}, {})).rejects.toThrow(/organizationId/i);
  });

  it('throws on referral.findAll without organizationId', async () => {
    const engine = getEngine();
    await expect(engine.repositories.referral.findAll({}, {})).rejects.toThrow(/organizationId/i);
  });
});
