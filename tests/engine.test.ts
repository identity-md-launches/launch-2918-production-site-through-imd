import { describe, expect, test } from 'vitest';
import { applyPresses, BOARD_MASK, canonicalKey, createPuzzle, createRound, FALLBACK_PRESSES, gameReducer, hashSeed, MASKS, popcount, score, solve, xorshift32 } from '../src/core/engine';
import { STARTER_ARCHIVE } from '../src/data/archive';
import type { PuzzleInput } from '../src/core/types';

const demo = (index: number): PuzzleInput => ({ version: 1, kind: 'demo', index });

// Independent GF(2) Gaussian elimination, used only as an oracle. It does not
// chase rows or call the production solve/applyPresses functions.
function referenceMinimum(board: number): number | null {
  const rows: number[] = [];
  for (let cell = 0; cell < 25; cell++) {
    let row = ((board >>> cell) & 1) << 25;
    for (let press = 0; press < 25; press++) {
      const dr = Math.abs(Math.floor(cell / 5) - Math.floor(press / 5));
      const dc = Math.abs(cell % 5 - press % 5);
      if (dr + dc <= 1) row |= 1 << press;
    }
    rows.push(row);
  }
  const pivots: number[] = [];
  let rank = 0;
  for (let col = 0; col < 25; col++) {
    const offset = rows.slice(rank).findIndex(r => !!(r & (1 << col)));
    if (offset < 0) continue;
    const pivot = rank + offset;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let row = 0; row < 25; row++) if (row !== rank && rows[row] & (1 << col)) rows[row] ^= rows[rank];
    pivots.push(col); rank++;
  }
  if (rows.slice(rank).some(row => row & (1 << 25))) return null;
  const free = Array.from({ length: 25 }, (_, i) => i).filter(i => !pivots.includes(i));
  let best = 26;
  for (let choice = 0; choice < (1 << free.length); choice++) {
    let bits = free.reduce((a, col, index) => a | (((choice >>> index) & 1) << col), 0);
    for (let row = 0; row < rank; row++) {
      let parity = (rows[row] >>> 25) & 1;
      for (const col of free) parity ^= ((rows[row] >>> col) & 1) & ((bits >>> col) & 1);
      bits |= parity << pivots[row];
    }
    best = Math.min(best, bits.toString(2).replaceAll('0', '').length);
  }
  return best;
}

describe('board rules and minimum solver', () => {
  test('corners and edges do not wrap; center changes exactly five cells', () => {
    expect(MASKS[0]).toBe((1 << 0) | (1 << 1) | (1 << 5));
    expect(MASKS[4]).toBe((1 << 4) | (1 << 3) | (1 << 9));
    expect(MASKS[12]).toBe([7, 11, 12, 13, 17].reduce((a, i) => a | 1 << i, 0));
    expect(popcount(MASKS[2])).toBe(4);
    expect(popcount(MASKS[24])).toBe(3);
  });
  test('presses commute and pressing twice cancels', () => {
    const initial = createPuzzle(demo(1)).initial;
    expect(initial ^ MASKS[1] ^ MASKS[2]).toBe(initial ^ MASKS[2] ^ MASKS[1]);
    expect(initial ^ MASKS[12] ^ MASKS[12]).toBe(initial);
  });
  test('known empty, one-move and unsolvable boards', () => {
    expect(solve(0)).toBe(0);
    expect(solve(MASKS[12])).toBe(1 << 12);
    expect(referenceMinimum(1)).toBeNull();
    expect(solve(1)).toBeNull();
  });
  test('500 deterministic samples are solvable, nonempty and within budget', () => {
    for (let index = 1; index <= 500; index++) {
      const puzzle = createPuzzle(demo(index));
      expect(puzzle.initial).toBeGreaterThan(0);
      expect(puzzle.initial & ~BOARD_MASK).toBe(0);
      expect(puzzle.par).toBeGreaterThanOrEqual(5);
      expect(puzzle.par).toBeLessThanOrEqual(12);
      expect(applyPresses(puzzle.initial, solve(puzzle.initial)!)).toBe(0);
      expect(puzzle.limit).toBe(puzzle.par + 8);
    }
  });
  test('par matches an independent algebraic solver on 80 boards', () => {
    for (let i = 1; i <= 80; i++) {
      const puzzle = createPuzzle(demo(i));
      expect(puzzle.par).toBe(referenceMinimum(puzzle.initial));
    }
  });
  test('bounded fallback is solvable and stays inside the advertised difficulty', () => {
    const board = applyPresses(0, FALLBACK_PRESSES);
    expect(board).toBeGreaterThan(0);
    expect(referenceMinimum(board)).toBe(5);
    expect(popcount(solve(board)!)).toBe(5);
    expect(applyPresses(board, solve(board)!)).toBe(0);
  });
  test('a shortest solution wins every one of 100 generated rounds', () => {
    for (let i = 1; i <= 100; i++) {
      let round = gameReducer(createRound(demo(i), 'demo'), { type: 'start' });
      const solution = solve(round.board)!;
      for (let cell = 0; cell < 25; cell++) if (solution & 1 << cell) round = gameReducer(round, { type: 'press', cell });
      expect(round.phase).toBe('won'); expect(round.history.length).toBe(round.puzzle.par); expect(score(round)).toBe(1000);
    }
  });
});

