import type { Puzzle, Run, Source, Tile } from './types';

export const SIZE = 6;
export const DURATION = 180_000;
export const N = 1, E = 2, S = 4, W = 8;
const directions = [{ bit: N, opposite: S, dr: -1, dc: 0 }, { bit: E, opposite: W, dr: 0, dc: 1 }, { bit: S, opposite: N, dr: 1, dc: 0 }, { bit: W, opposite: E, dr: 0, dc: -1 }];

// Retained, tested unsigned FNV-1a / xorshift primitives from the preceding project.
export function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return h || 0x9e3779b9;
}
export function xorshift32(seed: number): number {
  let x = seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0;
}
export function rotateMask(mask: number): number { return ((mask << 1) & 15) | (mask >> 3); }
export function turnsTo(from: number, to: number): number {
  for (let i = 0; i < 4; i++, from = rotateMask(from)) if (from === to) return i;
  return 0;
}
export function cellName(i: number): string { return `${String.fromCharCode(65 + Math.floor(i / SIZE))}${i % SIZE + 1}`; }
export function tileName(tile: Tile): string {
  if (tile.kind !== 'conduit') return ({ source: 'hamster wheel', beacon: 'flower beacon', rock: 'stone obstacle', fern: 'fern' })[tile.kind];
  const bits = directions.filter(d => tile.mask & d.bit).length;
  return bits === 3 ? 'T-junction' : tile.mask === 5 || tile.mask === 10 ? 'straight conduit' : 'elbow conduit';
}
export function ports(mask: number): string { return directions.filter(d => mask & d.bit).map(d => ({ 1: 'north', 2: 'east', 4: 'south', 8: 'west' })[d.bit]).join(', '); }

