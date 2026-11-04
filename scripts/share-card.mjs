import { readFile } from 'node:fs/promises';
import { dependencyRequire } from './dependencies.mjs';
import { serveExport } from './static-server.mjs';
const { chromium } = dependencyRequire('playwright');
const ts = dependencyRequire('typescript');
async function load(file) {
  const code = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const engine = await load('src/core/engine.ts'), { DEMO_SOURCE } = await load('src/data/archive.ts');
const preview = await serveExport(); let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('https://api.squeekchain.com/**', route => route.abort());
  await page.goto(preview.url + '?mode=demo'); await page.getByRole('button', { name: 'Start garden', exact: true }).click();
  for (const index of engine.solutionSteps(engine.createRun(DEMO_SOURCE))) {
    if (await page.getByRole('button', { name: 'Next garden', exact: true }).count()) break;
    await page.locator(`main [data-cell="${index}"]`).click(); await page.keyboard.press('r');
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    const board = document.querySelector('.garden-board').cloneNode(true);
    const card = document.createElement('div');
    card.style.cssText = 'width:1200px;height:630px;display:grid;grid-template-columns:1fr 480px;align-items:center;gap:45px;padding:52px 60px;background:#0b1021;color:#f2eee4;font-family:DM Sans,sans-serif;';
    const copy = document.createElement('div');
    copy.innerHTML = '<div style="font-size:24px;color:#edc77c;font-family:Space Grotesk,sans-serif;margin-bottom:60px">Squeek Signal Garden</div><div style="font:500 60px/1.08 Space Grotesk,sans-serif;letter-spacing:-2px">Bring the night<br>to bloom.</div><p style="font-size:21px;line-height:1.5;color:#a9b7ca;margin-top:24px">An original Squeekchain puzzle<br>and stream companion.</p><div style="font-size:16px;color:#a9b7ca;margin-top:50px">3 gardens · 3 minutes · No wallet</div>';
    const scene = document.createElement('div'); scene.style.cssText = 'background:#141c31;padding:14px;border-radius:22px;'; scene.append(board);
    card.append(copy, scene); document.body.replaceChildren(card); document.body.style.margin = '0';
    for (const el of document.querySelectorAll('.tile')) el.classList.remove('selected');
    const style = document.createElement('style'); style.textContent = '*{animation:none!important;transition:none!important}.tile-coordinate{display:none}'; document.head.append(style);
  });
  await page.screenshot({ path: 'public/og-image.png', type: 'png', scale: 'css' });
  console.log('Created 1200×630 share card from the actual solved Demo garden.');
} finally { await browser?.close(); await preview.close(); }
