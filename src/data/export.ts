import { score } from '../core/engine';
import type { Round } from '../core/types';

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function roundName(round: Round): string {
  const input = round.puzzle.input;
  return input.kind === 'demo' ? `demo-${input.index}` : `block-${input.block.number}`;
}

export function exportJSON(round: Round) {
  download(new Blob([JSON.stringify({
    format: 'blocklight-archive', version: 1, input: round.puzzle.input,
    attempt: { phase: round.phase, presses: round.history, hints: round.hints, undos: round.undos, score: round.phase === 'won' ? score(round) : 0 },
    seed: round.puzzle.seed, initialBoard: round.puzzle.initial, par: round.puzzle.par,
  }, null, 2)], { type: 'application/json' }), `blocklight-${roundName(round)}.json`);
}

export async function exportPNG(round: Round): Promise<void> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PNG export is unavailable in this browser. Export the JSON puzzle instead.');
  const text = (value: string, x: number, y: number, size: number, color = '#202820', family = 'DM Sans, sans-serif') => {
    ctx.fillStyle = color; ctx.font = `500 ${size}px ${family}`; ctx.fillText(value, x, y);
  };
  ctx.fillStyle = '#f4f5ed'; ctx.fillRect(0, 0, 1200, 1000);
  text('Blocklight', 60, 88, 38, '#202820', 'Space Grotesk, sans-serif');
  text('Every block. Lights out.', 60, 166, 52, '#202820', 'Space Grotesk, sans-serif');
  const input = round.puzzle.input;
  const source = input.kind === 'demo' ? `Demo ${input.index} · offline practice` : `${round.origin === 'live' ? 'Live snapshot' : 'Archive replay'} · Ethereum block ${input.block.number}`;
  text(source, 60, 220, 24);
  ctx.fillStyle = '#202820'; ctx.beginPath(); ctx.roundRect(60, 264, 530, 530, 24); ctx.fill();
  for (let i = 0; i < 25; i++) {
    const x = 80 + (i % 5) * 100, y = 284 + Math.floor(i / 5) * 100;
    const on = !!(round.board & (1 << i));
    ctx.fillStyle = on ? '#d4ed93' : '#65735d'; ctx.beginPath(); ctx.roundRect(x, y, 90, 90, 14); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 45, y + 45, 6, 0, Math.PI * 2);
    if (on) { ctx.fillStyle = '#202820'; ctx.fill(); } else { ctx.strokeStyle = '#f4f5ed'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  const status = round.phase === 'won' ? 'Lights out.' : round.phase === 'lost' ? 'Out of moves.' : round.phase === 'ready' ? 'Ready to play.' : 'In progress.';
  text(status, 650, 326, 38);
  text(`Moves  ${round.history.length} / ${round.puzzle.limit}`, 650, 400, 28);
  text(`Par  ${round.puzzle.par}`, 650, 448, 28);
  text(`Score  ${round.phase === 'won' ? score(round) : 0}`, 650, 496, 28);
  text(`Hints  ${round.hints}  ·  Undos  ${round.undos}`, 650, 544, 24);
  text(`Engine v1 · Seed ${round.puzzle.seed.toString(16).padStart(8, '0')}`, 650, 640, 20);
  if (input.kind === 'block') {
    text('Block hash', 60, 848, 20);
    text(input.block.hash, 60, 885, 21, '#202820', 'monospace');
  } else {
    text('Demo puzzle. No live blockchain data is used.', 60, 866, 24);
  }
  text('A static snapshot. Replay the original puzzle with its JSON archive or shared link.', 60, 953, 20);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Unable to create a PNG. Try the JSON export.')), 'image/png'));
  download(blob, `blocklight-${roundName(round)}-${round.phase}.png`);
}
