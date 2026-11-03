# Blocklight

A complete, static Lights Out game seeded by Ethereum blocks. Turn all 25 lights off within the move budget. Live polling, numbered offline demos, replayable archives, keyboard and touch play, hints, undo, win/loss/restart, PNG downloads and JSON exports are implemented.

The supplied implementation brief starts mid-sentence and specifies neither the game nor its API. This build makes that open choice explicit: **5 × 5 Lights Out + Ethereum block headers**, using a deterministic solvable engine. No wallet, contract, owner address, private key or backend is needed. Nothing synthetic is presented as live blockchain data.

## Install, run and rebuild

Use Node **22.12 or newer** and npm. Source and the complete production export are both included. The host serves `dist/`; it does not need to build the project.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite. For browser validation, install Playwright's browser runtimes and any required OS libraries, then run:

```sh
npx playwright install --with-deps chromium webkit
npm run test:browser
node scripts/check-export.mjs
node scripts/record-unit.mjs
```

`npm run test:browser` owns a temporary HTTP server and closes it when finished. It tests the **built export under `/preview/`**, including downloads, rather than the development server. Machine-readable results and screenshots go to `test/scratch/validation/` (override with `BLOCKLIGHT_REPORTS`). That folder is scratch output and is not committed; the results of the final run are copied into the **Validation** tables below. The script exits nonzero for a failed executed check; a browser that cannot launch is recorded as a limitation in `browser-results.json`, so read those limitations as well as the exit code.

The committed PNG share card is generated locally, with the same fonts and palette. To regenerate it after a visual change:

```sh
npm run build
node scripts/share-card.mjs
npm run build
```

`vite.config.mjs` sets `base: './'`. JavaScript, CSS, fonts, favicon and the share card use relative runtime paths; all required assets are bundled locally. One page and hash-based puzzle links work beneath an IPFS gateway subpath without server rewrites. JavaScript is required. There is no remote font request, tracking script, service worker or private configuration.

### Restricted contributor installation

This worker installed dependencies outside the repository, using the committed manifest and lockfile, to respect the protected `node_modules/` path. The same scripts support that arrangement:

```sh
mkdir -p /tmp/blocklight-deps
cp package.json package-lock.json .npmrc /tmp/blocklight-deps/
npm ci --prefix /tmp/blocklight-deps --cache /tmp/blocklight-npm-cache
BLOCKLIGHT_DEPENDENCIES=/tmp/blocklight-deps npm run typecheck
BLOCKLIGHT_DEPENDENCIES=/tmp/blocklight-deps npm test
BLOCKLIGHT_DEPENDENCIES=/tmp/blocklight-deps npm run build
```

Set the same `BLOCKLIGHT_DEPENDENCIES` variable for browser scripts when using an external install. `PLAYWRIGHT_BROWSERS_PATH` can similarly place browser binaries outside the repository. `.npmrc` disables automatic peer dependency installation; every tool this project actually uses is pinned in `package-lock.json`. Vite's cache defaults to `/tmp/blocklight-vite-cache` and can be changed with `BLOCKLIGHT_CACHE`.

## Play and source behavior

