# Squeek Signal Garden

An original Squeekchain puzzle and stream companion. Restore a night garden by turning conduits from a hamster-wheel source toward four flower beacons. A run contains three progressively harder 6×6 boards, a shared three-minute active-play clock, rotation limits, optional growth charges, connection streaks and combos. Tutorial, pause, restart, actual win/loss screens, local bests, stream overlay and PNG export are implemented.

The first visit defaults to **Round Challenge**, a historical safe positive-work settlement. **Live Garden** uses new wheel movement for optional bonus energy while baseline routing works during naps. **Demo** is an explicitly labelled fixed practice fixture, available even when every API fails. No wallet, account, new contract, token reward, paid API or backend is involved.

## Install, preview and rebuild

Use Node **22.12 or newer** and npm. The existing pinned React/Vite/TypeScript tooling and lockfile are retained. The package identifier and external-install environment variable still use the preceding project's internal name; the delivered product is Squeek Signal Garden.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite. The complete production site is **`dist/`**. It is served directly, with no server rewrite or build step at the host. Vite's existing `base: './'` makes JS, CSS, fonts, favicon and share image relative. Query parameters work under an IPFS gateway subpath. All required assets are local; JavaScript and HTTP(S) are required (`file://` module loading is unsupported).

For interaction checks, install Playwright browsers and their system prerequisites, then run:

```sh
npx playwright install --with-deps chromium webkit
npm run test:browser
node scripts/record-unit.mjs
node scripts/check-export.mjs
```

The browser script owns a temporary static server, checks the built export at `/preview/`, closes its resources and writes actual reports/screenshots/downloads under `test/scratch/validation/`. It returns nonzero on a failed executed check. A browser that cannot launch is explicitly listed as unavailable, so inspect limitations as well as the exit code. Scratch is excluded from submission. A compact copy of this delivery's evidence is in [evidence/](evidence/).

The share card is generated from an actual solved Demo board:

```sh
npm run build
node scripts/share-card.mjs
npm run build
```

The restricted worker used a fresh external dependency install from the unchanged manifest and lockfile, leaving protected `node_modules/` untouched. The existing tooling also supports that setup: set `BLOCKLIGHT_DEPENDENCIES` to an external directory containing that install. Set `PLAYWRIGHT_BROWSERS_PATH` to an external browser installation if needed. These are local build options, never runtime configuration or required hosted secrets.

## Play

