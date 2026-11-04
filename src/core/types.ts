export type Mode = 'archive' | 'live' | 'demo';
export type Phase = 'ready' | 'playing' | 'paused' | 'bloom' | 'won' | 'lost';
export interface Network { target: string; chainId: string }
export interface Settlement {
  transactionHash: string; settledThroughRound: string; workAdded: string;
  cumulativeWork: string; confirmationStatus: 'safe' | 'finalized'; blockTimestamp: string;
}
export interface Source {
  mode: Mode; key: string; round: string; timestamp: string; network: Network | null;
  installationId: string; releaseId: string; epoch: string; budget: number;
  settlement?: Settlement; baselineDistanceMm?: number; baselineWork?: string;
}
export interface Tile { mask: number; solution: number; kind: 'conduit' | 'source' | 'beacon' | 'rock' | 'fern' }
export interface Puzzle { key: string; tiles: Tile[]; par: number; limit: number; source: number; beacons: number[]; stage: number }
export interface Run {
  version: 1; source: Source; puzzle: Puzzle; phase: Phase; tiles: Tile[]; stage: number;
  moves: number; score: number; streak: number; combo: number; awarded: number[]; boosted: number[];
  charges: number; remainingMs: number; selected: number; boardRound: string; completed: number; lossReason: string;
}
