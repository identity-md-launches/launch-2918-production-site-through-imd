import { createPuzzle, rotateMask } from '../core/engine';
import type { Run, Source } from '../core/types';
import { DEMO_SOURCE, DECIMAL, HASH, energyBudget, parseNetwork, parseSettlement } from './archive';
import { breakContinuity, emptyTracker, type Tracker } from './telemetry';
export const STORAGE_KEY = 'squeek-signal-garden.v1';
export interface Saved { run: Run | null; tracker: Tracker; bests: Record<string, number>; warning: string }
export function validateSource(value: unknown): Source {
  const s = value as Source;
  if (!s || typeof s !== 'object') throw new Error('Invalid source.');
  if (s.mode === 'demo') return { ...DEMO_SOURCE };
  if (!['live', 'archive'].includes(s.mode) || !DECIMAL.test(s.round) || !s.network || typeof s.installationId !== 'string' || !s.installationId || s.installationId.length > 256 || typeof s.releaseId !== 'string' || !s.releaseId || s.releaseId.length > 256 || !Number.isFinite(Date.parse(s.timestamp))) throw new Error('Invalid saved source.');
  const network = parseNetwork(s.network);
  if (s.mode === 'archive') {
    const settlement = parseSettlement(s.settlement);
    if (settlement.settledThroughRound !== s.round || !HASH.test(settlement.transactionHash)) throw new Error('Invalid round.');
    return { ...s, network, settlement, key: `signal-garden/v1|archive|${network.chainId}|${settlement.transactionHash}|${s.round}`, budget: energyBudget(settlement.workAdded) };
  }
  if (typeof s.epoch !== 'string' || !s.epoch || s.epoch.length > 256 || typeof s.key !== 'string' || s.key.length > 1100 || !s.key.startsWith('signal-garden/v1|live|')) throw new Error('Invalid live epoch.');
  return { ...s, network, budget: 0 };
}
export function restoreRun(value: unknown): Run {
  const run = value as Run, source = validateSource(run?.source);
  if (run.version !== 1 || !Number.isInteger(run.stage) || run.stage < 0 || run.stage > 2 || !['ready', 'playing', 'paused', 'bloom', 'won', 'lost'].includes(run.phase)) throw new Error('Invalid run.');
  const key = source.mode === 'live' ? run.puzzle?.key : source.key;
  if (typeof key !== 'string' || key.length > 1100) throw new Error('Invalid puzzle.');
  const puzzle = createPuzzle(key, run.stage);
  if (!Array.isArray(run.tiles) || run.tiles.length !== 36) throw new Error('Invalid board.');
  const tiles = run.tiles.map((tile, i) => {
    const original = puzzle.tiles[i], permitted = [original.mask]; let mask = original.mask;
    for (let n = 0; n < 3; n++) { mask = rotateMask(mask); permitted.push(mask); }
    if (!permitted.includes(tile.mask) || (original.kind !== 'conduit' && tile.mask !== original.mask)) throw new Error('Invalid tile.');
    return { ...original, mask: tile.mask };
  });
  for (const n of ['moves', 'score', 'streak', 'combo', 'charges', 'remainingMs', 'selected', 'completed'] as const) if (!Number.isFinite(run[n]) || (n !== 'remainingMs' && !Number.isSafeInteger(run[n])) || run[n] < 0 || run[n] > 1_000_000) throw new Error('Invalid progress.');
  if (run.selected > 35 || run.charges > 3 || run.remainingMs > 180000 || run.moves > puzzle.limit) throw new Error('Invalid progress.');
  for (const list of [run.awarded, run.boosted]) if (!Array.isArray(list) || list.length > 4 || list.some(i => !puzzle.beacons.includes(i))) throw new Error('Invalid flowers.');
  if (typeof run.lossReason !== 'string' || run.lossReason.length > 1000) throw new Error('Invalid result.');
  const boardRound = typeof run.boardRound === 'string' && (source.mode === 'demo' ? run.boardRound === 'practice' : DECIMAL.test(run.boardRound)) ? run.boardRound : source.round;
  return { ...run, source, puzzle, tiles, boardRound, phase: run.phase === 'playing' ? 'paused' : run.phase };
}
export function loadSaved(storage?: Pick<Storage, 'getItem'>): Saved {
  const fallback = { run: null, tracker: emptyTracker(), bests: {}, warning: '' };
  try {
    const raw = (storage ?? localStorage).getItem(STORAGE_KEY);
    if (!raw) return fallback;
    if (raw.length > 100000) throw new Error('Saved run too large.');
    const value = JSON.parse(raw), bests: Record<string, number> = {};
    if (value.bests && typeof value.bests === 'object') for (const [key, score] of Object.entries(value.bests).slice(0, 100)) if (typeof score === 'number' && Number.isSafeInteger(score) && score >= 0 && score < 1_000_000 && key.length < 1100) bests[key] = score;
    // A reload always rebaselines. Historic counters in storage cannot earn energy.
    const tracker = emptyTracker();
    const stored = value.tracker;
    if (stored && typeof stored.identity === 'string' && stored.identity.length < 1100 && stored.seen && typeof stored.seen === 'object') {
      tracker.identity = stored.identity;
      for (const [key, raw] of Object.entries(stored.seen).slice(0, 30)) {
        const mark = raw as { time: number; distance: number; work: string };
        if (key.length < 1100 && Number.isFinite(mark?.time) && Number.isSafeInteger(mark?.distance) && mark.distance >= 0 && typeof mark.work === 'string' && DECIMAL.test(mark.work)) tracker.seen[key] = mark;
      }
    }
    tracker.note = 'Restored run. Live bonus energy will rebaseline before continuing.';
    const run = value.run ? restoreRun(value.run) : null;
    if (run?.source.mode === 'live') { tracker.charges = run.charges; tracker.earned = run.charges; }
    return { run, tracker: breakContinuity(tracker, tracker.note), bests, warning: '' };
  } catch { return { ...fallback, warning: 'Local saves are unavailable or unreadable. You can still play and export a PNG.' }; }
}
export function saveState(run: Run | null, tracker: Tracker, bests: Record<string, number>, storage?: Pick<Storage, 'setItem'>): boolean {
  try { (storage ?? localStorage).setItem(STORAGE_KEY, JSON.stringify({ version: 1, run, tracker, bests })); return true; } catch { return false; }
}