describe('versioned seeds and reproducibility', () => {
  test('FNV-1a and xorshift have independent known vectors', () => {
    expect(hashSeed('hello')).toBe(0x4f9f2cab);
    expect(xorshift32(1)).toBe(270369);
  });
  test('v1 golden vectors pin archive behavior across future refactors', () => {
    expect(createPuzzle(demo(1))).toMatchObject({ seed: 515378726, initial: 29810256, par: 10, limit: 18 });
    expect(createPuzzle(STARTER_ARCHIVE)).toMatchObject({ seed: 3962975052, initial: 22582324, par: 8, limit: 16 });
    expect(solve(22582324)).toBe(1771032);
  });
  test('repeat samples give byte-identical puzzles; distinct demos vary', () => {
    expect(createPuzzle(STARTER_ARCHIVE)).toEqual(createPuzzle(JSON.parse(JSON.stringify(STARTER_ARCHIVE))));
    const boards = new Set(Array.from({ length: 100 }, (_, i) => createPuzzle(demo(i + 1)).initial));
    expect(boards.size).toBeGreaterThan(95);
  });
  test('timestamp and parent hash are metadata; hash and height seed the board', () => {
    if (STARTER_ARCHIVE.kind !== 'block') throw new Error('Expected recorded header.');
    const changed: PuzzleInput = { ...STARTER_ARCHIVE, block: { ...STARTER_ARCHIVE.block, timestamp: 1793700000, parentHash: undefined } };
    expect(canonicalKey(changed)).toBe(canonicalKey(STARTER_ARCHIVE));
    expect(createPuzzle(changed).initial).toBe(createPuzzle(STARTER_ARCHIVE).initial);
    expect(canonicalKey({ ...changed, block: { ...changed.block, number: changed.block.number + 1 } })).not.toBe(canonicalKey(changed));
  });
});

describe('attempt transitions, loss, restart and scoring', () => {
  test('ready board rejects presses and unsupported cells are ignored', () => {
    const ready = createRound(demo(1), 'demo');
    expect(gameReducer(ready, { type: 'press', cell: 1 })).toBe(ready);
    const active = gameReducer(ready, { type: 'start' });
    for (const cell of [-1, 25, 1.5, NaN]) expect(gameReducer(active, { type: 'press', cell })).toBe(active);
  });
  test('same tile repeatedly reaches a real loss; terminal state is immutable', () => {
    let round = gameReducer(createRound(demo(1), 'demo'), { type: 'start' });
    for (let i = 0; i < round.puzzle.limit; i++) round = gameReducer(round, { type: 'press', cell: 0 });
    expect(round.phase).toBe('lost'); expect(score(round)).toBe(0);
    for (const action of [{ type: 'undo' }, { type: 'hint' }, { type: 'press', cell: 1 }] as const) expect(gameReducer(round, action)).toBe(round);
  });
  test('a final allowed move that clears the board is a win', () => {
    let round = gameReducer(createRound(demo(1), 'demo'), { type: 'start' });
    round = { ...round, board: MASKS[12], history: Array(round.puzzle.limit - 1).fill(0) };
    expect(gameReducer(round, { type: 'press', cell: 12 }).phase).toBe('won');
  });
  test('undo restores the board and move, with a persistent penalty', () => {
    const active = gameReducer(createRound(demo(2), 'demo'), { type: 'start' });
    const undone = gameReducer(gameReducer(active, { type: 'press', cell: 12 }), { type: 'undo' });
    expect(undone.board).toBe(active.board); expect(undone.history).toEqual([]); expect(undone.undos).toBe(1); expect(score(undone)).toBe(950);
  });
  test('a hint reduces remaining optimal distance by exactly one; repeats charge once', () => {
    const active = gameReducer(createRound(demo(3), 'demo'), { type: 'start' });
    const hinted = gameReducer(active, { type: 'hint' });
    expect(hinted.hints).toBe(1); expect(score(hinted)).toBe(900);
    expect(gameReducer(hinted, { type: 'hint' })).toBe(hinted);
    expect(popcount(solve(gameReducer(hinted, { type: 'press', cell: hinted.hintCell! }).board)!)).toBe(active.puzzle.par - 1);
  });
  test('restart retains the exact input and clears every attempt value', () => {
    let round = gameReducer(createRound(STARTER_ARCHIVE, 'archive'), { type: 'start' });
    round = gameReducer(round, { type: 'hint' }); round = gameReducer(round, { type: 'press', cell: 3 }); round = gameReducer(round, { type: 'undo' });
    expect(gameReducer(round, { type: 'restart' })).toEqual(createRound(STARTER_ARCHIVE, 'archive'));
  });
  test('formula charges only moves above par plus hints and undos, with floor zero', () => {
    const round = createRound(demo(1), 'demo');
    expect(score({ ...round, history: Array(round.puzzle.par + 2).fill(0), hints: 1, undos: 1 })).toBe(770);
    expect(score({ ...round, hints: 50 })).toBe(0);
  });
});
