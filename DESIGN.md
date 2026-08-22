---
name: MO Gallery
description: A restrained, editorial visual system for photography display and media work.
colors:
  paper: "#FFFFFF"
  ink: "#0F0F0F"
  ink-primary: "#111111"
  paper-card: "#F9F9F9"
  paper-secondary: "#F4F4F4"
  paper-muted: "#F5F5F5"
  line: "#E5E5E5"
  accent-subtle: "#E0E0E0"
  danger: "#CC0000"
  night: "#050505"
  night-card: "#0F0F0F"
  night-muted: "#141414"
  gold: "#D4AF37"
  night-line: "#222222"
  dark-danger: "#CF6679"
typography:
  heading:
    fontFamily: "Cormorant Garamond, Georgia, Cambria, serif"
    fontWeight: 500
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.5
  label:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.2em"
rounded:
  sharp: "0rem"
  desktop-sm: "0.5rem"
  desktop-xs: "0.375rem"
  desktop-card: "1rem"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink-primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sharp}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sharp}"
    padding: "8px 16px"
  navigation-active:
    backgroundColor: "{colors.ink-primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sharp}"
    padding: "12px 16px"

# Design System: MO Gallery

## Overview

**Creative North Star: "摄影展厅与编辑部工作台"**

MO Gallery has one shared visual language expressed across three surfaces. The public Web experience is a photography exhibition hall: the image is the primary object, chrome recedes, and captions behave like quiet catalogue labels. Web Admin and Desktop are editorial workbenches: dense, legible, and structured for repeated media operations, with the same typographic pairing and restrained monochrome foundation.

The system is deliberately quiet and editorial. It gives photographs, metadata, and written context the strongest contrast, while controls rely on spacing, hairline borders, type weight, and state color instead of decorative containers. Light and dark themes are both first-class; dark mode changes the primary accent to a muted gold for clear action feedback.

**Key Characteristics:**
- Restrained, editorial, and work-focused.
- Photography and real media states lead every surface.
- Serif headings paired with a neutral sans UI voice.
- Mostly sharp silhouettes, thin borders, and low decoration.

## Colors

The palette is a paper-and-ink system in light mode, with a near-black exhibition mode and muted gold action accent in dark mode.

### Primary
- **Ink Primary** (`#111111`): Default actions, active navigation, strong labels, and the public site's highest-contrast controls.
- **Night Gold** (`#D4AF37`): Dark-mode primary action, focus ring, and selected state.

### Neutral
- **Paper** (`#FFFFFF`): Light page and gallery background.
- **Paper Card** (`#F9F9F9`): Quiet container surfaces where a surface needs separation from the page.
- **Paper Secondary** (`#F4F4F4`): Secondary controls and grouped regions.
- **Paper Muted** (`#F5F5F5`): Hover and muted control backgrounds.
- **Ink** (`#0F0F0F`): Main light-mode text.
- **Line** (`#E5E5E5`): Hairline dividers, fields, and navigation boundaries.
- **Night** (`#050505`): Dark-mode page background.
- **Night Card** (`#0F0F0F`): Dark-mode container and popover surface.
- **Night Line** (`#222222`): Dark-mode divider.

### Named Rules
**The One Image Rule.** Let the photograph, story, or real media state carry the visual emphasis; do not compete with it using ornamental color.

## Typography

**Display / Heading Font:** Cormorant Garamond (with Georgia, Cambria, and serif fallbacks)
**Body / UI Font:** Montserrat (with system sans-serif fallbacks)
**Label / Mono Font:** Montserrat for labels; a system monospace stack is reserved for technical metadata and code.

**Character:** Cormorant Garamond supplies a literary, exhibition-catalogue voice. Montserrat keeps navigation, metadata, and repeated operational controls precise and readable.

### Hierarchy
- **Heading** (500, project-specific display sizes, tight tracking): Page titles, photo titles, and editorial section headings.
- **Body** (400, `1rem`, `1.6`): Narrative copy and descriptive content, normally constrained to a readable measure.
- **UI** (400–500, `0.875rem`, `1.5`): Buttons, inputs, navigation, and operational labels.
- **Label** (700, `0.75rem`, `0.2em` tracking, uppercase where used): Categories, section labels, and compact metadata.

### Named Rules
**The Catalogue Label Rule.** Uppercase, tracked labels identify metadata and navigation; they never replace readable body copy.

## Layout

Public Web layouts are image-led and responsive: gallery grids use fluid columns with a minimum card width around `300px`, while masonry and timeline views preserve each image's aspect ratio. Captions remain compact and aligned so scanning does not shift the grid.

Web Admin uses a fixed navigation rail that can collapse from `16rem` to `5rem`, with a `5rem` top bar and a spacious `2rem` content rhythm. Desktop uses the same editorial shell with a narrower `210px` sidebar, `64px` collapsed state, and an integrated window frame. Editors and Zine use immersive, full-height workspaces when the task benefits from focus.