- **Play puzzle** begins the displayed round, and so does pressing any tile on a ready board (that press counts as move 1). A press flips that tile and its orthogonal neighbors; board edges do not wrap. All lights off wins, including on the last allowed move. A nonempty board at the move limit loses.
- The first ready screen is explicitly labeled **Demo · offline practice** while fetching a block. The first fresh header can replace this untouched bootstrap demo once. Starting a game or explicitly choosing a puzzle prevents that automatic replacement. Subsequent headers only make **Load latest block** available.
- **Live snapshot** means an input actually received from the API. Its board is frozen. The separate feed status describes polling now. A stale/unavailable feed cannot create new live rounds; existing rounds still work.
- **Play demo** loads the next numbered practice seed. Demo inputs never contain a pretend block number, hash or timestamp. **Open archive** lists this browser's started puzzles plus one real recorded Ethereum header.
- Loading a different input during a round with moves requires confirmation. **Restart** confirms before clearing moves; **Play again** immediately starts a fresh attempt on the same puzzle.
- **Show a hint** marks one move from a shortest solution of the current board. Asking again before changing the board does not charge twice. **Undo** restores the previous board and returns one move, with a point penalty. Terminal rounds cannot be undone.
- Keyboard: Tab to a control, Enter/Space to activate; within the board use arrow keys, Home/End, or Ctrl+Home/End. Board navigation wraps, while gameplay adjacency does not. Escape closes dialogs; Tab/Shift+Tab stay inside and focus returns to the opener.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/core/types.ts` | Versioned inputs, block metadata, puzzle and attempt types |
| `src/core/engine.ts` | Pure board masks, seed, generator, minimum solver, reducer and scoring; no network, clock, storage or random API |
| `src/data/rpc.ts` | Strict JSON-RPC parser, freshness/epoch reducer and serialized poller with cancellation generation tokens |
| `src/data/useFeed.ts` | React lifecycle bridge; pauses polling while the document is hidden |
| `src/data/archive.ts` | Input validation, bounded local storage, deduplication, share-link encoding and a recorded header |
| `src/data/export.ts` | Locally rendered PNG and versioned JSON downloads |
| `src/App.tsx` | Input selection, attempt lifecycle, storage warnings, source details, confirmations and result states |
| `src/components/` | Native dialog, accessible board and local SVG icon components |
| `src/styles/app.css` | Implemented tokens, responsive layout and component states; documented in `DESIGN.md` |
| `tests/` | Deterministic engine, adapter/poller and archive tests |
| `scripts/validate.mjs` | Actual Chromium/WebKit interaction checks, screenshots, accessibility scan and rendered contrast measurements |
| `scripts/check-export.mjs` | Relative-asset, metadata, lockfile, runtime-file hash and byte-budget checks |

## Exact API → game mapping

Production API: **`https://ethereum-rpc.publicnode.com`**, Ethereum mainnet (chain 1). This is the public endpoint listed by [PublicNode](https://ethereum.publicnode.com/). The JSON-RPC method and field formats follow the [Ethereum JSON-RPC documentation](https://ethereum.org/developers/docs/apis/json-rpc/).

```json
{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["latest",false]}
```

Requests use POST, JSON content type, `cache: no-store`, an **8-second timeout**, and a **12-second delay after each completed request**. Only one request runs at once. There is no WebSocket and no transaction request. Worker verification uses the contributor-provided Ethereum transport when configured; the production bundle contains only the public endpoint.

| API field | Validation | Game use |
| --- | --- | --- |
| `jsonrpc`, `id`, `error`, `result` | Must be `2.0`, id `1`, no error and a nonnull object result | Reject incomplete/error envelopes; never invent a header |
| `result.number` | Canonical hexadecimal quantity, safe nonnegative integer | Decimal block height in the canonical seed key; visible block title |
| `result.hash` | Nonzero 32-byte hexadecimal hash, normalized to lowercase | Entire hash enters the seed; full value available in source details, JSON, link and PNG |
| `result.parentHash` | 32-byte hexadecimal hash | Feed reorganization detection for consecutive heights; not part of the puzzle seed |
| `result.timestamp` | Hex quantity; at least Ethereum's launch timestamp; no more than 30 seconds in the future | UTC source time and freshness; not part of the puzzle seed |
| All other fields, including transactions and gas | Not used | No effect on board, par, moves or score |

### Samples, epochs, reset and stale input

`src/data/rpc.ts` is the executable contract:

1. An accepted sample increments the diagnostic sample count and updates `lastSuccess`. A changed `(number, hash)` also updates `lastChange`. Repeated headers retain identity and never reset a round.
2. A changed header increments the **feed epoch** when its height is at or below the previous height, or when a consecutive next height has a parent hash that disagrees with the previous hash. A height gap alone is not evidence of a fork. Epoch is diagnostic; it never enters a seed or changes an archived puzzle.
3. A header is fresh only when the last successful response and the last changed header are both at most **60 seconds** old, and the block timestamp is at most **120 seconds** old. A one-second UI tick catches staleness even without responses. Repeated successful stale headers cannot keep the live badge alive.
4. A timeout, HTTP error, invalid schema or fetch error immediately labels the feed **unavailable**, retaining the last header for context. A later valid changed/fresh sample can recover. Demo and archive play stay available.
5. Hiding the page pauses polling and aborts pending work. Returning resumes it. Poller reset clears its sample state and advances a generation token; any old response is discarded even if its transport ignores abort. Game restart separately resets only the attempt, preserving its exact input and initial board.

## Seed, solvability and scoring formulas

Cells are numbered `i = 5 × row + column`, zero-based, with A1 at the top left. A board is a 25-bit integer. Press mask `T[i]` contains the pressed bit and each in-bounds orthogonal neighbor. A press performs `board XOR T[i]`.

