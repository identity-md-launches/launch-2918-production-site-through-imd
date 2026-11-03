import { useEffect, useRef, useState } from 'react';
import { Board } from './components/Board';
import { Icon, Mark } from './components/Icon';
import { Modal } from './components/Modal';
import { canonicalKey, cellName, createRound, gameReducer, score } from './core/engine';
import type { GameAction } from './core/engine';
import type { Origin, PuzzleInput, Round } from './core/types';
import { addArchive, ARCHIVE_KEY, decodeInput, encodeInput, readArchive, STARTER_ARCHIVE, validateInput, type ArchiveItem } from './data/archive';
import { exportJSON, exportPNG } from './data/export';
import { useFeed } from './data/useFeed';
import { RPC_URL } from './data/rpc';

type Dialog = 'help' | 'source' | 'archive' | 'result' | 'replace' | 'restart' | null;
const integer = new Intl.NumberFormat('en-US');
const blockTitle = (input: PuzzleInput) => input.kind === 'demo' ? `Demo ${input.index}` : `Block #${integer.format(input.block.number)}`;
const demoInput = (index: number): PuzzleInput => ({ version: 1, kind: 'demo', index });

function initialRound(): Round {
  try {
    const shared = decodeInput(location.hash);
    if (shared) return createRound(shared, shared.kind === 'demo' ? 'demo' : 'archive');
  } catch { /* The effect exposes the malformed-link error. */ }
  return createRound(demoInput(1), 'demo');
}

