/**
 * §P8.1 dispatch guard — pure unit tests on `emitDomainEvent`.
 *
 * Pre-fix, a host-owned `ctx.session` with NO outbox SILENTLY DROPPED
 * the event (`if (ctx.session) return` with nothing durable written).
 * Canonical semantics:
 *
 *   - session + NO outbox  → throw `UnmanagedSessionError` before any
 *     side effect (no silent drop);
 *   - session + outbox     → durable-relay-only: row saved session-bound,
 *     immediate publish skipped (the relay delivers post-commit).
 */
import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@classytic/primitives/events';
import type { OutboxStore } from '@classytic/primitives/outbox';
import { UnmanagedSessionError } from '../../src/domain/errors/referral.errors.js';
import { emitDomainEvent } from '../../src/events/dispatch.js';

const silentLogger = { error() {} };

class RecordingOutbox implements OutboxStore {
  readonly saved: Array<{ type: string; hasSession: boolean }> = [];
  async save(event: DomainEvent, options?: { session?: unknown }): Promise<void> {
    this.saved.push({ type: event.type, hasSession: options?.session != null });
  }
  async claim(): Promise<DomainEvent[]> {
    return [];
  }
  async acknowledge(): Promise<void> {}
  async fail(): Promise<void> {}
}

function transport(published: string[]) {
  return {
    name: 'recording',
    async publish(e: DomainEvent) {
      published.push(e.type);
    },
    async subscribe() {
      return async () => {};
    },
  };
}

describe('§P8.1 emitDomainEvent guard', () => {
  it('session + transport + NO outbox throws instead of silently dropping', async () => {
    const published: string[] = [];
    await expect(
      emitDomainEvent(
        { eventTransport: transport(published), outbox: undefined, logger: silentLogger },
        'referral-code',
        'referral:converted' as never,
        { codeId: 'c1' },
        { organizationId: 'org1', session: {} } as never,
        'c1',
      ),
    ).rejects.toBeInstanceOf(UnmanagedSessionError);
    expect(published).toHaveLength(0);
  });

  it('session + outbox is relay-only: row saved session-bound, publish skipped', async () => {
    const outbox = new RecordingOutbox();
    const published: string[] = [];
    await emitDomainEvent(
      { eventTransport: transport(published), outbox, logger: silentLogger },
      'referral-code',
      'referral:converted' as never,
      { codeId: 'c1' },
      { organizationId: 'org1', session: {} } as never,
      'c1',
    );
    expect(outbox.saved).toHaveLength(1);
    expect(outbox.saved[0]?.hasSession).toBe(true);
    expect(published).toHaveLength(0);
  });

  it('no session publishes immediately (unchanged fast path)', async () => {
    const published: string[] = [];
    await emitDomainEvent(
      { eventTransport: transport(published), outbox: undefined, logger: silentLogger },
      'referral-code',
      'referral:converted' as never,
      { codeId: 'c1' },
      { organizationId: 'org1' } as never,
      'c1',
    );
    expect(published).toHaveLength(1);
  });
});
