# Film Gallery Archive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/gallery/film` into the approved archive-style UI while preserving the existing roll data flow and frame lightbox behavior.

**Architecture:** Keep the route and server query unchanged, and concentrate the redesign inside `src/app/gallery/film/FilmPageContent.tsx`. Use the existing roll/photo DTOs for content, the shared `public/film/general-135.png` asset for the left-side film box visual, and only add global CSS if a repeated archive utility cannot be expressed cleanly with Tailwind classes inline.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, Tailwind CSS 4, Framer Motion, Next/Image, ESLint

---

## File Structure

- Modify: `src/app/gallery/film/FilmPageContent.tsx`
  - Rebuild the film gallery hero, roll rows, strip rendering, and lightbox styling.
- Modify if needed: `src/app/globals.css`
  - Add archive-only utility classes for textures or reusable gradients if Tailwind utilities become noisy.
- Reuse: `public/film/general-135.png`
  - Shared 135 film box asset shown on each roll row.

## Notes Before Implementation

- No formal UI test framework is configured in this repo. Per `AGENTS.md`, minimum verification is `pnpm run lint` plus manual browser validation of the affected page.
- Do not change `src/app/gallery/film/page.tsx` or `server/lib/queries.ts` unless implementation reveals a hard blocker.
- Keep the page data-backed. The redesign is visual, not a static mock.

### Task 1: Re-map the page state and derived display data

**Files:**
- Modify: `src/app/gallery/film/FilmPageContent.tsx`

- [ ] **Step 1: Replace the old page-level state shape with archive-specific derived values**

Remove the old grayscale toggle state and keep only the data that the archive page still uses:

```tsx
const [rolls] = useState<FilmRollDto[]>(initialRolls)
const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)

const strips = useMemo(() => {
  return rolls
    .filter((roll) => (roll.filmPhotos?.length ?? 0) > 0)
    .map((roll) => ({
      roll,
      photos: roll.filmPhotos!.map((item) => item.photo!).filter(Boolean),
    }))
}, [rolls])

const totalFrames = useMemo(
  () => strips.reduce((sum, strip) => sum + strip.photos.length, 0),
  [strips],
)
```

- [ ] **Step 2: Add display helpers for archive metadata lines**

Add small pure helpers near the top of `FilmPageContent.tsx` so row rendering stays readable:

```tsx
function getRollMetaLine(roll: FilmRollDto) {
  const parts = [`${roll.frameCount || 36} EXP`, '35MM']
  if (roll.iso) parts.push(`ISO ${roll.iso}`)
  return parts.join(' • ')
}

function getRollNote(roll: FilmRollDto) {
  return roll.notes?.trim() || 'ARCHIVE ENTRY'
}
```

- [ ] **Step 3: Remove the old header and grayscale button wiring**

Delete the now-unused imports and UI:

```tsx
import { ArrowLeft, Circle, CircleOff } from 'lucide-react'
import Link from 'next/link'
```

Expected end state:

```tsx
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
```

- [ ] **Step 4: Run lint on the file-in-progress to catch dead imports and type drift**

Run: `pnpm run lint src/app/gallery/film/FilmPageContent.tsx`

Expected: any failures should be limited to incomplete in-progress edits and resolved before the next task is considered complete.

### Task 2: Rebuild the archive hero and catalog row layout

**Files:**
- Modify: `src/app/gallery/film/FilmPageContent.tsx`
- Reuse: `public/film/general-135.png`

- [ ] **Step 1: Replace the page shell markup with the new archive hero**

Create a top-level section with navbar spacing, dark background layering, archive eyebrow, `Film Archive` title, supporting copy, and the right-side stat card:

