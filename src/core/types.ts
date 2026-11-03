export const ENGINE_VERSION = 1 as const;
export interface BlockRef {
  number: number;
  hash: string;
  timestamp: number;
  parentHash?: string;
}
export type PuzzleInput =
  | { version: 1; kind: 'block'; block: BlockRef }
  | { version: 1; kind: 'demo'; index: number };
export type Origin = 'live' | 'archive' | 'demo';
export interface Puzzle {
  input: PuzzleInput;
  key: string;
  seed: number;
  initial: number;
  par: number;
  limit: number;
}
export type Phase = 'ready' | 'playing' | 'won' | 'lost';
export interface Round {
  puzzle: Puzzle;
  origin: Origin;
  board: number;
  phase: Phase;
  history: number[];
  hints: number;
  undos: number;
  hintCell: number | null;
}
