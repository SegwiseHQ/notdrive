/**
 * In-process pub/sub for item-change events. Used by the SSE route
 * (GET /items/:id/stream) to push real-time updates to connected viewers.
 *
 * Single-replica safe. When you scale to multiple API replicas, swap the
 * internals for Postgres LISTEN/NOTIFY (the publish/subscribe surface stays
 * the same — only this file changes).
 */
import { logger } from '../util/logger.js';

export type ItemEventKind =
  | 'updated'    // body / title / visibility / favorite changed
  | 'archived'
  | 'restored'
  | 'moved'
  | 'linked'
  | 'unlinked';

export interface ItemEvent {
  kind: ItemEventKind;
  /** User who triggered the change. Frontends suppress self-events. */
  by: string;
  /** Epoch ms — clients can use this to order / dedupe. */
  at: number;
}

type Subscriber = (event: ItemEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();

/** Notify every active subscriber for `itemId`. Fire-and-forget. */
export function publishItemEvent(itemId: string, event: ItemEvent): void {
  const subs = subscribers.get(itemId);
  if (!subs || subs.size === 0) return;
  for (const fn of subs) {
    try {
      fn(event);
    } catch (err) {
      // One bad subscriber shouldn't stop the others.
      logger.warn({ itemId, err: (err as Error).message }, 'item subscriber threw');
    }
  }
}

/** Register a subscriber. Returns an unsubscribe fn. */
export function subscribeToItem(itemId: string, fn: Subscriber): () => void {
  let set = subscribers.get(itemId);
  if (!set) {
    set = new Set();
    subscribers.set(itemId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) subscribers.delete(itemId);
  };
}
