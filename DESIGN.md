# Blocklight design system

## Overview

Blocklight is a small logic game for mouse, keyboard and touch players. Its single visual idea is a panel of square light switches: an ivory page, one charcoal board, sage unlit tiles and pale lime lit tiles. The board is the product. Source transparency and score controls support it without a marketing screen or extra navigation.

The implemented source of truth is `src/styles/app.css`; page composition is in `src/App.tsx`. The one display heading, flat surfaces, quiet utility actions and compact source information should carry through any extension. These are implementation choices made for this assignment, not a preexisting requester brand.

## Colors

Primitives are declared at `src/styles/app.css:5`; component rules use semantic role tokens.

| Semantic token | Value | Intended role |
| --- | --- | --- |
| `--color-bg` | `#f4f5ed` | Page, dialog surface, light board focus/marker ink |
| `--color-surface` | `#e8ebdf` | Quiet control hover, help illustration backing, textarea |
| `--color-text` | `#202820` | Primary ink and button text |
| `--color-muted` | `#535f4c` | Instructions, secondary labels, metadata |
| `--color-border` | `#d3d8c9` | Structural separators and neutral control outlines |
| `--color-accent` | `#d4ed93` | Lit switches and the primary action fill |
| `--color-accent-hover` | `#c1dd76` | Primary action hover |
| `--color-board` | `#202820` | Game frame; dark ink on lit switches |
| `--color-tile-off` | `#65735d` | Unlit switch fill |
| `--color-board-text` | `#d9dfd0` | Frame labels and counts |
| `--color-focus` | `#315c08` | Focus outline on the ivory surface |
| `--color-warning` | `#80521f` | Stale/unavailable API and storage warnings |
| `--color-error` | `#a73d33` | Recoverable import error text |

There is one intentionally light theme. Do not add an unused theme ramp. Every feed state has text and a dot treatment; lights have filled versus outlined center marks and `aria-pressed`, so state is not conveyed by hue alone. Affected lit tiles use a dark inset outline; affected unlit tiles use light ink. Board focus and hint outlines sit outside the tiles against the dark frame.

Actual computed solid pairs were measured in both Chromium and WebKit: primary ink/page **13.805:1**, muted ink/page **6.153:1**, frame labels/frame **11.125:1**, off-tile boundary/frame **3.005:1**, off marker/hint ink/tile **4.595:1**, primary button ink/fill **11.787:1**, board focus/frame **13.805:1**. See `artifacts/browser-results.json` for colors and thresholds. Disabled controls are intentionally dimmed. The translucent modal backdrop is decorative; text is on the opaque dialog surface. These measurements do not establish every possible user color preference.

## Typography

Two local Latin variable WOFF2 fonts, both with their original OFL notices:

- **DM Sans**, `public/fonts/dm-sans-latin-wght-normal.woff2`, CSS range 100–1000; body, controls and data labels. Fallback: `sans-serif`.
- **Space Grotesk**, `public/fonts/space-grotesk-latin-wght-normal.woff2`, CSS range 300–700; brand and headings. Fallback: `sans-serif`.
- Hashes and seed keys alone use `ui-monospace, SFMono-Regular, Consolas, monospace`. No monospace prose or extra font download.

The used weights are **400, 500 and 600**, with `font-synthesis: none`. Font loading was checked in the rendered production export. The global type scale contains six tokens:

| Token | Size at the default root | Role |
| --- | --- | --- |
| `--text-xs` | .8125rem / 13px | Metadata, source labels, mobile instructions, code |
| `--text-sm` | .9375rem / 15px | Utility controls, prose, instructions |
| `--text-body` | 1rem / 16px | Body default, main action, small headings |
| `--text-lg` | 1.5rem / 24px | Brand, desktop round title, metrics, dialog headings |
| `--text-xl` | 2rem / 32px | Mobile display heading and mobile result number |
| `--text-display` | 3.5rem / 56px | Desktop display heading and result number |

The h1 is weight 600, line-height 1.06, tracking −.055em; below 44rem it is 32px/1.12 with −.05em tracking. Round/dialog h2 uses 24px/1.3 with −.03em tracking; the mobile round name becomes 16px/1.4 with natural tracking. H3 uses 16px/1.4 at weight 600. Prose is 1.5–1.6 line-height. Long details are capped near 65 characters; headings balance and long hashes wrap instead of truncating. Metrics use tabular numerals to remain stable as counts change. The page uses natural sentence case.

## Layout

Shared spacing tokens are **4, 8, 12, 16, 24, 32, 48 and 64px** (`--space-*`). A group uses smaller internal gaps than the space separating it from another group. One common `.container` aligns header, game and footer.

- **Above 60rem:** container width is `min(1160px, 100% − 80px)`. The workspace has a board column capped at 520px, a second column of at least 300px, and a 64px gap. The heading is a compact single row with a plain product description alongside. The board frame has 24px padding; grid gaps are 10px.
- **At or below 60rem:** the container uses 24px side margins; the workspace uses 32px gaps and flexible 1.25fr/1fr columns with a 280px minimum on the controls. Frame padding becomes 16px, grid gaps 8px.
- **At or below 44rem:** one column with a 500px maximum and 16px side margins. Round controls and Play puzzle appear before the board, then source controls. The same order is in the DOM. The brand and help remain at opposite ends of a 76px header. The h1 is 32px. Secondary desktop notes are hidden; the essential rules remain beside the board and in Help. Workspace gaps and intro padding are 16px.
- **At or below 22rem:** frame padding is 12px, tile gaps 6px and tile corners 8px; brand text is 16px. This keeps all five columns usable at 320px.

