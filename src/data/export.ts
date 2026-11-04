import { connections } from '../core/engine';
import type { Run } from '../core/types';
import { networkName } from './archive';
import { tileArt } from '../components/art';
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const escape = (value: string) => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
export function gardenSVG(run: Run): string {
  const powered = connections(run.tiles, run.puzzle.source);
  const cells = run.tiles.map((tile, i) => `<g transform="translate(${360 + i % 6 * 80} ${70 + Math.floor(i / 6) * 80})"><rect width="76" height="76" rx="10" fill="${powered.has(i) ? '#202a3b' : '#182139'}"/><g transform="scale(.76)">${tileArt(tile, powered.has(i), run.boosted.includes(i))}</g></g>`).join('');
  const mode = run.source.mode === 'demo' ? 'Demo · offline practice' : run.source.mode === 'archive' ? `Historical round ${run.boardRound}` : `Live Garden · round ${run.boardRound}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#0b1021"/><g fill="#536e8a">${[40, 180, 290, 870, 1020, 1150].map((x, i) => `<circle cx="${x}" cy="${70 + i % 3 * 100}" r="2"/>`).join('')}</g><g font-family="sans-serif"><text x="44" y="70" font-size="28" fill="#f2eee4">Squeek</text><text x="44" y="108" font-size="28" fill="#edc77c">Signal Garden</text><text x="44" y="170" font-size="18" fill="#a9b7ca">${escape(mode)}</text><text x="44" y="204" font-size="16" fill="#a9b7ca">${escape(networkName(run.source.network))}</text><text x="44" y="300" font-size="40" fill="#f2eee4">${run.score} points</text><text x="44" y="340" font-size="18" fill="#a9b7ca">Garden ${run.stage + 1} / 3 · ${escape(run.phase)}</text><text x="44" y="380" font-size="18" fill="#a9b7ca">${run.moves} / ${run.puzzle.limit} rotations</text><text x="44" y="420" font-size="18" fill="#a9b7ca">${run.charges} growth charge${run.charges === 1 ? '' : 's'}</text>${cells}<text x="44" y="590" font-size="16" fill="#a9b7ca">${escape(run.source.timestamp ? `Source: ${run.source.timestamp}` : 'Fixed practice fixture. No live data.')}</text>${run.source.settlement ? `<text x="44" y="620" font-size="14" fill="#a9b7ca">${escape(run.source.settlement.transactionHash)}</text>` : ''}<text x="44" y="652" font-size="14" fill="#a9b7ca">Static snapshot of the current garden · Local score · No token rewards</text></g></svg>`;
}
export async function exportPNG(run: Run): Promise<void> {
  const svg = new Blob([gardenSVG(run)], { type: 'image/svg+xml' }), url = URL.createObjectURL(svg);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 675;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser cannot export a PNG. Try another browser.');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG creation failed. Try again.')), 'image/png'));
    download(blob, `squeek-garden-${run.source.mode}-${run.source.round}.png`);
  } finally { URL.revokeObjectURL(url); }
}
export function overlayURL(run: Run | null): string {
  const url = new URL(location.href); url.hash = ''; url.search = ''; url.searchParams.set('overlay', '1'); url.searchParams.set('controls', '0');
  if (run) { url.searchParams.set('mode', run.source.mode); url.searchParams.set('round', run.source.round); if (run.source.settlement) url.searchParams.set('tx', run.source.settlement.transactionHash); }
  return url.toString();
}
