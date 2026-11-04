# Production validation and consolidated review

Squeek Signal Garden, 2026-11-04. This is the worker's own evidence and review, not independent network certification. The checked target is the production `dist/` export served at a `/preview/` subpath, with the same source, local runtime assets and relative URLs submitted for IMD hosting.

## Outcome and scope

| Area | Result |
| --- | --- |
| Required local game, data adapters, persistence and sharing | Implemented; checked as detailed below |
| Executed deterministic tests | 34/34 passed |
| Executed Chromium interaction groups | 12/12 passed |
| Product/main action on first screen at 390×844 | Yes; final manual inspection placed Start at y=752.375–796.375, with content width exactly 390 |
| Pinned taste@1 probe | 16/16 checks passed |
| Share metadata/card | Title, description, favicon, og:title, og:image and real 1200×630 local PNG present |
| Static production export | Built, complete, relative assets; integrity and byte budgets passed |
| WebKit / native-device checks | Not verified; details below |
| New public commit, job URL, live IPFS publication | After worker submission, owned by IMD; not claimed already published |

The implemented visual idea is a night-garden puzzle in which gold signal conduits from an original hamster wheel restore cyan flower beacons on indigo ground. Ordinary design decisions were inferred from the complete brief; optional Chinese localization was omitted to prioritize a reliable English core. No new contracts, wallets, private configuration, financial flows or fake online features were added.

## Requirement review

This review was performed after implementation against the complete brief, then findings were repaired and affected checks rerun.

