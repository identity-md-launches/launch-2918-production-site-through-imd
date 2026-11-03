import { dependencyRequire } from './dependencies.mjs';
import { serveExport } from './static-server.mjs';
const { chromium } = dependencyRequire('playwright');
const preview = await serveExport();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.route('https://ethereum-rpc.publicnode.com/**', route => route.abort());
  await page.goto(preview.url + '#p=1.d.1');
  await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f5ed'; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = '#202820'; ctx.font = '600 30px Space Grotesk'; ctx.fillText('Blocklight', 72, 85);
    ctx.font = '600 76px Space Grotesk'; ctx.fillText('Every block.', 72, 260); ctx.fillText('Lights out.', 72, 345);
    ctx.font = '400 26px DM Sans'; ctx.fillStyle = '#535f4c'; ctx.fillText('A logic puzzle born from an Ethereum block.', 72, 415);
    ctx.font = '500 21px DM Sans'; ctx.fillText('Free to play. No wallet needed.', 72, 550);
    ctx.fillStyle = '#202820'; ctx.beginPath(); ctx.roundRect(750, 135, 365, 365, 26); ctx.fill();
    const board = 0b1010111011010101011110011;
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = board & 1 << i ? '#d4ed93' : '#65735d';
      ctx.beginPath(); ctx.roundRect(770 + i % 5 * 66, 155 + Math.floor(i / 5) * 66, 61, 61, 10); ctx.fill();
    }
    document.body.replaceChildren(canvas); document.body.style.margin = '0';
  });
  await page.screenshot({ path: 'public/og-image.png', type: 'png' });
  console.log('Created local 1200 × 630 public/og-image.png');
} finally { await browser?.close(); await preview.close(); }
