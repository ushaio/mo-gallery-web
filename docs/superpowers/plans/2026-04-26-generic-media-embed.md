# Generic Media Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the music-only embed flow with a generic `mediaEmbed` flow that accepts arbitrary iframe embed code, while keeping Spotify and NetEase link-to-official-iframe conversion.

**Architecture:** Move parsing into a generic media embed utility that can normalize iframe snippets and known provider links. Replace the TipTap `musicEmbed` node with `mediaEmbed`, keep backward parsing support for stored `music-embed` content, and render saved content through a single frontend embed path.

**Tech Stack:** Next.js App Router, React 19, TipTap 3, TypeScript, Node `node:test`, ESLint

---

### Task 1: Add parser regression tests

**Files:**
- Create: `tests/media-embed.test.ts`
- Test: `tests/media-embed.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- arbitrary iframe HTML being normalized into generic embed data
- Spotify link being converted into official embed data
- NetEase link being converted into official embed data
- old iframe `src` extraction with protocol-relative URLs

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test tests/media-embed.test.ts`
Expected: FAIL because `src/lib/media-embed.ts` and generic parser APIs do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/media-embed.ts` with the generic parser surface required by the tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test tests/media-embed.test.ts`
Expected: PASS

### Task 2: Replace the TipTap node model

**Files:**
- Create: `src/components/tiptap-extensions/MediaEmbed.ts`
- Create: `src/components/tiptap-extensions/MediaEmbedNodeView.tsx`
- Modify: `src/components/tiptap-editor/useNarrativeEditor.ts`
- Modify: `src/components/NarrativeTipTapEditor.tsx`
- Modify: `src/components/tiptap-editor.css`

- [ ] **Step 1: Update editor code to use `mediaEmbed` instead of `musicEmbed`**

Replace imports, active-state checks, paste handlers, and insertion logic so embeds are inserted only through paste recognition.

- [ ] **Step 2: Keep backward compatibility**

Make the new node parse both `data-type="media-embed"` and historical `data-type="music-embed"` content.

- [ ] **Step 3: Update node view styling and fallback**

Rename CSS classes to generic media embed classes and keep existing iframe presentation behavior.

- [ ] **Step 4: Verify editor compilation paths**

Run: `pnpm exec eslint src/components/tiptap-extensions/MediaEmbed.ts src/components/tiptap-extensions/MediaEmbedNodeView.tsx src/components/tiptap-editor/useNarrativeEditor.ts src/components/NarrativeTipTapEditor.tsx src/components/tiptap-editor.css`
Expected: no errors

### Task 3: Update saved-content rendering

**Files:**
- Modify: `src/components/StoryRichContent.tsx`
- Modify: `src/components/story-rich-content.css`

- [ ] **Step 1: Replace music-card rendering with generic media-card rendering**

Render generic iframe data for arbitrary embeds and keep provider-specific official iframe generation for Spotify and NetEase.

- [ ] **Step 2: Keep compatibility with old markup**

Continue recognizing both `music-embed` and `media-embed` placeholders during HTML resolution.

- [ ] **Step 3: Verify rendering files**

Run: `pnpm exec eslint src/components/StoryRichContent.tsx src/components/story-rich-content.css`
Expected: no errors

### Task 4: Update copy and final verification

**Files:**
- Modify: `src/lib/i18n/editor.ts`
- Test: `tests/media-embed.test.ts`

- [ ] **Step 1: Rename UI copy from music to media**

Keep the toolbar label accurate even though insertion happens by paste only.

- [ ] **Step 2: Run focused tests**

Run: `pnpm exec tsx --test tests/media-embed.test.ts`
Expected: PASS

- [ ] **Step 3: Run repository lint**

Run: `pnpm run lint`
Expected: exit code 0
