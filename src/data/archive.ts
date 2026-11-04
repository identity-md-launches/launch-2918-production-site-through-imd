import type { Network, Settlement, Source } from '../core/types';

export const API = 'https://api.squeekchain.com/v1';
export const DECIMAL = /^(0|[1-9][0-9]{0,79})$/;
export const HASH = /^0x[0-9a-fA-F]{64}$/;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('The API returned an incomplete object.');
  return v as Record<string, unknown>;
}
function string(v: unknown): string { if (typeof v !== 'string' || !v.length || v.length > 256) throw new Error('The API returned an invalid identifier.'); return v; }
function decimal(v: unknown): string { if (typeof v !== 'string' || !DECIMAL.test(v)) throw new Error('The API returned an invalid counter.'); return v; }
function date(v: unknown): string { const s = string(v); if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error('The API returned an invalid timestamp.'); return s; }
function integer(v: unknown): number { if (!Number.isSafeInteger(v) || Number(v) < 0) throw new Error('The API returned an invalid measurement.'); return Number(v); }
export interface Status {
  installationId: string; generatedAt: string;
  measurement: { freshness: string; observedAt: string; staleAfterSeconds: number; counterEpoch: string; cumulativeWorkUnits: string; coreStatus: string; rpmMilli: number; speedMmPerSecond: number; distanceMm: number };
}
export interface Economy { installationId: string; generatedAt: string; status: string; chain: Network; currentRound: string; releaseId: string }
export interface Archive { installationId: string; generatedAt: string; chain: Network; items: Settlement[] }
export function parseNetwork(v: unknown): Network {
  const n = object(v); const chainId = decimal(n.chainId); if (chainId === '0') throw new Error('The API returned an invalid chain.');
  return { target: string(n.target), chainId };
}
export function parseStatus(v: unknown): Status {
  const root = object(v), m = object(root.measurement);
  if (root.schemaVersion !== 1) throw new Error('Unsupported status schema.');
  const staleAfterSeconds = integer(m.staleAfterSeconds);
  if (staleAfterSeconds < 1 || staleAfterSeconds > 86400) throw new Error('Invalid freshness window.');
  return { installationId: string(root.installationId), generatedAt: date(root.generatedAt), measurement: {
    freshness: string(m.freshness), observedAt: date(m.observedAt), staleAfterSeconds,
    counterEpoch: string(m.counterEpoch), cumulativeWorkUnits: decimal(m.cumulativeWorkUnits),
    coreStatus: string(m.coreStatus), rpmMilli: integer(m.rpmMilli), speedMmPerSecond: integer(m.speedMmPerSecond), distanceMm: integer(m.distanceMm),
  } };
}
export function parseEconomy(v: unknown): Economy {
  const root = object(v), lifecycle = object(root.lifecycle), release = object(root.release);
  if (root.schemaVersion !== 2 || root.status !== 'available') throw new Error('Squeekchain economy is unavailable.');
  return { installationId: string(root.installationId), generatedAt: date(root.generatedAt), status: 'available', chain: parseNetwork(root.chain), currentRound: decimal(lifecycle.currentRound), releaseId: string(release.id) };
}
export function parseSettlement(v: unknown): Settlement {
  const s = object(v), hash = string(s.transactionHash);
  if (!HASH.test(hash) || /^0x0+$/.test(hash) || !['safe', 'finalized'].includes(String(s.confirmationStatus))) throw new Error('This settlement is not safe.');
  const workAdded = decimal(s.workAdded), cumulativeWork = decimal(s.cumulativeWork);
  if (BigInt(workAdded) <= 0n || BigInt(cumulativeWork) < BigInt(workAdded)) throw new Error('This round has no usable work.');
  return { transactionHash: hash.toLowerCase(), settledThroughRound: decimal(s.settledThroughRound), workAdded, cumulativeWork, confirmationStatus: s.confirmationStatus as 'safe' | 'finalized', blockTimestamp: date(s.blockTimestamp) };
}
export function parseArchive(v: unknown): Archive {
  const root = object(v);
  if (root.schemaVersion !== 3 || root.status !== 'available' || !Array.isArray(root.recentSettlements)) throw new Error('Historical rounds are unavailable.');
  const seen = new Set<string>(), items: Settlement[] = [];
  for (const raw of root.recentSettlements.slice(0, 200)) {
    try {
      const item = parseSettlement(raw);
      if (Date.parse(item.blockTimestamp) > Date.parse(date(root.generatedAt)) + 30000) continue;
      const key = `${item.transactionHash}|${item.settledThroughRound}`;
      if (!seen.has(key)) { seen.add(key); items.push(item); }
    } catch { /* Pending, idle and malformed entries are deliberately not playable. */ }
  }
  items.sort((a, b) => BigInt(a.settledThroughRound) > BigInt(b.settledThroughRound) ? -1 : BigInt(a.settledThroughRound) < BigInt(b.settledThroughRound) ? 1 : a.transactionHash.localeCompare(b.transactionHash));
  return { installationId: string(root.installationId), generatedAt: date(root.generatedAt), chain: parseNetwork(root.chain), items };
}
export function sameInstallation(archive: Archive, economy: Economy): boolean {
  return archive.installationId === economy.installationId && archive.chain.chainId === economy.chain.chainId && archive.chain.target === economy.chain.target;
}
export function energyBudget(work: string): number { return Number(1n + (BigInt(work) / 250n > 2n ? 2n : BigInt(work) / 250n)); }
export function archiveSource(item: Settlement, archive: Archive, economy: Economy): Source {
  if (!sameInstallation(archive, economy)) throw new Error('The API installation or network changed. Refresh the round list.');
  return { mode: 'archive', key: `signal-garden/v1|archive|${archive.chain.chainId}|${item.transactionHash}|${item.settledThroughRound}`, round: item.settledThroughRound,
    timestamp: item.blockTimestamp, network: archive.chain, installationId: archive.installationId, releaseId: economy.releaseId, epoch: '', budget: energyBudget(item.workAdded), settlement: item };
}
export const DEMO_SOURCE: Source = { mode: 'demo', key: 'signal-garden/v1|demo|moonflower', round: 'practice', timestamp: '', network: null, installationId: '', releaseId: '', epoch: '', budget: 2 };
export function liveSource(status: Status, economy: Economy): Source {
  if (status.installationId !== economy.installationId) throw new Error('Status and economy installations disagree. Retry before starting Live Garden.');
  return { mode: 'live', key: liveKey(status, economy), round: economy.currentRound, timestamp: status.measurement.observedAt, network: economy.chain,
    installationId: status.installationId, releaseId: economy.releaseId, epoch: status.measurement.counterEpoch, budget: 0, baselineDistanceMm: status.measurement.distanceMm, baselineWork: status.measurement.cumulativeWorkUnits };
}
export function liveKey(status: Status, economy: Economy): string {
  return `signal-garden/v1|live|${economy.chain.chainId}|${status.installationId}|${economy.releaseId}|${status.measurement.counterEpoch}|${economy.currentRound}`;
}
export function networkName(network: Network | null): string {
  return network ? `${network.target === 'sepolia' ? 'Sepolia testnet' : network.target} · ${network.chainId}` : 'Offline practice';
}
export function transactionURL(source: Source): string | null {
  if (!source.settlement) return null;
  const base = ({ '11155111': 'https://sepolia.etherscan.io', '1': 'https://etherscan.io', '8453': 'https://basescan.org', '42161': 'https://arbiscan.io' } as Record<string, string>)[source.network?.chainId ?? ''];
  return base ? `${base}/tx/${source.settlement.transactionHash}` : null;
}