The 5×5 board remains square. Coordinates are physical and the grid keeps `direction: ltr` even when the surrounding page is mirrored. Logical margins/padding handle surrounding layout direction. Text containers grow and wrap; full hashes and share links are never ellipsized. Dialogs scroll within `100dvh − 48px` and retain 16px viewport margins.

Rendered widths checked: **320, 390, 768, 960 and 1440px**, plus a separate taste probe at 320/390/1440. The main action is on the first screen at 390×844. Reflow also passed with the root font enlarged to 200% and with an RTL mirror. This is not a native browser-zoom or translated-language test.

## Elevation & Depth

The interface is flat. Header/footer/metrics/source separators and neutral button borders communicate structure. There are no nested information cards or decorative page shadows. The dark board is a single tonal surface.

`Modal` uses the native dialog top layer, an opaque ivory surface and a single `0 24px 80px #0003` shadow without a border. Its backdrop is `#162015a6` with 3px blur. The backdrop never carries text. No fixed toolbar covers gameplay.

## Shapes

The board frame is 24px radius on desktop, 20px at the intermediate breakpoint and 18px on very narrow screens. Tiles use 12px corners, reducing to 10px and 8px. Controls use 10px corners. The help illustration has a 16px backing radius and 5px miniature cells. Dialogs use 24px corners. These values distinguish the overall panel, controls and nested switch shapes without extra decorations.

## Components

### Buttons and links

Patterns live in `src/styles/app.css:31`. `.button-primary` is a filled lime action; use one primary action for the current task. `.button-outline` is a neutral source/export action; `.button-quiet` is a utility. `.text-button` is underlined and at least 44px tall. `.icon-button` is 44×44 and requires an accessible action name. The brand also has a 44px minimum height.

Standard buttons are at least 48px tall; desktop primary gameplay is 56px, mobile is 48px, and board tools are at least 44px. Hover styles are gated behind `(hover:hover)`. Native disabled states prevent actions and dim utilities, while the ready/finished board retains its readable light pattern.

### Board

`src/components/Board.tsx` receives the current `Round` and callbacks for press, restart, undo and export. It owns only focus/hover presentation. A native button in each semantic gridcell exposes its coordinate, on/off state, and hint state. The board is disabled before starting and after finishing.

Arrow keys and Home/End move a roving tab stop; Space/Enter activate. The current focus has a **3px solid ivory ring, 3px offset**. A hint has a dashed ring and visible “Hint” label. Hover/focus outlines preview the pressed tile's cross. Start and replay focus the active grid tile. On/off markers differ by filled versus outlined centers.

### Modal

`src/components/Modal.tsx` accepts `title`, `onClose`, `children` and optional `wide`. Default maximum width is 480px; wide is 600px. It uses `showModal()`, labels itself from the visible heading, autofocuses Close, wraps Tab/Shift+Tab, closes on Escape/backdrop, and restores the opener's focus. Native dialog makes the background inert. Use it for help, source, archive, result and explicit discard confirmations.

### Round controls and source panel

These are composition patterns in `src/App.tsx`, not an exported component library. The round panel presents origin, identity, moves/par/potential, and one main action. The guidance is a polite atomic status region for hints and remaining moves. Feed status is separately announced. This distinguishes a locked round from the changing feed.

Source choices show loading/live/stale/unavailable/paused with text. Load latest block is disabled unless there is a fresh different input. Demo and archive remain usable. Local storage errors have a visible warning; no fabricated data fills an API outage.

### Details, imports and exports

Source details use a two-column definition list and wrapping monospace values. Export actions wrap as needed. Clipboard denial reveals a full, explicitly labeled selectable textarea (`#puzzle-link`). Archive import is a labeled native file input with an error region; the list clearly says browser-local and unverified. Result content shows outcome, score provenance and replay/export actions, with no implied public leaderboard.

### Icons and motion

`src/components/Icon.tsx` contains one local SVG set with 1.7px current-color strokes, 20px by default and 16/18px in supporting labels. Icons are decorative when a text label supplies the accessible name. `Mark` is the local four-switch brand symbol.

Interaction transitions are **120ms**, explicit `background-color` and `scale`, with `cubic-bezier(.2,0,0,1)`. Press scale is **.96**. They exist only under `prefers-reduced-motion: no-preference`; no endless animation or page entrance exists. Motion is accompanied by persistent board state, labels or counters. Forced colors retains switch borders and a distinct lit state.

## Do's and Don'ts

- Start with `.container`, the six type tokens and existing buttons. Keep the actual game/action ahead of explanation on mobile.
- Reuse the semantic palette. If changing off-tile fill or hint ink, remeasure both the 3:1 tile/frame boundary and 4.5:1 hint text pair, then update PNG/share rendering too.
- Use `Modal` for an overlay; preserve its focus behavior. Use ordinary wrapping flow for details and utility actions.
- Keep all origin labels truthful. A cached, imported or demo input must not acquire the live badge merely because a separate feed is connected.
- Keep full identifiers available and copyable. Add no fixed-height text box, cropped hash or ellipsis to force a fit.
- To add another small view, compose existing buttons, heading steps and flat source rows; keep hash routing/static export compatibility and recheck 390px. Do not add another font, decorative card stack or unneeded wallet integration.

Design workflow attribution: Better Interface by Jakub Krehel (MIT); documentation method adapted from Impeccable by Paul Bakaus (Apache-2.0). Exact pinned source links are in `README.md`; notices and licenses are retained in `artifacts/licenses/Design-guidance-LICENSE.txt`.