Canonical ASCII key:

```text
blocklight/v1|1|<decimal block number>|<full lowercase 0x hash>
blocklight/v1|demo|<decimal demo index>
```

Seed is **FNV-1a**, initialized to `2166136261`. For each character, `h = imul(h XOR charCode, 16777619) >>> 0`. If it is zero, use `0x9e3779b9`. Each PRNG step is unsigned **xorshift32**: `x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0`.

Each candidate takes the low 25 PRNG bits as a press set and applies those presses to an all-off board. Therefore it is solvable by construction. The solver enumerates all **32 possible first rows**, then presses directly below each remaining light in the preceding row. Every solution is represented. It chooses the fewest presses, breaking ties by the smallest numeric press mask.

Accept the first candidate whose shortest solution has **5–12 moves**. Try at most 256 candidates; a bounded fallback presses the four corners and center of the empty board: bits **0, 4, 12, 20, 24**, mask **17,829,905**, with verified par **5**. There is no unbounded generation loop. **Move limit = par + 8**. Version 1's generator, solver and canonical serialization are pinned by golden vectors; a future incompatible algorithm must use another version.

```text
win score = max(0, 1000 − 40 × max(0, M − par) − 100 × hints − 50 × undos)
loss score = 0
```

`M` is the current press-history length after undo. Undo decreases `M` but its penalty remains. Hints count once per displayed suggestion until the board changes. The UI labels this number **Potential** until the round ends. PNG/JSON exports record earned score only for a win; an unfinished attempt exports score 0. There is no time bonus and no shared leaderboard. Restart clears moves, hints and undo penalties.

Golden vectors:

| Input | Seed (hex) | Initial board (decimal) | Par | Limit |
| --- | --- | --- | --- | --- |
| Demo 1 | `1eb80e26` | `29810256` | 10 | 18 |
| Recorded block #26,334,137 | `ec36334c` | `22582324` | 8 | 16 |

## Archive and export reproducibility

Up to **30 started puzzle inputs** are kept under `blocklight.archive.v1` in this browser's local storage. They are deduplicated by canonical key. An additional bundled reference header was read at **2026-11-03 12:00:47 UTC**, block **26,334,137**, hash **`0x73c0561f039f4a34ba4f92aa094f2932c0370174e6a1271154cb4cd5f9ca316d`**. It is always labeled as an archive, never as a current feed.

JSON export includes `{format, version, input, attempt, seed, initialBoard, par}`. Import deliberately trusts **only a validated versioned input** and recomputes the board, par, seed and fresh attempt. A forged score or initial-board field has no effect. Files larger than 32 KB are rejected with a recoverable error. Corrupt or blocked storage produces an honest warning; it does not block play or export.

Puzzle links encode the complete reproducible input in the fragment:

```text
#p=1.d.<demo index>
#p=1.b.<decimal block number>.<64 hash digits>.<decimal timestamp>
```

An imported/shared block is labeled **Archive · unverified replay**. No network access is needed to regenerate its board. Header authenticity is not proven by importing it; source details offer a block-explorer link for comparison. Imported attempt metadata is informational and never restores a score. JSON exports and links replay the **original board**, not the moves already made. PNG captures the current board, outcome, full hash or explicit demo label, seed and score, and states that it is a static snapshot.

## Two-minute reviewer walkthrough

1. **0:00–0:20:** Open the site at a 390px viewport. The product, source label, score/move data and **Play puzzle** are visible immediately. The board is present on the same screen. Inspect the separately labeled live feed; if the API is unavailable, the message offers demo, archive and retry.
2. **0:20–0:40:** Append `#p=1.d.1` to the page URL and reload for a repeatable, explicitly offline demo. Select **Play puzzle** (or just tap a tile). Tap a tile, undo it, then restart and confirm. Try **How to play**, Tab/Shift+Tab and Escape. The grid supports arrow keys and Space/Enter.
3. **0:40–1:10:** For a quick win on a fresh Demo 1, press **A2, A3, A5, B1, C1, C2, C3, D3, D4, D5** once each, in any order. Rows are A–E from top to bottom; columns 1–5 from left to right. The result is **1,000 points at par 10** without hints/undo. Save the PNG, inspect the source and export JSON.
4. **1:10–1:30:** Select **Play again** and press A1 18 times. A genuine loss appears at the move cap, with score 0. Select **Play again** to verify the starting board returns.
5. **1:30–2:00:** Close the result if open. **Open archive**, replay a recorded block or import the exported JSON, and inspect its full seed/hash. Try **Copy puzzle link** (manual-copy field appears if clipboard access is denied). A new live block can be loaded explicitly; incoming blocks leave the current round fixed. The automated virtual-clock checks cover repeats, stale input and reorganization/reset cases without waiting a minute in real time.