// Build a degree-three comb tree FIRST. Its four leaves become fixed beacons.
// Seeded rotation/reflection changes placement; only then scramble conduits.
export function createPuzzle(key: string, stage = 0): Puzzle {
  let state = hashSeed(`${key}|board:${stage}`);
  const random = (max: number) => { state = xorshift32(state); return state % max; };
  const masks = Array<number>(36).fill(0), spine = 1 + random(3), mirror = random(2), spin = random(4);
  function join(a: number, b: number) {
    const diff = b - a; const bit = diff === 1 ? E : diff === -1 ? W : diff === 6 ? S : N;
    masks[a] |= bit; masks[b] |= rotateMask(rotateMask(bit));
  }
  for (let c = 0; c < spine; c++) join(30 + c, 31 + c);
  for (let r = 0; r < 5; r++) join(r * 6 + spine, (r + 1) * 6 + spine);
  const endpoints: number[] = [];
  const sides = [false, true, false, true];
  for (let i = sides.length - 1; i > 0; i--) { const j = random(i + 1); [sides[i], sides[j]] = [sides[j], sides[i]]; }
  for (let r = 0; r < 4; r++) {
    const right = sides[r], end = right ? 5 : 0;
    for (let c = spine; c !== end; c += right ? 1 : -1) join(r * 6 + c, r * 6 + c + (right ? 1 : -1));
    endpoints.push(r * 6 + end);
  }
  const transform = (i: number) => {
    let r = Math.floor(i / 6), c = i % 6;
    if (mirror) c = 5 - c;
    for (let n = 0; n < spin; n++) [r, c] = [c, 5 - r];
    return r * 6 + c;
  };
  const transformMask = (value: number) => {
    let m = value;
    if (mirror) m = (m & 5) | (m & E ? W : 0) | (m & W ? E : 0);
    for (let n = 0; n < spin; n++) m = rotateMask(m);
    return m;
  };
  const source = transform(30), beacons = endpoints.map(transform);
  const tiles: Tile[] = Array.from({ length: 36 });
  for (let i = 0; i < 36; i++) {
    const index = transform(i), solution = transformMask(masks[i]);
    const kind = index === source ? 'source' : beacons.includes(index) ? 'beacon' : solution ? 'conduit' : random(5) < 2 + stage ? 'rock' : 'fern';
    tiles[index] = { mask: solution, solution, kind };
  }
  const empty = tiles.map((t, i) => t.kind === 'rock' || t.kind === 'fern' ? i : -1).filter(i => i >= 0);
  for (let i = empty.length - 1; i > 0; i--) { const j = random(i + 1); [empty[i], empty[j]] = [empty[j], empty[i]]; }
  empty.forEach((index, i) => { tiles[index].kind = i < 3 + stage * 2 ? 'rock' : 'fern'; });
  const candidates = tiles.map((t, i) => t.kind === 'conduit' ? i : -1).filter(i => i >= 0);
  for (let i = candidates.length - 1; i > 0; i--) { const j = random(i + 1); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  const entry = transform(31);
  candidates.splice(candidates.indexOf(entry), 1); candidates.unshift(entry);
  const count = Math.min(candidates.length, 4 + stage * 3);
  for (const index of candidates.slice(0, count)) {
    const t = tiles[index], turns = stage === 0 ? 3 : 1 + random(3);
    for (let i = 0; i < turns; i++) t.mask = rotateMask(t.mask);
    if (t.mask === t.solution) t.mask = rotateMask(t.mask);
  }
  const par = tiles.reduce((n, t) => n + (t.kind === 'conduit' ? turnsTo(t.mask, t.solution) : 0), 0);
  return { key, tiles, source, beacons, stage, par, limit: par + [7, 5, 3][stage] };
}

export function connections(tiles: Tile[], source: number): Set<number> {
  const found = new Set([source]), queue = [source];
  while (queue.length) {
    const index = queue.shift()!, r = Math.floor(index / 6), c = index % 6;
    for (const d of directions) {
      const nr = r + d.dr, nc = c + d.dc;
      if (!(tiles[index].mask & d.bit) || nr < 0 || nc < 0 || nr >= 6 || nc >= 6) continue;
      const next = nr * 6 + nc;
      if ((tiles[next].mask & d.opposite) && !found.has(next)) { found.add(next); queue.push(next); }
    }
  }
  return found;
}
export function routed(run: Pick<Run, 'tiles' | 'puzzle'>): number[] {
  const powered = connections(run.tiles, run.puzzle.source);
  return run.puzzle.beacons.filter(i => powered.has(i));
}
export function createRun(source: Source): Run {
  const puzzle = createPuzzle(source.key, 0);
  return { version: 1, source, puzzle, tiles: puzzle.tiles.map(t => ({ ...t })), phase: 'ready', stage: 0, moves: 0, score: 0, streak: 0, combo: 1, awarded: [], boosted: [], charges: source.budget, remainingMs: DURATION, selected: puzzle.source, boardRound: source.round, completed: 0, lossReason: '' };
}
export type Action = { type: 'start' | 'pause' | 'resume' | 'restart' | 'boost' } | { type: 'select'; index: number } | { type: 'rotate' } | { type: 'tick'; elapsed: number } | { type: 'charges'; value: number } | { type: 'next'; key?: string; round?: string };
export function gameReducer(run: Run, action: Action): Run {
  if (action.type === 'restart') return createRun(run.source);
  if (action.type === 'select') return Number.isInteger(action.index) && action.index >= 0 && action.index < 36 ? { ...run, selected: action.index } : run;
  if (action.type === 'charges') return { ...run, charges: Math.max(0, Math.min(3, Math.floor(action.value))) };
  if (action.type === 'start') return run.phase === 'ready' ? { ...run, phase: 'playing' } : run;
  if (action.type === 'pause') return run.phase === 'playing' ? { ...run, phase: 'paused' } : run;
  if (action.type === 'resume') return run.phase === 'paused' ? { ...run, phase: 'playing' } : run;
  if (action.type === 'tick') {
    if (run.phase !== 'playing') return run;
    const remainingMs = Math.max(0, run.remainingMs - Math.max(0, action.elapsed));
    return { ...run, remainingMs, ...(remainingMs === 0 ? { phase: 'lost' as const, lossReason: 'The three-minute night has ended.' } : {}) };
  }
  if (action.type === 'boost') {
    if (!['playing', 'bloom'].includes(run.phase) || !run.charges || !routed(run).includes(run.selected) || run.boosted.includes(run.selected)) return run;
    return { ...run, charges: run.charges - 1, boosted: [...run.boosted, run.selected], score: run.score + 150 };
  }
  if (action.type === 'next') {
    if (run.phase !== 'bloom') return run;
    if (run.stage === 2) return { ...run, phase: 'won', score: run.score + Math.floor(run.remainingMs / 1000) * 2 };
    const stage = run.stage + 1, key = action.key ?? (run.source.mode === 'live' ? run.puzzle.key : run.source.key), puzzle = createPuzzle(key, stage);
    return { ...run, boardRound: action.round ?? (run.source.mode === 'live' ? run.boardRound : run.source.round), puzzle, tiles: puzzle.tiles.map(t => ({ ...t })), stage, phase: 'playing', moves: 0, awarded: [], boosted: [], selected: puzzle.source };
  }
  if (run.phase !== 'playing' || run.tiles[run.selected].kind !== 'conduit') return run;
  const tiles = run.tiles.map((t, i) => i === run.selected ? { ...t, mask: rotateMask(t.mask) } : t);
  const reached = routed({ tiles, puzzle: run.puzzle }), previous = routed(run);
  const newFlowers = reached.filter(i => !run.awarded.includes(i));
  const lostConnection = previous.some(i => !reached.includes(i));
  const streak = newFlowers.length && !lostConnection ? run.streak + 1 : 0, combo = 1 + Math.min(3, Math.max(0, streak - 1));
  const moves = run.moves + 1, clear = reached.length === 4, limit = moves >= run.puzzle.limit;
  return { ...run, tiles, moves, streak, combo, awarded: [...new Set([...run.awarded, ...reached])],
    score: run.score + newFlowers.length * 100 * combo + (clear ? 400 + 5 * (run.puzzle.limit - moves) : 0),
    phase: clear ? 'bloom' : limit ? 'lost' : 'playing', completed: clear ? run.stage + 1 : run.completed,
    lossReason: limit && !clear ? 'The garden used its last rotation.' : '' };
}
export function solutionSteps(run: Run): number[] {
  return run.tiles.flatMap((t, i) => t.kind === 'conduit' ? Array<number>(turnsTo(t.mask, t.solution)).fill(i) : []);
}
