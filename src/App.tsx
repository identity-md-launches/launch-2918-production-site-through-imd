import { useCallback, useEffect, useRef, useState } from 'react';
import { cellName, createRun, gameReducer, routed, tileName, type Action } from './core/engine';
import type { Mode, Run, Source } from './core/types';
import { archiveSource, DEMO_SOURCE, liveKey, liveSource, networkName, sameInstallation, transactionURL } from './data/archive';
import { useFeed } from './data/useFeed';
import { breakContinuity, emptyTracker, freshness, sample } from './data/telemetry';
import { loadSaved, restoreRun, saveState, STORAGE_KEY } from './data/storage';
import { exportPNG, overlayURL } from './data/export';
import { playTone } from './data/sound';
import { Board } from './components/Board';
import { Modal } from './components/Modal';
import { Tutorial } from './components/Tutorial';
import { Icon } from './components/Icon';
import { flowerArt, wheelArt } from './components/art';

const modeLabels: Record<Mode, string> = { archive: 'Round Challenge', live: 'Live Garden', demo: 'Demo' };
const time = (milliseconds: number) => `${Math.floor(Math.ceil(milliseconds / 1000) / 60)}:${String(Math.ceil(milliseconds / 1000) % 60).padStart(2, '0')}`;
function stamp(iso: string) { return iso ? new Date(iso).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Fixed practice fixture'; }

export function App() {
  const [params] = useState(() => new URLSearchParams(location.search));
  const overlay = params.get('overlay') === '1';
  const [controls, setControls] = useState(params.get('controls') !== '0');
  const [saved] = useState(() => loadSaved());
  const qmode = params.get('mode') as Mode | null;
  const initialRun = saved.run && (!qmode || qmode === saved.run.source.mode) && (!params.get('round') || params.get('round') === saved.run.source.round) && (!params.get('tx') || params.get('tx') === saved.run.source.settlement?.transactionHash) ? saved.run : qmode === 'demo' ? createRun(DEMO_SOURCE) : null;
  const [run, setRun] = useState<Run | null>(initialRun);
  const [following, setFollowing] = useState(overlay && !!saved.run && initialRun === saved.run);
  const [mode, setMode] = useState<Mode>(initialRun?.source.mode ?? (qmode && ['archive', 'live', 'demo'].includes(qmode) ? qmode : 'archive'));
  const [tracker, setTracker] = useState(saved.tracker), trackerRef = useRef(tracker);
  const [bests, setBests] = useState(saved.bests), [storageWarning, setStorageWarning] = useState(saved.warning);
  const [panel, setPanel] = useState<'help' | 'about' | 'share' | 'archive' | 'restart' | 'result' | null>(null);
  const [tutorial, setTutorial] = useState(false), [sound, setSound] = useState(false), [notice, setNotice] = useState('');
  const [pendingMode, setPendingMode] = useState<Mode | null>(null), [manualCopy, setManualCopy] = useState('');
  const [exporting, setExporting] = useState(false);
  const { feed, retry } = useFeed();
  const runRef = useRef(run); runRef.current = run;
  const currentFreshness = feed.errors.status ? 'unavailable' : freshness(feed.status, feed.now);
  const compatibleArchive = feed.archive && feed.economy && sameInstallation(feed.archive, feed.economy) ? feed.archive : null;
  const liveAvailable = !!feed.status && !!feed.economy && feed.status.installationId === feed.economy.installationId && !feed.errors.economy && !feed.errors.status && currentFreshness !== 'stale' && feed.now - Date.parse(feed.economy.generatedAt) <= 180000 && Date.parse(feed.economy.generatedAt) <= feed.now + 30000;

  const updateTracker = useCallback((next: typeof tracker) => { trackerRef.current = next; setTracker(next); }, []);
  const pin = useCallback((source: Source) => {
    setRun(createRun(source)); setMode(source.mode); updateTracker(emptyTracker()); setNotice(''); setPanel(null);
  }, [updateTracker]);
  useEffect(() => {
    if (run) return;
    if (mode === 'demo') { pin(DEMO_SOURCE); return; }
    if (mode === 'archive' && compatibleArchive && feed.economy) {
      const requestedRound = params.get('round'), requestedTx = params.get('tx');
      const item = requestedRound ? compatibleArchive.items.find(s => s.settledThroughRound === requestedRound && (!requestedTx || s.transactionHash === requestedTx)) : compatibleArchive.items[0];
      if (item) pin(archiveSource(item, compatibleArchive, feed.economy));
    }
    if (mode === 'live' && liveAvailable) pin(liveSource(feed.status!, feed.economy!));
  }, [run, mode, compatibleArchive, feed.economy, feed.status, params, liveAvailable, pin]);

  const act = useCallback((action: Action) => {
    const before = runRef.current; if (!before) return;
    if (action.type === 'start' && before.source.mode === 'live') {
      if (!feed.status || !feed.economy || !liveAvailable) { setNotice('Fresh wheel and economy samples are needed to start Live Garden. Demo stays available.'); return; }
      // Pin a new baseline at START, never at page load or from lifetime distance.
      const source = liveSource(feed.status, feed.economy), fresh = createRun(source);
      const tracked = sample(emptyTracker(), feed.status, feed.economy, Date.now()); updateTracker(tracked);
      setRun(gameReducer(fresh, { type: 'start' })); return;
    }
    const after = gameReducer(before, action);
    if (action.type === 'boost' && before.source.mode === 'live' && after.charges !== before.charges) updateTracker({ ...trackerRef.current, charges: after.charges });
    setRun(after);
    if (sound && after !== before && ['rotate', 'boost', 'next'].includes(action.type)) playTone(action.type === 'boost' ? 784 : after.phase === 'bloom' ? 659 : 330);
  }, [feed.status, feed.economy, liveAvailable, sound, updateTracker]);

  useEffect(() => {
    if ((overlay && !controls && following) || !run || run.source.mode !== 'live' || run.phase === 'ready' || ['won', 'lost'].includes(run.phase)) return;
    const current = trackerRef.current;
    let next = current;
    if (feed.errors.status || feed.errors.economy) next = breakContinuity(current);
    else if (feed.status && feed.economy) next = sample(current, feed.status, feed.economy, feed.now);
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      updateTracker(next);
      if (next.charges !== run.charges) setRun(r => r ? gameReducer(r, { type: 'charges', value: next.charges }) : r);
    }
  }, [feed.status, feed.economy, feed.now, feed.errors, run?.source.mode, run?.phase, run?.charges, updateTracker, overlay, controls, following]);

  useEffect(() => {
    if (!run || run.phase !== 'playing' || panel || tutorial || (overlay && !controls && following)) return;
    let last = performance.now();
    const timer = setInterval(() => { const now = performance.now(); const elapsed = now - last; last = now; setRun(r => r ? gameReducer(r, { type: 'tick', elapsed }) : r); }, 250);
    return () => clearInterval(timer);
  }, [run?.phase, panel, tutorial, overlay, controls, following]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) { setRun(r => r ? gameReducer(r, { type: 'pause' }) : r); updateTracker(breakContinuity(trackerRef.current, 'Tab was hidden. Resume with a new live baseline; no background energy is awarded.')); }
    };
    document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden);
  }, [updateTracker]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (panel || tutorial || !runRef.current || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (e.key.toLowerCase() === 'r' && !(e.target instanceof HTMLElement && e.target.closest('.garden-board'))) { e.preventDefault(); act({ type: 'rotate' }); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [act, panel, tutorial]);

  useEffect(() => {
    if (!run || !['won', 'lost'].includes(run.phase)) return;
    if (!(overlay && !controls)) setPanel('result');
    if (run.phase === 'won') setBests(previous => ({ ...previous, [run.source.mode]: Math.max(previous[run.source.mode] ?? 0, run.score), [run.source.key]: Math.max(previous[run.source.key] ?? 0, run.score) }));
  }, [run?.phase]);
  // Saves are throttled to whole seconds, plus every meaningful action, not every clock frame.
  const savedSecond = run ? Math.ceil(run.remainingMs / 1000) : -1;
  useEffect(() => {
    if (overlay && !controls && following) return;
    if (!saveState(run, trackerRef.current, bests)) setStorageWarning('Local storage is blocked or full. Progress lasts for this visit; PNG export still works.');
  }, [run?.moves, run?.score, run?.phase, run?.stage, run?.source.key, run?.charges, savedSecond, bests, overlay, controls, following]);
  useEffect(() => {
    if (!overlay || controls) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { const raw = JSON.parse(event.newValue).run; const next = restoreRun(raw); if (!controls && raw.phase === 'playing') next.phase = 'playing'; if ((!params.get('mode') || next.source.mode === params.get('mode')) && (!params.get('round') || next.source.round === params.get('round'))) { setFollowing(true); setRun(next); updateTracker(breakContinuity({ ...trackerRef.current, charges: next.charges }, 'Stream progress loaded. Resume live accounting with a fresh baseline.')); } } catch { /* Ignore unrelated or corrupt storage events. */ }
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [overlay, params, controls, updateTracker]);

  const switchMode = (next: Mode) => {
    if (mode === next) return;
    if (run && ['playing', 'paused', 'bloom'].includes(run.phase)) { setPendingMode(next); setPanel('restart'); return; }
    changeMode(next);
  };
  const changeMode = (next: Mode) => { setRun(null); setMode(next); updateTracker(emptyTracker()); setPanel(null); setPendingMode(null); setNotice(''); };
  const restart = () => { if (pendingMode) changeMode(pendingMode); else if (run) { pin(run.source); } };
  const nextGarden = () => {
    if (run?.source.mode === 'live' && feed.status && feed.economy && liveAvailable) act({ type: 'next', key: liveKey(feed.status, feed.economy), round: feed.economy.currentRound });
    else act({ type: 'next' });
    if (run && run.stage < 2) setTimeout(() => document.querySelector<HTMLButtonElement>('.garden-board [tabindex="0"]')?.focus(), 0);
  };
  const png = async () => { if (!run) return; setExporting(true); try { await exportPNG(run); setNotice('Garden PNG exported.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'PNG export failed. Try again.'); } finally { setExporting(false); } };
  const copy = async () => { const url = overlayURL(run); try { await navigator.clipboard.writeText(url); setNotice('Overlay URL copied. Add it as a 1920 × 1080 browser source.'); setManualCopy(url); } catch { setManualCopy(url); setNotice('Select and copy the overlay URL below.'); } };
  const reached = run ? routed(run) : [];
  const canBoost = !!run && ['playing', 'bloom'].includes(run.phase) && run.charges > 0 && reached.includes(run.selected) && !run.boosted.includes(run.selected);
  const selected = run ? run.tiles[run.selected] : null;
  const link = run ? transactionURL(run.source) : null;
  const sourceBadge = mode === 'demo' ? 'Demo · offline practice' : mode === 'archive' ? `Historical round ${run?.boardRound ?? '…'}` : `Live Garden · ${currentFreshness}${run ? ` · round ${run.boardRound}` : ''}`;
  const preview = run ?? createRun(DEMO_SOURCE);
  const best = bests[mode] ?? 0;
  const error = mode === 'archive' ? feed.errors.archive || feed.errors.economy || (feed.archive && feed.economy && !compatibleArchive ? 'Source installations or networks disagree. Retry to load new historical rounds.' : null) : mode === 'live' ? feed.errors.status || feed.errors.economy || (currentFreshness === 'stale' ? 'The wheel sample is stale. Retry the source or practice in Demo.' : null) : null;
  const sourcePending = !error && (mode === 'archive' ? !feed.archive || !feed.economy : mode === 'live' ? !feed.status || !feed.economy : false);

  return <div className={`app${overlay ? ' overlay-app' : ''}${overlay && !controls ? ' controls-hidden' : ''}`}>
    <a className="skip-link" href="#garden">Skip to garden</a>
    <header className="app-header">
      <a className="brand" href={location.pathname} aria-label="Squeek Signal Garden home"><svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true" dangerouslySetInnerHTML={{ __html: flowerArt(true, true) }} /><span>Squeek <span>Signal Garden</span></span></a>
      <nav aria-label="Garden utilities"><button className="quiet-button sound-button" aria-pressed={sound} onClick={() => { setSound(v => !v); if (!sound) playTone(523); }} title="Optional garden sound">Sound {sound ? 'on' : 'off'}</button><button className="quiet-button" onClick={() => setTutorial(true)}><Icon name="help" /><span>How to play</span></button></nav>
    </header>
    <main id="garden" className="main-layout">
      <section className="garden-column" aria-label="Signal Garden game">
        <div className="intro"><h1>Bring the night to bloom.</h1><p>Route the wheel’s energy into four flower beacons.</p></div>
        <div className="mode-tabs" role="group" aria-label="Game mode">{(['archive', 'live', 'demo'] as Mode[]).map(m => <button key={m} aria-pressed={mode === m} onClick={() => switchMode(m)}>{modeLabels[m]}</button>)}</div>
        <div className="source-line"><span className={`status-dot ${mode === 'live' ? currentFreshness : mode}`} aria-hidden="true"/><span>{sourceBadge}{overlay ? ` · wheel ${currentFreshness}${run ? ` · ${run.phase}` : ''}` : ''}</span>{mode === 'archive' && <button className="text-button" onClick={() => setPanel('archive')}>Change round <Icon name="arrow" size={14}/></button>}{mode === 'demo' && <span className="source-tail">Fixed fixture</span>}</div>
        <div className="score-strip" aria-label="Run statistics">
          <div><span>Garden</span><strong>{(run?.stage ?? 0) + 1}<small> / 3</small></strong></div>
          <div><span>Time left</span><strong data-testid="timer">{time(run?.remainingMs ?? 180000)}</strong></div>
          <div><span>Rotations</span><strong data-testid="moves">{run?.moves ?? 0}<small> / {run?.puzzle.limit ?? '–'}</small></strong></div>
          <div><span>Score</span><strong data-testid="score">{run?.score ?? 0}</strong></div>
        </div>
        <div className={`board-scene${!run ? ' board-loading' : ''}${run?.phase === 'bloom' || run?.phase === 'won' ? ' garden-restored' : ''}`}>
          <div className="board-topline"><span>{['Moonflower court', 'Starlit greenhouse', 'The midnight canopy'][run?.stage ?? 0]}</span><span role="status" aria-live="polite">{reached.length} / 4 connected</span></div>
          <Board key={`${preview.puzzle.key}:${preview.stage}`} run={preview} disabled={!run || !['playing', 'ready', 'bloom'].includes(run.phase)} onSelect={index => act({ type: 'select', index })} onRotate={() => act({ type: 'rotate' })} />
          {!run && <div className="board-cover"><span>Garden preview</span><strong>{sourcePending ? mode === 'archive' ? 'Finding a settled round…' : 'Listening for the wheel…' : mode === 'archive' ? 'No safe round loaded' : 'Live source unavailable'}</strong><button className="primary" onClick={() => { changeMode('demo'); pin(DEMO_SOURCE); }}>Play Demo</button></div>}
          {run?.phase === 'paused' && <div className="board-cover paused-cover"><strong>Garden paused</strong><span>The night can wait.</span><button className="primary" onClick={() => act({ type: 'resume' })}>Resume garden</button></div>}
        </div>
        <div className="game-controls">
          {run?.phase === 'ready' ? <button className="primary start-button" onClick={() => { act({ type: 'start' }); setTimeout(() => document.querySelector<HTMLButtonElement>('.garden-board [tabindex="0"]')?.focus(), 0); }}>Start garden <Icon name="arrow"/></button> : run?.phase === 'bloom' ? <button className="primary" onClick={nextGarden}>{run.stage === 2 ? 'Finish the garden' : 'Next garden'} <Icon name="arrow"/></button> : run?.phase === 'won' || run?.phase === 'lost' ? <button className="primary" onClick={() => setPanel('result')}>View result</button> : run?.phase === 'paused' ? <span className="paused-label">Run paused</span> : <button className="primary" disabled={!run || selected?.kind !== 'conduit'} onClick={() => act({ type: 'rotate' })}><Icon name="restart"/> Rotate <kbd>R</kbd></button>}
          <button className="boost-button" disabled={!canBoost} onClick={() => act({ type: 'boost' })}><Icon name="bolt"/> Grow <span className="grow-count">{run?.charges ?? 0}</span></button>
          <button className="icon-button" aria-label={run?.phase === 'paused' ? 'Resume' : 'Pause'} disabled={!run || !['playing', 'paused'].includes(run.phase)} onClick={() => act({ type: run?.phase === 'paused' ? 'resume' : 'pause' })}>{run?.phase === 'paused' ? '▷' : 'Ⅱ'}</button>
          <button className="icon-button" aria-label="Restart" disabled={!run} onClick={() => { setPendingMode(null); setPanel('restart'); }}><Icon name="restart"/></button>
        </div>
        <div className="selection-line"><span>{run ? `${cellName(run.selected)} · ${selected ? tileName(selected) : ''}` : 'Select a mode to begin'}</span><span>{run?.phase === 'bloom' ? 'All connected. Grow a beacon or continue.' : 'Select a tile, then rotate.'}</span></div>
        <p className="keyboard-tip">Arrow keys move focus · Enter selects · R rotates clockwise</p>
        <div className="run-extras"><span>Connection streak <strong>{run?.streak ?? 0}</strong></span><span>Combo <strong>×{run?.combo ?? 1}</strong></span><span>Local best <strong>{best.toLocaleString('en')}</strong></span></div>
        <p className="notice" role="status">{notice}</p>
        {error && <div className="source-error"><p>{error}</p><button onClick={retry}>Retry source</button>{mode !== 'demo' && <button onClick={() => switchMode('demo')}>Practice in Demo</button>}</div>}
        {storageWarning && <p className="warning">{storageWarning}</p>}
      </section>
      <aside className="garden-aside">
        <div className="wheel-scene"><svg className={currentFreshness === 'live' ? 'wheel-illustration wheel-running' : 'wheel-illustration'} viewBox="0 0 100 100" role="img" aria-label={currentFreshness === 'live' ? 'Original illustration of a hamster in a wheel; live wheel movement detected' : 'Original illustration of a hamster resting in a wheel'} dangerouslySetInnerHTML={{ __html: wheelArt }}/><div><h2>{currentFreshness === 'idle' ? 'Small paws, quiet night.' : currentFreshness === 'live' ? 'The wheel is turning.' : 'A signal in the dark.'}</h2><p>{currentFreshness === 'idle' ? 'Squeektoshi is resting. The garden is still yours to restore.' : currentFreshness === 'live' ? 'New wheel movement can grow bonus energy in Live Garden.' : 'Live data is unavailable or stale. Historical rounds and Demo stay playable.'}</p></div></div>
        <section className="reservoir" aria-label="Growth reservoir"><div className="aside-title"><h2>Growth reservoir</h2><strong>{run?.charges ?? 0} / 3</strong></div><div className="charge-slots" aria-hidden="true">{[0, 1, 2].map(i => <span key={i} className={i < (run?.charges ?? 0) ? 'charged' : ''}><Icon name="bolt" size={22}/></span>)}</div><p>{mode === 'live' ? '1 charge per 1,000 new mm with positive work. Baseline power is always on.' : mode === 'archive' ? `${run?.source.settlement?.workAdded ?? '…'} settled work units → ${run?.source.budget ?? '…'} bonus charges for this run.` : '2 practice charges. This fixed fixture uses no live data.'}</p><p className="small-copy">Select a connected flower, then Grow. Each charge is spent once.</p></section>
        <section className="source-details"><h2>{mode === 'archive' ? 'A moment from the wheel' : mode === 'live' ? 'From the real wheel' : 'Room to practice'}</h2><dl><div><dt>Source</dt><dd>{mode === 'archive' ? 'Historical · API-safe settlement' : mode === 'live' ? 'Provisional telemetry' : 'Deterministic Demo'}</dd></div><div><dt>Network</dt><dd>{networkName(run?.source.network ?? null)}</dd></div><div><dt>Source time</dt><dd>{stamp(mode === 'live' ? feed.status?.measurement.observedAt ?? '' : run?.source.timestamp ?? '')}</dd></div><div><dt>Wheel now</dt><dd>{currentFreshness === 'idle' ? 'Idle · baseline power on' : currentFreshness}</dd></div></dl>{link && <a href={link} target="_blank" rel="noreferrer">View round transaction <Icon name="external" size={16}/></a>}{mode === 'live' && <p className="small-copy">{tracker.note}</p>}<button className="text-button" onClick={() => setPanel('help')}>How it works <Icon name="arrow" size={16}/></button></section>
        <div className="share-actions"><button onClick={() => setPanel('share')}><Icon name="copy"/> Share / stream</button><button disabled={!run || exporting} onClick={() => void png()}><Icon name="download"/> {exporting ? 'Exporting…' : 'Export garden PNG'}</button></div>
      </aside>
    </main>
    <footer><span>A little garden on Squeekchain.</span><div><button className="text-button" onClick={() => setPanel('about')}>About</button><a href="https://squeekchain.com/genesis/code" target="_blank" rel="noreferrer">Genesis Code <Icon name="external" size={14}/></a></div></footer>
    {overlay && <button className="overlay-toggle" onClick={() => { if (!controls) setFollowing(false); setControls(v => !v); }}>{controls ? 'Hide controls' : 'Show controls'}</button>}
    {tutorial && <Tutorial onClose={() => setTutorial(false)}/>}
    {panel === 'help' && <Modal title="How the signal grows" onClose={() => setPanel(null)} wide><p>Join the wheel to all four flowers. Select a conduit, then Rotate or press R. Stones and ferns stay fixed. Each board has a rotation limit; finish three gardens within three minutes of active play. Pause and dialogs stop the clock.</p><h3>Three ways to play</h3><p><strong>Round Challenge:</strong> a historical settlement labelled safe or finalized by the public API, with positive work. Its transaction hash + round + actual chain seed every board. Charges = min(3, 1 + floor(workAdded / 250)). Rounds need not be contiguous.</p><p><strong>Live Garden:</strong> pin installation, release, chain, epoch and a fresh source baseline at Start. Every 1,000 new millimetres paired with positive new work earns one charge, capped at 3. Overflow is discarded. Repeats and old timestamps earn nothing; counter resets, stale data, source changes, hiding and reconnects rebaseline without awarding history. A round change seeds only the next board.</p><p><strong>Demo:</strong> the fixed moonflower fixture, 2 practice charges, separate local best. No synthetic values are presented as live.</p><h3>Source right now</h3><dl className="detail-list"><div><dt>Wheel status</dt><dd>{currentFreshness}</dd></div><div><dt>Observed at</dt><dd>{feed.status?.measurement.observedAt ?? 'Not received'}</dd></div><div><dt>Generated at</dt><dd>{feed.status?.generatedAt ?? 'Not received'}</dd></div><div><dt>Freshness limit</dt><dd>{feed.status?.measurement.staleAfterSeconds ?? '–'} seconds</dd></div><div><dt>Network</dt><dd>{networkName(feed.economy?.chain ?? null)}</dd></div><div><dt>Pinned baseline</dt><dd>{run?.source.mode === 'live' ? `${run.source.timestamp} · epoch ${run.source.epoch} · ${run.source.baselineDistanceMm ?? 'unknown'} mm · ${run.source.baselineWork ?? 'unknown'} work units` : 'Start Live Garden to pin a baseline.'}</dd></div><div><dt>Energy note</dt><dd>{tracker.note}</dd></div></dl><p>Status is polled every 10 seconds; economy and archive every 60 seconds. Requests are serialized, time out after 8 seconds, back off on failure and honor Retry-After. Hidden tabs suspend requests. Telemetry is provisional; optimistic builder projections are never treated as settled chain state.</p><h3>Points, fairly local</h3><p>First connection per flower: 100 × combo. Consecutive connecting rotations build a combo up to ×4; other rotations reset it. A cleared board adds 400 + 5 per spare rotation. Grow adds 150 once per flower. A full win adds 2 per second left. Reconnecting a flower cannot farm points. Bests are saved only on this browser, separately for each mode.</p><button className="primary" onClick={() => { setPanel(null); setTutorial(true); }}>Try the interactive tutorial</button></Modal>}
    {panel === 'about' && <Modal title="A garden with a real heartbeat" onClose={() => setPanel(null)}><p>Squeek Signal Garden is an original browser puzzle and stream companion for Squeekchain Genesis Code. The live wheel’s new distance can grant optional growth charges; safe historical settlements make reproducible round challenges.</p><p>It reads only Squeekchain’s public status, economy and settlements APIs. The network label comes from those APIs. Scores and progress stay on this device. There are no accounts, wallet signatures, contracts, token rewards or financial promises.</p><p>This is an independent creation, with original SVG garden and hamster artwork. No official endorsement is claimed.</p><div className="modal-actions"><a href="https://squeekchain.com" target="_blank" rel="noreferrer">Visit Squeekchain <Icon name="external" size={16}/></a><a href="https://squeekchain.com/genesis/code" target="_blank" rel="noreferrer">Read Genesis Code <Icon name="external" size={16}/></a></div></Modal>}
    {panel === 'share' && <Modal title="Let the garden join your stream" onClose={() => setPanel(null)}><p>Add the overlay URL as a 1920 × 1080 browser source. It renders this game in a 16:9 garden scene, with mode, round and freshness visible. Controls can be shown at any time.</p><p>Tabs in this browser share local progress. A separate OBS profile opens the same pinned challenge as a fresh playable game; it does not receive this browser’s moves. Historical URLs need that round in the API’s available archive, or a saved local run.</p><div className="modal-actions"><button className="primary" onClick={() => void copy()}><Icon name="copy"/> Copy overlay URL</button><a className="button-link" href={overlayURL(run)} target="_blank" rel="noreferrer">Open overlay <Icon name="external" size={16}/></a></div>{manualCopy && <label className="copy-field">Overlay URL · select and copy<textarea readOnly value={manualCopy} onFocus={e => e.currentTarget.select()} /></label>}<button disabled={!run || exporting} onClick={() => void png()}><Icon name="download"/> Export garden PNG</button><p className="small-copy" role="status">{notice}</p></Modal>}
    {panel === 'archive' && <Modal title="Choose a historical round" onClose={() => setPanel(null)}><p>Only safe or finalized settlements with positive work are playable. These are past rounds, not live activity.</p>{compatibleArchive?.items.length ? <div className="archive-list">{compatibleArchive.items.map(item => <button key={item.transactionHash} onClick={() => { if (run && ['playing', 'paused', 'bloom'].includes(run.phase) && !window.confirm('Replace the current run with this historical round?')) return; pin(archiveSource(item, compatibleArchive, feed.economy!)); }}><strong>Round {item.settledThroughRound}</strong><span>{item.workAdded} work · {stamp(item.blockTimestamp)}</span><Icon name="arrow" size={16}/></button>)}</div> : <p>No safe positive-work settlements loaded. Retry the source or practice in Demo.</p>}<button onClick={retry}>Refresh available rounds</button><p className="small-copy">{feed.errors.archive || feed.errors.economy}</p></Modal>}
    {panel === 'restart' && <Modal title={pendingMode ? 'Change the garden mode?' : 'Restart this run?'} onClose={() => { setPanel(null); setPendingMode(null); }}><p>{pendingMode ? 'This ends the current attempt and opens the selected mode.' : 'The same source and initial board return. Score, timer and charges reset; Live Garden starts with a fresh baseline.'}</p><div className="modal-actions"><button className="primary" onClick={restart}>{pendingMode ? 'Change mode' : 'Restart run'}</button><button onClick={() => { setPanel(null); setPendingMode(null); }}>Keep playing</button></div></Modal>}
    {panel === 'result' && run && <Modal title={run.phase === 'won' ? 'The night is in bloom.' : 'The garden will wait.'} onClose={() => setPanel(null)}><div className="result-flowers" aria-hidden="true">{[0, 1, 2, 3].map(i => <svg key={i} viewBox="0 0 100 100" dangerouslySetInnerHTML={{ __html: flowerArt(run.phase === 'won', i === 1 && run.phase === 'won') }}/>)}</div><p>{run.phase === 'won' ? 'Three gardens restored before dawn.' : run.lossReason} {modeLabels[run.source.mode]} · {run.source.mode === 'demo' ? 'offline practice' : `round ${run.source.round}`}.</p><div className="result-score"><span>{run.phase === 'won' ? 'Final score' : 'Points this attempt'}</span><strong>{run.score.toLocaleString('en')}</strong><span>{run.completed} / 3 gardens · local best {Math.max(best, run.phase === 'won' ? run.score : 0)}</span></div><div className="modal-actions"><button className="primary" onClick={() => pin(run.source)}>Play again <Icon name="restart"/></button><button disabled={exporting} onClick={() => void png()}>Export garden PNG</button></div></Modal>}
  </div>;
}
