import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dependencyRequire } from './dependencies.mjs';
import { serveExport } from './static-server.mjs';
const { chromium, webkit } = dependencyRequire('playwright');
const ts = dependencyRequire('typescript');
const AxeBuilder = dependencyRequire('@axe-core/playwright').default;
const output = resolve('test/scratch/validation');
await mkdir(resolve(output, 'screenshots'), { recursive: true });
await mkdir(resolve(output, 'exports'), { recursive: true });
async function moduleFrom(file, name) {
  const code = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const path = resolve(output, name + '.mjs'); await writeFile(path, code); return import(pathToFileURL(path));
}
const engine = await moduleFrom('src/core/engine.ts', 'engine');
const fixtures = await moduleFrom('tests/fixtures.ts', 'fixtures');
const adapter = await moduleFrom('src/data/archive.ts', 'adapter');
const { DEMO_SOURCE } = adapter;
const report = { generatedAt: new Date().toISOString(), target: 'production dist/ at /preview/ subpath', checks: [], limitations: [] };
const preview = await serveExport(); let failures = 0;
async function check(name, callback) {
  try { const evidence = await callback(); report.checks.push({ name, passed: true, evidence: evidence ?? 'Assertions passed.' }); console.log(`PASS ${name}`); }
  catch (error) { failures++; report.checks.push({ name, passed: false, error: error.stack || String(error) }); console.error(`FAIL ${name}: ${error.message}`); }
}
const apiPattern = 'https://api.squeekchain.com/v1/**';
async function offline(page) { await page.route(apiPattern, r => r.fulfill({ status: 503, body: '{}', contentType: 'application/json' })); }
async function mock(page, override = {}) {
  await page.route(apiPattern, r => {
    const path = new URL(r.request().url()).pathname;
    const body = path.includes('settlements') ? override.archive?.() ?? fixtures.archiveJSON : path.includes('economy') ? override.economy?.() ?? fixtures.economyJSON : override.status?.() ?? fixtures.statusJSON;
    return r.fulfill({ status: 200, body: JSON.stringify(body), contentType: 'application/json' });
  });
}
async function loadDemo(page) { await page.goto(preview.url + '?mode=demo'); await page.getByRole('button', { name: 'Start garden', exact: true }).waitFor(); }
const board = page => page.locator('main .tile');
async function masks(page) { return board(page).evaluateAll(tiles => tiles.map(t => Number(t.dataset.mask))); }
async function noOverflow(page) { const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth })); assert(size.content <= size.viewport + 1, JSON.stringify(size)); return size; }
async function shot(page, name, fullPage = true) { await page.screenshot({ path: resolve(output, 'screenshots', name), fullPage, type: 'png', scale: 'css' }); }
async function download(page, action, filename) {
  const pending = page.waitForEvent('download'); await action(); const d = await pending; await d.saveAs(resolve(output, 'exports', filename));
  const data = await readFile(resolve(output, 'exports', filename)); return data;
}
async function clearBoard(page, key, stage, touch = false) {
  const expected = engine.createPuzzle(key, stage), actual = await masks(page);
  assert.deepEqual(actual, expected.tiles.map(t => t.mask), 'Rendered initial board must match its pinned seed');
  let logical = { ...engine.createRun(DEMO_SOURCE), puzzle: expected, tiles: expected.tiles.map(t => ({ ...t })), stage, phase: 'playing' };
  for (const index of engine.solutionSteps(logical)) {
    if (await page.getByRole('button', { name: stage === 2 ? 'Finish the garden' : 'Next garden', exact: true }).count()) break;
    const cell = page.locator(`main [data-cell="${index}"]`);
    if (touch) { await cell.tap(); await page.getByRole('button', { name: /^Rotate/ }).tap(); }
    else { await cell.click(); await page.keyboard.press('r'); }
  }
  assert.equal(await page.locator('.board-topline').innerText().then(t => t.includes('4 / 4 connected')), true);
}
try {
  for (const [name, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    let browser;
    try { browser = await browserType.launch({ headless: true }); }
    catch (error) { report.limitations.push(`${name} unavailable: ${error.message}`); console.log(`UNAVAILABLE ${name}: ${error.message.split('\n').slice(0, 3).join(' ')}`); continue; }
    async function page(options = {}) { const context = await browser.newContext(options); const p = await context.newPage(); p.setDefaultTimeout(8000); return p; }
    try {
      await check(`${name}: interactive tutorial, modal keyboard trap and focus return`, async () => {
        const p = await page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await offline(p); await loadDemo(p);
        const help = p.getByRole('button', { name: 'How to play', exact: true }); await help.tap();
        const dialog = p.getByRole('dialog'); await dialog.waitFor();
        const audit = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); assert.deepEqual(audit.violations.map(v => v.id), []);
        for (let i = 0; i < 5; i++) { await p.keyboard.press('Tab'); assert(await p.locator(':focus').evaluate(el => !!el.closest('dialog'))); }
        await dialog.locator('.tutorial-target').tap(); await dialog.getByRole('button', { name: /Rotate clockwise/ }).tap();
        await dialog.locator('.tutorial-target').tap(); await dialog.getByRole('button', { name: /Grow beacon/ }).tap();
        await dialog.getByRole('button', { name: 'Play a full garden' }).tap(); assert.equal(await dialog.count(), 0);
        assert(await help.evaluate(el => el === document.activeElement)); await p.close();
        return 'Four tutorial steps completed by touch; WCAG-tagged axe scan 0 violations; dialog traps Tab and restores focus.';
      });
      await check(`${name}: keyboard selection/rotation, pause, help, restart and saved progress`, async () => {
        const p = await page({ viewport: { width: 1440, height: 1000 } }); await offline(p); await loadDemo(p);
        const errors = []; p.on('pageerror', e => errors.push(e.message));
        const initial = await masks(p); await p.getByRole('button', { name: 'Start garden', exact: true }).focus(); await p.keyboard.press('Enter');
        await p.locator('main .tile:focus').waitFor(); assert(await p.locator(':focus').evaluate(el => el.classList.contains('tile')));
        const index = Number(await p.locator(':focus').getAttribute('data-cell')); await p.keyboard.press('ArrowRight'); assert.equal(Number(await p.locator(':focus').getAttribute('data-cell')), Math.floor(index / 6) * 6 + (index % 6 + 1) % 6);
        await p.locator(`main [data-cell="${index}"]`).focus(); await p.keyboard.press('Enter'); assert.deepEqual(await masks(p), initial); await p.keyboard.press('r'); assert((await p.getByTestId('moves').innerText()).startsWith('1'));
        await p.getByRole('button', { name: 'Pause', exact: true }).click(); assert.equal(await p.locator('main .garden-board [tabindex="0"]').count(), 0); const pausedTimer = await p.getByTestId('timer').innerText();
        await p.clock.install(); await p.clock.fastForward(10000); assert.equal(await p.getByTestId('timer').innerText(), pausedTimer);
        await p.getByRole('button', { name: 'Resume garden', exact: true }).first().click();
        const changed = await masks(p); await p.reload(); await p.getByRole('button', { name: 'Resume garden', exact: true }).first().waitFor(); assert.deepEqual(await masks(p), changed);
        await p.getByRole('button', { name: 'Restart', exact: true }).click(); await p.getByRole('button', { name: 'Keep playing' }).click(); assert.deepEqual(await masks(p), changed);
        await p.getByRole('button', { name: 'Restart', exact: true }).click(); await p.getByRole('button', { name: 'Restart run', exact: true }).click(); assert.deepEqual(await masks(p), initial); assert.equal(await p.getByTestId('timer').innerText(), '3:00');
        assert.deepEqual(errors, []); await p.close(); return 'Enter selects without spending; arrows move focus; R rotates; pause freezes virtual time; reload restores paused board; restart cancel/confirm works.';
      });
      await check(`${name}: full three-garden win, growth spending, best, PNG, overlay URL fallback`, async () => {
        const p = await page({ viewport: { width: 1440, height: 1000 } }); await offline(p); await loadDemo(p); await p.getByRole('button', { name: 'Start garden', exact: true }).click();
        for (let stage = 0; stage < 3; stage++) {
          await clearBoard(p, DEMO_SOURCE.key, stage);
          if (stage === 0) {
            const flower = p.locator('main .tile-beacon').first(); await flower.click(); const before = Number(await p.getByTestId('score').innerText());
            await p.getByRole('button', { name: /^Grow / }).click(); assert.equal(Number(await p.getByTestId('score').innerText()), before + 150); assert(await p.getByRole('button', { name: /^Grow / }).isDisabled());
          }
          await p.getByRole('button', { name: stage === 2 ? 'Finish the garden' : 'Next garden', exact: true }).click();
        }
        await p.getByRole('heading', { name: 'The night is in bloom.' }).waitFor(); await shot(p, 'win-desktop.png');
        const png = await download(p, () => p.getByRole('dialog').getByRole('button', { name: 'Export garden PNG', exact: true }).click(), 'garden-win.png');
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 675);
        await p.getByRole('button', { name: 'Close dialog' }).click();
        const best = await p.locator('.run-extras').innerText(); assert(!best.endsWith('Local best 0'));
        await p.getByRole('button', { name: 'Share / stream', exact: true }).click(); await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('deliberate denial'); } } }); });
        await p.getByRole('button', { name: 'Copy overlay URL', exact: true }).click(); const url = await p.locator('textarea').inputValue(); assert(url.includes('overlay=1') && url.includes('controls=0') && url.includes('mode=demo')); await p.close();
        return 'All 3 boards won via UI; charge spent once for +150; Demo best persisted; real 1200×675 PNG downloaded; denied clipboard exposes complete manual-copy URL.';
      });
      await check(`${name}: complete mobile touch win, genuine move-loss, restart and first screen`, async () => {
        const p = await page({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await offline(p); await loadDemo(p);
        const box = await p.getByRole('button', { name: 'Start garden', exact: true }).boundingBox(); assert(box && box.y >= 0 && box.y + box.height <= 844, JSON.stringify(box)); await noOverflow(p); await shot(p, 'demo-390.png', false);
        await p.getByRole('button', { name: 'Start garden', exact: true }).tap();
        for (let stage = 0; stage < 3; stage++) { await clearBoard(p, DEMO_SOURCE.key, stage, true); await p.getByRole('button', { name: stage === 2 ? 'Finish the garden' : 'Next garden', exact: true }).tap(); }
        await p.getByRole('heading', { name: 'The night is in bloom.' }).waitFor(); await p.getByRole('button', { name: 'Play again', exact: true }).tap();
        await p.getByRole('button', { name: 'Start garden', exact: true }).tap(); const first = p.locator('main [data-kind="conduit"]').first(); await first.tap();
        const limit = engine.createPuzzle(DEMO_SOURCE.key).limit; for (let n = 0; n < limit; n++) await p.getByRole('button', { name: /^Rotate/ }).tap();
        await p.getByRole('heading', { name: 'The garden will wait.' }).waitFor(); assert((await p.getByRole('dialog').innerText()).includes('last rotation')); await shot(p, 'loss-mobile.png');
        await p.getByRole('button', { name: 'Play again', exact: true }).tap(); assert((await p.getByTestId('moves').innerText()).startsWith('0')); await p.close();
        return `390×844 main action fully visible; full 3-board win by taps without dragging; actual loss at ${limit} moves; Play again resets game.`;
      });
      await check(`${name}: idle Live Garden, repeats, energy cap, epoch/reconnect and next-board seed`, async () => {
        const p = await page({ viewport: { width: 1440, height: 1000 } }); await p.clock.install({ time: new Date(fixtures.NOW) });
        let mm = 0, work = 0, epoch = 'test-epoch-a', round = '1221', unavailable = false;
        await p.route(apiPattern, r => {
          if (unavailable) return r.fulfill({ status: 503, body: '{}' });
                    // The page's virtual Date is used in generatedAt/observedAt to avoid real-clock fixtures going stale.
          return p.evaluate(() => new Date().toISOString()).then(iso => {
            const path = new URL(r.request().url()).pathname;
            const json = path.includes('economy') ? { ...fixtures.economyJSON, generatedAt: iso, lifecycle: { currentRound: round } } : path.includes('settlements') ? { ...fixtures.archiveJSON, generatedAt: iso } : { ...fixtures.statusJSON, generatedAt: iso, measurement: { ...fixtures.statusJSON.measurement, observedAt: iso, counterEpoch: epoch, distanceMm: 4500000 + mm, cumulativeWorkUnits: String(90000 + work) } };
            return r.fulfill({ status: 200, body: JSON.stringify(json), contentType: 'application/json' });
          });
        });
        await p.goto(preview.url + '?mode=live'); await p.getByRole('button', { name: 'Start garden', exact: true }).click();
        const initial = await masks(p); assert((await p.locator('.source-line').innerText()).includes('idle')); assert((await p.locator('.aside-title').innerText()).includes('0 / 3'));
        await p.clock.fastForward(11000); assert.deepEqual(await masks(p), initial); assert((await p.locator('.aside-title').innerText()).includes('0 / 3'));
        mm = 10000; work = 10; await p.clock.fastForward(11000); await p.waitForFunction(() => document.querySelector('.aside-title')?.textContent.includes('3 / 3')); assert((await p.locator('.aside-title').innerText()).includes('3 / 3'));
        epoch = 'test-epoch-b'; mm = 20000; work = 20; await p.clock.fastForward(11000); await p.waitForFunction(() => document.querySelector('.source-details')?.textContent.toLowerCase().includes('rebaselined')); assert((await p.locator('.aside-title').innerText()).includes('3 / 3')); assert((await p.locator('.source-details').innerText()).toLowerCase().includes('rebaselined'));
        unavailable = true; await p.clock.fastForward(11000); await p.waitForFunction(() => document.querySelector('.source-line')?.textContent.includes('unavailable')); assert((await p.locator('.source-line').innerText()).includes('unavailable')); assert.deepEqual(await masks(p), initial);
        unavailable = false; round = '1222'; await p.getByRole('button', { name: 'Retry source', exact: true }).click(); await p.clock.fastForward(1000); await p.waitForFunction(() => document.querySelector('.source-details')?.textContent.includes('Reconnected'));
        assert.deepEqual(await masks(p), initial); assert((await p.locator('.source-details').innerText()).includes('Reconnected'));
        await clearBoard(p, 'signal-garden/v1|live|11155111|test-installation|test-release|test-epoch-a|1221', 0);
        await p.getByRole('button', { name: 'Next garden', exact: true }).click();
        const nextPuzzle = engine.createPuzzle('signal-garden/v1|live|11155111|test-installation|test-release|test-epoch-b|1222', 1);
        assert.deepEqual(await masks(p), nextPuzzle.tiles.map(t => t.mask)); assert((await p.locator('.source-line').innerText()).includes('1222'));
        await p.close(); return 'Idle live starts at zero energy; repeated samples award nothing; new paired movement caps reservoir at 3; epoch and outage rebaseline; board survives all feed changes.';
      });
      await check(`${name}: historical round pinning, selection, actual network and cross-device reproduction`, async () => {
        const archive = { ...fixtures.archiveJSON, recentSettlements: [fixtures.settlementJSON, { ...fixtures.settlementJSON, transactionHash: '0x' + 'b'.repeat(64), settledThroughRound: '1201', workAdded: '99' }, { ...fixtures.settlementJSON, transactionHash: '0x' + 'c'.repeat(64), workAdded: '250' }] };
        const p = await page({ viewport: { width: 1440, height: 1000 } }); await mock(p, { archive: () => archive }); await p.goto(preview.url);
        await p.getByRole('button', { name: 'Start garden', exact: true }).waitFor(); assert((await p.locator('.source-line').innerText()).includes('Historical round 1214'));
        assert((await p.locator('.source-details').innerText()).includes('Sepolia testnet · 11155111')); assert((await p.getByRole('link', { name: 'View round transaction' }).getAttribute('href')).startsWith('https://sepolia.etherscan.io/'));
        const first = await masks(p); const p2 = await page({ viewport: { width: 390, height: 844 } }); await mock(p2, { archive: () => archive }); await p2.goto(preview.url); await p2.getByRole('button', { name: 'Start garden', exact: true }).waitFor(); assert.deepEqual(await masks(p2), first);
        await p.getByRole('button', { name: 'Change round', exact: true }).click(); await p.getByRole('button', { name: /Round 1201/ }).click(); assert((await p.locator('.source-line').innerText()).includes('1201')); assert.notDeepEqual(await masks(p), first);
        await p2.goto(preview.url + '?mode=archive&round=1214&tx=0x' + 'c'.repeat(64)); await p2.getByRole('button', { name: 'Start garden', exact: true }).waitFor(); assert((await p2.getByRole('link', { name: 'View round transaction' }).getAttribute('href')).endsWith('0x' + 'c'.repeat(64))); assert.notDeepEqual(await masks(p2), first);
        await p.close(); await p2.close(); return 'Safe round 1214 is default; chain label and explorer are Sepolia; separate contexts generate identical boards; non-contiguous round 1201 is selectable; a pinned tx URL takes precedence over a different saved tx in the same round.';
      });
      await check(`${name}: unavailable API, explicit Demo recovery and storage denial`, async () => {
        const p = await page({ viewport: { width: 390, height: 844 } }); await offline(p); await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }); }); await p.goto(preview.url);
        await p.getByRole('button', { name: 'Play Demo', exact: true }).waitFor(); assert.equal(await p.getByRole('button', { name: 'Start garden', exact: true }).count(), 0);
        await p.getByRole('button', { name: 'Play Demo', exact: true }).click(); await p.getByRole('button', { name: 'Start garden', exact: true }).click(); assert((await p.locator('.source-line').innerText()).includes('Demo · offline practice'));
        assert((await p.locator('.warning').innerText()).includes('Local storage')); const cell = p.locator('main [data-kind="conduit"]').first(); await cell.click(); await p.getByRole('button', { name: /^Rotate/ }).click(); assert((await p.getByTestId('moves').innerText()).startsWith('1')); await p.close();
        return 'No random fallback for unavailable historical source; explicit Play Demo starts fixture; denied localStorage shows warning and game still works.';
      });
      await check(`${name}: real 16:9 overlay, controls toggle and source-dependent board`, async () => {
        const p = await page({ viewport: { width: 1920, height: 1080 } }); await p.clock.install({ time: new Date(fixtures.NOW) }); await offline(p); await p.goto(preview.url + '?overlay=1&controls=0&mode=demo');
        await p.locator('main .tile').first().waitFor(); assert.deepEqual(await masks(p), engine.createPuzzle(DEMO_SOURCE.key).tiles.map(t => t.mask));
        assert.equal(await p.getByRole('button', { name: 'Start garden', exact: true }).isVisible(), false); const rect = await p.locator('.overlay-app').boundingBox(); assert(Math.abs(rect.width / rect.height - 16 / 9) < .02, JSON.stringify(rect));
        assert((await p.locator('.source-line').innerText()).includes('Demo')); await noOverflow(p); await shot(p, 'overlay-1920.png', false);
        await p.getByRole('button', { name: 'Show controls', exact: true }).click(); await p.getByRole('button', { name: 'Start garden', exact: true }).click(); await p.locator('main [data-kind="conduit"]').first().click(); await p.getByRole('button', { name: /^Rotate/ }).click(); assert((await p.getByTestId('moves').innerText()).startsWith('1'));
        const timerBeforeHiding = await p.getByTestId('timer').innerText(); await p.getByRole('button', { name: 'Hide controls', exact: true }).click(); await p.clock.fastForward(2500); assert.notEqual(await p.getByTestId('timer').innerText(), timerBeforeHiding); await p.close(); return '1920×1080 overlay is exactly 16:9, source/mode/freshness retained; same actual engine; Show/Hide controls and real rotation work; a standalone hidden-controls game continues its actual clock.';
      });
      await check(`${name}: responsive reflow, reduced motion, accessibility, contrast and focus`, async () => {
        const p = await page({ viewport: { width: 390, height: 844 } }); await offline(p); await loadDemo(p);
        for (const width of [320, 390, 620, 760, 900, 1440]) { await p.setViewportSize({ width, height: 1000 }); await noOverflow(p); }
        await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(p); await p.evaluate(() => { document.documentElement.style.fontSize = ''; });
        await p.emulateMedia({ reducedMotion: 'reduce' }); const animations = await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length); assert.equal(animations, 0);
        const audit = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze(); assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
        await p.getByRole('button', { name: 'Start garden', exact: true }).focus(); await p.keyboard.press('Enter'); await p.locator('main .tile:focus').waitFor(); const focus = await p.locator(':focus').evaluate(el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle })); assert.equal(focus.width, '3px'); assert.equal(focus.style, 'solid'); await shot(p, 'keyboard-focus-390.png', false);
        const colors = await p.evaluate(() => { const root = getComputedStyle(document.documentElement); return Object.fromEntries(['--color-bg', '--color-surface', '--color-text', '--color-muted', '--color-accent', '--color-ink', '--color-focus'].map(k => [k, root.getPropertyValue(k).trim()])); });
        function luminance(hex) { const c = hex.match(/\w\w/g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
        function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
        const pairs = [['body', '--color-text', '--color-bg'], ['muted', '--color-muted', '--color-surface'], ['primary', '--color-ink', '--color-accent'], ['focus', '--color-focus', '--color-surface']].map(([label, a, b]) => ({ label, foreground: colors[a], background: colors[b], ratio: Number(ratio(colors[a], colors[b]).toFixed(3)) }));
        for (const pair of pairs) assert(pair.ratio >= 4.5); await p.close(); return { widths: [320, 390, 620, 760, 900, 1440], overflow: 'none', rootTextEnlargement: '200%, no horizontal overflow', axeViolations: 0, reducedMotionRunningAnimations: animations, focus, measuredSolidPairs: pairs };
      });
      await check(`${name}: timer expiry, sound toggle and separate local mode bests`, async () => {
        const p = await page({ viewport: { width: 390, height: 844 } }); await p.clock.install({ time: new Date(fixtures.NOW) }); await mock(p); await loadDemo(p);
        assert.equal(await p.getByRole('button', { name: 'Sound off', exact: true }).getAttribute('aria-pressed'), 'false');
        await p.getByRole('button', { name: 'Sound off', exact: true }).click(); assert.equal(await p.getByRole('button', { name: 'Sound on', exact: true }).getAttribute('aria-pressed'), 'true'); await p.getByRole('button', { name: 'Sound on', exact: true }).click();
        await p.getByRole('button', { name: 'Start garden', exact: true }).click(); await p.clock.runFor(180100);
        await p.getByRole('heading', { name: 'The garden will wait.' }).waitFor(); assert((await p.getByRole('dialog').innerText()).includes('three-minute night')); assert.equal(await p.getByTestId('timer').innerText(), '0:00');
        await p.getByRole('button', { name: 'Play again', exact: true }).click(); assert.equal(await p.getByTestId('timer').innerText(), '3:00');
        await p.evaluate(() => { const key = 'squeek-signal-garden.v1'; const saved = JSON.parse(localStorage.getItem(key)); saved.bests = { demo: 3456, archive: 1234, live: 567 }; localStorage.setItem(key, JSON.stringify(saved)); });
        await p.reload(); assert((await p.locator('.run-extras').innerText()).includes('3,456'));
        await p.getByRole('button', { name: 'Round Challenge', exact: true }).click(); await p.getByRole('button', { name: 'Start garden', exact: true }).waitFor(); assert((await p.locator('.run-extras').innerText()).includes('1,234'));
        await p.close(); return 'Virtual clock reaches genuine 0:00 loss and restart; sound starts off, enables only on click and toggles off; mode bests read distinct local keys.';
      });
      await check(`${name}: same-browser overlay follows real live progress without duplicate charge accounting`, async () => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const controller = await context.newPage(), follower = await context.newPage(); controller.setDefaultTimeout(8000); follower.setDefaultTimeout(8000);
        await controller.clock.install({ time: new Date(fixtures.NOW) }); await follower.clock.install({ time: new Date(fixtures.NOW) });
        let mm = 0;
        const data = () => ({ ...fixtures.statusJSON, generatedAt: new Date(fixtures.NOW + (mm ? 1000 : 0)).toISOString(), measurement: { ...fixtures.statusJSON.measurement, observedAt: new Date(fixtures.NOW + (mm ? 1000 : 0)).toISOString(), distanceMm: 4500000 + mm, cumulativeWorkUnits: String(90000 + mm / 1000) } });
        await mock(controller, { status: data }); await mock(follower, { status: data });
        await controller.goto(preview.url + '?mode=live'); await controller.getByRole('button', { name: 'Start garden', exact: true }).click();
        await follower.goto(preview.url + '?overlay=1&controls=0&mode=live&round=1221'); await follower.locator('main .tile').first().waitFor();
        mm = 3000; await controller.clock.fastForward(11000); await controller.waitForFunction(() => document.querySelector('.aside-title')?.textContent.includes('3 / 3'));
        await follower.waitForFunction(() => document.querySelector('.aside-title')?.textContent.includes('3 / 3'));
        await clearBoard(controller, 'signal-garden/v1|live|11155111|test-installation|test-release|test-epoch-a|1221', 0);
        await controller.locator('main .tile-beacon').first().click(); await controller.getByRole('button', { name: /^Grow / }).click();
        await follower.waitForFunction(() => document.querySelector('.aside-title')?.textContent.includes('2 / 3'));
        assert.deepEqual(await masks(follower), await masks(controller)); await follower.clock.fastForward(22000);
        assert((await follower.locator('.aside-title').innerText()).includes('2 / 3'));
        assert.equal(await follower.getByRole('dialog').count(), 0);
        const stored = await controller.evaluate(() => JSON.parse(localStorage.getItem('squeek-signal-garden.v1'))); assert.equal(stored.run.charges, 2);
        await context.close(); return 'Separate pages in one browser share actual live board, bloom and 3→2 charge spend; display-only overlay neither awards energy nor overwrites controller storage.';
      });
      await check(`${name}: actual public APIs and production screenshots`, async () => {
        const p = await page({ viewport: { width: 1440, height: 1000 } }); const errors = [], missing = []; p.on('pageerror', e => errors.push(e.message)); p.on('response', r => { if (r.url().startsWith(preview.url) && r.status() >= 400) missing.push(r.url()); });
        await p.goto(preview.url); await p.getByRole('button', { name: 'Start garden', exact: true }).waitFor({ timeout: 25000 }); await p.evaluate(() => document.fonts.ready);
        assert((await p.locator('.source-line').innerText()).includes('Historical round')); const source = await p.locator('.source-details').innerText(); const modes = await p.locator('.source-line').innerText();
        const fonts = await p.evaluate(() => [...document.fonts].map(f => ({ family: f.family, status: f.status }))); assert(fonts.every(f => f.status === 'loaded'));
        await shot(p, 'actual-1440.png'); await p.setViewportSize({ width: 390, height: 844 }); await noOverflow(p); const box = await p.getByRole('button', { name: 'Start garden', exact: true }).boundingBox(); assert(box && box.y + box.height <= 844, JSON.stringify(box)); await shot(p, 'actual-390.png', false);
        assert.deepEqual(errors, []); assert.deepEqual(missing, []); await p.close(); return { modes, source, fonts, scriptErrors: errors, missingLocalResources: missing, mainAction390: box };
      });
    } finally { await browser.close(); }
  }
} finally { await preview.close(); await writeFile(resolve(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n'); }
if (failures) process.exitCode = 1;
console.log(`${report.checks.filter(c => c.passed).length}/${report.checks.length} browser groups passed; ${report.limitations.length} unavailable browser(s).`);
