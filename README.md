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
```

`npm run test:browser` owns a temporary HTTP server and closes it when finished. It tests the **built export under `/preview/`**, including downloads, rather than the development server. Results and compact screenshots go in `artifacts/`. It exits nonzero for a failed executed check; an unavailable browser is separately recorded in `browser-results.json`. Inspect those limitations as well as the exit code.

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

- **Play puzzle** begins the displayed round. A press flips that tile and its orthogonal neighbors; board edges do not wrap. All lights off wins, including on the last allowed move. A nonempty board at the move limit loses.
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
2. **0:20–0:40:** Append `#p=1.d.1` to the page URL and reload for a repeatable, explicitly offline demo. Select **Play puzzle**. Tap a tile, undo it, then restart and confirm. Try **How to play**, Tab/Shift+Tab and Escape. The grid supports arrow keys and Space/Enter.
3. **0:40–1:10:** For a quick win on a fresh Demo 1, press **A2, A3, A5, B1, C1, C2, C3, D3, D4, D5** once each, in any order. Rows are A–E from top to bottom; columns 1–5 from left to right. The result is **1,000 points at par 10** without hints/undo. Save the PNG, inspect the source and export JSON.
4. **1:10–1:30:** Select **Play again** and press A1 18 times. A genuine loss appears at the move cap, with score 0. Select **Play again** to verify the starting board returns.
5. **1:30–2:00:** Close the result if open. **Open archive**, replay a recorded block or import the exported JSON, and inspect its full seed/hash. Try **Copy puzzle link** (manual-copy field appears if clipboard access is denied). A new live block can be loaded explicitly; incoming blocks leave the current round fixed. The automated virtual-clock checks cover repeats, stale input and reorganization/reset cases without waiting a minute in real time.

## Validation and evidence

Actual commands, observed results, screenshots, fixes and limits are recorded in [artifacts/validation.md](artifacts/validation.md), [artifacts/browser-results.json](artifacts/browser-results.json) and [artifacts/export-integrity.json](artifacts/export-integrity.json). [DESIGN.md](DESIGN.md) documents the final implemented design. These are worker-side observations, not an independent certification by the network.

**Actual final worker results (2026-11-03):** production build and strict typecheck passed; **39/39 deterministic tests**, **15/15 Chromium/WebKit browser groups** and **16/16 pinned visual-probe checks** passed. Full desktop and emulated-touch win/loss/restart, unavailable API/retry, idle/repeated/stale input, overlays, archive/JSON/link replay and PNG downloads were exercised. There was no horizontal overflow at 320, 390, 768, 960 or 1440px. Checked ready, active-with-hint and help-dialog states had **0 automated axe violations in both engines**. The actual Ethereum transport returned a live header with **0 page errors and 0 missing local resources**. The final lockfile audit reported **0 vulnerabilities**. Physical devices, assistive screen-reader use and native browser zoom remain unverified as detailed below.

The deterministic suite covers 500 generated solvable samples, 80 comparisons to an independent GF(2) Gaussian-elimination solver, 100 complete optimal wins, known seed vectors, genuine loss and restart, strict API rejection, repeat/stale/epoch semantics, in-flight reset cancellation, short virtual polling intervals and archive/link reproduction. Browser checks exercise both desktop and emulated mobile input and distinguish deliberately mocked responses from the actual live-API check.

## Known limits

- PublicNode is a third-party service. Browser CORS, outages, gateway policies or rate limits can prevent live input. The game surfaces that state and never silently substitutes a synthetic live feed. Polling is delayed sampling, not a guaranteed stream of every block.
- The displayed header is trusted from one RPC provider; no consensus proof is verified. Sparse polling cannot detect every reorganization. A saved snapshot can belong to a later orphaned block and still reproduces its puzzle.
- The 32-bit seed and finite board space permit collisions. Different blocks are not promised unique puzzles. Demo indices are 1–1,000,000.
- Storage is local to the browser/origin and can be evicted. Active moves are not persisted across reloads; archive inputs and exports preserve the original puzzle. Scores are local attempt values, editable by someone controlling their browser, and have no monetary or competitive authority.
- Offline demo/archive play works after the static page and assets load. There is no service worker guaranteeing a cold offline first visit. `file://` module loading is not supported; use a static HTTP preview or the hosted export.
- Automated mobile input is emulation, not a physical phone. No assistive screen-reader session or native Safari/iOS session was available. Root text enlargement to 200% is checked; browser-native zoom and manual animation-panel inspection are separately unverified. Passing automated accessibility checks is not a claim of full conformance.
- The assigned browser connector could not initialize its configured Chrome binary. Actual render and interaction checks used separately installed Playwright browsers. WebKit required temporary system-library and software-rendering setup; no such libraries are shipped with the website.

## Submission, byte budget and publication

The complete export is `dist/index.html` plus its assets, fonts, font licenses, favicon and share PNG. No dependency cache, browser binary, registry mirror, `.tgz`, server bundle or submodule is required or included. The explicit ignore-path and per-directory budgets are in [artifacts/path-budget.json](artifacts/path-budget.json); generated dependency/cache directories have a **0-byte submission budget at every nesting level**. `dist/` is deliberately included. The total additions must stay below **8,388,608 bytes**, checked by `scripts/check-export.mjs`.

**IMD publishes the submitted export after this worker finishes.** Job URL, live IPFS site URL, public source URL and commit identifier have not been supplied to this checkout and cannot be truthfully filled before that publication step. They are network-side outputs, not fabricated links or local preview addresses. No publish command was run, and no protected Git metadata was modified. The source, lockfile and finished export are ready for the network's submission bundle.

## Design guidance and assets

The pinned Better Interface guide was applied while building and reviewed across accessibility, layout, writing, typography, colors and UI. The independent final review, concrete source findings, fixes and check coverage are in `artifacts/validation.md`. Guidance is adapted from [Jakub Krehel's Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface) (MIT) and Paul Bakaus's [Impeccable documentation method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md) (Apache-2.0); included license notices are in `artifacts/licenses/Design-guidance-LICENSE.txt`. Space Grotesk and DM Sans are bundled as local Latin variable WOFF2 files with their original SIL Open Font License notices in `public/fonts/` and `dist/fonts/`.
