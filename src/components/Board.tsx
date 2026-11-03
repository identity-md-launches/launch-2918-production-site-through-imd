import { useRef, useState, type KeyboardEvent } from 'react';
import { cellName, MASKS, popcount, SIZE } from '../core/engine';
import type { Round } from '../core/types';
import { Icon } from './Icon';

export function Board({ round, onPress, onRestart, onUndo, onExport }: { round: Round; onPress: (cell: number) => void; onRestart: () => void; onUndo: () => void; onExport: () => void }) {
  const [focused, setFocused] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = round.phase === 'playing';
  function navigate(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    let next = i;
    const row = Math.floor(i / SIZE), col = i % SIZE;
    if (event.key === 'ArrowRight') next = row * SIZE + (col + 1) % SIZE;
    else if (event.key === 'ArrowLeft') next = row * SIZE + (col + SIZE - 1) % SIZE;
    else if (event.key === 'ArrowDown') next = ((row + 1) % SIZE) * SIZE + col;
    else if (event.key === 'ArrowUp') next = ((row + SIZE - 1) % SIZE) * SIZE + col;
    else if (event.key === 'Home') next = event.ctrlKey ? 0 : row * SIZE;
    else if (event.key === 'End') next = event.ctrlKey ? SIZE * SIZE - 1 : row * SIZE + SIZE - 1;
    else return;
    event.preventDefault(); setFocused(next); refs.current[next]?.focus();
  }
  const origin = round.origin === 'demo' ? 'Demo puzzle' : round.origin === 'archive' ? 'Archive replay' : 'Live snapshot';
  return <section className="board-section" aria-label="Puzzle board">
    <div className="board-frame">
      <div className="board-topline"><span className="board-origin"><span className="tiny-grid" aria-hidden="true">▦</span>{origin}</span><span>5 × 5</span></div>
      <div className="grid" role="grid" aria-label="5 by 5 Lights Out puzzle" aria-describedby="board-instructions" onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: SIZE }, (_, row) => <div className="grid-row" role="row" key={row}>
          {Array.from({ length: SIZE }, (_, col) => {
            const i = row * SIZE + col, on = !!(round.board & (1 << i));
            const hint = round.hintCell === i;
            const affected = active && hovered !== null && !!(MASKS[hovered] & (1 << i));
            return <div className="grid-cell" role="gridcell" key={i}>
              <button ref={el => { refs.current[i] = el; }} data-cell={i}
                className={`tile${on ? ' tile-on' : ''}${hint ? ' tile-hint' : ''}${affected ? ' tile-affected' : ''}`}
                aria-label={`${cellName(i)}, light ${on ? 'on' : 'off'}${hint ? ', suggested move' : ''}`}
                aria-pressed={on} disabled={!active} tabIndex={i === focused ? 0 : -1}
                onFocus={() => { setFocused(i); setHovered(i); }} onBlur={() => setHovered(null)}
                onMouseEnter={() => setHovered(i)} onKeyDown={e => navigate(e, i)} onClick={() => onPress(i)}>
                <span className="light-mark" aria-hidden="true" />{hint && <span className="hint-label" aria-hidden="true">Hint</span>}
              </button>
            </div>;
          })}
        </div>)}
      </div>
      <div className="board-bottomline"><span>{popcount(round.board)} lights on</span><span>{round.phase === 'ready' ? 'Ready to play' : round.phase === 'won' ? 'Grid cleared' : round.phase === 'lost' ? 'Round finished' : 'Round in progress'}</span></div>
    </div>
    <div className="board-tools">
      <button className="button button-quiet" onClick={onUndo} disabled={!active || !round.history.length} title="Undo a move; costs 50 points"><Icon name="undo" />Undo</button>
      <button className="button button-quiet" onClick={onRestart} disabled={round.phase === 'ready'}><Icon name="restart" />Restart</button>
      <button className="button button-quiet" onClick={onExport}><Icon name="download" />Save PNG</button>
    </div>
    <p id="board-instructions" className="board-instructions">Select a tile to flip it and its neighbors. Turn every light off.</p>
    <p className="keyboard-note">Keyboard: arrow keys to move, Space or Enter to flip.</p>
  </section>;
}