```tsx
<section className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 pb-10 pt-28 sm:px-6 md:px-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12 lg:pt-32">
  <div className="max-w-3xl">
    <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.45em] text-[#b89452]">
      Analog Archive • 35mm
    </p>
    <h1 className="font-serif text-5xl font-light tracking-[0.03em] text-[#f0e7d6] sm:text-6xl lg:text-7xl">
      Film Archive
    </h1>
    <p className="mt-5 max-w-xl font-mono text-[11px] uppercase tracking-[0.32em] text-[#8e8372]">
      A collection of moments, captured on film.
    </p>
  </div>

  <div className="w-full max-w-[180px] self-start border border-[#5d4b2d] bg-[#0c0b09]/90 px-5 py-4">
    <p className="font-mono text-[9px] uppercase tracking-[0.32em] text-[#8e7b53]">Total Frames</p>
    <p className="mt-3 font-serif text-4xl text-[#d4af67]">{totalFrames}</p>
    <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.32em] text-[#8e7b53]">
      {strips.length} Rolls
    </p>
  </div>
</section>
```

- [ ] **Step 2: Add a focused roll row component inside `FilmPageContent.tsx`**

Replace the old `FilmStrip` structure with one row component that accepts `roll`, `photos`, `index`, and `onPhotoClick`:

```tsx
function ArchiveRollRow({
  roll,
  photos,
  rowIndex,
  onPhotoClick,
}: {
  roll: FilmRollDto
  photos: PhotoDto[]
  rowIndex: number
  onPhotoClick: (photo: PhotoDto) => void
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: rowIndex * 0.05 }}
      className="grid gap-0 overflow-hidden rounded-[18px] border border-[#2a2115] bg-[#090807] lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      {/* left archive card */}
      {/* right film strip */}
    </motion.article>
  )
}
```

- [ ] **Step 3: Implement the left-side archive card with the 135 box asset**

Use the shared asset and text metadata instead of per-roll canister art:

```tsx
<div className="flex min-h-[190px] items-center gap-5 border-b border-[#2a2115] px-5 py-5 sm:px-6 lg:min-h-[208px] lg:border-b-0 lg:border-r">
  <div className="relative h-[136px] w-[96px] shrink-0">
    <Image
      src="/film/general-135.png"
      alt="135 film box"
      fill
      sizes="96px"
      className="object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.55)]"
    />
  </div>

  <div className="min-w-0">
    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#9c927f]">{roll.brand}</p>
    <h2 className="mt-3 font-serif text-3xl font-light tracking-[0.03em] text-[#d7b16a]">
      {roll.name}
    </h2>
    <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.28em] text-[#817867]">
      {getRollMetaLine(roll)}
    </p>
    <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.32em] text-[#6e654f]">
      {getRollNote(roll)}
    </p>
  </div>
</div>
```

- [ ] **Step 4: Replace the main list render with archive rows**

The page body should render rows in a single vertical stack:

```tsx
<section className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 pb-16 sm:px-6 md:px-10">
  {strips.map((strip, index) => (
    <ArchiveRollRow
      key={strip.roll.id}
      roll={strip.roll}
      photos={strip.photos}
      rowIndex={index}
      onPhotoClick={setSelectedPhoto}
    />
  ))}
</section>
```

- [ ] **Step 5: Add the archive footer marker**

Append a restrained end marker after the list:

```tsx
<div className="relative z-10 mx-auto flex w-full max-w-[1600px] items-center justify-center gap-4 px-4 pb-14 pt-2 sm:px-6 md:px-10">
  <div className="h-px w-10 bg-[#3a2f20]" />
  <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-[#8d7244]">
    Film Is Not Dead
  </p>
  <div className="h-px w-10 bg-[#3a2f20]" />
</div>
```

### Task 3: Rebuild the continuous film strip and harmonize the lightbox

**Files:**
- Modify: `src/app/gallery/film/FilmPageContent.tsx`

- [ ] **Step 1: Replace the sprocket rail and frame cell styling with a continuous strip**

Keep helper components if they still help, but update them to match the archive rail instead of the current card-like strip:

