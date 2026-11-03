import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dependencyRequire } from './dependencies.mjs';
import { serveExport } from './static-server.mjs';

const { chromium, webkit } = dependencyRequire('playwright');
const playwrightTimeout = 8_000;
const AxeBuilder = dependencyRequire('@axe-core/playwright').default;
const output = resolve(process.env.BLOCKLIGHT_REPORTS ?? 'test/scratch/validation');
await mkdir(resolve(output, 'screenshots'), { recursive: true });
await mkdir(resolve(output, 'exports'), { recursive: true });
const report = { generatedAt: new Date().toISOString(), target: 'production dist/ at a /preview/ subpath', checks: [], limitations: [] };
const preview = await serveExport();
const recorded = { number: 26334137, hash: '0x73c0561f039f4a34ba4f92aa094f2932c0370174e6a1271154cb4cd5f9ca316d', timestamp: 1793707247 };
const recordedLink = `#p=1.b.${recorded.number}.${recorded.hash.slice(2)}.${recorded.timestamp}`;
const rpcPattern = '**/ethereum-rpc.publicnode.com/**';
let failures = 0;

async function check(name, callback) {
  try { const evidence = await callback(); report.checks.push({ name, passed: true, evidence: evidence ?? 'Assertions passed.' }); console.log(`PASS ${name}`); }
  catch (error) { failures++; report.checks.push({ name, passed: false, error: error.stack || String(error) }); console.error(`FAIL ${name}: ${error.message}`); }
}
function board(page) { return page.locator('.tile').evaluateAll(tiles => tiles.reduce((a, tile, i) => a | ((tile.getAttribute('aria-pressed') === 'true' ? 1 : 0) << i), 0)); }
function mask(cell) {
  let result = 0;
  const row = Math.floor(cell / 5), col = cell % 5;
  for (let i = 0; i < 25; i++) if (Math.abs(Math.floor(i / 5) - row) + Math.abs(i % 5 - col) <= 1) result |= 1 << i;
  return result;
}
// Independent row-chasing oracle over the rendered board, no app internals exposed.
function solveRendered(input) {
  let best;
  for (let first = 0; first < 32; first++) {
    let grid = input; const steps = [];
    const press = i => { grid ^= mask(i); steps.push(i); };
    for (let c = 0; c < 5; c++) if (first & 1 << c) press(c);
    for (let r = 1; r < 5; r++) for (let c = 0; c < 5; c++) if (grid & 1 << ((r - 1) * 5 + c)) press(r * 5 + c);
    if (!grid && (!best || steps.length < best.length)) best = steps;
  }
  assert(best, 'Rendered board must have a solution'); return best;
}
async function noOverflow(page) {
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert(widths.content <= widths.viewport + 1, JSON.stringify(widths)); return widths;
}
async function downloaded(page, action) {
  const promise = page.waitForEvent('download'); await action(); const download = await promise;
  const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { download, data: Buffer.concat(chunks) };
}
async function offline(page) { await page.route(rpcPattern, route => route.fulfill({ status: 503, body: '{"error":"Deliberate offline test"}', contentType: 'application/json' })); }
async function loadDemo(page, index = 1) {
  await page.goto(preview.url + `#p=1.d.${index}`);
  await page.locator('.tile').first().waitFor(); await page.evaluate(() => document.fonts.ready);
}
async function screenshot(page, name) {
  await page.waitForTimeout(180);
  await page.screenshot({ path: resolve(output, 'screenshots', name), type: 'jpeg', quality: 82, fullPage: true, scale: 'css' });
}