## Validation and evidence

Every result below is from the worker's final run on **2026-11-03**, after the last source change, against the built `dist/` export served at a `/preview/` subpath. They are worker-side observations, not an independent certification by the network. [DESIGN.md](DESIGN.md) documents the final implemented design.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed (strict `tsc --noEmit`) |
| `node scripts/record-unit.mjs` (runs `npm test`) | **39/39** deterministic tests passed in 3 files |
| `npm run build` | Passed; `dist/index.html`, one CSS and one JS bundle, fonts, favicon, share PNG |
| `node scripts/check-export.mjs` | Passed: 9 runtime files, all HTML/CSS asset URLs relative and present, metadata and 1200×630 share card present, lockfile matches manifest, per-path budgets in [scripts/path-budget.json](scripts/path-budget.json) met, total well under 8 MiB |
| `npm audit` (pinned lockfile) | 0 vulnerabilities |
| `npm run test:browser` | **Chromium: 8/8 groups passed. WebKit: not run** (could not launch, see below) |
| Design probe `taste.mjs` at 320/390/1440 | **16/16 checks passed** (render, layout, targets, contrast, casing, tracking, eyebrows, type-sizes, type-faces, glyphs, slogans, repetition, copy-budget, chrome, motion, share) |

Browser groups (Playwright 1.64.1, Chromium headless shell 1248):

