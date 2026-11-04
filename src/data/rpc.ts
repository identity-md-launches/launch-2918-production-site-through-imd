import { API, parseArchive, parseEconomy, parseStatus, type Archive, type Economy, type Status } from './archive';
export type Endpoint = 'status' | 'economy' | 'archive';
export interface Feed { status: Status | null; economy: Economy | null; archive: Archive | null; errors: Partial<Record<Endpoint, string>>; loading: boolean; now: number }
export const initialFeed: Feed = { status: null, economy: null, archive: null, errors: {}, loading: true, now: Date.now() };
export function retryAfter(value: string | null, now: number): number {
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.max(0, Number(value) * 1000);
  const at = Date.parse(value); return Number.isFinite(at) ? Math.max(0, at - now) : 0;
}
export function createPoller(options: { onChange: (feed: Feed) => void; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; intervals?: Record<Endpoint, number> }) {
  const clock = options.now ?? Date.now, fetcher = options.fetcher ?? fetch;
  const intervals = options.intervals ?? { status: 10_000, economy: 60_000, archive: 60_000 };
  const paths = { status: '/status', economy: '/economy/state', archive: '/settlements?range=24h' };
  const due = { status: 0, economy: 0, archive: 0 }, embargo = { status: 0, economy: 0, archive: 0 }, failures = { status: 0, economy: 0, archive: 0 };
  let globalEmbargo = 0;
  let state: Feed = { ...initialFeed, errors: {}, now: clock() }, active = false, busy = false, generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | null = null;
  const emit = () => options.onChange({ ...state, errors: { ...state.errors }, now: clock() });
  const schedule = () => {
    if (!active || busy) return;
    clearTimeout(timer);
    const delay = Math.max(0, globalEmbargo - clock(), Math.min(...Object.values(due)) - clock());
    timer = setTimeout(() => { void pump(); }, delay);
  };
  async function pump() {
    if (!active || busy) return;
    if (clock() < globalEmbargo) { schedule(); return; }
    const endpoint = (['status', 'economy', 'archive'] as Endpoint[]).find(e => due[e] <= clock());
    if (!endpoint) { schedule(); return; }
    busy = true; const token = generation; controller = new AbortController(); const currentController = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // The timeout covers headers AND the response body, including a stalled JSON read.
      const request = (async () => {
        const response = await fetcher(API + paths[endpoint], { signal: currentController.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!response.ok) {
          if (token === generation) {
            embargo[endpoint] = Math.max(embargo[endpoint], clock() + retryAfter(response.headers.get('Retry-After'), clock()));
            globalEmbargo = Math.max(globalEmbargo, embargo[endpoint]);
          }
          throw new Error(`Squeekchain ${endpoint} unavailable (HTTP ${response.status}). Try Demo or retry.`);
        }
        const json: unknown = await response.json();
        return endpoint === 'status' ? parseStatus(json) : endpoint === 'economy' ? parseEconomy(json) : parseArchive(json);
      })();
      const parsed = await Promise.race([request, new Promise<never>((_, reject) => { timeout = setTimeout(() => { currentController.abort(); reject(new Error('Request timed out.')); }, options.timeoutMs ?? 8000); })]);
      if (token !== generation || !active) return;
      state = { ...state, [endpoint]: parsed, loading: false };
      delete state.errors[endpoint]; failures[endpoint] = 0; due[endpoint] = clock() + intervals[endpoint];
    } catch (error) {
      if (token !== generation || !active) return;
      failures[endpoint]++;
      state = { ...state, loading: false, errors: { ...state.errors, [endpoint]: error instanceof Error ? error.message : 'Connection unavailable. Try Demo or retry.' } };
      due[endpoint] = Math.max(embargo[endpoint], clock() + Math.min(120_000, intervals[endpoint] * 2 ** Math.min(4, failures[endpoint] - 1)));
    } finally {
      clearTimeout(timeout);
      if (token === generation) { busy = false; controller = null; emit(); schedule(); }
    }
  }
  return {
    start() { if (active) return; active = true; schedule(); },
    pause() { active = false; generation++; clearTimeout(timer); controller?.abort(); controller = null; busy = false; },
    retry() { for (const e of ['status', 'economy', 'archive'] as Endpoint[]) due[e] = Math.max(clock(), embargo[e]); schedule(); },
    tick() { emit(); },
    getState() { return state; },
  };
}