Responsive behavior follows the existing Tailwind breakpoint vocabulary. Mobile navigation becomes an off-canvas drawer; desktop keeps persistent navigation. Preserve stable dimensions for grids, toolbars, photo tiles, and editor surfaces so loading and selection states do not reflow the work area.

## Elevation & Depth

The public Web is flat by default: depth comes from white/grey tonal changes, hairline borders, image scale, and hover opacity. Web Admin follows the same rule. Desktop permits restrained structural shadows for its integrated frame, transient toasts, dialogs, and the Zine workbench; shadows should clarify a floating layer, never decorate a resting card. The Desktop overview follows the same flat rule: its metric ledger and content sections are separated by hairlines and whitespace instead of resting cards.

### Shadow Vocabulary
- **Desktop frame** (`0 10px 30px rgb(0 0 0 / 0.12)`): Separates the Wails window frame from its host surface.
- **Desktop transient** (`0 10px 24px rgb(0 0 0 / 0.16)`): Toasts and temporary overlays only.
- **Control detail** (`0 1px 3px rgba(0, 0, 0, 0.25)`): Small Zine manipulation handles where a control must remain visible over artwork.

### Named Rules
**The Flat-By-Default Rule.** A surface earns elevation through its role or state; resting cards and gallery images do not need a shadow — on every surface, including the Desktop overview.

## Shapes

Web presentation and Web Admin use sharp corners (`0rem`) and thin borders. The silhouette should feel like a printed sheet, catalogue label, or editorial column rather than a rounded app card. Desktop keeps the same sharp visual language for primary content but permits small `0.5rem` and `0.375rem` radii on app-frame, toast, and utility controls where platform affordance benefits from a softer edge.

Images clip to their media frame and may use subtle scale on hover. Do not introduce pill-shaped controls except for an existing binary switch pattern.

## Components

### Buttons
- **Shape:** Sharp in Web (`0rem`); compact Desktop utility controls may use the existing small radius.
- **Primary:** Ink on paper in light mode, gold on near-black in dark mode; compact padding with uppercase tracked labels in Admin.
- **Hover / Focus:** Use opacity or muted background shifts, a one-pixel ring, and short color transitions. Preserve visible keyboard focus.
- **Secondary / Ghost:** Transparent or hairline outlined; use muted text until hover or selection makes the action relevant.

### Cards / Containers
- **Corner Style:** Sharp on Web; small radius only where Desktop's utility surface already uses it.
- **Background:** Paper/card neutrals in light mode; night/night-card in dark mode.
- **Shadow Strategy:** Flat at rest on every surface; reserve shadows for Desktop structure and transient overlays.
- **Border:** Hairline `Line` or `Night Line` when a boundary improves scanning.
- **Internal Padding:** Use the shared `8px`, `16px`, and `32px` rhythm; avoid stacking nested cards.

### Inputs / Fields
- **Style:** White or theme surface with a thin border and sharp corners on Web; same token mapping in Desktop.
- **Focus:** Primary ring or gold ring in dark mode, never a browser-default blue outline.
- **Error / Disabled:** Destructive red/pink is reserved for errors; disabled controls lower contrast and opacity without changing geometry.

### Navigation
- **Public Web:** Minimal navigation that frames the gallery and recedes behind imagery.
- **Web Admin / Desktop:** Persistent left navigation with serif product title, tracked uppercase labels, active item filled with primary color, and explicit theme/language/account controls.
- **Mobile:** Off-canvas navigation for Admin; preserve a clear route title and a full-size close/action target.

### Gallery Photo Card
The signature public component is an image-first card: fixed media geometry, dominant-color placeholder during loading, subtle hover scale, then a two-line catalogue caption with category and year metadata. The card should never become a generic rounded marketing tile.

## Do's and Don'ts

### Do:
- **Do** give photography, story content, and real metadata the strongest visual weight.
- **Do** use the Cormorant Garamond / Montserrat pairing across Web and Desktop.
- **Do** use paper-and-ink neutrals, hairline borders, and clear state contrast.
- **Do** keep operational screens dense enough for repeated work while preserving readable labels and stable grids.
- **Do** honor both light and dark themes as designed states, including dark-mode gold focus and action feedback.

### Don't:
- **Don't** add decorative gradients, bokeh, floating blobs, or ornamental color that competes with photography.
- **Don't** introduce rounded card stacks or nested cards into the public gallery or Admin shell.
- **Don't** use shadows as a default card treatment; keep them scoped to Desktop structure and transient states.
- **Don't** replace catalogue labels with tiny, low-contrast text; the label scale has a readability floor.
- **Don't** invent testimonials, customer logos, performance claims, or other proof that is not present in the product evidence.