try {
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    let browser;
    try {
      browser = await browserType.launch({ headless: true });
      browser.newPage = async options => {
        const context = await browser.newContext(options);
        const page = await context.newPage(); page.setDefaultTimeout(playwrightTimeout); return page;
      };
    }
    catch (error) { report.limitations.push(`${engine} could not launch: ${error.message}`); console.log(`UNAVAILABLE ${engine}`); continue; }
    try {
      await check(`${engine}: keyboard, focus, hints, undo and confirmed restart`, async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await offline(page); await loadDemo(page);
        const initial = await board(page);
        const play = page.getByRole('button', { name: 'Play puzzle', exact: true });
        await play.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator(':focus').getAttribute('data-cell'), '0');
        await page.keyboard.press('ArrowRight'); assert.equal(await page.locator(':focus').getAttribute('data-cell'), '1');
        await page.keyboard.press('Space'); assert.equal(await board(page), initial ^ mask(1));
        assert.equal(await page.getByTestId('moves').textContent(), '1');
        await page.getByRole('button', { name: 'Undo', exact: true }).click(); assert.equal(await board(page), initial);
        assert.equal(await page.getByTestId('score').textContent(), '950');
        await page.getByRole('button', { name: /Show a hint/ }).click();
        assert.equal(await page.locator('.tile-hint').count(), 1); assert.equal(await page.getByTestId('score').textContent(), '850');
        const help = page.getByRole('button', { name: 'How to play' }); await help.click();
        await page.getByRole('dialog').waitFor();
        for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); assert(await page.locator(':focus').evaluate(el => !!el.closest('dialog'))); }
        await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
        assert(await help.evaluate(el => el === document.activeElement));
        await page.locator('[data-cell="0"]').focus(); await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Restart', exact: true }).click();
        await page.getByRole('button', { name: 'Keep playing', exact: true }).click(); assert.equal(await page.getByTestId('moves').textContent(), '1');
        await page.getByRole('button', { name: 'Restart', exact: true }).click(); await page.getByRole('button', { name: 'Restart puzzle', exact: true }).click();
        assert.equal(await board(page), initial); assert.equal(await page.getByTestId('moves').textContent(), '0'); assert.equal(await page.getByTestId('score').textContent(), '1000');
        assert(await play.isVisible()); assert.deepEqual(errors, []); await page.close();
        return 'Native keyboard activation; roving arrows; hint and undo penalties; dialog focus trap and return; restart cancel/confirm; zero page errors.';
      });

      await check(`${engine}: complete loss, PNG, restart, complete win and JSON replay`, async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
        await offline(page); await loadDemo(page);
        const initial = await board(page);
        const limit = Number((await page.locator('.metric-total').textContent()).replace(/\D/g, ''));
        await page.getByRole('button', { name: 'Play puzzle', exact: true }).click();
        for (let i = 0; i < limit; i++) await page.locator('[data-cell="0"]').click();
        await page.getByRole('heading', { name: 'Out of moves.', exact: true }).waitFor();
        assert.equal(await page.getByTestId('score').textContent(), '0');
        assert(!(await page.getByRole('dialog').innerText()).includes('Round started'), 'Loss dialog must not show a stale start notice');
        const png = await downloaded(page, () => page.getByRole('dialog').getByRole('button', { name: 'Save PNG', exact: true }).click());
        assert.equal(png.data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.data.readUInt32BE(16), 1200); assert.equal(png.data.readUInt32BE(20), 1000); assert(png.data.length > 10_000);
        if (engine === 'chromium') await png.download.saveAs(resolve(output, 'exports', 'demo-loss.png'));
        await page.getByRole('dialog').getByRole('button', { name: 'Play again', exact: true }).click(); assert.equal(await board(page), initial);
        const solution = solveRendered(await board(page));
        for (const cell of solution) await page.locator(`[data-cell="${cell}"]`).click();
        await page.getByRole('heading', { name: 'Lights out. Well played.', exact: true }).waitFor(); assert.equal(await board(page), 0);
        assert.equal(await page.getByTestId('score').textContent(), '1000');
        if (engine === 'chromium') await screenshot(page, 'win-desktop.jpg');
        await page.getByRole('dialog').getByRole('button', { name: 'See puzzle source', exact: true }).click();
        const exported = await downloaded(page, () => page.getByRole('button', { name: 'Export JSON', exact: true }).click());
        const payload = JSON.parse(exported.data.toString()); assert.equal(payload.input.kind, 'demo'); assert.equal(payload.attempt.score, 1000);
        if (engine === 'chromium') await exported.download.saveAs(resolve(output, 'exports', 'demo-round.json'));
        await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Deliberately denied'); } } }); });
        await page.getByRole('button', { name: 'Copy puzzle link', exact: true }).click();
        assert((await page.getByLabel('Puzzle link', { exact: true }).inputValue()).endsWith('#p=1.d.1'));
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Play demo', exact: true }).click();
        await page.getByRole('button', { name: 'Open archive', exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('no json') });
        await page.getByRole('alert').waitFor();
        await page.locator('input[type="file"]').setInputFiles({ name: 'round.json', mimeType: 'application/json', buffer: exported.data });
        await page.getByRole('button', { name: 'Play puzzle', exact: true }).waitFor(); assert.equal(await board(page), initial);
        await page.getByRole('button', { name: 'Open archive', exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles({ name: 'block.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ input: { version: 1, kind: 'block', block: recorded }, initialBoard: 0, score: 999999 })) });
        await page.locator('.round-source').filter({ hasText: 'Archive · unverified replay' }).waitFor();
        const blockBoard = await board(page); assert(blockBoard > 0); assert.equal(await page.getByTestId('score').textContent(), '1000');
        await page.goto(preview.url + recordedLink); await page.locator('.tile').first().waitFor(); assert.equal(await board(page), blockBoard);
        await page.close();
        return `Loss at ${limit} moves; valid 1200×1000 PNG; optimal ${solution.length}-move win at 1,000 points; clipboard fallback; invalid import recovery; demo and block JSON/link reproduction.`;
      });

      await check(`${engine}: touch flow at 390, first-screen action and dialog`, async () => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
        const page = await context.newPage(); await offline(page); await loadDemo(page, 7);
        const action = page.getByRole('button', { name: 'Play puzzle', exact: true });
        const box = await action.boundingBox(); assert(box && box.y + box.height <= 844); assert(await page.locator('.grid').isVisible()); await noOverflow(page);
        if (engine === 'chromium') await screenshot(page, 'demo-mobile.jpg');
        const initial = await board(page); await action.tap(); await page.locator('[data-cell="12"]').tap();
        assert.equal(await board(page), initial ^ mask(12));
        await page.getByRole('button', { name: /Show a hint/ }).tap(); assert.equal(await page.locator('.tile-hint').count(), 1);
        await page.locator('.tile-hint').tap(); assert.equal(await page.getByTestId('moves').textContent(), '2');
        await page.getByRole('button', { name: 'How to play', exact: true }).tap(); await page.getByRole('dialog').waitFor();
        await noOverflow(page); if (engine === 'chromium') await screenshot(page, 'help-mobile.jpg');
        await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
        await page.getByRole('button', { name: 'Restart', exact: true }).tap(); await page.getByRole('button', { name: 'Restart puzzle', exact: true }).tap();
        assert.equal(await board(page), initial); assert.equal(await page.getByTestId('moves').textContent(), '0');
        // A first tile tap in the ready state starts the round and counts as a move.
        const [first, ...rest] = solveRendered(await board(page));
        assert(await page.locator(`[data-cell="${first}"]`).isEnabled());
        await page.locator(`[data-cell="${first}"]`).tap();
        assert.equal(await board(page), initial ^ mask(first)); assert.equal(await page.getByTestId('moves').textContent(), '1');
        assert(await page.getByRole('button', { name: /Show a hint/ }).evaluate(el => !el.classList.contains('button-primary')), 'Hint penalty must not use the primary style');
        for (const cell of rest) await page.locator(`[data-cell="${cell}"]`).tap();
        await page.getByRole('heading', { name: 'Lights out. Well played.', exact: true }).waitFor();
        assert.equal(await page.getByTestId('score').textContent(), '1000');
        assert(!(await page.getByRole('dialog').innerText()).includes('Round started'), 'Result dialog must not show a stale start notice');
        if (engine === 'chromium') await screenshot(page, 'win-mobile.jpg');
        await page.getByRole('dialog').getByRole('button', { name: 'Play again', exact: true }).tap();
        const limit = Number((await page.locator('.metric-total').textContent()).replace(/\D/g, ''));
        for (let i = 0; i < limit; i++) await page.locator('[data-cell="0"]').tap();
        await page.getByRole('heading', { name: 'Out of moves.', exact: true }).waitFor();
        const png = await downloaded(page, () => page.getByRole('dialog').getByRole('button', { name: 'Save PNG', exact: true }).tap());
        assert.equal(png.data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        await context.close(); return 'Touch emulation, not a physical phone. Primary action wholly above 844px; all 25 tiles render; center cross, hint, help, confirmed restart, tile tap starts a ready round, full win/loss with no stale notice, and PNG download work.';
      });

      await check(`${engine}: unavailable API, retry and active-round protection`, async () => {
        const page = await browser.newPage(); let available = false;
        await page.route(rpcPattern, async route => {
          if (!available) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { number: '0x191d3b9', hash: recorded.hash, parentHash: '0x' + 'a'.repeat(64), timestamp: `0x${(Math.floor(Date.now() / 1000) - 3).toString(16)}` } }) });
        });
        await page.goto(preview.url); await page.getByText('Ethereum API unavailable', { exact: true }).waitFor();
        assert((await page.locator('.round-source').textContent()).includes('Demo · offline practice'));
        assert(await page.getByRole('button', { name: 'Load latest block', exact: true }).isDisabled());
        await page.getByRole('button', { name: 'Play puzzle', exact: true }).click(); await page.locator('[data-cell="0"]').click();
        const frozen = await board(page); available = true; await page.getByRole('button', { name: 'Retry API', exact: true }).click();
        await page.getByText('Ethereum feed is live', { exact: true }).waitFor(); assert.equal(await board(page), frozen);
        assert((await page.locator('.round-source').textContent()).includes('Demo · offline practice'));
        await page.getByRole('button', { name: 'Load latest block', exact: true }).click(); await page.getByRole('button', { name: 'Keep playing', exact: true }).click(); assert.equal(await board(page), frozen);
        await page.getByRole('button', { name: 'Load latest block', exact: true }).click(); await page.getByRole('button', { name: 'Load puzzle', exact: true }).click();
        assert((await page.locator('.round-source').textContent()).includes('Live snapshot'));
        assert.equal(await page.getByTestId('moves').textContent(), '0'); await page.close();
        return 'Deliberate HTTP 503 is plainly labeled; demo remains playable; retry does not replace active board; switching blocks requires confirmation.';
      });

      await check(`${engine}: idle live input, repeat samples and stale UI (virtual clock)`, async () => {
        const page = await browser.newPage(); let advanced = false;
        await page.clock.install();
        await page.route(rpcPattern, async route => {
          const n = advanced ? 1 : 0;
          const now = await page.evaluate(() => Date.now());
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {
            number: `0x${(recorded.number + n).toString(16)}`, hash: n ? '0x' + 'b'.repeat(64) : recorded.hash,
            parentHash: n ? recorded.hash : '0x' + 'a'.repeat(64), timestamp: `0x${(Math.floor(now / 1000) - 3).toString(16)}`,
          } }) });
        });
        await page.goto(preview.url); await page.getByText('Ethereum feed is live', { exact: true }).waitFor();
        const initial = await board(page), title = await page.locator('.round-name').textContent();
        advanced = true;
        await page.clock.fastForward(12_100); await page.locator('.feed-detail').filter({ hasText: 'A new block is ready when you are.' }).waitFor();
        assert.equal(await board(page), initial); assert.equal(await page.locator('.round-name').textContent(), title);
        await page.getByRole('button', { name: 'Play puzzle', exact: true }).click();
        for (let i = 0; i < 6; i++) { await page.clock.fastForward(12_100); await page.waitForFunction(() => document.querySelectorAll('.tile').length === 25); await page.evaluate(() => Promise.resolve()); }
        await page.getByText('Ethereum feed is stale', { exact: true }).waitFor();
        assert.equal(await board(page), initial); assert(await page.getByRole('button', { name: 'Load latest block', exact: true }).isDisabled());
        await page.locator('[data-cell="0"]').click(); assert.equal(await page.getByTestId('moves').textContent(), '1');
        await page.close(); return 'Controlled API headers and virtual time: new blocks and repeats leave ready/active boards fixed; stale feed disables new live input while gameplay continues.';
      });

      await check(`${engine}: responsive reflow, text enlargement, motion and accessibility`, async () => {
        const page = await browser.newPage(); await offline(page); await loadDemo(page, 9);
        const widths = [];
        for (const width of [320, 390, 768, 960, 1440]) { await page.setViewportSize({ width, height: 1000 }); widths.push(await noOverflow(page)); }
        await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; }); await noOverflow(page);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.documentElement.dir = 'rtl'; }); await noOverflow(page);
        await page.evaluate(() => { document.documentElement.dir = 'ltr'; });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('.tile').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
        const ready = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        assert.deepEqual(ready.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), []);
        await page.getByRole('button', { name: 'Play puzzle', exact: true }).click();
        await page.getByRole('button', { name: /Show a hint/ }).click();
        const active = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        assert.deepEqual(active.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), []);
        await page.getByRole('button', { name: 'How to play', exact: true }).click();
        const modal = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        assert.deepEqual(modal.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), []);
        await page.close(); return { widths, textEnlargement: '200% root font size, not native browser zoom', axe: { ready: ready.violations.length, active: active.violations.length, helpDialog: modal.violations.length }, reducedMotion: 'No tile transition' };
      });

      await check(`${engine}: rendered contrast and visible keyboard focus`, async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await offline(page); await loadDemo(page);
        const primary = await page.locator('.button-primary.main-action').evaluate(el => { const s = getComputedStyle(el); return { color: s.color, backgroundColor: s.backgroundColor }; });
        await page.getByRole('button', { name: 'Play puzzle', exact: true }).focus();
        await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight');
        await page.locator('[data-cell="0"]').focus();
        await page.waitForTimeout(160);
        const measured = await page.evaluate(primary => {
          const style = selector => getComputedStyle(document.querySelector(selector));
          const lum = value => {
            const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
          };
          const contrast = (a, b) => { const sorted = [lum(a), lum(b)].sort((x, y) => y - x); return +((sorted[0] + .05) / (sorted[1] + .05)).toFixed(3); };
          const root = style(':root'), frame = style('.board-frame'), off = style('.tile:not(.tile-on)'), on = style('.tile-on'), button = style('.main-action'), muted = style('.round-guidance'), focus = style(':focus-visible');
          return {
            pairs: [
              ['body text / page', root.color, root.backgroundColor, 4.5],
              ['muted text / page', muted.color, root.backgroundColor, 4.5],
              ['board text / board', frame.color, frame.backgroundColor, 4.5],
              ['unlit tile / board', off.backgroundColor, frame.backgroundColor, 3],
              ['unlit marker and hint / tile', off.color, off.backgroundColor, 4.5],
              ['lit marker / tile', on.color, on.backgroundColor, 3],
              ['primary button text / fill', primary.color, primary.backgroundColor, 4.5],
              ['hint button text / page', button.color, root.backgroundColor, 4.5],
              ['board focus ring / board', focus.outlineColor, frame.backgroundColor, 3],
            ].map(([name, foreground, background, required]) => ({ name, foreground, background, required, ratio: contrast(foreground, background) })),
            focus: { width: focus.outlineWidth, offset: focus.outlineOffset, style: focus.outlineStyle },
          };
        }, primary);
        for (const pair of measured.pairs) assert(pair.ratio >= pair.required, JSON.stringify(pair));
        assert.equal(measured.focus.width, '3px'); assert.equal(measured.focus.style, 'solid');
        if (engine === 'chromium') await screenshot(page, 'keyboard-focus-desktop.jpg');
        await page.emulateMedia({ forcedColors: 'active' }); await noOverflow(page);
        await page.close(); return measured;
      });

      if (engine === 'chromium') await check('chromium: actual public API and production screenshots', async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = [], missing = [];
        if (process.env.BLOCKLIGHT_VALIDATION_RPC) await page.route(rpcPattern, async route => {
          try {
            const response = await fetch(process.env.BLOCKLIGHT_VALIDATION_RPC, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: route.request().postData(), signal: AbortSignal.timeout(8_000),
            });
            await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
          } catch { await route.abort(); }
        });
        page.on('pageerror', e => errors.push(e.message));
        page.on('response', response => { if (response.url().startsWith(preview.url) && response.status() >= 400) missing.push(response.url()); });
        await page.goto(preview.url); await page.locator('.tile').first().waitFor();
        await page.waitForFunction(() => !document.querySelector('.feed-connecting'), { timeout: 12_000 }); await page.evaluate(() => document.fonts.ready);
        const observed = await page.locator('.feed-status').textContent();
        const source = await page.locator('.round-source').textContent(); const title = await page.locator('.round-name').textContent();
        await screenshot(page, 'production-desktop.jpg');
        await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(page); await screenshot(page, 'production-mobile.jpg');
        const box = await page.getByRole('button', { name: 'Play puzzle', exact: true }).boundingBox(); assert(box && box.y + box.height < 844);
        assert.deepEqual(errors, []); assert.deepEqual(missing, []);
        assert(await page.evaluate(() => document.fonts.check('500 16px "DM Sans"') && document.fonts.check('600 32px "Space Grotesk"')));
        const og = await page.request.get(preview.url + 'og-image.png'); assert(og.ok());
        const ogData = await og.body(); assert.equal(ogData.readUInt32BE(16), 1200); assert.equal(ogData.readUInt32BE(20), 630);
        await page.close(); return { observed, source, title, transport: process.env.BLOCKLIGHT_VALIDATION_RPC ? 'Contributor Ethereum RPC used for this machine check; production URL is PublicNode.' : 'PublicNode directly.', localResourceFailures: missing.length, pageErrors: errors.length, fontsLoaded: true, shareCard: '1200×630 local PNG' };
      });
    } finally { await browser.close(); }
  }
} finally {
  await preview.close();
  report.limitations.push('No physical phone or assistive screen-reader session. Text enlargement is not browser-native zoom. External API checks reflect this run, not future uptime. Mocked API tests are explicitly identified above.');
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(`${report.checks.filter(c => c.passed).length}/${report.checks.length} browser checks passed; ${report.limitations.length} limitation records.`);
if (!report.checks.length || failures) process.exitCode = 1;