| Brief requirement | Local result / evidence |
| --- | --- |
| “an original finished browser puzzle game and stream companion” | Met: actual conduit engine, complete three-board win/loss, tutorial, source-dependent overlay; not a dashboard or API-only wrapper |
| “Read … genesis/code and respect its build/skip rules” | Met: actual page read in browser; original game/stream companion implements its build direction; no copied project, token landing or approval claim |
| “6x6 grid with straight, elbow and T-junction tiles, obstacles and a limited move budget” | Met: 36 cells, all three conduit types, 3/5/7 stones, seeded scramble and computed cap; 3,000-board corpus |
| “Tap/click selects … Rotate … R … arrow keys … Enter” | Met: actual keyboard and touch checks; selection itself spends no move; no dragging |
| “three-minute run … three progressively harder boards … actual win/loss screen” | Met: full desktop and mobile wins, genuine move-cap loss, virtual 180-second clock loss, restart; 4/7/10 scrambled tiles and shrinking slack |
| “score, connection streak, combo and local personal best” | Met: visible run HUD, per-flower awarded set, disconnection/combo regression, separate local mode/source keys |
| “short interactive tutorial, pause/restart … sound … off until user interaction” | Met: four actual touch tutorial steps; pause/resume, restart cancel/confirm, sound toggle initialized by click |
| “connected solution before scrambling … every board … solvable” | Met: connected degree-three tree construction first, then scrambling; independent connectivity oracle and 100 full legal runs |
| All three specified schema-versioned public endpoints and consumed fields | Met: actual pre-implementation reads in `api-verification.json`, strict parsers, final actual-API browser group; no invented endpoint/method/reward |
| “builder.projected … optimistic” / actual network | Met: projections ignored; telemetry labelled provisional; archive safe status explicitly API-reported; Sepolia 11155111 label and explorer observed |
| “Live Garden … 10 seconds … 60 seconds … no overlapping … Retry-After … timeout/backoff … hidden” | Met: one request lane, full-body timeout, backoff, whole-lane Retry-After embargo, cancellation generations and visibility lifecycle; virtual tests |
| “Pin an epoch and source baseline … positive new work/distance … visible, capped reservoir” | Met: Start rebaselines current counters with zero past awards; paired deltas, 1,000mm threshold, cap 3, single-use spending; HUD count/slots |
| “baseline power while the hamster sleeps” / next-round seed only | Met: idle live starts and remains playable at zero bonus; feed/epoch/outage changes leave the board unchanged; explicit advancement uses updated round |
| Repeats, reconnects, negative deltas, epochs, old timestamps, installation/release changes | Met: monotone identity-specific high-water marks, rebaseline notes, gap discard, persistence; adapter corpus and browser live sequence |
| “Round Challenge … default … safe confirmed settlement with positive workAdded” | Met: API-safe/finalized positive entries only; historical label; full hash/round/actual chain seed and bounded work budget |
| “same pinned round … same puzzle and budget on two devices” / another archived round | Met: separate browser contexts compare masks; deterministic adapter tests compare budget; noncontiguous round selection; explicit tx URL overrides a different saved tx in the same round |
| “Demo … fixed deterministic fixture … network failure … never silently replace” | Met: explicit practice label and separate best; unavailable archive offers Play Demo; fixture is never presented as live |
| Night observatory art, warm gold/cyan/indigo, board priority | Met: original `art.ts` botany and hamster wheel, flat indigo scene, dominant board; actual screenshots inspected |
| Responsive 390/1440, visible focus, readable contrast, redundant states, reduced motion | Met in available browser: widths 320/390/620/760/900/1440, focus and solid color pairs measured, noncolor glyph/shape/text cues, reduced motion; physical/native limits below |
| “About … actual Squeekchain dependency … links” | Met: concise independent-creation panel, read-only dependencies, required Squeekchain/Genesis links, no official approval claim |
| “real overlay URL … static IPFS … 16:9 … badge … hide-controls” | Met: query URL preserves host/subpath, actual 1920×1080 scene, source/mode/round/freshness; Show/Hide controls; same engine and standalone clock |
| “Copy overlay URL and export garden PNG … manual-copy fallback” | Met: actual 1200×675 PNG download decoded and dimension checked; denied clipboard creates complete selectable URL |
| “Scores and progress persist locally … graceful storage failure” | Met: saved board/time/source/marks restore paused; bests stay mode-local; storage denial/corruption do not block play/export |
| Fresh build, source and lockfile plus committed static export | Met locally: fresh external install from unchanged locked dependencies, production build/typecheck, complete source/tests/docs and `dist/`; Git/publication bundle is IMD's subsequent step |
| README, DESIGN.md, independent review and actual evidence | Met: setup/build/test, architecture, formulas, two-minute walkthrough, limits and six-domain review; machine-readable reports and actual images included |

## Better Interface: six-domain coverage

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility | Native buttons/dialog, names/roles, roving focus, Enter/R/arrows, trap/return, hidden/paused board tab stops, visible 3px focus, explicit statuses and reduced motion; keyboard and touch groups; axe selected WCAG tags: 0 violations in ready/tutorial states | No screen-reader session, physical phone, native zoom or full WCAG certification; not every modal/state received a separate axe scan |
| Layout | Actual 320/390/620/760/900/1440 reflow, 200% root-text enlargement, full first phone action, compact desktop composition and 1920×1080 stream scene; no horizontal overflow | English only; RTL/translation and every possible viewport were not tested |
| Writing | Historical/Live/Demo provenance, provisional versus API-safe status, exact network, verb-first controls, recovery actions, source-specific loading copy, no global score claim or financial promise | API/browser error wording can vary; optional Chinese was not implemented |
| Typography | Six declared size tokens, two local font families, three used weights, tabular changing values, natural casing/tracking and wrapping; loaded fonts observed; probe typography passes | No native Safari typography or browser-native zoom test |
| Colors | Role tokens, distinct redundant states and solid pairs measured from rendered CSS; probe contrast passes | Decorative SVG and all alpha/composited/forced-color variants were not separately measured |
| UI | Primary/secondary/disabled/paused/selected/powered/grown/won/lost states, real data loading/empty/failure/retry, confirmations, actual downloads, clipboard fallback and source-dependent overlay; named 120ms transitions and reduced motion | No physical speaker/OBS capture; animation-panel 10% speed replay not performed |

