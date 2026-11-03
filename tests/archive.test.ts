import { describe, expect, test } from 'vitest';
import { addArchive, ARCHIVE_KEY, decodeInput, encodeInput, readArchive, STARTER_ARCHIVE, validateInput } from '../src/data/archive';
import { createPuzzle, createRound } from '../src/core/engine';

describe('archive reproducibility without a network', () => {
  test('JSON round-trip replays the exact board, par, limit and seed', () => {
    const original = createRound(STARTER_ARCHIVE, 'live');
    const exported = JSON.stringify({ version: 1, input: original.puzzle.input, score: 999999, initialBoard: 0 });
    const loaded = createRound(validateInput(JSON.parse(exported).input), 'archive');
    expect(loaded.puzzle).toMatchObject({ seed: original.puzzle.seed, initial: original.puzzle.initial, par: original.puzzle.par, limit: original.puzzle.limit });
    expect(loaded.origin).toBe('archive'); expect(loaded.history).toEqual([]); expect(loaded.phase).toBe('ready');
  });
  test('share links preserve the full hash and reproduce both block and demo puzzles', () => {
    for (const input of [STARTER_ARCHIVE, { version: 1, kind: 'demo', index: 29 } as const]) {
      const decoded = decodeInput(encodeInput(input))!;
      expect(createPuzzle(decoded).initial).toBe(createPuzzle(input).initial);
      expect(createPuzzle(decoded).seed).toBe(createPuzzle(input).seed);
    }
  });
  test('malformed, unsupported and oversized share links are rejected', () => {
    expect(decodeInput('#game')).toBeNull();
    for (const hash of ['#p=2.d.1', '#p=1.d.-1', '#p=1.d.0', '#p=1.b.12.abc.123', '#p=' + 'x'.repeat(300)]) expect(() => decodeInput(hash)).toThrow();
  });
  test('rejects incorrect versions, unsafe numbers, empty hashes and malformed inputs', () => {
    for (const value of [null, {}, { version: 2, kind: 'demo', index: 1 }, { version: 1, kind: 'demo', index: 0 }, { version: 1, kind: 'demo', index: 1.5 }, { version: 1, kind: 'demo', index: 1_000_001 },
      { version: 1, kind: 'block', block: { number: 1, hash: '0x' + '0'.repeat(64), timestamp: 1793707247 } },
      { version: 1, kind: 'block', block: { number: Number.MAX_SAFE_INTEGER + 1, hash: '0x' + 'a'.repeat(64), timestamp: 1793707247 } }]) expect(() => validateInput(value)).toThrow();
  });
  test('local archive deduplicates and retains the most recent 30 inputs', () => {
    let items = addArchive([], STARTER_ARCHIVE, 1);
    items = addArchive(items, STARTER_ARCHIVE, 2); expect(items.length).toBe(1); expect(items[0].savedAt).toBe(2);
    for (let i = 1; i <= 40; i++) items = addArchive(items, { version: 1, kind: 'demo', index: i }, i + 2);
    expect(items.length).toBe(30); expect(items[0].input).toEqual({ version: 1, kind: 'demo', index: 40 });
  });
  test('missing storage is empty; corrupted or oversized storage is recoverable', () => {
    expect(readArchive({ getItem: () => null })).toEqual({ items: [], warning: null });
    for (const value of ['not json', '{}', '[null]', 'x'.repeat(100_001)]) {
      const result = readArchive({ getItem: () => value }); expect(result.items).toEqual([]); expect(result.warning).toBeTruthy();
    }
    expect(readArchive({ getItem: () => { throw new Error('Storage blocked'); } }).warning).toBeTruthy();
  });
  test('stored headers rebuild identically on a new session', () => {
    const items = addArchive([], STARTER_ARCHIVE, 100);
    const read = readArchive({ getItem: key => key === ARCHIVE_KEY ? JSON.stringify(items) : null });
    expect(read.warning).toBeNull(); expect(createPuzzle(read.items[0].input).initial).toBe(createPuzzle(STARTER_ARCHIVE).initial);
  });
});
