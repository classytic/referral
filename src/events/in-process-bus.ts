import type {
  DomainEvent,
  EventHandler,
  EventTransport,
} from '@classytic/primitives/events';
import { matchEventPattern } from '@classytic/primitives/events';

export interface InProcessReferralBusOptions {
  logger?: { error(message: string, ...args: unknown[]): void };
}

/**
 * ~50-line in-process fallback transport (rule 13). Structurally identical
 * to arc's `MemoryEventTransport`; delegates glob matching to primitives'
 * `matchEventPattern`. Hosts that pass an `eventTransport` never construct it.
 */
export class InProcessReferralBus implements EventTransport {
  readonly name = 'in-process-referral';
  private handlers = new Map<string, Set<EventHandler>>();
  private logger: { error(message: string, ...args: unknown[]): void };

  constructor(options: InProcessReferralBusOptions = {}) {
    this.logger = options.logger ?? console;
  }

  async publish(event: DomainEvent): Promise<void> {
    const matched = new Set<EventHandler>();
    for (const [pattern, handlers] of this.handlers.entries()) {
      if (matchEventPattern(pattern, event.type)) {
        for (const h of handlers) matched.add(h);
      }
    }
    for (const handler of matched) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(`[referral] handler error for ${event.type}:`, err);
      }
    }
  }

  async subscribe(pattern: string, handler: EventHandler): Promise<() => void> {
    let set = this.handlers.get(pattern);
    if (!set) {
      set = new Set();
      this.handlers.set(pattern, set);
    }
    set.add(handler);
    return () => {
      const s = this.handlers.get(pattern);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) this.handlers.delete(pattern);
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }
}
