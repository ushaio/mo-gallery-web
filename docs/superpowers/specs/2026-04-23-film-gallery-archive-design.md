# Film Gallery Archive UI Redesign

## Context

The existing `src/app/gallery/film/FilmPageContent.tsx` page already renders real film roll data and supports clicking individual frames to open a lightbox. The requested change is front-end only: restyle the film gallery page to closely match the provided reference image, and use the provided `135` film box asset as the left-side visual for every roll.

This redesign intentionally does not change query behavior, API contracts, or film roll data modeling.

## Goals

- Rebuild the `/gallery/film` page into an archive-style catalog matching the reference composition.
- Use a restrained black, charcoal, and gold palette with thin borders and serif-led typography.
- Replace the current immersive strip-browser feel with a structured archival layout.
- Reuse current roll and photo data where available, but prioritize the target UI over data-specific presentation.
- Preserve useful existing behavior where it does not conflict with the new layout, especially frame click to open a large preview.

## Non-Goals

- No backend or schema changes.
- No new filtering, sorting, or management interactions.
- No attempt to generate per-brand packaging variations from the shared `135` box asset.
- No redesign of the global site navbar.

## Chosen Approach

Keep the current page route and server data-loading path intact, but fully restyle `FilmPageContent` around a new archive composition.

This is preferred over a static mock because it keeps the page live and functional, and preferred over a larger component refactor because the current task is visual fidelity rather than long-term component extraction.

## Page Structure

### 1. Overall shell

- Keep the existing route at `/gallery/film`.
- Let the global `Navbar` remain the page navigation.
- Add top padding so the page sits cleanly under the fixed navbar.
- Use a near-black background with subtle layered gradients and restrained texture so the page resembles a premium archive board rather than a default dark section.

### 2. Hero section

The hero should mirror the reference structure:

- Left side:
  - Small uppercase eyebrow line such as `ANALOG ARCHIVE • 35MM`
  - Large serif title `Film Archive`
  - One short supporting sentence
- Right side:
  - Thin bordered stat card
  - Total frame count
  - Total roll count

The hero must feel spacious and editorial. It should not include the current inline back button or B&W toggle.

### 3. Roll list

Each roll becomes a horizontal archive row with two major parts:

- Left fixed-width information panel
- Right film-strip preview rail

Rows should stack vertically with consistent spacing and thin separators. The list should visually resemble catalog entries rather than independent cards.

### 4. Left information panel

Each row’s information block should contain:

- The provided `135` film box asset as the primary image
- Brand name
- Roll name
- Compact metadata lines derived from existing fields where possible:
  - frame count
  - `35mm`
  - ISO value when available
  - optional note or fallback descriptive line
- A low-emphasis detail label styled to match the reference, without introducing a new functional CTA requirement

The asset is reused for every row. Brand and model differentiation come from text, not packaging art.

### 5. Right film strip

The film preview area should feel like one continuous strip:

- top sprocket rail
- center frame window lane
- bottom sprocket rail
- small frame numbering above or within the top portion of the strip

Each photo should sit inside the strip window with:

- subtle border treatment
- mild desaturation / tonal treatment compatible with the archive look
- very light hover feedback only

The right side should avoid the current card-like separation and strong glow effects. The strip background, spacing, and sprocket holes should visually connect all frames into one rail.

### 6. Footer marker

At the end of the page, add a compact archival closing line similar in spirit to the reference. It should serve as a visual terminator for the list rather than introduce another interaction.

## Interaction Design

### Removed interactions

- Remove the current B&W toggle.
- Remove the custom top-left page header row that duplicates navigation concerns already handled by the global navbar.

### Preserved interactions

- Keep click-to-open lightbox on individual frames.

### Lightbox adjustments

The lightbox can remain functionally similar, but its styling should be harmonized with the archive theme:

- dark matte background
- restrained gold/neutral metadata accents
- keep Escape-to-close behavior

The lightbox is secondary to the page layout, so implementation should stay lightweight.

## Responsive Behavior

### Desktop

- Optimize for the provided reference look.
- Keep each roll on a single horizontal row.
- Align the info panel height with the film strip height.

### Tablet

- Preserve the two-column row structure.
- Reduce panel widths and internal spacing slightly.
- Keep the stat card visible without breaking the hero balance.

### Mobile

- Switch each row to vertical stacking:
  - info panel first
  - horizontally scrollable strip second
- Maintain single-row film-strip behavior with horizontal scrolling rather than crushing frames to unreadable widths.
- Keep the archive tone and hierarchy, but prioritize legibility and touch targets.

## Data Mapping Rules

- Continue reading `initialRolls` as today.
- Continue deriving photo frames from `roll.filmPhotos`.
- Use existing roll fields when present:
  - `brand`
  - `name`
  - `frameCount`
  - `iso`
  - `notes`
- If optional fields are missing, fall back to generic text so the layout remains stable.

Example fallback behavior:

- missing `iso` -> omit ISO fragment
- missing `notes` -> show a neutral stock line such as `ARCHIVE ENTRY`
- missing `filmPhotos` -> skip the row entirely, matching the current practical behavior

## Visual Language

- Palette: black, charcoal, smoke gray, muted gold
- Borders: thin, low-contrast gold/gray strokes
- Typography:
  - serif for the page title and major catalog labels
  - mono or narrow uppercase text for metadata and numbering
- Motion:
  - subtle entrance only
  - no dramatic scaling or glow-heavy hover behavior

## Implementation Scope

Primary implementation target:

- `src/app/gallery/film/FilmPageContent.tsx`

Possible supporting updates only if needed:

- `src/app/globals.css` for archive-specific utility classes shared within the page

No other route or data file should need behavioral changes.

## Verification

Minimum verification for this front-end-only task:

- run `pnpm run lint`
- confirm the film gallery page still renders
- confirm clicking a frame still opens and closes the lightbox

## Risks and Mitigations

### Risk: reference fidelity versus live data variance

Real roll metadata will not always match the exact sample labels shown in the reference.

Mitigation:

- anchor fidelity in layout, spacing, palette, and component shape
- allow text content to vary according to available data

### Risk: mobile rows becoming cramped

The reference is desktop-first and dense.

Mitigation:

- stack rows on mobile
- keep the strip horizontally scrollable

### Risk: over-animating a layout that should feel archival

Mitigation:

- cap animation to low-amplitude fades and short translations
- remove current stronger hover behaviors

## Acceptance Criteria

- `/gallery/film` visually shifts to an archive catalog layout close to the provided reference.
- The provided `135` film box asset is used as the left-side visual for each roll row.
- The B&W toggle is gone.
- The page hero includes archive eyebrow text, `Film Archive` title, supporting description, and a right-side stat card.
- Each roll row contains a left metadata panel and a right continuous film strip.
- Clicking a frame still opens a large preview.
- The layout remains usable on mobile via stacked rows and horizontal strip scrolling.