```tsx
function SprocketRail({ holeCount }: { holeCount: number }) {
  return (
    <div className="flex h-6 items-center justify-between bg-[#050505] px-3">
      {Array.from({ length: holeCount }, (_, index) => (
        <span
          key={index}
          className="h-[11px] w-[8px] rounded-[1px] border border-[#201911] bg-[#0f0d0b]"
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Update frame cells so they read as windows inside one strip**

Refine `FilmFrame` so it uses a softer archive treatment and no dramatic scale/glow:

```tsx
className="group relative shrink-0 overflow-hidden border border-[#2f2922] bg-[#111] transition-colors duration-200 hover:border-[#8b6a33]"
```

And keep the image treatment restrained:

```tsx
className="object-cover grayscale-[0.15] sepia-[0.18] brightness-[0.92] transition duration-300 group-hover:brightness-100"
```

- [ ] **Step 3: Build the right-side strip panel inside `ArchiveRollRow`**

Render a single dark strip board with rail labels and horizontal overflow on small screens:

```tsx
<div className="overflow-x-auto px-3 py-3 sm:px-4 lg:px-5">
  <div className="min-w-max rounded-[14px] border border-[#1c1712] bg-[#050505]">
    <div className="px-5 pt-3">
      <div className="flex items-center gap-6 font-mono text-[9px] uppercase tracking-[0.35em] text-[#8b7348]">
        <span>{roll.brand}</span>
        {photos.slice(0, 6).map((_, frameIndex) => (
          <span key={frameIndex}>{String(frameIndex + 1).padStart(3, '0')}</span>
        ))}
      </div>
    </div>
    <SprocketRail holeCount={Math.max(photos.length * 2 + 4, 14)} />
    <div className="flex gap-[4px] px-3 py-[4px]">
      {photos.map((photo, frameIndex) => (
        <FilmFrame
          key={photo.id}
          photo={photo}
          frameIndex={frameIndex}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
    <SprocketRail holeCount={Math.max(photos.length * 2 + 4, 14)} />
  </div>
</div>
```

- [ ] **Step 4: Re-skin the lightbox to match the archive palette**

Keep the current modal structure, but align its chrome with the new page:

```tsx
className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020202]/95 p-4 md:p-10"
```

Use a calmer metadata footer:

```tsx
<div className="flex items-center justify-between border-t border-[#2b2217] bg-[#070605] px-4 py-3">
  <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-[#7f6b45]">
    Frame Preview
  </span>
  <span className="font-serif text-sm text-[#e6dcc8]">{photo.title}</span>
</div>
```

- [ ] **Step 5: Validate responsive row behavior in code**

Make sure the row switches from stacked to two-column layout at `lg`, and the strip remains horizontally scrollable below that breakpoint:

```tsx
className="grid gap-0 ... lg:grid-cols-[280px_minmax(0,1fr)]"
```

```tsx
className="overflow-x-auto px-3 py-3 sm:px-4 lg:px-5"
```

### Task 4: Add only the minimum shared CSS and verify the page end-to-end

**Files:**
- Modify if needed: `src/app/globals.css`
- Modify: `src/app/gallery/film/FilmPageContent.tsx`

- [ ] **Step 1: Add shared archive utilities only if inline Tailwind becomes unreadable**

If repeated classes are making the file noisy, add narrowly scoped utilities like:

```css
.film-archive-panel {
  background:
    linear-gradient(180deg, rgba(18, 15, 11, 0.96), rgba(7, 6, 5, 0.98)),
    radial-gradient(circle at top, rgba(155, 119, 54, 0.08), transparent 42%);
}

.film-archive-grid {
  background-image: linear-gradient(to right, rgba(212, 175, 103, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

Skip this step entirely if the page stays clearer without touching `globals.css`.

- [ ] **Step 2: Run repository lint after the page rewrite**

Run: `pnpm run lint`

Expected: exit code `0`.

- [ ] **Step 3: Run a local browser check on the affected page**

Run: `pnpm run dev`

Manual checks on `http://localhost:3000/gallery/film`:

- hero shows `Film Archive`, archive eyebrow, supporting sentence, and stat card
- each roll shows the shared 135 box art on the left
- each roll renders as left metadata panel plus right film strip
- no B&W toggle remains
- mobile width stacks the left panel above the horizontally scrollable strip
- clicking a frame opens the preview and Escape closes it

- [ ] **Step 4: Commit the focused UI change**

Run:

```bash
git add src/app/gallery/film/FilmPageContent.tsx src/app/globals.css
git commit -m "feat: redesign film gallery archive page"
```

If `src/app/globals.css` was not touched, omit it from `git add`.
