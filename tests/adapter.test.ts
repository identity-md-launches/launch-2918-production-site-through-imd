import { afterEach, describe, expect, test, vi } from 'vitest';
import { acceptSample, BLOCK_STALE_MS, createPoller, failSample, fetchLatestBlock, initialFeed, parseBlockResponse, STALE_MS, tickFeed } from '../src/data/rpc';
import { STARTER_ARCHIVE } from '../src/data/archive';
import { createRound, gameReducer } from '../src/core/engine';
import type { BlockRef } from '../src/core/types';

if (STARTER_ARCHIVE.kind !== 'block') throw new Error('Expected a block fixture.');
const block: BlockRef = STARTER_ARCHIVE.block;
const NOW = block.timestamp * 1000 + 3000;
const envelope = () => ({ jsonrpc: '2.0', id: 1, result: { number: `0x${block.number.toString(16)}`, hash: block.hash, parentHash: block.parentHash, timestamp: `0x${block.timestamp.toString(16)}` } });
// Synthetic headers are isolated test fixtures; never shipped as live input.
const nextBlock = (): BlockRef => ({ number: block.number + 1, hash: '0x' + 'a'.repeat(64), parentHash: block.hash, timestamp: block.timestamp + 12 });

afterEach(() => vi.useRealTimers());
describe('strict API boundary', () => {
  test('parses a recorded real Ethereum header', () => expect(parseBlockResponse(envelope(), NOW)).toEqual(block));
  test('rejects RPC errors, nulls, malformed hashes, noncanonical numbers and future time', () => {
    for (const value of [null, {}, { ...envelope(), error: { code: -1 } }, { ...envelope(), id: 2 }, { ...envelope(), result: null },
      { ...envelope(), result: { ...envelope().result, hash: '0x123' } },
      { ...envelope(), result: { ...envelope().result, number: '0x01' } },
      { ...envelope(), result: { ...envelope().result, number: '0x10000000000000000' } },
      { ...envelope(), result: { ...envelope().result, timestamp: `0x${(block.timestamp + 400).toString(16)}` } }]) expect(() => parseBlockResponse(value, NOW)).toThrow();
  });
  test('fetch uses the exact public method and handles HTTP failure', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(envelope()), { status: 200 }));
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    await expect(fetchLatestBlock(undefined, fetcher as typeof fetch)).resolves.toEqual(block);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ethereum-rpc.publicnode.com');
    expect(JSON.parse(String(request.body))).toEqual({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] });
    await expect(fetchLatestBlock(undefined, vi.fn(async () => new Response('', { status: 503 })) as typeof fetch)).rejects.toThrow('503');
    vi.restoreAllMocks();
  });
});

describe('sample, stale and epoch semantics', () => {
  test('repeated headers retain identity, epoch and last-change time', () => {
    const first = acceptSample(initialFeed(), block, NOW);
    const repeat = acceptSample(first, { ...block }, NOW + 12_000);
    expect(repeat.block).toEqual(first.block); expect(repeat.epoch).toBe(0); expect(repeat.lastChange).toBe(NOW); expect(repeat.samples).toBe(2);
  });
  test('a repeated successful response cannot hide a stalled chain', () => {
    const first = acceptSample(initialFeed(), block, NOW);
    expect(acceptSample(first, block, NOW + STALE_MS + 1).status).toBe('stale');
    expect(tickFeed(first, NOW + STALE_MS + 1).status).toBe('stale');
  });
  test('old headers are stale immediately even if freshly fetched', () => {
    expect(acceptSample(initialFeed(), block, NOW + BLOCK_STALE_MS + 1).status).toBe('stale');
  });
  test('normal adjacent header advances without changing epoch', () => {
    const feed = acceptSample(acceptSample(initialFeed(), block, NOW), nextBlock(), NOW + 12_000);
    expect(feed.status).toBe('live'); expect(feed.epoch).toBe(0); expect(feed.lastChange).toBe(NOW + 12_000);
  });
  test('conflicting height, parent mismatch and regression increment epoch', () => {
    const first = acceptSample(initialFeed(), block, NOW);
    for (const candidate of [
      { ...nextBlock(), number: block.number },
      { ...nextBlock(), parentHash: '0x' + 'b'.repeat(64) },
      { ...nextBlock(), number: block.number - 1 },
    ]) expect(acceptSample(first, candidate, NOW + 12_000).epoch).toBe(1);
  });
  test('failure keeps the last header but never labels it live', () => {
    const feed = failSample(acceptSample(initialFeed(), block, NOW), 'Offline');
    expect(feed.status).toBe('unavailable'); expect(feed.block).toEqual(block); expect(feed.error).toBe('Offline');
  });
  test('incoming blocks do not mutate an active round or its seed', () => {
    const round = gameReducer(createRound(STARTER_ARCHIVE, 'live'), { type: 'start' });
    const frozen = JSON.stringify(round);
    let feed = acceptSample(initialFeed(), block, NOW);
    feed = acceptSample(feed, nextBlock(), NOW + 12_000);
    expect(feed.block?.hash).not.toBe(block.hash); expect(JSON.stringify(round)).toBe(frozen);
  });
});

describe('poller lifetime and retries', () => {
  test('serializes retries while one request is pending', async () => {
    let resolve!: (value: BlockRef) => void;
    const request = vi.fn(() => new Promise<BlockRef>(r => { resolve = r; }));
    const poller = createPoller({ onChange: vi.fn(), request, now: () => NOW });
    poller.start(); poller.retry(); poller.retry(); expect(request).toHaveBeenCalledTimes(1);
    resolve(block); await Promise.resolve(); await Promise.resolve();
    expect(poller.getState().status).toBe('live'); poller.reset();
  });
  test('reset ignores late old responses and starts a clean sample epoch', async () => {
    const resolvers: ((block: BlockRef) => void)[] = [];
    const request = vi.fn(() => new Promise<BlockRef>(r => resolvers.push(r)));
    const changed = vi.fn();
    const poller = createPoller({ onChange: changed, request, now: () => NOW });
    poller.start(); poller.reset(); poller.start();
    resolvers[0](nextBlock()); await Promise.resolve(); await Promise.resolve();
    expect(poller.getState().block).toBeNull();
    resolvers[1](block); await Promise.resolve(); await Promise.resolve();
    expect(poller.getState().block).toEqual(block); expect(poller.getState().samples).toBe(1); poller.reset();
  });
  test('pause aborts pending work, stops polling, and resume recovers', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const request = vi.fn((s: AbortSignal) => { signal = s; return Promise.resolve(block); });
    const poller = createPoller({ onChange: vi.fn(), request, now: () => NOW, interval: 25 });
    poller.start(); await vi.advanceTimersByTimeAsync(0);
    poller.pause(); expect(signal?.aborted).toBe(true); expect(poller.getState().status).toBe('paused');
    await vi.advanceTimersByTimeAsync(100); expect(request).toHaveBeenCalledTimes(1);
    poller.start(); await vi.advanceTimersByTimeAsync(25); expect(request.mock.calls.length).toBeGreaterThan(1); poller.reset();
  });
  test('API failure recovers on a short deterministic polling interval', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(block);
    const poller = createPoller({ onChange: vi.fn(), request, now: () => NOW, interval: 20 });
    poller.start(); await vi.advanceTimersByTimeAsync(0); expect(poller.getState().status).toBe('unavailable');
    await vi.advanceTimersByTimeAsync(20); expect(poller.getState().status).toBe('live'); poller.reset();
  });
});
