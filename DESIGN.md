# Squeek Signal Garden design system

## Overview

A browser puzzle and stream companion for people restoring a night garden in short sessions. One visual idea carries the page: warm gold signal conduits growing cyan flowers on deep indigo ground. The game board receives the largest surface; a small original hamster wheel, reservoir and source provenance support it. There is no marketing landing screen or dashboard-first hierarchy.

The source of truth is `src/styles/app.css`, with procedural illustration in `src/components/art.ts` and composition in `src/App.tsx`. The existing local font files and native-dialog foundation were retained. This document describes the implemented Squeek Signal Garden, replacing the preceding product's visual system.

## Colors

CSS tokens are declared in `src/styles/app.css:3`. The single intentional dark theme uses sRGB hex values and `color-scheme: dark`.

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#0b1021` | Night ground/page and form backing |
| `--color-surface` | `#141c31` | Board bed, modal and quiet surfaces |
| `--color-tile` | `#1c2640` | Unpowered conduit tiles |
| `--color-tile-powered` | `#24313f` | Powered tile backing |
| `--color-text` | `#f2eee4` | Primary text |
| `--color-muted` | `#a9b7ca` | Instructions, secondary data and labels |
| `--color-border` | `#46536c` | Structural control outlines |
| `--color-accent` | `#edc77c` | Primary action, selected tile, charge accents |
| `--color-accent-hover` | `#f6d99f` | Primary action hover |
| `--color-signal` | `#91dfd3` | Connected flowers and informative success/link accents |
| `--color-error` | `#f1af9e` | Recoverable unavailable-source/storage errors |
| `--color-focus` | `#f7e8bd` | Visible keyboard focus perimeter |
| `--color-ink` | `#151b28` | Dark text on the warm primary action |

Artwork uses the same family of colors as explicit SVG literals so the screen and SVG/canvas PNG share the exact drawing code. `tileArt`, `flowerArt` and `wheelArt` in `src/components/art.ts` own that palette: gold `#f0ce86` signal cores, `#8592ac` dormant cores, cyan `#91dfd3` flowers, and warm tan hamster shapes. These literals are illustration details, not a second UI theme.

Color has redundant cues: selection has a perimeter and coordinate tag; power adds a leaf and explicit accessible name; flowers show a check mark; growth adds a plus/star; stones have a distinct polygon silhouette. Live, idle, stale, historical and Demo states are spelled out. The current connection count is a polite status region. No token/reward color semantics are implied.

Final rendered solid-pair measurements in Chromium: primary text/page **16.325:1**, secondary text/surface **8.316:1**, primary label/fill **10.712:1**, focus/surface **13.895:1**. The pinned probe passed measured text contrast. Decorative SVG art, all transparency combinations and forced user themes were not certified by those numbers.

## Typography

Two local Latin variable WOFF2 families, loaded from `public/fonts/` with their existing OFL notices:

- **Space Grotesk**, weights available 300–700: brand, headings, score/timer values. Fallback `sans-serif`.
- **DM Sans**, weights available 100–1000: body, controls, labels and provenance. Fallback `sans-serif`.

The interface uses **400, 500 and 600** only. `font-synthesis: none` is set on the root. Both local fonts were observed loaded in production. There is no remote font request and no monospace prose.

| Token | Default size | Use |
| --- | --- | --- |
| `--text-xs` | 13px / `.8125rem` | Source metadata, coordinates, concise instructions |
| `--text-sm` | 14px / `.875rem` | Controls, compact descriptions |
| `--text-base` | 16px / `1rem` | Body, disclosure headings, copy fields |
| `--text-lg` | 20px / `1.25rem` | Secondary headings and game values |
| `--text-xl` | 32px / `2rem` | Main title on compact/phone layouts, pause message |
| `--text-display` | 40px / `2.5rem` | Roomy desktop title and result score |

Headings use 1.1–1.25 line-height and balanced wrapping. Body uses 1.6; modal prose uses 1.65. The main title tracks at −.045em at 40px or −.035em at 32px; small text is naturally spaced. Timers, scores and changing values use tabular numbers. Critical identifiers wrap with `overflow-wrap: anywhere` in detail views instead of clipping. Textareas remain at 16px or larger on mobile. Root antialiasing is applied once.

## Layout

Spacing reference tokens are **4, 8, 12, 16, 24 and 32px** (`--space-1` through `--space-8`); component declarations use that rhythm plus geometry-specific board gaps/insets. Structural edges align the title, mode control, stats, board and action row.

- Roomy desktop: `.app` max 1200px, 40px inline padding; `.main-layout` has up to 650px game + 310px source column, 72px gap.
- Desktop with height ≤1020px: game width `min(490px, 100vh - 410px)` + up to 290px aside, 64px gap, 76px header and smaller title. This keeps the board and Start/Rotate visible at both checked laptop heights, 780px and 900px.
- Width ≤1080px: 28px page inset, compact brand/title and narrower columns.
- Width ≤760px: one column, max 620px page; 20px inset, 82px header, game first, source details below. At 390×844 the complete board and main Start action are visible on the first screen. The remaining charge count is also shown on Grow.
- Width ≤760px and height ≤760px: 56px header, compact mode-tab padding, visually hidden intro (including the retained accessible h1). The brand still identifies the product. At 390×664 the complete board ends at 599px and Start/Rotate ends at 657px.
- Width ≤365px: 12px inset and tighter utility spacing; the six-column board still reflows without horizontal scroll.
- The 6×6 board has square cells, 6px desktop / 5px phone gaps, and no drag surface. Metadata and source labels wrap. Statistics use auto-fit columns, and mode labels can wrap under text enlargement.

