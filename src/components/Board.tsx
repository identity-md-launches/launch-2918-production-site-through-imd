import { useRef, useState } from 'react';
import { cellName, connections, ports, tileName } from '../core/engine';
import type { Run } from '../core/types';
import { tileArt } from './art';
export function Board({ run, onSelect, onRotate, disabled = false, tutorialTarget }: { run: Run; onSelect: (index: number) => void; onRotate: () => void; disabled?: boolean; tutorialTarget?: number }) {
  const [focus, setFocus] = useState(run.selected);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const powered = connections(run.tiles, run.puzzle.source);
  return <div className="garden-board" role="group" aria-label={`Garden ${run.stage + 1}, six by six conduit puzzle`}>
    {run.tiles.map((tile, i) => <button key={i} type="button" ref={el => { buttons.current[i] = el; }}
      className={`tile tile-${tile.kind}${powered.has(i) ? ' powered' : ''}${run.selected === i ? ' selected' : ''}${run.boosted.includes(i) ? ' boosted' : ''}${tutorialTarget === i ? ' tutorial-target' : ''}`}
      aria-label={`${cellName(i)}, ${tileName(tile)}${tile.mask ? `, ${ports(tile.mask)}` : ''}${powered.has(i) ? ', powered' : ''}${run.boosted.includes(i) ? ', growth charged' : ''}`}
      aria-pressed={run.selected === i} aria-disabled={disabled || undefined} data-cell={i} data-mask={tile.mask} data-kind={tile.kind}
      tabIndex={!disabled && focus === i ? 0 : -1} onFocus={() => setFocus(i)}
      onClick={() => { if (!disabled) { setFocus(i); onSelect(i); } }}
      onKeyDown={e => {
        if (disabled) return;
        const row = Math.floor(i / 6), col = i % 6;
        const next = e.key === 'ArrowRight' ? row * 6 + (col + 1) % 6 : e.key === 'ArrowLeft' ? row * 6 + (col + 5) % 6 : e.key === 'ArrowDown' ? ((row + 1) % 6) * 6 + col : e.key === 'ArrowUp' ? ((row + 5) % 6) * 6 + col : -1;
        if (next >= 0) { e.preventDefault(); buttons.current[next]?.focus(); }
        if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey && !disabled) { e.preventDefault(); onRotate(); }
      }}>
      <svg viewBox="0 0 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: tileArt(tile, powered.has(i), run.boosted.includes(i)) }} />
      {run.selected === i && <span className="tile-coordinate" aria-hidden="true">{cellName(i)}</span>}
      {tile.kind === 'beacon' && <span className="beacon-mark" aria-hidden="true">{run.boosted.includes(i) ? '+' : powered.has(i) ? '✓' : '○'}</span>}
    </button>)}
  </div>;
}
