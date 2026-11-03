import { canonicalKey } from '../core/engine';
import type { PuzzleInput } from '../core/types';
import { HASH } from './rpc';

export const ARCHIVE_KEY = 'blocklight.archive.v1';
export const ARCHIVE_LIMIT = 30;
export interface ArchiveItem { input: PuzzleInput; savedAt: number }

// Real header read on 2026-11-03. It is an archive fixture, never a live fallback.
export const STARTER_ARCHIVE: PuzzleInput = {
  version: 1, kind: 'block', block: {
    number: 26334137,
    hash: '0x73c0561f039f4a34ba4f92aa094f2932c0370174e6a1271154cb4cd5f9ca316d',
    parentHash: '0x3e9df9f395e9c93e5f4d6df5ebee39e26c3ad624ba0aea030718b9a81f566f1a',
    timestamp: 1793707247,
  },
};

export function validateInput(value: unknown): PuzzleInput {
  if (!value || typeof value !== 'object') throw new Error('Choose a Blocklight v1 archive file.');
  const v = value as Record<string, unknown>;
  if (v.version !== 1) throw new Error('This archive uses an unsupported game version. Use a v1 archive.');
  if (v.kind === 'demo' && Number.isSafeInteger(v.index) && Number(v.index) >= 1 && Number(v.index) <= 1_000_000) {
    return { version: 1, kind: 'demo', index: Number(v.index) };
  }
  if (v.kind === 'block' && v.block && typeof v.block === 'object') {
    const b = v.block as Record<string, unknown>;
    if (Number.isSafeInteger(b.number) && Number(b.number) >= 0 &&
        Number.isSafeInteger(b.timestamp) && Number(b.timestamp) >= 1438269973 && Number(b.timestamp) <= 8_640_000_000_000 &&
        typeof b.hash === 'string' && HASH.test(b.hash) && !/^0x0+$/.test(b.hash)) {
      return { version: 1, kind: 'block', block: { number: Number(b.number), hash: b.hash.toLowerCase(), timestamp: Number(b.timestamp) } };
    }
  }
  throw new Error('This archive is incomplete. Choose an exported Blocklight JSON file.');
}

export function readArchive(storage: Pick<Storage, 'getItem'>): { items: ArchiveItem[]; warning: string | null } {
  try {
    const text = storage.getItem(ARCHIVE_KEY);
    if (!text) return { items: [], warning: null };
    if (text.length > 100_000) throw new Error('Archive is too large.');
    const items = JSON.parse(text) as unknown;
    if (!Array.isArray(items)) throw new Error('Invalid archive.');
    const seen = new Set<string>();
    const parsed = items.slice(0, ARCHIVE_LIMIT).map((v: unknown) => {
      if (!v || typeof v !== 'object') throw new Error('Invalid archive.');
      const item = v as Record<string, unknown>;
      if (!Number.isSafeInteger(item.savedAt) || Number(item.savedAt) < 0) throw new Error('Invalid date.');
      return { input: validateInput(item.input), savedAt: Number(item.savedAt) };
    }).filter(item => { const key = canonicalKey(item.input); if (seen.has(key)) return false; seen.add(key); return true; });
    return { items: parsed, warning: null };
  } catch { return { items: [], warning: 'Saved puzzles could not be read. You can still play and import an archive.' }; }
}

export function addArchive(items: ArchiveItem[], input: PuzzleInput, now: number): ArchiveItem[] {
  return [{ input, savedAt: now }, ...items.filter(i => canonicalKey(i.input) !== canonicalKey(input))].slice(0, ARCHIVE_LIMIT);
}

export function encodeInput(input: PuzzleInput): string {
  return input.kind === 'demo' ? `#p=1.d.${input.index}`
    : `#p=1.b.${input.block.number}.${input.block.hash.slice(2)}.${input.block.timestamp}`;
}
export function decodeInput(hash: string): PuzzleInput | null {
  if (!hash.startsWith('#p=')) return null;
  if (hash.length > 256) throw new Error('This puzzle link is too long. Open an exported v1 puzzle link.');
  const parts = hash.slice(3).split('.');
  if (parts[0] !== '1') throw new Error('This puzzle link uses an unsupported version.');
  if (parts[1] === 'd' && parts.length === 3 && /^\d+$/.test(parts[2])) return validateInput({ version: 1, kind: 'demo', index: Number(parts[2]) });
  if (parts[1] === 'b' && parts.length === 5 && /^\d+$/.test(parts[2]) && /^\d+$/.test(parts[4])) {
    return validateInput({ version: 1, kind: 'block', block: { number: Number(parts[2]), hash: `0x${parts[3]}`, timestamp: Number(parts[4]) } });
  }
  throw new Error('This puzzle link is incomplete. Ask for a new exported link.');
}