Measured solid pairs: body `#f2eee4` on `#0b1021`: **16.325:1**; secondary `#a9b7ca` on `#141c31`: **8.316:1**; primary `#151b28` on `#edc77c`: **10.712:1**; focus `#f7e8bd` on `#141c31`: **13.895:1**. The probe found all measured text above its required threshold. It reported eight utilities under the comfortable 44px size; all 53 measured controls satisfied the 24px/spacing baseline. Core game actions are 44px high.

## Findings, changes and rechecks

| Severity / domain | Source location and original finding | Correction and evidence |
| --- | --- | --- |
| Medium / gameplay | `src/core/engine.ts:43`: unconstrained branch sides could leave only six mutable conduits when stage three requested ten | Balanced two branches to each edge, preserved seeded shuffle/transform and guaranteed the entry scramble. Initial corpus failed at 6 vs 10; final 3,000 boards and all 100 full games pass |
| High / accessibility | `src/components/Modal.tsx:21`: trap candidate list included buttons with `tabindex=-1`; a second Tab in tutorial reached browser/body focus | Filter actual tabbable controls. Touch tutorial plus repeated Tab checks now stay inside; closing restores the opener |
| High / layout | `src/styles/app.css:34`, `:36`: 200% root text produced a 506px document at a 390px viewport through auto minimum track sizes/nowrap | Zero-minimum mode tracks, wrapping labels and auto-fit stats. Final enlarged check measures no horizontal overflow |
| Medium / layout | `src/styles/app.css:30`: roomy desktop board placed its action row below the initial viewport | Height-aware compact game/aside columns, header and spacing. Actual final 1440 screenshot shows full board and controls; 390 main action remains visible |
| High / data and UI | `src/App.tsx:73`, `:85`, `:112`, `:119`: a stream tab could run independent reservoir accounting or overwrite controller progress; hiding controls also overbroadly froze standalone play | Following state separates an actual storage follower from an independently played overlay. Followers skip their own accounting/clock/save; standalone hidden-control games continue. Same-profile live test follows exact board and 3→2 spend without another charge award; standalone timer continues after hiding controls |
| High / availability | `src/data/rpc.ts:34`: header fetch was timed but a stalled JSON body could hold the entire serialized lane | Race the complete fetch/body/adapter operation against timeout. Hanging-header and hanging-body tests both pass; Retry-After delays the whole lane and manual Retry cannot bypass it |
| High / accessibility | `src/components/Board.tsx:14`: a covered paused board retained a tab stop with its focus indicator hidden by the cover | Disabled boards remove the roving tab stop and keyboard handler. Pause browser check asserts zero board tab stops; Resume remains visible and functional. Duplicate filled Resume was reduced to a quiet paused label plus one primary Resume |
| Medium / scoring | `src/core/engine.ts:134`: simultaneous first-connection/disconnection could score with a higher combo than the reset combo shown in the HUD | Determine disconnection before streak/multiplier. A deterministic legal-shape regression checks ×1 scoring and verifies reconnection earns only the board-clear bonus, not repeat flower points |
| Medium / persistence | `src/data/storage.ts:34`: malformed fractional control indices/result fields could survive a shallow restore | Require integer discrete progress, valid masks/caps, string result and bounded source data; restore active runs paused. Corrupt/blocked-storage tests pass |
| Medium / source pinning | `src/App.tsx:26`: a saved challenge with the same round but a different transaction could take precedence over a pinned tx URL | Include the transaction hash in saved-run matching. Browser check opens a second safe fixture tx in the same round and receives its exact link/board rather than the old save |
| Low / writing | `src/App.tsx:145`: a live-loading cover used historical-round wording, and stale/mismatched sources lacked an immediate explicit recovery message | Derive waiting/empty state from the needed source and show source-specific text, retry or explicit Demo; available API/failure groups and source review rechecked |