| Group | Result | What it exercised |
| --- | --- | --- |
| Keyboard, focus, hints, undo, confirmed restart (1440) | Pass | Enter on Play puzzle focuses A1; arrows move the roving tab stop; Space flips; undo −50; hint −100; help dialog traps Tab and returns focus on Escape; restart cancel and confirm; 0 page errors |
| Complete loss, PNG, restart, win, JSON replay (1440) | Pass | Loss at 18 presses of A1 with score 0 and no stale notice in the dialog; 1200×1000 PNG download; Play again restores the board; optimal 10-move win at 1,000; JSON export; clipboard-denied fallback field; invalid JSON import recovers; demo and block JSON/link reproduce the same board; a forged score is ignored |
| Touch flow at 390 (mobile emulation) | Pass | Play puzzle wholly inside the first 844px; tap centre cross; hint and hinted tap; help dialog; confirmed restart; **tapping a tile on a ready board starts the round (moves 0 → 1)**; hint button is not primary-styled; full win with no "Round started" line in the dialog; loss and PNG download |
| Unavailable API, retry, active-round protection | Pass | Deliberately mocked HTTP 503 is labelled "Ethereum API unavailable"; demo stays playable; retry leaves the active board alone; switching puzzles mid-round needs confirmation |
| Idle live input, repeats and stale UI (virtual clock) | Pass | Mocked headers under a virtual clock: new and repeated blocks leave ready and active boards fixed; a stale feed disables Load latest block while play continues |
| Responsive reflow, text enlargement, motion, accessibility | Pass | No horizontal overflow at 320, 390, 768, 960, 1440; 200% root text size; reduced motion; axe-core (WCAG 2.2 AA tags) **0 violations** in ready, active-with-hint and help-dialog states |
| Rendered contrast and visible focus | Pass | Body 13.805:1, muted 6.153:1, board labels 11.125:1, unlit tile/board 3.005:1, unlit marker/tile 4.595:1, lit marker/tile 11.787:1, primary button 11.787:1, outline hint button 13.805:1, focus ring/board 13.805:1; focus ring 3px solid; forced-colors mode has no overflow |
| Actual API and production screenshots | Pass | Real Ethereum header received ("Ethereum feed is live", "Live snapshot · locked for this round", block #26,334,445); 0 page errors, 0 missing local resources, local fonts loaded, Play puzzle visible at 390×844. On this machine the request was routed through the contributor's Ethereum RPC; the shipped bundle calls only PublicNode |

Checks that did **not** run in the final pass: WebKit (Playwright reported missing host libraries such as `libx264.so` and the machine allows no system package install); a physical phone; a screen-reader session; browser-native zoom; a real-time (non-virtual-clock) wait for staleness. The 390 probe screenshot was inspected by eye: brand, How to play, headline, source label, block title, moves/par/potential, Play puzzle and the top of the board are all on the first screen.

The deterministic suite covers 500 generated solvable samples, 80 comparisons to an independent GF(2) Gaussian-elimination solver, 100 complete optimal wins, known seed vectors, genuine loss and restart, strict API rejection, repeat/stale/epoch semantics, in-flight reset cancellation, short virtual polling intervals and archive/link reproduction.

### Design review (Better Interface, six domains)

The pinned guide was applied while building and re-checked across accessibility, layout, writing, typography, colors and UI. Findings fixed in this revision:

| Domain | Finding | Fix |
| --- | --- | --- |
| UI / accessibility | Board ignored taps before Play puzzle with no feedback | Tiles enabled in the ready state; the first press starts the round (`src/components/Board.tsx:11`, `src/App.tsx:90`) |
| UI | Penalty action (hint, −100) reused the lime primary style in the Play puzzle slot | Outline style (`src/App.tsx:145`) |
| Writing | Result dialog repeated a stale "Round started" status | Notice cleared when a round ends (`src/App.tsx:64`) |
| Writing | Extra slogans in header, footer and help title competed with the hero | Removed the header note and footer line; help dialog titled "How to play" (`src/App.tsx:135`, `:164`, `:166`) |
| Fidelity | README linked evidence and license files that were never committed | Results tables above; license notice in `LICENSES/`; budget in `scripts/` |

Remaining limits: contrast was measured in Chromium only; assistive technology and native zoom were not exercised; passing automated checks is not a claim of full WCAG conformance.

## Known limits

- PublicNode is a third-party service. Browser CORS, outages, gateway policies or rate limits can prevent live input. The game surfaces that state and never silently substitutes a synthetic live feed. Polling is delayed sampling, not a guaranteed stream of every block.
- The displayed header is trusted from one RPC provider; no consensus proof is verified. Sparse polling cannot detect every reorganization. A saved snapshot can belong to a later orphaned block and still reproduces its puzzle.
- The 32-bit seed and finite board space permit collisions. Different blocks are not promised unique puzzles. Demo indices are 1–1,000,000.
- Storage is local to the browser/origin and can be evicted. Active moves are not persisted across reloads; archive inputs and exports preserve the original puzzle. Scores are local attempt values, editable by someone controlling their browser, and have no monetary or competitive authority.
- Offline demo/archive play works after the static page and assets load. There is no service worker guaranteeing a cold offline first visit. `file://` module loading is not supported; use a static HTTP preview or the hosted export.
- Automated mobile input is emulation, not a physical phone. No assistive screen-reader session or native Safari/iOS session was available. Root text enlargement to 200% is checked; browser-native zoom and manual animation-panel inspection are separately unverified. Passing automated accessibility checks is not a claim of full conformance.
- Render and interaction checks used Playwright browsers installed outside the repository. WebKit could not launch on the final validation machine, so Safari-engine behaviour is unverified in this revision. No browser binaries or system libraries ship with the website.

## Submission, byte budget and publication

The complete export is `dist/index.html` plus its assets, fonts, font licenses, favicon and share PNG. No dependency cache, browser binary, registry mirror, `.tgz`, server bundle or submodule is required or included. The explicit ignore-path and per-directory budgets are in [scripts/path-budget.json](scripts/path-budget.json); generated dependency/cache directories have a **0-byte submission budget at every nesting level**. `dist/` is deliberately included. The total additions must stay below **8,388,608 bytes**, checked by `scripts/check-export.mjs`.

**IMD publishes the submitted export after this worker finishes.** Job URL, live IPFS site URL, public source URL and commit identifier have not been supplied to this checkout and cannot be truthfully filled before that publication step. They are network-side outputs, not fabricated links or local preview addresses. No publish command was run, and no protected Git metadata was modified. The source, lockfile and finished export are ready for the network's submission bundle.

## Design guidance and assets

The pinned Better Interface guide was applied while building and reviewed across accessibility, layout, writing, typography, colors and UI. Coverage, findings and fixes are in the **Design review** table above. Guidance is adapted from [Jakub Krehel's Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface) (MIT) and Paul Bakaus's [Impeccable documentation method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md) (Apache-2.0); included license notices are in [LICENSES/Design-guidance-LICENSE.txt](LICENSES/Design-guidance-LICENSE.txt). Space Grotesk and DM Sans are bundled as local Latin variable WOFF2 files with their original SIL Open Font License notices in `public/fonts/` and `dist/fonts/`.
