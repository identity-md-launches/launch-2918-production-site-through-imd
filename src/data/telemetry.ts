import type { Economy, Status } from './archive';
export type Freshness = 'live' | 'idle' | 'stale' | 'unavailable';
export function freshness(status: Status | null, now: number): Freshness {
  if (!status) return 'unavailable';
  const m = status.measurement, age = now - Date.parse(m.observedAt), generatedAge = now - Date.parse(status.generatedAt);
  if (m.freshness !== 'online' || age < -30_000 || generatedAge < -30_000 || age > m.staleAfterSeconds * 1000 || generatedAge > m.staleAfterSeconds * 1000) return 'stale';
  return m.coreStatus === 'IDLE' || (m.rpmMilli === 0 && m.speedMmPerSecond === 0) ? 'idle' : 'live';
}
export interface Watermark { time: number; distance: number; work: string }
export interface Tracker { identity: string; seen: Record<string, Watermark>; remainderMm: number; charges: number; needsBaseline: boolean; note: string; earned: number }
export function emptyTracker(): Tracker { return { identity: '', seen: {}, remainderMm: 0, charges: 0, needsBaseline: true, note: 'Waiting for a fresh source baseline. Lifetime distance never grants energy.', earned: 0 }; }
export function breakContinuity(t: Tracker, note = 'Connection interrupted. The next fresh sample becomes a new baseline.'): Tracker {
  return { ...t, needsBaseline: true, remainderMm: 0, note };
}
export function sample(t: Tracker, status: Status, economy: Economy, now: number): Tracker {
  if (status.installationId !== economy.installationId) return breakContinuity(t, 'Installations disagree. Bonus energy is suspended until they match.');
  if (freshness(status, now) === 'stale' || (now - Date.parse(economy.generatedAt) > 180_000 || Date.parse(economy.generatedAt) - now > 30_000)) return breakContinuity(t, 'Source is stale. Baseline power still works; fresh data will rebaseline.');
  const m = status.measurement;
  const identity = [status.installationId, economy.releaseId, economy.chain.chainId, m.counterEpoch].join('|');
  const time = Date.parse(m.observedAt), old = t.seen[identity];
  // High-water marks survive resets, revisits, reconnects and stored-run restoration.
  const watermark = { time: Math.max(time, old?.time ?? time), distance: Math.max(m.distanceMm, old?.distance ?? m.distanceMm), work: (BigInt(m.cumulativeWorkUnits) > BigInt(old?.work ?? '0') ? m.cumulativeWorkUnits : (old?.work ?? m.cumulativeWorkUnits)) };
  const rebaseline = (note: string): Tracker => ({ ...t, identity, seen: { ...t.seen, [identity]: watermark }, needsBaseline: false, remainderMm: 0, note });
  if (identity !== t.identity || !old || t.needsBaseline) return rebaseline(!t.identity ? 'Baseline pinned. Only new distance with positive work can earn charges.' : identity !== t.identity ? 'Epoch, installation, release or chain changed. Rebaselined; no historical energy awarded.' : 'Reconnected and rebaselined. Distance during the gap grants no energy.');
  if (time <= old.time) return { ...t, note: time === old.time ? t.note : 'Older sample ignored. The source watermark stays pinned.' };
  if (m.distanceMm < old.distance || BigInt(m.cumulativeWorkUnits) < BigInt(old.work)) return rebaseline('Counter decreased. High-water marks retained to prevent replaying old energy.');
  const distance = m.distanceMm - old.distance, work = BigInt(m.cumulativeWorkUnits) - BigInt(old.work);
  const next = { ...t, seen: { ...t.seen, [identity]: watermark } };
  if (distance <= 0 || work <= 0n) return { ...next, note: 'Wheel resting or no paired new work. Baseline routing remains powered.' };
  const total = t.remainderMm + distance, earned = Math.floor(total / 1000), charges = Math.min(3, t.charges + earned);
  return { ...next, charges, remainderMm: charges === 3 ? 0 : total % 1000, earned: t.earned + Math.min(earned, 3 - t.charges), note: earned ? 'New wheel movement grew bonus energy. Reservoir capped at 3; overflow is discarded.' : `${total} / 1000 new millimetres toward a growth charge.` };
}