Actual production browser widths checked: 320, 390, 620, 760, 900 and 1440, including 390×664 and 1440×780, plus 1280×720 and 1920×1080 overlays. Horizontal overflow was absent. Both overlay document heights equal their viewport heights. Root text enlargement to 200% at 390 also reflowed; this was not native browser zoom. English is the only implemented locale; RTL and a translated version were not tested or claimed.

## Elevation & depth

Tonal layers establish depth: night page, indigo bed, conduit tiles and warmer powered backings. There are no card shadows or nested card stacks. Sparse separators organize the aside; control borders communicate interaction, selection outlines communicate state. A subtle nontext radial atmosphere sits behind the game.

Native dialogs use an opaque surface with one border, a dark translucent backdrop and 5px backdrop blur. The page behind them is made inert by `showModal()`. Dialogs scroll within 90dvh. Selected tiles use z-index 1, focused/tutorial tiles 2, and board covers 3, so paused/loading/error copy stays above the entire board. The overlay's Show/Hide control remains accessible in a fixed corner on desktop and in normal flow on narrow screens. With controls hidden it is transparent until scene hover or keyboard focus.

## Shapes

Conduit/button radii are 9px desktop; board bed radius 20px with 16px normal inset. Phone tiles use 7px corners inside a 15px bed with 10px inset. Small fields use 8px; dialog corners are 20px desktop / 15px phone. Flower petals, ferns, stone facets and the hamster wheel are original SVG geometry; do not replace them with unrelated icon assets.

## Components

| Component / pattern | Source | Behavior and states |
| --- | --- | --- |
| `Board` | `src/components/Board.tsx` | Native button cells with one roving tab stop; arrows focus, Enter selects, R rotates selected conduit. Ctrl/Meta/Alt+R retain their browser behavior. New boards select the fixed wheel, so players choose their first conduit. Selected coordinate, powered leaf/ports, blocked stone, checked beacon and charged bloom are distinct. Disabled/covered boards remove cell tab stops. |
| `tileArt`, `flowerArt`, `wheelArt` | `src/components/art.ts` | Shared original vector drawing used by board and PNG. `powered` / `boosted` are visual parameters; the engine determines them. |
| `Modal` | `src/components/Modal.tsx` | Native `<dialog>`, title, close button, Escape/backdrop close, visible keyboard focus, trap over actual tabbable controls only, focus return. `wide` expands instructional content. |
| `Tutorial` | `src/components/Tutorial.tsx` | Separate fixed Demo lesson using the same engine/board. Dashed target, four interactive steps, one primary action per step. |
| `.primary` / `.icon-button` / `.text-button` | `src/styles/app.css` | Warm filled primary, neutral outlined utilities, consistent text disclosure; hover, visible focus, pressed and disabled states. Core controls are at least 44px high; some small utilities are 36px with spacing. |
| `.mode-tabs` | `src/App.tsx`, CSS | Three native pressed-state buttons, underline and explicit mode text. Active play requests confirmation before a mode change. |
| `.score-strip`, `.run-extras` | `src/App.tsx`, CSS | Stable tabular values and quiet labels; game values precede the board, streak/combo/local best follow controls. |
| `.reservoir`, `.source-details` | `src/App.tsx`, CSS | Three visible slots plus textual count, exact charge mapping, real network/time and source-state disclosures. Unloaded sources say Waiting / Not loaded; fixture wording belongs to Demo. Fresh wheel motion is live regardless of core lifecycle status. Cold-load failures put retry and explicit Demo on the board cover. |
| `.overlay-app.controls-hidden` | `src/App.tsx`, CSS | Actual 16:9 game scene at a static query URL. Keeps garden, mode/round/freshness, source and reservoir; hides ordinary controls until requested by hover/focus. At desktop heights ≤800px, two supporting paragraphs are omitted to fit 720p while retaining mapping, network and transaction link. Same-profile storage following is display-only; a standalone game continues while controls are hidden. |
| PNG / share pattern | `src/data/export.ts`, `src/App.tsx` | Actual current-state PNG download, copied overlay URL, labelled manual-copy textarea on denial, explicit errors and progress. |

High-frequency transitions are **120ms**, naming background/color/opacity/scale only. Primary/icon press scales to **.96**. A one-time flower arrival lasts 400ms after restoration. All motion is opt-in through `prefers-reduced-motion: no-preference`; there is no endless animation or `transition: all`. Pausing does not trap focus behind the board cover. Reduced motion was exercised; animation-panel replay at 10% speed was not performed.

## Do's and don'ts

- Start a new surface with the existing tokens, typography and flat spacing hierarchy. Put the actual task before source explanations.
- Use the warm filled action for Start/Rotate/Next/confirm. Keep secondary actions neutral. Never turn a status badge into a misleading control.
- Reuse `Board` and the pure engine for another presentation, as overlay/tutorial already do. Draw exported gardens with the same `tileArt` functions.
- Keep explicit Historical / Live / Demo provenance, actual network and source timestamps. Preserve labels when API requests fail; offer Demo as an explicit choice.
- Keep selection, power, blocked and grown states distinguishable beyond hue. Keep native button/dialog semantics and visible focus.
- Keep required runtime assets local and URLs relative. Do not add a remote font, a dashboard-first hero, extra type families or an unrelated visual theme.

For an additional informational panel, use `Modal`, an h2 title, compact 14px prose, existing link styling and one clear close/return path. For a new game view, feed a `Run` into `Board` and derive connectivity from the engine; avoid a separate cosmetic game simulation.

Six-domain coverage, fixes, actual checks and unperformed checks are recorded in [evidence/validation.md](evidence/validation.md). The referenced guide's MIT and Apache-2.0 notices remain in `LICENSES/Design-guidance-LICENSE.txt`.