export function App() {
  const [round, setRound] = useState<Round>(initialRound);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [archive, setArchive] = useState<ArchiveItem[]>([]);
  const [notice, setNotice] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const { feed, retry } = useFeed();
  const pending = useRef<{ input: PuzzleInput; origin: Origin } | null>(null);
  const autoLive = useRef(!location.hash.startsWith('#p='));
  const startButton = useRef<HTMLButtonElement>(null);
  const demoCount = useRef(round.puzzle.input.kind === 'demo' ? round.puzzle.input.index : 1);
  const game = (action: GameAction) => setRound(current => gameReducer(current, action));

  useEffect(() => {
    try { const saved = readArchive(localStorage); setArchive(saved.items); if (saved.warning) setStorageWarning(saved.warning); }
    catch { setStorageWarning('Browser storage is unavailable. Export JSON to keep a puzzle.'); }
    try { decodeInput(location.hash); } catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to read the puzzle link.'); autoLive.current = false; }
    const handleHash = () => {
      try {
        const input = decodeInput(location.hash);
        if (input) { autoLive.current = false; pending.current = { input, origin: input.kind === 'demo' ? 'demo' : 'archive' }; setDialog('replace'); }
      } catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to read the puzzle link.'); }
    };
    addEventListener('hashchange', handleHash);
    return () => removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (feed.status === 'live' && feed.block && autoLive.current) {
      autoLive.current = false;
      setRound(createRound({ version: 1, kind: 'block', block: feed.block }, 'live'));
    }
  }, [feed]);

  useEffect(() => {
    if (round.phase === 'won' || round.phase === 'lost') { setNotice(''); setDialog('result'); }
  }, [round.phase]);

  function save(input: PuzzleInput) {
    setArchive(current => {
      const items = addArchive(current, input, Date.now());
      try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(items)); }
      catch { setStorageWarning('This puzzle is saved for this session only. Export JSON to keep it.'); }
      return items;
    });
  }
  function select(input: PuzzleInput, origin: Origin) {
    autoLive.current = false;
    setRound(createRound(input, origin)); setDialog(null); setArchiveError(''); setNotice('Puzzle loaded. Select Play puzzle or any tile to begin.');
    try { history.replaceState(null, '', `${location.pathname}${location.search}${encodeInput(input)}`); } catch { /* IPFS gateways can restrict history. */ }
    setTimeout(() => startButton.current?.focus({ preventScroll: true }), 0);
  }
  function request(input: PuzzleInput, origin: Origin) {
    if (canonicalKey(input) === round.puzzle.key) { setNotice('This is already the current puzzle. Restart to try it again.'); setDialog(null); return; }
    if (round.phase === 'playing' && round.history.length > 0) { pending.current = { input, origin }; setDialog('replace'); }
    else select(input, origin);
  }
  function start() {
    autoLive.current = false; save(round.puzzle.input); game({ type: 'start' }); setNotice('Round started. Turn every light off.');
    setTimeout(() => document.querySelector<HTMLButtonElement>('.tile[tabindex="0"]')?.focus({ preventScroll: true }), 0);
  }
  function press(cell: number) {
    if (round.phase === 'ready') { autoLive.current = false; save(round.puzzle.input); game({ type: 'start' }); setNotice('Round started. Turn every light off.'); }
    game({ type: 'press', cell });
  }
  function restart(play = false) {
    const next = createRound(round.puzzle.input, round.origin);
    setRound(play ? gameReducer(next, { type: 'start' }) : next); setDialog(null); setNotice(play ? 'New attempt started on the same puzzle.' : 'Puzzle reset. Moves, hints and score have been reset.');
    setTimeout(() => play ? document.querySelector<HTMLButtonElement>('.tile[tabindex="0"]')?.focus({ preventScroll: true }) : startButton.current?.focus({ preventScroll: true }), 0);
  }
  async function png() {
    setExporting(true);
    try { await exportPNG(round); setNotice('PNG created. Check your browser downloads.'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to export PNG. Try JSON instead.'); }
    finally { setExporting(false); }
  }
  async function copyLink() {
    const link = new URL(location.href); link.hash = encodeInput(round.puzzle.input);
    try { await navigator.clipboard.writeText(link.href); setNotice('Puzzle link copied. It replays the original board, without your moves.'); }
    catch { setShowLink(true); setNotice('Copy is unavailable here. Select and copy the puzzle link below.'); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 32_768) throw new Error('Choose an archive smaller than 32 KB.');
      const payload: unknown = JSON.parse(await file.text());
      const candidate = payload && typeof payload === 'object' && 'input' in payload ? (payload as Record<string, unknown>).input : payload;
      const input = validateInput(candidate);
      setArchiveError(''); request(input, input.kind === 'demo' ? 'demo' : 'archive');
    } catch (e) { setArchiveError(e instanceof SyntaxError ? 'This file is not valid JSON. Choose an exported Blocklight archive.' : e instanceof Error ? e.message : 'Unable to read this archive.'); }
  }

  const active = round.phase === 'playing';
  const terminal = round.phase === 'won' || round.phase === 'lost';
  const input = round.puzzle.input;
  const liveAvailable = feed.status === 'live' && feed.block !== null;
  const newBlock = liveAvailable && canonicalKey({ version: 1, kind: 'block', block: feed.block! }) !== round.puzzle.key;
  const sourceLabel = round.origin === 'demo' ? 'Demo · offline practice' : round.origin === 'archive' ? 'Archive · unverified replay' : 'Live snapshot · locked for this round';
  const feedLabel = { connecting: 'Connecting to Ethereum', live: 'Ethereum feed is live', stale: 'Ethereum feed is stale', unavailable: 'Ethereum API unavailable', paused: 'Ethereum feed paused' }[feed.status];
  const archiveItems = archive.some(a => canonicalKey(a.input) === canonicalKey(STARTER_ARCHIVE)) ? archive : [...archive, { input: STARTER_ARCHIVE, savedAt: STARTER_ARCHIVE.kind === 'block' ? STARTER_ARCHIVE.block.timestamp * 1000 : 0 }];
  const link = new URL(location.href); link.hash = encodeInput(input);

  return <>
    <a className="skip-link" href="#game">Skip to game</a>
    <header className="site-header container">
      <a className="brand" href="./" aria-label="Blocklight home"><Mark /><span>Blocklight</span></a>
      <div className="header-utilities"><button className="button button-quiet" onClick={() => setDialog('help')}><Icon name="help" />How to play</button></div>
    </header>
    <main id="game" className="container">
      <div className="intro"><h1>Every block.<br className="desktop-break" /> <span>Lights out.</span></h1><p>A logic puzzle born from<br className="desktop-break" /> an Ethereum block.</p></div>
      <div className="workspace">
        <section className="round-controls" aria-label="Round controls">
          <div className="round-source"><span>{sourceLabel}</span><button className="icon-button" aria-label="Inspect puzzle source" onClick={() => { setShowLink(false); setDialog('source'); }}><Icon name="info" /></button></div>
          <h2 className="round-name">{blockTitle(input)}</h2>
          <dl className="metrics"><div><dt>Moves</dt><dd><span data-testid="moves">{round.history.length}</span><span className="metric-total"> / {round.puzzle.limit}</span></dd></div><div><dt>Par</dt><dd>{round.puzzle.par}</dd></div><div><dt>{terminal ? 'Score' : 'Potential'}</dt><dd data-testid="score">{score(round)}</dd></div></dl>
          {round.phase === 'ready' ? <button className="button button-primary main-action" ref={startButton} onClick={start}>Play puzzle<Icon name="arrow" /></button>
            : active ? <button className="button button-outline main-action" onClick={() => game({ type: 'hint' })} disabled={round.hintCell !== null}>Show a hint<span>−100 pts</span></button>
            : <button className="button button-primary main-action" onClick={() => restart(true)}>Play again<Icon name="arrow" /></button>}
          <p className="round-guidance" role="status" aria-atomic="true">{round.phase === 'ready' ? `All lights off within ${round.puzzle.limit} moves. No time limit.` : round.phase === 'won' ? `Grid cleared in ${round.history.length} moves. Nicely done.` : round.phase === 'lost' ? 'Out of moves. A fresh attempt starts on the same board.' : round.hintCell !== null ? `Hint: flip tile ${cellName(round.hintCell)}. The marked tile is one move in a shortest solution.` : `${round.puzzle.limit - round.history.length} moves left. Take your time.`}</p>
          {terminal && <button className="text-button" onClick={() => setDialog('result')}>View round result<Icon name="arrow" size={16} /></button>}
          <div className="score-note"><Icon name="bolt" size={18} /><span>Start at 1,000 points. Keep moves close to par.</span></div>
        </section>
        <Board round={round} onPress={press} onUndo={() => { game({ type: 'undo' }); setNotice('Move undone. 50-point penalty applied.'); }} onRestart={() => round.history.length ? setDialog('restart') : restart()} onExport={() => { if (!exporting) void png(); }} />
        <section className="source-panel" aria-label="Choose a puzzle source">
          <div className={`feed-status feed-${feed.status}`} role="status"><span className="status-dot" aria-hidden="true" /><span>{feedLabel}</span></div>
          <p className="feed-detail">{feed.block ? <>Latest: #{integer.format(feed.block.number)}{feed.epoch > 0 ? ` · feed epoch ${feed.epoch}` : ''}<br />{feed.status === 'live' ? newBlock ? 'A new block is ready when you are.' : 'This round stays fixed as blocks arrive.' : feed.status === 'stale' ? 'No fresh block. Your round is safe to continue.' : 'Your current puzzle is still playable.'}</> : feed.status === 'connecting' ? 'Fetching a real block. Demo play is ready below.' : 'Live blocks could not be loaded. Demo and archive play still work.'}</p>
          <button className="button button-outline source-action" disabled={!liveAvailable || !newBlock} onClick={() => feed.block && request({ version: 1, kind: 'block', block: feed.block }, 'live')}><Icon name="bolt" />Load latest block<Icon name="arrow" size={18} /></button>
          {(feed.status === 'unavailable' || feed.status === 'stale') && <button className="text-button" onClick={() => { retry(); setNotice('Retrying the Ethereum API. Your board will stay the same.'); }}>Retry API<Icon name="restart" size={16}/></button>}
          <div className="source-alternatives"><button className="button button-quiet" onClick={() => { demoCount.current = Math.min(1_000_000, demoCount.current + 1); request(demoInput(demoCount.current), 'demo'); }}>Play demo<Icon name="arrow" size={16}/></button><button className="button button-quiet" onClick={() => { setArchiveError(''); setDialog('archive'); }}><Icon name="archive" size={18}/>Open archive</button></div>
          <p className="source-footnote">Live input changes the next puzzle, never a round in progress. Demo puzzles use no live data.</p>
        </section>
      </div>
      <div className="notice" role="status" aria-live="polite">{notice}</div>
      {storageWarning && <p className="storage-warning">{storageWarning}</p>}
    </main>
    <footer className="site-footer container"><button className="text-button" onClick={() => setDialog('source')}>See puzzle source<Icon name="info" size={16}/></button><span>Blocklight · v1</span></footer>

    {dialog === 'help' && <Modal title="How to play" onClose={() => setDialog(null)}>
      <p>Blocklight is a 5 × 5 Lights Out puzzle. Turn every light off before you run out of moves.</p>
      <ol className="how-list"><li><strong>Flip a tile.</strong> It changes itself and the tiles directly above, below, left and right. Edges never wrap.</li><li><strong>Think in crosses.</strong> Pressing the same tile twice cancels out. The outlined tiles show what your next press will change.</li><li><strong>Beat par.</strong> Par is the fewest moves needed from the starting board. Every puzzle is solvable, with eight spare moves.</li></ol>
      <div className="help-example" aria-label="A press flips five tiles in a cross"><div className="mini-grid" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span className={[1, 3, 4, 5, 7].includes(i) ? 'mini-on' : ''} key={i}>{i === 4 ? '+' : ''}</span>)}</div><p>One press.<br />A small chain reaction.</p></div>
      <h3>Points, hints and undo</h3><p>A win starts at 1,000 points. Each move above par costs 40. Each hint costs 100. Undo returns one move and costs 50. A loss scores 0. Restart resets the attempt.</p>
      <h3>Play your way</h3><p>Tap or click a tile. With a keyboard, Tab to the board, use arrow keys to move, and Space or Enter to flip. There is no timer.</p>
      <button className="button button-primary full-width" onClick={() => setDialog(null)}>Back to the puzzle<Icon name="arrow"/></button>
    </Modal>}

    {dialog === 'source' && <Modal title="Inside this puzzle" onClose={() => setDialog(null)} wide>
      <p>{sourceLabel}. {input.kind === 'demo' ? 'This puzzle is generated from a numbered practice seed. It does not use blockchain data.' : 'The block number and full hash determine the starting board. The board stays fixed for the entire round.'}</p>
      <dl className="source-data"><div><dt>Puzzle</dt><dd>{blockTitle(input)}</dd></div><div><dt>Engine</dt><dd>v1 · 5 × 5 Lights Out</dd></div><div><dt>Seed</dt><dd><code>{round.puzzle.seed.toString(16).padStart(8, '0')}</code></dd></div>{input.kind === 'block' && <><div><dt>Block time</dt><dd>{new Date(input.block.timestamp * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</dd></div><div><dt>Full hash</dt><dd><code className="hash">{input.block.hash}</code></dd></div></>}<div><dt>Canonical input</dt><dd><code className="hash">{round.puzzle.key}</code></dd></div></dl>
      {input.kind === 'block' && <p className="source-footnote">Archive and shared puzzle headers are replay inputs, not independently verified chain proofs. <a href={`https://etherscan.io/block/${input.block.number}`} target="_blank" rel="noreferrer">Check this block on Etherscan <Icon name="external" size={16}/></a></p>}
      <div className="export-actions"><button className="button button-primary" disabled={exporting} onClick={() => void png()}><Icon name="download"/>{exporting ? 'Creating PNG…' : 'Save PNG'}</button><button className="button button-outline" onClick={() => { exportJSON(round); setNotice('JSON created. Import it from the archive to replay the original board.'); }}><Icon name="download"/>Export JSON</button><button className="button button-outline" onClick={() => void copyLink()}><Icon name="copy"/>Copy puzzle link</button></div>
      {showLink && <div className="link-label"><label htmlFor="puzzle-link">Puzzle link</label><textarea id="puzzle-link" readOnly value={link.href} onFocus={e => e.currentTarget.select()} rows={4}/></div>}
      <p className="modal-notice" role="status">{notice}</p>
      <details className="technical-details"><summary>How live input works</summary><p>The Ethereum feed polls every 12 seconds. Repeated samples do not create new puzzles. A regression or conflicting adjacent block starts a new feed epoch. After 60 seconds without a changed header, the feed is stale. Frozen rounds and archive replays stay playable.</p><p>Public API: <a href="https://ethereum.publicnode.com/" target="_blank" rel="noreferrer">PublicNode Ethereum</a><br /><code className="hash">{RPC_URL}</code></p><p>No account, wallet, analytics or transaction is required. Up to 30 started puzzles are stored in this browser only.</p></details>
    </Modal>}

    {dialog === 'archive' && <Modal title="Replay a block" onClose={() => setDialog(null)} wide>
      <p>Started puzzles are saved in this browser only. Replays restore the original board with a fresh attempt. One recorded Ethereum block is included to try offline.</p>
      <label className="button button-outline import-button"><Icon name="download"/>Import JSON<input type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/></label>
      {archiveError && <p className="field-error" role="alert">{archiveError}</p>}
      <ul className="archive-list">{archiveItems.map(item => <li key={canonicalKey(item.input)}><button onClick={() => request(item.input, item.input.kind === 'demo' ? 'demo' : 'archive')}><span><strong>{blockTitle(item.input)}</strong><span>{item.input.kind === 'demo' ? 'Demo · offline practice' : 'Archive · unverified replay'}</span></span><Icon name="arrow"/></button></li>)}</ul>
      <p className="source-footnote">Keep an archive beyond this browser with Export JSON in the source details. Imported metadata never sets your board or score.</p>
    </Modal>}

    {dialog === 'result' && <Modal title={round.phase === 'won' ? 'Lights out. Well played.' : 'Out of moves.'} onClose={() => setDialog(null)}>
      <div className={`result-symbol ${round.phase === 'won' ? 'result-win' : ''}`}><Icon name={round.phase === 'won' ? 'check' : 'restart'} size={34}/></div>
      <p>{round.phase === 'won' ? `You cleared ${blockTitle(input).toLowerCase()} in ${round.history.length} moves. Par was ${round.puzzle.par}.` : `The grid still has lights on after ${round.puzzle.limit} moves. The same puzzle is solvable in ${round.puzzle.par}. Give it another try.`}</p>
      <div className="result-score"><span>{integer.format(score(round))}</span><span>points · {round.origin === 'demo' ? 'Demo' : round.origin === 'archive' ? 'Archive replay' : 'Live snapshot'}</span></div>
      <p className="source-footnote">{round.hints} hints · {round.undos} undos. Scores belong to this attempt and are not a shared leaderboard.</p>
      <button className="button button-primary full-width" onClick={() => restart(true)}>Play again<Icon name="restart"/></button>
      <div className="export-actions"><button className="button button-outline" disabled={exporting} onClick={() => void png()}><Icon name="download"/>{exporting ? 'Creating PNG…' : 'Save PNG'}</button><button className="button button-outline" onClick={() => { setShowLink(false); setDialog('source'); }}>See puzzle source<Icon name="info"/></button></div>
      <p className="modal-notice" role="status">{notice}</p>
    </Modal>}

    {dialog === 'replace' && <Modal title="Load a different puzzle?" onClose={() => { pending.current = null; setDialog(null); }}>
      <p>This starts a fresh round and clears your current moves. The current puzzle remains in this browser’s archive if you started it.</p>
      <div className="export-actions"><button className="button button-primary" onClick={() => { if (pending.current) { const next = pending.current; pending.current = null; select(next.input, next.origin); } }}>Load puzzle<Icon name="arrow"/></button><button className="button button-outline" onClick={() => { pending.current = null; setDialog(null); }}>Keep playing</button></div>
    </Modal>}

    {dialog === 'restart' && <Modal title="Restart this puzzle?" onClose={() => setDialog(null)}>
      <p>Your moves, hints and undo penalties will reset. The starting board and par stay the same.</p>
      <div className="export-actions"><button className="button button-primary" onClick={() => restart()}>Restart puzzle<Icon name="restart"/></button><button className="button button-outline" onClick={() => setDialog(null)}>Keep playing</button></div>
    </Modal>}
  </>;
}
