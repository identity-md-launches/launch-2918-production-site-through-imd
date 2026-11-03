import type { BlockRef } from '../core/types';

export const RPC_URL = 'https://ethereum-rpc.publicnode.com';
export const POLL_MS = 12_000;
export const TIMEOUT_MS = 8_000;
export const STALE_MS = 60_000;
export const BLOCK_STALE_MS = 120_000;
export const HASH = /^0x[0-9a-fA-F]{64}$/;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

function quantity(value: unknown, field: string): number {
  if (typeof value !== 'string' || !QUANTITY.test(value)) throw new Error(`Invalid block ${field}.`);
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid block ${field}.`);
  return parsed;
}

export function parseBlockResponse(value: unknown, now = Date.now()): BlockRef {
  if (!value || typeof value !== 'object') throw new Error('The block API returned an invalid response.');
  const envelope = value as Record<string, unknown>;
  if (envelope.jsonrpc !== '2.0' || envelope.id !== 1 || envelope.error || !envelope.result || typeof envelope.result !== 'object') {
    throw new Error('The block API did not return a block.');
  }
  const b = envelope.result as Record<string, unknown>;
  if (typeof b.hash !== 'string' || !HASH.test(b.hash) || /^0x0+$/.test(b.hash) ||
      typeof b.parentHash !== 'string' || !HASH.test(b.parentHash)) throw new Error('The block API returned an invalid hash.');
  const number = quantity(b.number, 'number'), timestamp = quantity(b.timestamp, 'timestamp');
  if (timestamp < 1438269973 || timestamp * 1000 > now + 30_000) throw new Error('The block timestamp is outside the expected range.');
  return { number, hash: b.hash.toLowerCase(), parentHash: b.parentHash.toLowerCase(), timestamp };
}

export async function fetchLatestBlock(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<BlockRef> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetcher(RPC_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }),
    signal: combined, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`The block API is unavailable (HTTP ${response.status}).`);
  return parseBlockResponse(await response.json());
}

export type FeedStatus = 'connecting' | 'live' | 'stale' | 'unavailable' | 'paused';
export interface Feed {
  status: FeedStatus;
  block: BlockRef | null;
  epoch: number;
  lastSuccess: number | null;
  lastChange: number | null;
  error: string | null;
  samples: number;
}
export const initialFeed = (): Feed => ({ status: 'connecting', block: null, epoch: 0, lastSuccess: null, lastChange: null, error: null, samples: 0 });

export function isFresh(feed: Feed, now: number): boolean {
  return !!feed.block && feed.lastSuccess !== null && feed.lastChange !== null &&
    now - feed.lastSuccess <= STALE_MS && now - feed.lastChange <= STALE_MS && now - feed.block.timestamp * 1000 <= BLOCK_STALE_MS;
}

export function acceptSample(feed: Feed, block: BlockRef, now: number): Feed {
  const previous = feed.block;
  const repeat = previous?.hash === block.hash && previous.number === block.number;
  const reorg = !!previous && !repeat && (block.number <= previous.number ||
    (block.number === previous.number + 1 && block.parentHash !== previous.hash));
  const next: Feed = {
    ...feed, block, epoch: feed.epoch + (reorg ? 1 : 0), lastSuccess: now,
    lastChange: repeat ? feed.lastChange : now, error: null, samples: feed.samples + 1,
  };
  return { ...next, status: isFresh(next, now) ? 'live' : 'stale' };
}

export function failSample(feed: Feed, message: string): Feed {
  return { ...feed, status: 'unavailable', error: message };
}
export function tickFeed(feed: Feed, now: number): Feed {
  if (feed.status !== 'live') return feed;
  return isFresh(feed, now) ? feed : { ...feed, status: 'stale' };
}

export interface PollOptions {
  onChange: (feed: Feed) => void;
  request?: (signal: AbortSignal) => Promise<BlockRef>;
  now?: () => number;
  interval?: number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
}

// Serial polling and generation tokens keep aborted/reset responses from leaking in.
export function createPoller(options: PollOptions) {
  let feed = initialFeed(), generation = 0, running = false, pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  const emit = () => options.onChange(feed);
  const request = options.request ?? fetchLatestBlock;
  async function poll() {
    if (!running || pending) return;
    if (timer) cancel(timer);
    pending = true;
    const token = generation;
    controller = new AbortController();
    try {
      const block = await request(controller.signal);
      if (running && token === generation) { feed = acceptSample(feed, block, now()); emit(); }
    } catch (error) {
      if (running && token === generation) {
        feed = failSample(feed, error instanceof Error ? error.message : 'Unable to reach the block API.'); emit();
      }
    } finally {
      if (token === generation) {
        pending = false;
        if (running) timer = schedule(poll, options.interval ?? POLL_MS);
      }
    }
  }
  return {
    start() { if (running) return; running = true; generation++; void poll(); },
    retry() { void poll(); },
    tick() { const next = tickFeed(feed, now()); if (next !== feed) { feed = next; emit(); } },
    pause() {
      running = false; generation++; pending = false; controller?.abort(); if (timer) cancel(timer);
      feed = { ...feed, status: 'paused' }; emit();
    },
    reset() {
      running = false; generation++; pending = false; controller?.abort(); if (timer) cancel(timer);
      feed = initialFeed(); emit();
    },
    getState() { return feed; },
  };
}
