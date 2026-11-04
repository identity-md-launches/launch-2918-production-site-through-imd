import { describe, expect, it } from 'vitest';
import { connections, createPuzzle, createRun, gameReducer, hashSeed, rotateMask, routed, solutionSteps, turnsTo } from '../src/core/engine';
import { DEMO_SOURCE } from '../src/data/archive';

function independentReach(masks: number[], source: number): Set<number> {
  const reached = new Set([source]); let changed = true;
  while (changed) { changed = false; for (const i of [...reached]) for (const [delta, a, b] of [[-6, 1, 4], [1, 2, 8], [6, 4, 1], [-1, 8, 2]]) {
    const j = i + delta; if (j < 0 || j >= 36 || (Math.abs(delta) === 1 && Math.floor(j / 6) !== Math.floor(i / 6))) continue;
    if ((masks[i] & a) && (masks[j] & b) && !reached.has(j)) { reached.add(j); changed = true; }
  } } return reached;
}
describe('connected-solution generator', () => {
  it('retains stable unsigned hashing and rotation primitives', () => {
    expect(hashSeed('hello')).toBe(0x4f9f2cab); expect(rotateMask(9)).toBe(3); expect(turnsTo(10, 5)).toBe(1);
    for (let n = 0; n < 16; n++) expect(rotateMask(rotateMask(rotateMask(rotateMask(n))))).toBe(n);
  });
  it('makes 3000 deterministic solvable 6×6 boards within budget, with four leaves and all tile types', () => {
    for (let seed = 0; seed < 1000; seed++) for (let stage = 0; stage < 3; stage++) {
      const p = createPuzzle(`corpus:${seed}`, stage), q = createPuzzle(`corpus:${seed}`, stage);
      expect(p).toEqual(q); expect(p.tiles).toHaveLength(36); expect(p.beacons).toHaveLength(4);
      const fixed = p.tiles.map(t => ({ ...t, mask: t.solution }));
      const reached = independentReach(fixed.map(t => t.mask), p.source);
      expect(p.beacons.every(i => reached.has(i))).toBe(true);
      expect([...connections(fixed, p.source)].sort()).toEqual([...reached].sort());
      expect(p.tiles.filter(t => t.kind === 'conduit' && t.mask !== t.solution)).toHaveLength(4 + stage * 3);
      expect(p.tiles.some(t => t.kind === 'rock')).toBe(true);
      const conduits = p.tiles.filter(t => t.kind === 'conduit');
      expect(conduits.some(t => t.solution === 5 || t.solution === 10)).toBe(true);
      expect(conduits.some(t => [7, 11, 13, 14].includes(t.solution))).toBe(true);
      expect(conduits.some(t => [3, 6, 9, 12].includes(t.solution))).toBe(true);
      const cost = conduits.reduce((n, t) => n + turnsTo(t.mask, t.solution), 0);
      expect(cost).toBe(p.par); expect(cost).toBeLessThanOrEqual(p.limit);
      expect(p.beacons.every(i => independentReach(p.tiles.map(t => t.mask), p.source).has(i))).toBe(false);
    }
  });
  it('completes 100 full three-board games using only legal clockwise rotations', () => {
    for (let seed = 0; seed < 100; seed++) {
      let r = gameReducer(createRun({ ...DEMO_SOURCE, key: `run:${seed}` }), { type: 'start' });
      for (let stage = 0; stage < 3; stage++) {
        for (const index of solutionSteps(r)) {
          if (r.phase === 'bloom') break;
          r = gameReducer(r, { type: 'select', index }); r = gameReducer(r, { type: 'rotate' });
        }
        expect(r.phase).toBe('bloom'); expect(routed(r)).toHaveLength(4); expect(r.moves).toBeLessThanOrEqual(r.puzzle.limit);
        r = gameReducer(r, { type: 'next' });
      }
      expect(r.phase).toBe('won'); expect(r.completed).toBe(3); expect(r.score).toBeGreaterThan(2400);
    }
  });
});
describe('real gameplay states and budgets', () => {
  it('selects without rotating; blocks fixed cells and paused input', () => {
    const original = createRun(DEMO_SOURCE); let r = gameReducer(original, { type: 'start' });
    const fixed = r.puzzle.source; r = gameReducer(r, { type: 'select', index: fixed });
    expect(r.moves).toBe(0); expect(gameReducer(r, { type: 'rotate' })).toEqual(r);
    r = gameReducer(r, { type: 'pause' }); expect(gameReducer(r, { type: 'tick', elapsed: 180000 })).toEqual(r);
    expect(gameReducer(r, { type: 'rotate' })).toEqual(r); expect(gameReducer(r, { type: 'resume' }).phase).toBe('playing');
  });
  it('loses at the move cap and restarts exact initial source, clock and budget', () => {
    let r = gameReducer(createRun(DEMO_SOURCE), { type: 'start' });
    const cell = r.tiles.findIndex(t => t.kind === 'conduit'); r = gameReducer(r, { type: 'select', index: cell });
    for (let i = 0; i < r.puzzle.limit; i++) r = gameReducer(r, { type: 'rotate' });
    expect(r.phase).toBe('lost'); expect(r.lossReason).toContain('last rotation'); expect(gameReducer(r, { type: 'restart' })).toEqual(createRun(DEMO_SOURCE));
  });
  it('loses on the shared three-minute clock; cannot rotate after loss', () => {
    let r = gameReducer(createRun(DEMO_SOURCE), { type: 'start' }); r = gameReducer(r, { type: 'tick', elapsed: 180001 });
    expect(r.phase).toBe('lost'); expect(r.remainingMs).toBe(0); expect(gameReducer(r, { type: 'rotate' })).toEqual(r);
  });
  it('spends one charge only on a routed beacon, never twice on the same flower', () => {
    let r = gameReducer(createRun(DEMO_SOURCE), { type: 'start' }); expect(gameReducer(r, { type: 'boost' })).toEqual(r);
    for (const index of solutionSteps(r)) { if (r.phase === 'bloom') break; r = gameReducer(gameReducer(r, { type: 'select', index }), { type: 'rotate' }); }
    r = gameReducer(r, { type: 'select', index: r.puzzle.beacons[0] }); const before = r;
    r = gameReducer(r, { type: 'boost' }); expect(r.charges).toBe(before.charges - 1); expect(r.score).toBe(before.score + 150);
    expect(gameReducer(r, { type: 'boost' })).toEqual(r);
  });
  it('pins boards until explicit advancement; only the next live board uses a new round key', () => {
    let r = gameReducer(createRun(DEMO_SOURCE), { type: 'start' }); const initial = r.puzzle;
    expect(gameReducer(r, { type: 'next', key: 'new round' }).puzzle).toEqual(initial);
    for (const index of solutionSteps(r)) { if (r.phase === 'bloom') break; r = gameReducer(gameReducer(r, { type: 'select', index }), { type: 'rotate' }); }
    const next = gameReducer(r, { type: 'next', key: 'new round', round: '1222' });
    expect(next.puzzle).toEqual(createPuzzle('new round', 1)); expect(next.remainingMs).toBe(r.remainingMs); expect(next.stage).toBe(1);
  });
  it('resets combo when a rotation connects a new flower but disconnects old ones; reconnects cannot farm points', () => {
    const base = createRun(DEMO_SOURCE);
    let checked = false;
    outer: for (let index = 0; index < 36; index++) {
      if (![7, 11, 13, 14].includes(base.tiles[index].solution)) continue;
      let mask = base.tiles[index].solution;
      for (let turn = 0; turn < 4; turn++, mask = rotateMask(mask)) {
        const tiles = base.tiles.map((t, i) => ({ ...t, mask: i === index ? mask : t.solution }));
        const beforeReach = base.puzzle.beacons.filter(i => independentReach(tiles.map(t => t.mask), base.puzzle.source).has(i));
        const nextTiles = tiles.map((t, i) => ({ ...t, mask: i === index ? rotateMask(t.mask) : t.mask }));
        const afterReach = base.puzzle.beacons.filter(i => independentReach(nextTiles.map(t => t.mask), base.puzzle.source).has(i));
        const added = afterReach.filter(i => !beforeReach.includes(i));
        if (!added.length || !beforeReach.some(i => !afterReach.includes(i)) || new Set([...beforeReach, ...afterReach]).size !== 4) continue;
        let run = { ...base, tiles, phase: 'playing' as const, selected: index, awarded: beforeReach, streak: 1, combo: 1, score: beforeReach.length * 100 };
        let next = gameReducer(run, { type: 'rotate' });
        expect(next.combo).toBe(1); expect(next.streak).toBe(0); expect(next.score - run.score).toBe(added.length * 100);
        const scoreBeforeReconnect = next.score;
        for (let n = 0; n < 3 && next.phase === 'playing'; n++) next = gameReducer(next, { type: 'rotate' });
        expect(next.phase).toBe('bloom');
        expect(next.score - scoreBeforeReconnect).toBe(400 + 5 * (next.puzzle.limit - next.moves));
        expect(new Set(next.awarded).size).toBe(4); checked = true; break outer;
      }
    }
    expect(checked).toBe(true);
  });
  it('keeps deterministic fixture stable', () => {
    const p = createPuzzle(DEMO_SOURCE.key); expect({ key: p.key, par: p.par, limit: p.limit, masks: p.tiles.map(t => t.mask) }).toMatchSnapshot();
  });
});
