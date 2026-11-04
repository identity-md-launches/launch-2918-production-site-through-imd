import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEconomy, parseStatus } from '../src/data/archive';
import { breakContinuity, emptyTracker, freshness, sample, type Tracker } from '../src/data/telemetry';
import { createPoller, retryAfter } from '../src/data/rpc';
import { archiveJSON, economyJSON, NOW, statusJSON } from './fixtures';
const economy = parseEconomy(economyJSON);
function status(deltaMm = 0, deltaWork = 0, seconds = 0) {
  return parseStatus({ ...statusJSON, generatedAt: new Date(NOW + seconds * 1000).toISOString(), measurement: { ...statusJSON.measurement, distanceMm: statusJSON.measurement.distanceMm + deltaMm, cumulativeWorkUnits: String(BigInt(statusJSON.measurement.cumulativeWorkUnits) + BigInt(deltaWork)), observedAt: new Date(NOW + seconds * 1000).toISOString() } });
}
function take(t: Tracker, mm: number, work: number, seconds: number) { return sample(t, status(mm, work, seconds), { ...economy, generatedAt: new Date(NOW + seconds * 1000).toISOString() }, NOW + seconds * 1000); }
describe('strict verified public API adapters', () => {
  it('validates schema and every consumed status field, ignores optimistic projections', () => {
    expect(parseStatus({ ...statusJSON, builder: { projected: { cumulativeWork: '9999999999' } } }).measurement.cumulativeWorkUnits).toBe('90000');
    for (const key of Object.keys(statusJSON.measurement)) { const m = { ...statusJSON.measurement } as Record<string, unknown>; delete m[key]; expect(() => parseStatus({ ...statusJSON, measurement: m })).toThrow(); }
    for (const patch of [{ schemaVersion: 2 }, { installationId: '' }, { generatedAt: 'bad' }]) expect(() => parseStatus({ ...statusJSON, ...patch })).toThrow();
    for (const patch of [{ distanceMm: -1 }, { distanceMm: 1.5 }, { staleAfterSeconds: 0 }, { cumulativeWorkUnits: '9e6' }]) expect(() => parseStatus({ ...statusJSON, measurement: { ...statusJSON.measurement, ...patch } })).toThrow();
  });
  it('requires actual network, release and lifecycle from economy schema 2', () => {
    expect(economy.chain).toEqual({ target: 'sepolia', chainId: '11155111' });
    for (const patch of [{ schemaVersion: 1 }, { status: 'unavailable' }, { chain: { target: 'sepolia', chainId: 11155111 } }, { release: {} }, { lifecycle: {} }]) expect(() => parseEconomy({ ...economyJSON, ...patch })).toThrow();
  });
});
describe('new-work energy accounting', () => {
  it('pins lifetime counters without awarding the past, including zero-work initial counters', () => {
    const t = sample(emptyTracker(), status(), economy, NOW); expect(t.charges).toBe(0); expect(t.remainderMm).toBe(0);
    const zero = status(); zero.measurement.cumulativeWorkUnits = '0'; expect(sample(emptyTracker(), zero, economy, NOW).charges).toBe(0);
  });
  it('earns only paired positive deltas, preserves fractional mm, caps at 3 and discards overflow', () => {
    let t = sample(emptyTracker(), status(), economy, NOW);
    t = take(t, 500, 1, 1); expect(t.charges).toBe(0); expect(t.remainderMm).toBe(500);
    t = take(t, 1500, 2, 2); expect(t.charges).toBe(1); expect(t.remainderMm).toBe(500);
    t = take(t, 10000, 3, 3); expect(t.charges).toBe(3); expect(t.remainderMm).toBe(0);
    t = { ...t, charges: 2 }; t = take(t, 10000, 3, 4); expect(t.charges).toBe(2);
    t = take(t, 11000, 4, 5); expect(t.charges).toBe(3);
  });
  it('never duplicates energy from repeated or reordered timestamps, even after a charge is consumed', () => {
    let t = sample(emptyTracker(), status(), economy, NOW); t = take(t, 1000, 1, 1); t = { ...t, charges: 0 };
    for (let i = 0; i < 10; i++) t = take(t, 1000, 1, 1);
    expect(t.charges).toBe(0); t = take(t, 0, 0, 0); expect(t.charges).toBe(0);
    t = take(t, 2000, 2, 2); expect(t.charges).toBe(1);
  });
  it('counter decreases retain high-water marks; replayed old counters earn nothing', () => {
    let t = sample(emptyTracker(), status(), economy, NOW); t = take(t, 2000, 2, 1); t.charges = 0;
    t = take(t, -2000, -2, 2); expect(t.note).toContain('decreased');
    t = take(t, 1000, 1, 3); expect(t.charges).toBe(0);
    t = take(t, 2000, 2, 4); expect(t.charges).toBe(0);
    t = take(t, 3000, 3, 5); expect(t.charges).toBe(1);
  });
  it('epoch, installation, release and chain changes rebaseline; returning to an old identity cannot replay it', () => {
    for (const change of ['epoch', 'installation', 'release', 'chain']) {
      let t = sample(emptyTracker(), status(), economy, NOW); t = take(t, 1000, 1, 1); t.charges = 0;
      const s = status(100000, 100, 2), e = { ...economy, chain: { ...economy.chain } };
      if (change === 'epoch') s.measurement.counterEpoch = 'test-epoch-b';
      if (change === 'installation') { s.installationId = 'test-installation-b'; e.installationId = 'test-installation-b'; }
      if (change === 'release') e.releaseId = 'test-release-b';
      if (change === 'chain') e.chain.chainId = '1';
      t = sample(t, s, e, NOW + 2000); expect(t.charges).toBe(0); expect(t.note).toContain('changed');
      t = take(t, 0, 0, 3); expect(t.charges).toBe(0); t = take(t, 1000, 1, 4); expect(t.charges).toBe(0);
    }
  });
  it('stale and unavailable input suspend bonuses and rebaseline fresh reconnects', () => {
    let t = sample(emptyTracker(), status(), economy, NOW);
    t = sample(t, status(10000, 10, 1), economy, NOW + 200000); expect(t.charges).toBe(0); expect(t.needsBaseline).toBe(true);
    t = take(t, 20000, 20, 201); expect(t.charges).toBe(0);
    t = breakContinuity(t); t = take(t, 30000, 30, 202); expect(t.charges).toBe(0);
    t = take(t, 31000, 31, 203); expect(t.charges).toBe(1);
  });
  it('keeps the baseline pending through pre-break repeats and discards hidden-gap movement', () => {
    let t = sample(emptyTracker(), status(), economy, NOW);
    t = take(t, 500, 1, 1);
    t = breakContinuity(t, 'Tab was hidden. No background energy is awarded.');
    for (let second = 2; second <= 30; second++) {
      t = sample(t, status(500, 1, 1), economy, NOW + second * 1000);
      expect(t.needsBaseline).toBe(true); expect(t.charges).toBe(0);
      expect(t.note).toContain('Tab was hidden');
    }
    t = sample(t, status(), economy, NOW + 30000);
    expect(t.needsBaseline).toBe(true);
    t = take(t, 27500, 31, 31);
    expect(t.needsBaseline).toBe(false); expect(t.charges).toBe(0);
    expect(t.remainderMm).toBe(0); expect(t.note).toContain('Reconnected and rebaselined');
    t = take(t, 29000, 32, 32); expect(t.charges).toBe(1); expect(t.remainderMm).toBe(500);
    t = take(t, 29000, 32, 32); expect(t.charges).toBe(1);
  });
  it('zero-distance or zero-work samples never bank unpaired movement', () => {
    let t = sample(emptyTracker(), status(), economy, NOW);
    t = take(t, 1000, 0, 1); t = take(t, 1000, 1, 2); expect(t.charges).toBe(0);
    t = take(t, 2000, 2, 3); expect(t.charges).toBe(1);
  });
  it('reports honest idle, live, stale and unavailable states including time and freshness bounds', () => {
    expect(freshness(null, NOW)).toBe('unavailable'); expect(freshness(status(), NOW)).toBe('idle');
    const running = status(); running.measurement.coreStatus = 'IDLE'; running.measurement.rpmMilli = 66053;
    expect(freshness(running, NOW)).toBe('live'); expect(freshness(running, NOW + 120001)).toBe('stale');
    expect(freshness(status(0, 0, 60), NOW)).toBe('stale'); running.measurement.freshness = 'offline'; expect(freshness(running, NOW)).toBe('stale');
  });
  it('uses either motion field for live and requires both zero for idle, regardless of core lifecycle', () => {
    for (const coreStatus of ['ACTIVE', 'IDLE']) for (const [rpmMilli, speedMmPerSecond, expected] of [[0, 0, 'idle'], [0, 967, 'live'], [66053, 0, 'live'], [66053, 967, 'live']] as const) {
      const s = status(); Object.assign(s.measurement, { coreStatus, rpmMilli, speedMmPerSecond });
      expect(freshness(s, NOW)).toBe(expected);
    }
  });
});
describe('serialized, abortable polling', () => {
  afterEach(() => vi.useRealTimers());
  const ok = (url: string) => new Response(JSON.stringify(url.includes('settlements') ? archiveJSON : url.includes('economy') ? economyJSON : statusJSON), { status: 200, headers: { 'Content-Type': 'application/json' } });
  it('honors numeric/date Retry-After values', () => { expect(retryAfter('17', NOW)).toBe(17000); expect(retryAfter(new Date(NOW + 20000).toUTCString(), NOW)).toBe(20000); expect(retryAfter('invalid', NOW)).toBe(0); });
  it('polls status every 10s and economy every 60s without overlapping any request', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); let inflight = 0, max = 0; const calls: { url: string; at: number }[] = [];
    const fetcher = vi.fn(async (url: string) => { inflight++; max = Math.max(max, inflight); calls.push({ url, at: Date.now() }); await new Promise(r => setTimeout(r, 15)); inflight--; return ok(url); }) as unknown as typeof fetch;
    const poller = createPoller({ onChange() {}, fetcher }); poller.start(); await vi.advanceTimersByTimeAsync(61000); poller.pause();
    expect(max).toBe(1); expect(calls.filter(c => c.url.endsWith('/status'))).toHaveLength(7); expect(calls.filter(c => c.url.endsWith('/economy/state'))).toHaveLength(2);
    const statuses = calls.filter(c => c.url.endsWith('/status')); expect(statuses[1].at - statuses[0].at).toBeGreaterThanOrEqual(10000);
  });
  it('backs off, respects Retry-After even on manual retry, then recovers', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); let statuses = 0;
    const fetcher = vi.fn(async (url: string) => url.endsWith('/status') && ++statuses === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '30' } }) : ok(url)) as unknown as typeof fetch;
    const poller = createPoller({ onChange() {}, fetcher }); poller.start(); await vi.advanceTimersByTimeAsync(5);
    expect(poller.getState().errors.status).toContain('429'); poller.retry(); await vi.advanceTimersByTimeAsync(29000); expect(statuses).toBe(1); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100); expect(statuses).toBe(2); expect(poller.getState().errors.status).toBeUndefined(); poller.pause();
  });
  it('suspends hidden work and ignores late responses even when a transport ignores abort', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); let finish!: (r: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(r => { finish = r; })) as typeof fetch;
    const poller = createPoller({ onChange() {}, fetcher }); poller.start(); await vi.advanceTimersByTimeAsync(1); poller.pause();
    finish(ok('/status')); await vi.advanceTimersByTimeAsync(60000); expect(poller.getState().status).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('times out a stalled response body as well as response headers', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })) as unknown as typeof fetch;
    const poller = createPoller({ onChange() {}, fetcher, timeoutMs: 100 }); poller.start(); await vi.advanceTimersByTimeAsync(101);
    expect(poller.getState().errors.status).toContain('timed out'); poller.pause();
  });
  it('times out a hanging request and does not falsely mark it successful', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const fetcher = vi.fn(() => new Promise<Response>(() => {})) as typeof fetch;
    const poller = createPoller({ onChange() {}, fetcher, timeoutMs: 100 }); poller.start(); await vi.advanceTimersByTimeAsync(101);
    expect(poller.getState().errors.status).toContain('timed out'); expect(poller.getState().status).toBeNull(); poller.pause();
  });
  it('turns transport failures into an actionable message and recovers on retry', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); let connected = false;
    const fetcher = vi.fn(async (url: string) => { if (!connected) throw new TypeError('Failed to fetch'); return ok(url); }) as unknown as typeof fetch;
    const poller = createPoller({ onChange() {}, fetcher }); poller.start(); await vi.advanceTimersByTimeAsync(5);
    expect(poller.getState().errors.archive).toBe('Squeekchain could not be reached. Retry, or practice in Demo.');
    connected = true; poller.retry(); await vi.advanceTimersByTimeAsync(5);
    expect(poller.getState().archive).not.toBeNull(); expect(poller.getState().errors.archive).toBeUndefined(); poller.pause();
  });
});