No unresolved critical local gameplay/usability defect was observed in the final checks. The limits below remain disclosed rather than represented as passes.

## Commands and actual browser groups

The final worker ran `npm run typecheck`, `node scripts/record-unit.mjs` (which runs `npm test`), `npm run build`, `npm run test:browser`, the pinned `taste.mjs --out test/scratch/taste` probe and `node scripts/check-export.mjs`. A fresh external install used the unchanged package manifest/lockfile. The production bundle was rebuilt after the last application-source change.

The browser report contains twelve executed groups: tutorial/focus; keyboard/pause/save/restart; desktop full win/growth/PNG/clipboard fallback; mobile full touch win/move loss; idle live/repeats/cap/epoch/outage/reconnect/next-board seed; historical pinning and separate-device reproduction; unavailable API and storage denial; actual overlay/control toggle; responsive/enlarged/reduced-motion/axe/contrast/focus; timer loss/sound/mode bests; same-profile live stream following; actual public APIs/production screenshots.

**Fixture boundary:** resets, movement bursts, rate limits, same-round alternate tx and unavailable states are explicit automated test fixtures. They do not claim those events happened on the real wheel. Only the separate actual-public-API group uses the real services. The committed screenshots of `actual-*` use those real responses. Demo win/loss/overlay images and the PNG are visibly labelled practice.

Evidence files:

- [actual desktop](actual-1440.png), [actual first phone screen](actual-390.png), [visible keyboard focus](keyboard-focus-390.png)
- [desktop win](win-desktop.png), [phone loss](loss-mobile.png), [16:9 Demo overlay](overlay-1920.png), [actual downloaded garden PNG](garden-win.png)
- [browser groups](browser-results.json), [deterministic tests](unit-results.json), [taste probe](taste-results.json), [runtime hashes/byte budget](export-integrity.json), [actual API fields](api-verification.json)

The final manual browser view at 390×844 was inspected as an image: brand and help, concise title, mode selector, explicit Demo label, run values, full 6×6 board, Start, growth-count control and restart are visible. Start's measured box was x=20, y=752.375, width=153.625, height=44; document content and viewport widths were both 390. Final automated screenshots additionally show the default actual historical mode at phone/desktop sizes.

## Unperformed checks and publication boundary

WebKit's browser binaries were available, but launch failed because system libraries were missing; no WebKit assertions were executed. Safari/native iOS behavior remains unverified. No physical device, screen reader, native zoom, real OBS capture, speaker audibility or real-time hamster run/staleness wait was performed. Reduced motion, root text enlargement, synthesized input and timer/source behavior were tested in Chromium with the explicit boundaries above.

There is no cross-profile/device move broadcast; a separate OBS profile plays the pinned source as a fresh game. Cold offline first loading is not guaranteed without assets already being available. Recent archive URLs can expire from the public API's list. Public API safety is not independent consensus verification. All scores are local, editable and nonfinancial.

The full source and complete static `dist/` are ready for IMD's submission/publication step. The existing public repository is `https://github.com/identity-md-launches/launch-2918-production-site-through-imd`; supplied hosting name is `blocklight-every-block-lights-ou.identitymd.eth`. A direct check of the existing ENS gateway failed with a TLS alert, so it is not recorded as a verified live deployment of this new export. The current job URL, new public commit and new IPFS CID/gateway URL are publication outputs unavailable to this worker; the previous project's commit/CID are not substituted for them. No protected Git metadata, deployment credential or publishing configuration was read or modified.

**Completion:** local implementation, static export and the available required browser/engine checks are complete. IMD publication is a subsequent handoff; WebKit and the listed native/manual checks remain unverified. Required source/assets are retained, generated dependencies/caches are excluded and the submission fits the explicit 8MiB limit. See export-integrity JSON for measured bytes.
