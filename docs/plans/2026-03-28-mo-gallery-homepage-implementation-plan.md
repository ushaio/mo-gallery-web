# MO Gallery Homepage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone editorial-style official homepage for MO Gallery in `D:\Projects\mo-gallery`.

**Architecture:** Create a small static frontend project with a single responsive homepage. Use plain HTML, CSS, and minimal JavaScript so the deliverable is self-contained, easy to open locally, and does not require package installation or network access.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript, local assets

---

### Task 1: Scaffold the standalone project

**Files:**
- Create: `D:\Projects\mo-gallery\index.html`
- Create: `D:\Projects\mo-gallery\styles.css`
- Create: `D:\Projects\mo-gallery\main.js`
- Create: `D:\Projects\mo-gallery\README.md`

**Step 1: Create the base file structure**

Create the four files above and keep the project dependency-free.

**Step 2: Add the HTML shell**

Add:

- metadata
- font imports
- top navigation
- homepage sections
- CTA links
- script and stylesheet references

**Step 3: Add the CSS system**

Define:

- color tokens
- typography rules
- layout containers
- section spacing
- card styling
- responsive breakpoints
- motion-safe transitions

**Step 4: Add the small JavaScript layer**

Implement:

- mobile navigation toggle
- scroll progress indicator
- optional reveal-on-scroll behavior

**Step 5: Verify the files are internally linked correctly**

Confirm `index.html` references `styles.css` and `main.js` and loads without missing paths.

---

### Task 2: Implement the editorial homepage structure

**Files:**
- Modify: `D:\Projects\mo-gallery\index.html`

**Step 1: Build the hero section**

Include:

- editorial headline
- supporting copy
- primary and secondary CTA
- visual frame or layered background composition

**Step 2: Build the manifesto section**

Include:

- short thesis copy
- minimal visual separator

**Step 3: Build the narrative showcase**

Include:

- gallery mode
- story mode
- blog mode

Each item should have a label, short description, and visual panel.

**Step 4: Build the “why it exists” section**

Use side-by-side or stacked editorial text blocks.

**Step 5: Build the core capabilities section**

List core capabilities with concise product copy.

**Step 6: Build the trust section**

Show stack, deployment, and open-source credibility.

**Step 7: Build the final CTA**

Provide clear links for:

- GitHub
- deployment/getting started

---

### Task 3: Implement the visual system

**Files:**
- Modify: `D:\Projects\mo-gallery\styles.css`

**Step 1: Add typography system**

Use:

- `Cormorant Garamond` for display/headings
- `Montserrat` for interface/body copy

**Step 2: Add color variables**

Use the approved palette:

- ink
- warm paper
- smoke brown
- soft border
- muted text

**Step 3: Implement section layout and spacing**

Ensure:

- generous whitespace
- narrow reading measures
- wide visual panels
- consistent max widths

**Step 4: Implement interaction styling**

Add:

- hover states
- focus-visible states
- button styles
- navigation treatment

**Step 5: Add responsive rules**

Test layout behavior at:

- 375px
- 768px
- 1024px
- 1440px

---

### Task 4: Add lightweight interaction behavior

**Files:**
- Modify: `D:\Projects\mo-gallery\main.js`
- Modify: `D:\Projects\mo-gallery\index.html`
- Modify: `D:\Projects\mo-gallery\styles.css`

**Step 1: Add a mobile menu toggle**

Ensure the menu can open and close with keyboard and pointer interaction.

**Step 2: Add scroll reveal behavior**

Use IntersectionObserver to animate designated sections into view.

**Step 3: Add a progress indicator**

Display subtle reading progress at the top of the page.

**Step 4: Respect reduced motion**

Disable or soften transitions when `prefers-reduced-motion` is enabled.

---

### Task 5: Document usage

**Files:**
- Modify: `D:\Projects\mo-gallery\README.md`

**Step 1: Explain what the project is**

Describe the homepage as a standalone official landing page for MO Gallery.

**Step 2: Explain how to run it**

Document the simplest path:

- open `index.html` directly
- or serve the directory with a static file server

**Step 3: Explain structure**

List the purpose of each top-level file.

---

### Task 6: Verify output

**Files:**
- Verify: `D:\Projects\mo-gallery\index.html`
- Verify: `D:\Projects\mo-gallery\styles.css`
- Verify: `D:\Projects\mo-gallery\main.js`

**Step 1: Run a basic file listing**

Run:

```powershell
Get-ChildItem D:\Projects\mo-gallery
```

Expected:

- the four project files exist

**Step 2: Run a simple content check**

Run:

```powershell
Get-Content D:\Projects\mo-gallery\index.html
```

Expected:

- the homepage sections are present

**Step 3: If possible, open the page in a browser for manual review**

Verify:

- responsive layout
- no broken links
- no visual overlap
- editorial tone is preserved on mobile and desktop

**Step 4: Summarize any remaining limitations**

Call out:

- placeholder links
- static content assumptions
- future expansion points
