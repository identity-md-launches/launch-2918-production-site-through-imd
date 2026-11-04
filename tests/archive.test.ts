import { describe, expect, it } from 'vitest';
import { archiveSource, energyBudget, parseArchive, parseEconomy, parseSettlement, transactionURL } from '../src/data/archive';
import { createPuzzle, createRun } from '../src/core/engine';
import { loadSaved, restoreRun, saveState } from '../src/data/storage';
import { emptyTracker, sample } from '../src/data/telemetry';
import { archiveJSON, economyJSON, NOW, settlementJSON, statusJSON } from './fixtures';
import { parseStatus } from '../src/data/archive';
describe('safe archive reproducibility', () => {
  it('pins a real safe positive-work transaction and identical puzzle/budget on two devices', () => {
    const archive = parseArchive(archiveJSON), economy = parseEconomy(economyJSON);
    const a = archiveSource(archive.items[0], archive, economy), b = archiveSource(parseSettlement(JSON.parse(JSON.stringify(settlementJSON))), parseArchive(JSON.parse(JSON.stringify(archiveJSON))), parseEconomy(JSON.parse(JSON.stringify(economyJSON))));
    expect(a).toEqual(b); expect(a.budget).toBe(2);
    for (let stage = 0; stage < 3; stage++) expect(createPuzzle(a.key, stage)).toEqual(createPuzzle(b.key, stage));
    expect(transactionURL(a)).toBe('https://sepolia.etherscan.io/tx/' + settlementJSON.transactionHash);
  });
  it('never assumes contiguous rounds; filters idle, pending, invalid and duplicate entries', () => {
    const archive = parseArchive({ ...archiveJSON, recentSettlements: [{ ...settlementJSON, settledThroughRound: '1201', transactionHash: '0x' + 'a'.repeat(64) }, { ...settlementJSON, workAdded: '0' }, { ...settlementJSON, confirmationStatus: 'pending' }, { ...settlementJSON, transactionHash: 'bad' }, settlementJSON, settlementJSON] });
    expect(archive.items.map(s => s.settledThroughRound)).toEqual(['1214', '1201']);
  });
  it('rejects a mismatched installation or chain; never invents explorer links', () => {
    const archive = parseArchive(archiveJSON), e = parseEconomy(economyJSON);
    expect(() => archiveSource(archive.items[0], { ...archive, installationId: 'different' }, e)).toThrow();
    const s = archiveSource(archive.items[0], archive, e); expect(transactionURL({ ...s, network: { target: 'unknown', chainId: '988' } })).toBeNull();
  });
  it('bounds the actual work-based energy budget without unsafe number conversion', () => {
    expect(['1', '249', '250', '499', '500', '9999999999999999999999999999999999'].map(energyBudget)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('rejects incomplete and non-safe source fields', () => {
    for (const key of Object.keys(settlementJSON)) { const v = { ...settlementJSON } as Record<string, unknown>; delete v[key]; expect(() => parseSettlement(v)).toThrow(); }
    expect(() => parseArchive({ ...archiveJSON, schemaVersion: 2 })).toThrow();
  });
});
describe('local progress with graceful storage failure', () => {
  const source = () => { const a = parseArchive(archiveJSON); return archiveSource(a.items[0], a, parseEconomy(economyJSON)); };
  it('restores the exact garden and pauses active play on reload', () => {
    const r = createRun(source()); r.phase = 'playing'; r.moves = 1; r.remainingMs = 120000;
    expect(restoreRun(r)).toEqual({ ...r, phase: 'paused' });
  });
  it('discards corrupt progress and reports inaccessible storage', () => {
    expect(loadSaved({ getItem() { throw new Error('denied'); } }).warning).toContain('unavailable');
    expect(saveState(null, emptyTracker(), {}, { setItem() { throw new Error('quota'); } })).toBe(false);
    expect(() => restoreRun({ source: source(), version: 1, stage: 0, phase: 'playing', tiles: [] })).toThrow();
  });
  it('preserves live high-water marks through reload and requires rebaselining', () => {
    const st = parseStatus(statusJSON), ec = parseEconomy(economyJSON), tracker = sample(emptyTracker(), st, ec, NOW);
    let raw = ''; saveState(null, tracker, { demo: 2000 }, { setItem(_, v) { raw = v; } });
    const restored = loadSaved({ getItem() { return raw; } });
    expect(restored.tracker.seen).toEqual(tracker.seen); expect(restored.tracker.needsBaseline).toBe(true); expect(restored.bests.demo).toBe(2000);
  });
});
