import { ENGINE_VERSION, type Puzzle, type PuzzleInput, type Round, type Origin } from './types';

export const SIZE = 5;
export const CELLS = SIZE * SIZE;
export const BOARD_MASK = (1 << CELLS) - 1;
export const SPARE_MOVES = 8;
export const FALLBACK_PRESSES = (1 << 0) | (1 << 4) | (1 << 12) | (1 << 20) | (1 << 24);
export const MASKS = Array.from({ length: CELLS }, (_, index) => {
  const r = Math.floor(index / SIZE), c = index % SIZE;
  return [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
    .filter(([y, x]) => y >= 0 && x >= 0 && y < SIZE && x < SIZE)
    .reduce((mask, [y, x]) => mask | (1 << (y * SIZE + x)), 0);
});

export function popcount(value: number): number {
  let n = value >>> 0, count = 0;
  while (n) { n &= n - 1; count++; }
  return count;
}

export function applyPresses(board: number, presses: number): number {
  let result = board;
  for (let i = 0; i < CELLS; i++) if (presses & (1 << i)) result ^= MASKS[i];
  return result;
}

// Enumerate the 32 possible first rows, then chase every light in the row above.
// Every solution is represented; choose minimum popcount, then smallest numeric mask.
export function solve(board: number): number | null {
  let best: number | null = null;
  for (let first = 0; first < 1 << SIZE; first++) {
    let current = board, presses = first;
    current = applyPresses(current, first);
    for (let row = 1; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        if (current & (1 << ((row - 1) * SIZE + col))) {
          const i = row * SIZE + col;
          current ^= MASKS[i]; presses |= 1 << i;
        }
      }
    }
    if (current === 0 && (best === null || popcount(presses) < popcount(best) ||
      (popcount(presses) === popcount(best) && presses < best))) best = presses;
  }
  return best;
}

export function canonicalKey(input: PuzzleInput): string {
  return input.kind === 'demo'
    ? `blocklight/v${ENGINE_VERSION}|demo|${input.index}`
    : `blocklight/v${ENGINE_VERSION}|1|${input.block.number}|${input.block.hash.toLowerCase()}`;
}

// FNV-1a over canonical ASCII; all arithmetic is explicitly unsigned 32-bit.
export function hashSeed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return h || 0x9e3779b9;
}

export function xorshift32(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
}

export function createPuzzle(input: PuzzleInput): Puzzle {
  const key = canonicalKey(input), seed = hashSeed(key);
  let random = seed;
  for (let attempt = 0; attempt < 256; attempt++) {
    random = xorshift32(random);
    const initial = applyPresses(0, random & BOARD_MASK);
    const solution = solve(initial)!;
    const par = popcount(solution);
    if (par >= 5 && par <= 12) return { input, key, seed, initial, par, limit: par + SPARE_MOVES };
  }
  // A bounded, deterministic, solvable fallback, never an unsolvable random board.
  const initial = applyPresses(0, FALLBACK_PRESSES);
  const par = popcount(solve(initial)!);
  return { input, key, seed, initial, par, limit: par + SPARE_MOVES };
}

export function createRound(input: PuzzleInput, origin: Origin): Round {
  const puzzle = createPuzzle(input);
  return { puzzle, origin, board: puzzle.initial, phase: 'ready', history: [], hints: 0, undos: 0, hintCell: null };
}

export type GameAction = { type: 'start' } | { type: 'press'; cell: number } | { type: 'undo' } | { type: 'hint' } | { type: 'restart' };
export function gameReducer(round: Round, action: GameAction): Round {
  if (action.type === 'restart') return createRound(round.puzzle.input, round.origin);
  if (action.type === 'start') return round.phase === 'ready' ? { ...round, phase: 'playing' } : round;
  if (round.phase !== 'playing') return round;
  if (action.type === 'press') {
    if (!Number.isInteger(action.cell) || action.cell < 0 || action.cell >= CELLS) return round;
    const board = round.board ^ MASKS[action.cell];
    const history = [...round.history, action.cell];
    const phase = board === 0 ? 'won' : history.length >= round.puzzle.limit ? 'lost' : 'playing';
    return { ...round, board, history, phase, hintCell: null };
  }
  if (action.type === 'undo') {
    if (!round.history.length) return round;
    return { ...round, board: round.board ^ MASKS[round.history.at(-1)!], history: round.history.slice(0, -1), undos: round.undos + 1, hintCell: null };
  }
  if (round.hintCell !== null) return round;
  const solution = solve(round.board);
  if (!solution) return round;
  const hintCell = Math.log2(solution & -solution);
  return { ...round, hints: round.hints + 1, hintCell };
}

export function score(round: Round): number {
  if (round.phase === 'lost') return 0;
  return Math.max(0, 1000 - 40 * Math.max(0, round.history.length - round.puzzle.par) - 100 * round.hints - 50 * round.undos);
}

export function cellName(index: number): string {
  return `${String.fromCharCode(65 + Math.floor(index / SIZE))}${index % SIZE + 1}`;
}