- Choose a mode, then **Start garden**. Select a tile by click, tap or Enter. **Rotate** or **R** turns the selected conduit clockwise. Arrow keys move focus inside the board; Enter selects that focused tile. Rows A–F run downward; columns 1–6 run left to right. No dragging is needed.
- Gold lines carry baseline energy through matching adjacent ports. A flower gains a check mark when connected. Stones, ferns, source and flower ports stay fixed. Loose ends are allowed; all four flowers must connect simultaneously.
- Each rotation spends one move. A solved board on its last allowed rotation succeeds. A disconnected board at its cap, or a clock at zero, loses. A clear board offers **Next garden**; the third offers **Finish the garden**, opening the actual win screen.
- The 180-second clock counts active play across all three boards. Pause, hidden tabs, dialogs, tutorial and between-board bloom screens stop it. Hiding the tab pauses the run and suspends network polling. Resume is explicit.
- Select a correctly routed flower and **Grow** to spend one charge for +150 points and a golden bloom. Each flower can be grown once per board; charges carry between boards and never regenerate in archive/Demo. Routing itself always works at baseline power.
- **How to play** opens a short interactive Demo tutorial: select the indicated elbow, rotate, select a connected flower, spend one practice charge. It does not change the real run.
- Restart and changing mode during an attempt ask before discarding it. **Play again** resets the pinned attempt. Sound starts off on each visit and only initializes audio after an explicit toggle click.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/core/engine.ts` | Pure seeded connected-tree construction, clockwise masks, connectivity search, reducer, move/clock limits and scoring |
| `src/core/types.ts` | Mode, source, settlement, tile, puzzle and persisted run types |
| `src/data/archive.ts` | Strict adapters for all three public API schemas, safe settlement filtering, canonical source keys, budgets and chain-specific explorer links |
| `src/data/telemetry.ts` | Freshness, identity-scoped high-water marks, baseline/reset/reconnect handling, capped bonus reservoir |
| `src/data/rpc.ts` | Serialized REST poller (legacy filename), timeout, backoff, Retry-After and cancellation generations |
| `src/data/useFeed.ts` | React bridge and page-visibility lifecycle |
| `src/data/storage.ts` | Validated local progress and bests, paused restoration, graceful blocked/quota/corrupt storage handling |
| `src/data/export.ts` | Actual-state SVG→canvas PNG export and static-host-compatible overlay URLs |
| `src/data/sound.ts` | Optional short synthesized tones; no audio assets or automatic playback |
| `src/components/` | Native focus-managed modal, roving-focus board, original SVG botany/wheel and interactive tutorial |
| `src/App.tsx` | Pinned modes, run lifecycle, source transparency, panels, stream display and local synchronization |
| `src/styles/app.css` | Night-garden tokens, typography, responsive layouts and restrained motion; [DESIGN.md](DESIGN.md) describes the final implementation |
| `tests/` | Deterministic engine corpus, independent connectivity oracle, adapters/polling, accounting, archive and persistence checks |
| `scripts/validate.mjs` | Production-browser interactions, screenshots, downloads, source failure, virtual clocks and accessibility checks |

The tested FNV/xorshift primitives, native dialog foundation, download utility, local fonts and existing build infrastructure were reused. The old Lights Out mechanics and Ethereum-block RPC integration were replaced to implement this complete brief.

## Verified API → game mapping

The public endpoints were read before implementation on **2026-11-04** and exercised again in the final production browser checks. [API verification evidence](evidence/api-verification.json) preserves the selected public fields actually observed. At verification the APIs reported **Sepolia testnet, chain 11155111**, an online but **IDLE** wheel and safe historical positive-work settlements. There is no hardcoded mainnet gameplay claim.

| Public GET endpoint | Required fields validated and used | Gameplay effect |
| --- | --- | --- |
| [`/v1/status`](https://api.squeekchain.com/v1/status), schema 1 | `installationId`, `generatedAt`; `measurement.freshness`, `observedAt`, `staleAfterSeconds`, `counterEpoch`, decimal-string `cumulativeWorkUnits`, `coreStatus`, nonnegative safe-integer `rpmMilli`, `speedMmPerSecond`, `distanceMm` | Fresh/idle/stale status; initial live baseline and epoch; paired **new** distance/work produces capped optional charges |
| [`/v1/economy/state`](https://api.squeekchain.com/v1/economy/state), schema 2 | `status === available`, `installationId`, `generatedAt`, `chain.target`, decimal-string `chain.chainId`, `lifecycle.currentRound`, `release.id` | Actual network label, installation/release identity and next live board's round seed |
| [`/v1/settlements?range=24h`](https://api.squeekchain.com/v1/settlements?range=24h), schema 3 | `status === available`, `installationId`, `generatedAt`, actual `chain`, and each accepted entry's `transactionHash`, `settledThroughRound`, `workAdded`, `cumulativeWork`, `confirmationStatus`, `blockTimestamp` | Safe/finalized positive-work historical challenges; full hash + round + chain seed, timestamp/transaction provenance and work-based charge budget |

`builder.projected`, queued/projected heights, token values, contract identities and rewards are **not used**. Telemetry is provisional hardware data. A settlement is labelled safe/finalized **as reported by the public API**, not as an independently verified consensus proof. No signatures or transaction calls are made.

Adapter rules include exact schema versions, bounded nonempty identifiers, decimal strings checked before BigInt conversion, nonzero 32-byte transaction hashes and usable timestamps. Archive entries must be safe/finalized, have `workAdded > 0`, have cumulative work at least work added, and not have a block timestamp beyond the response time plus a 30-second tolerance. Invalid, idle, pending and duplicate entries are excluded. Available rounds are sorted by round descending, never assumed contiguous. Archive and economy installations/networks must match before a new source is pinned. Unknown chains retain their actual labels; an explorer link is omitted rather than guessed.

### Polling and freshness

There is one serialized request lane across all three endpoints. Status is scheduled **10 seconds after its previous completion**; economy and settlements **60 seconds after theirs**. Every request uses `cache: no-store`, `Accept: application/json` and an **8-second timeout covering headers and JSON body**. Failures use exponential backoff from the endpoint's interval, capped at 120 seconds. Numeric and HTTP-date `Retry-After` values impose a cooldown on the whole lane; manual Retry cannot bypass it.

Hiding the document aborts the pending fetch, invalidates its generation and suspends new requests. Late responses from a cancelled generation cannot update the feed. Returning resumes polling; an explicit run resume is still needed. A local one-second heartbeat updates freshness without making another request.

A wheel sample is stale when `freshness !== online`, either observed/generated timestamp is over `staleAfterSeconds` old, or either timestamp is more than 30 seconds in the future. Otherwise core `IDLE` or zero RPM and speed is labelled idle; movement is labelled live. A fetch/schema failure is unavailable. Live starting/earning also needs a matching economy response no more than 180 seconds old and no more than 30 seconds in the future.

### Live bonus accounting

Start pins `(installationId, release.id, chainId, counterEpoch)` and the **current** observed time, cumulative distance and cumulative work. Page load and past lifetime counters award zero energy. Original run source data remains pinned; the current board's round is tracked separately. Incoming rounds never replace an active board. At **Next garden**, the current accepted round determines the next live key; if input is unavailable, the existing board key/round is retained.

For each identity, keep maximum accepted timestamp, distance and work. Only a strictly newer timestamp with nonnegative counter movement is eligible. On a sample with both positive new distance and positive new work:

```text
newDistance = distanceMm − distanceHighWater
newWork     = cumulativeWorkUnits − workHighWater
millimetres = fractionalRemainder + newDistance
newCharges  = floor(millimetres / 1000)
reservoir   = min(3, reservoir + newCharges)
remainder   = reservoir == 3 ? 0 : millimetres % 1000
```

Samples with zero distance or zero work do not bank unpaired movement. All counters advance even when no charge can be granted, so replaying them cannot award again. Spending a charge updates both game and accounting state. Overflow at the three-charge cap is discarded, including the remainder.

Repeated/older timestamps award nothing. Negative deltas preserve the old high-water marks, clear the fraction and explain the counter decrease. Epoch, installation, release or chain changes rebaseline without awarding a gap; returning to a previous identity retains its old marks. Errors, stale data, hidden tabs and reloads also require a fresh baseline, discarding distance during that gap. Saved high-water marks survive reloads. These conservative rules favor undercounting over duplicate energy. Baseline routing is never disabled by a sleeping wheel or mid-run API failure.

### Historical challenge budget and seeds

Pin one safe/finalized entry with positive work, including its full transaction hash, round, work, timestamp and actual chain. The initial run budget is:

```text
archive growth charges = min(3, 1 + floor(BigInt(workAdded) / 250))
live growth charges    = 0 at start; only new paired movement can add charges
demo growth charges    = 2 per run
```

For example, the observed round **1214**, work **498**, gives **2** charges. Its transaction is [on Sepolia Etherscan](https://sepolia.etherscan.io/tx/0x0120e9817f1bf17a5ad0ba51f7815636ed61198236cf870582dc0a9b98c03c3b). This is historical activity, never described as the wheel currently moving. Restart reproduces the same archive boards and budget; another available round can be selected explicitly.

Canonical source keys (`round` and `chainId` are decimal strings; hash is full lowercase `0x…`):

```text
signal-garden/v1|archive|<chainId>|<transactionHash>|<settledThroughRound>
signal-garden/v1|live|<chainId>|<installationId>|<releaseId>|<counterEpoch>|<currentRound>
signal-garden/v1|demo|moonflower
```

For zero-based stage `s`, hash `<sourceKey>|board:<s>` using FNV-1a: initialize `h = 2166136261`; for each JavaScript UTF-16 code unit, `h = imul(h XOR charCode, 16777619) >>> 0`; replace a zero result with `0x9e3779b9`. PRNG steps are unsigned xorshift32 (`<<13`, `>>>17`, `<<5`), reduced modulo the requested range. No clock or random API enters board generation. Two devices pinning the same historical source obtain the same board, rotation cap and charge budget.

### Solvability and scoring

Ports are bit masks **N=1, E=2, S=4, W=8**. Clockwise rotation is `((mask << 1) & 15) | (mask >> 3)`. Connectivity starts at the wheel and crosses an edge only when both neighboring ports match; edges never wrap.

The generator first builds a connected degree-three comb tree: a spine, a source leg and four branches ending in fixed flowers, balanced across opposite edges. It then applies a seeded reflection/rotation. Empty cells receive **3 / 5 / 7** stone obstacles and decorative ferns. A seeded shuffle picks **4 / 7 / 10** conduits to scramble, always including the entry conduit. This prevents an already-solved starting board and guarantees enough tile variety. Stage 1 scrambles one corrective clockwise turn; later stages use seeded quarter-turn amounts, correcting unchanged straight-tile rotations.

`par` is the sum of clockwise turns needed to restore the constructed solution. **Move cap = par + [7, 5, 3][stage]**. This is a guaranteed restoration cost, not a claim of the shortest solution. The original connected solution remains available within that cap. Any arrangement that connects all four flowers succeeds. Difficulty increases through more scrambled tiles/obstacles and less spare budget.

```text
streak = consecutive rotations that first-connect a flower without disconnecting another
combo  = 1 + min(3, max(0, streak − 1))
first-connection points = 100 × newly connected flowers × combo
board-clear bonus       = 400 + 5 × rotations left
growth bonus            = 150 once per flower, consuming one charge
full-run win bonus      = 2 × floor(milliseconds left / 1000)
```

Other rotations or a disconnection reset the streak/combo. A per-board awarded set prevents reconnecting an old flower from farming points. Boosted flowers are separately tracked to prevent repeated spending. Scores carry between boards. A loss shows points from that attempt but does not establish a new best; only full wins do. Bests are local and separate for Demo, Live Garden, archive mode and each pinned source. There is no online/global leaderboard.

## Stream, PNG and local progress

**Share / stream → Copy overlay URL** produces a real URL on the current static host:

```text
?overlay=1&controls=0&mode=archive&round=<pinnedRound>&tx=<pinnedHash>
?overlay=1&controls=0&mode=live&round=<runStartRound>
?overlay=1&controls=0&mode=demo&round=practice
```

The overlay is an actual source-dependent 16:9 game view, with the real board, score, round/mode and wheel freshness. **Show controls** makes it playable; **Hide controls** restores the clean scene. The URL preserves the deployment subpath. If clipboard permission or the API is unavailable, a selectable full URL field provides manual copying.

Tabs in the **same browser profile and origin** follow the controller's saved board/progress through storage events. Following overlays do not run a second game clock, mint bonus charges or overwrite the controller's save. Use one controller. A separate OBS browser profile/device cannot read that local storage: it opens the pinned historical challenge as a fresh game (or starts its own fresh Live Garden baseline). A standalone overlay continues its own game clock and live accounting when controls are hidden after play starts. Showing controls takes control locally. There is no hidden server synchronization. An archive URL requires that round in the API's available list or an existing local saved run; an expired round is explicitly unavailable, with Demo offered as a choice.

**Export garden PNG** downloads a real **1200×675** PNG, drawn from the current tile orientations, connectivity, growth state, score, mode, network and pinned source timestamp/hash. It is labelled a static local-score snapshot. All drawing is local SVG/canvas; no screenshot or paid service is involved.

Progress, original source, current board, remaining active time, reservoir, high-water marks and bests use local storage key `squeek-signal-garden.v1`. An active run restores paused. Validation rejects corrupt sources, tile masks and invalid progress; blocked/full storage reports a warning while gameplay/export continue. Sound preference deliberately resets off. Local scores are editable by their browser owner and have no competitive or monetary authority.

## Two-minute reviewer walkthrough

1. **0:00–0:20:** Open at **390×844**. The title, mode, board and **Start garden** are on the first screen. Default is a clearly historical Round Challenge; its provenance links to the API-reported network. Select **How to play**, follow the outlined elbow, Rotate, outlined flower and Grow, then return to the full game.
2. **0:20–0:45:** Choose **Demo** (or open `?mode=demo`) and Start. On this fixed fixture rotate **A2, C3, D2, F2 once each**, in that order. The first garden connects in 4 moves. Select a connected flower and Grow; the charge count drops and score rises 150. Next garden.
3. **0:45–1:15:** Garden 2 correction sequence: **B1×1, B2×1, B4×2, B5×1, B6×1, C2×1, D3×1**. Next garden. Garden 3: **B2×1, C1×2, C2×2, C3×2, C5×1, C6×3, D1×1, D4×1, E1×1, E6×1**. Each count means clockwise Rotate presses after selecting the tile. Finish the garden for the actual win screen and local best.
4. **1:15–1:35:** Export the PNG. Play again, Start, select **A2** and rotate it **11 times**: a real move-limit loss opens. Play again resets the clock and board. Keyboard users can focus a tile with arrows, Enter to select and R to rotate. Pause/Resume and Restart cancel/confirm also work.
5. **1:35–2:00:** Open Share / stream, copy/open the overlay, toggle controls. Try another historical round with **Change round**. In Live Garden while the wheel is idle, starting awards **0** lifetime-distance charges and baseline routing works. If the API is unavailable, explicitly choose Demo; nothing is silently substituted as live. Automated virtual-clock checks exercise timer loss, live accrual, resets, staleness and retry without waiting in real time.

## Validation and evidence

The following are **worker-side observations on 2026-11-04**, not an independent network certification. They target the final production export served beneath `/preview/`. Reports are in [evidence/validation.md](evidence/validation.md), [browser results](evidence/browser-results.json), [deterministic results](evidence/unit-results.json), [design probe](evidence/taste-results.json) and [export integrity](evidence/export-integrity.json).

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed, strict TypeScript no-emit |
| `node scripts/record-unit.mjs` / `npm test` | **34/34** tests passed; 3,000 seeded boards checked against an independent connectivity oracle, 100 full legal three-board wins, seed snapshot, move/time loss, spending, schemas, repeat/reset/stale/reconnect accounting, serialized polling/Retry-After/body timeout, archive reproduction and storage failure |
| `npm run build` | Passed; complete `dist/index.html` and local runtime assets |
| `npm run test:browser` | **Chromium 12/12 groups passed**; WebKit could not launch because required host libraries were missing |
| Pinned `taste.mjs --out test/scratch/taste` | **16/16** checks passed, including 320/390/1440 reflow, primary-screen copy, targets, contrast, typography, motion and metadata |
| `node scripts/check-export.mjs` | Passed: relative/present assets, metadata, 1200×630 share image, unchanged manifest/lock match, runtime hashes and explicit byte budgets |

The 12 browser groups cover interactive tutorial and focus trap/return; keyboard selection/rotation; pause, saved-run reload and restart; complete desktop win, single-use growth, bests, real PNG and denied-clipboard fallback; complete mobile touch win and genuine move loss; idle live input, repeats, capped accrual, epoch/outage/reconnect and next-round-only seed changes; noncontiguous historical selection and two-context reproduction; unavailable API plus storage denial; actual 16:9 overlay and controls; responsive/reduced-motion/accessibility/contrast/focus; virtual 180-second loss and sound toggle; same-browser live overlay synchronization; and actual public APIs with no script errors or missing local assets.

No horizontal overflow was measured at **320, 390, 620, 760, 900 or 1440** CSS pixels, or with **200% root text enlargement** at 390. The main action is wholly visible at 390×844. Axe's selected WCAG 2.2 AA-related tags reported **0 violations in the tested ready and tutorial states**. Loaded local fonts and the visible 3px keyboard focus ring were checked. Solid contrast pairs measured from rendered CSS: body/page **16.325:1**, secondary text/surface **8.316:1**, primary label/fill **10.712:1**, focus/surface **13.895:1**. These measurements do not certify every composited art or user color-preference state.

### Better Interface review

All six pinned domains were applied during construction and reviewed on the export: accessibility, layout, writing, typography, colors and UI. [DESIGN.md](DESIGN.md) records the implemented system; [the consolidated review](evidence/validation.md) records source locations, findings, corrections, evidence and limitations. Fixed findings included too few scramble candidates in a generated edge case, modal trapping that included non-tabbable tiles, text-enlargement overflow, offscreen desktop controls, duplicated overlay accounting, a response-body timeout gap, invisible paused-board tab stops and inconsistent combo scoring on simultaneous connection/disconnection. Rechecks passed.

**Unavailable checks:** WebKit/Safari (launch failed for missing system libraries); a physical phone; a screen-reader session; native browser zoom; real OBS capture; actual speaker audibility; cross-device progress synchronization (not implemented or claimed); and a real-time wait for hamster movement/staleness. Mobile input is emulated touch. Timer and edge-case movement tests use explicit fixtures and virtual clocks; the separate actual-API check observed a resting wheel. Automated accessibility/probe passes are not a claim of full WCAG compliance.

## Known limits and delivery

- The public APIs and their CORS/gateway behavior are external dependencies. A cold first visit needs the site assets; there is no service worker guaranteeing cold offline loading. Once loaded, Demo and any valid saved challenge work without API access. Schema changes fail explicitly.
- The available archive is the API's recent list, not an invented complete round history. An old URL can become unavailable on a fresh device. Settlement confirmation is API-reported; the game does not perform independent consensus verification.
- Live sampling is delayed and conservative. It deliberately loses gap movement and may suppress new low counters until their previous same-epoch high-water marks are exceeded. Device clock errors can mark a source stale. Reset/release notes explain rebaselining; the original run input remains pinned for restart.
- The 32-bit hash and finite puzzle space permit seed/board collisions. The comb-tree family and 4/7/10 scrambles provide bounded, testable variety; it is not a claim of unique boards for every transaction or a globally optimized difficulty rating.
- Storage is origin/profile-local, can be evicted and is user-editable. Stream progress sharing works only within that storage boundary. There is no backend, account, remote leaderboard or cross-device broadcast.
- The committed source, unchanged package manifest/lockfile and complete `dist/` export are the submission. Dependency directories, browser binaries, caches, registry mirrors, archives, source maps and submodules are not deliverables. [scripts/path-budget.json](scripts/path-budget.json) budgets generated dependency/cache paths at zero and bounds the whole submission to **8,388,608 bytes**. No ignore file or protected build/dependency file was changed.

**Publication handoff:** IMD owns the public repository and IPFS publication after the worker's submission. The existing public source repository is [identity-md-launches/launch-2918-production-site-through-imd](https://github.com/identity-md-launches/launch-2918-production-site-through-imd). The supplied hosting record names `blocklight-every-block-lights-ou.identitymd.eth`; that existing name is retained for the next version even though the product has changed. The supplied previous commit/CID belong to Blocklight and are not evidence that this new export is already live. No publish/Git-metadata mutation was performed. The current job URL, final public commit hash and new IPFS CID/live gateway URL must be returned by IMD's publication step; they are not available to this worker and are not fabricated here. The existing ENS gateway could not be verified from this worker (TLS alert); local production export, public APIs and public repository were reachable.

## Sources and attribution

The actual [Genesis Code build/skip rules](https://squeekchain.com/genesis/code) were read in a browser. This delivers a playable original game and stream companion whose real wheel/round inputs change gameplay; it is not a read-only dashboard, token landing page or lightly changed tutorial. No official approval is claimed.

All botanical/wheel artwork is original SVG/CSS in this repository. Existing local Space Grotesk and DM Sans fonts retain their OFL notices in `public/fonts/`. Better Interface guidance is adapted from [Jakub Krehel's pinned work](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface) (MIT); design documentation guidance is adapted from [Paul Bakaus's pinned Impeccable method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md) (Apache-2.0). The existing [combined license notices](LICENSES/Design-guidance-LICENSE.txt) are retained.
