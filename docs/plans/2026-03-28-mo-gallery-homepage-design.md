# MO Gallery Homepage Design

**Date:** 2026-03-28
**Project:** `D:\Projects\mo-gallery`
**Source Context:** `D:\Projects\mo-gallery-web`

---

## Goal

Build a standalone official homepage for MO Gallery that introduces the project to creators first and developers second.

The homepage should:

- feel like an editorial photography website before it feels like a product page
- explain that MO Gallery is not only a photo gallery, but a narrative publishing system
- present the project as self-hostable and trustworthy without collapsing into a generic SaaS layout

---

## Audience

Primary audience:

- photographers
- visual storytellers
- independent creators who care about presentation and narrative

Secondary audience:

- independent developers looking for a self-hosted gallery/blog system

---

## Positioning

MO Gallery should be framed as:

> A self-hosted photography, story, and blog platform for creators who want images and writing to live in the same narrative space.

This homepage should not lead with implementation details.
It should first sell atmosphere, authorship, and intent.
Technical credibility should appear later in the page.

---

## Chosen Direction

Approved direction:

- standalone project in `D:\Projects\mo-gallery`
- homepage only
- editorial storytelling structure
- visual tone: premium magazine / exhibition guide
- audience bias: creators over developers

Rejected directions:

- generic feature-grid SaaS homepage
- overly technical developer landing page
- experimental exhibition microsite with excessive motion

---

## Information Architecture

### 1. Hero

Purpose:

- create immediate emotional pull
- establish MO Gallery as a creative medium, not a utility

Content:

- oversized editorial headline
- short supporting paragraph
- one primary CTA: learn about the project
- one secondary CTA: explore GitHub or demo
- large photographic background or split composition with cropped imagery

### 2. Manifesto

Purpose:

- explain the project thesis
- transition from mood to meaning

Content:

- short statement about photos, text, time, and narrative
- restrained copy, not marketing-heavy

### 3. Narrative Showcase

Purpose:

- reveal the three core modes of the product

Content:

- Gallery
- Story
- Blog

Each mode should be introduced as a publishing experience, not just a feature.

### 4. Why It Exists

Purpose:

- clarify the problem MO Gallery solves

Content:

- most gallery tools separate photos from writing
- most blogs flatten visual work into article attachments
- MO Gallery reconnects visual sequence, author voice, and publishing workflow

### 5. Core Capabilities

Purpose:

- translate the product into concrete value

Content groups:

- multi-view gallery
- story editor and narrative publishing
- integrated blog workflow
- EXIF and image metadata
- comments and engagement
- admin tooling
- multi-storage support
- self-hosted deployment

### 6. Trust and Build Stack

Purpose:

- reassure technical visitors
- build open-source credibility

Content:

- Next.js, Hono, Prisma, PostgreSQL, Tailwind, TipTap
- self-hosted architecture
- creator-owned data and assets

### 7. Final CTA

Purpose:

- give users a clear next move

Actions:

- view GitHub
- start deploying
- optional tertiary path to browse sample experience

---

## Visual System

### Tone

- black-white editorial base
- subtle warm neutrals
- minimal chrome
- strong typography
- oversized breathing space

### Typography

Chosen pairing:

- Heading: `Cormorant Garamond`
- Body/UI: `Montserrat`

Reason:

- consistent with the existing MO Gallery project
- more literary and reflective than a generic product-site pairing

### Color Palette

- Ink: `#0B0B0B`
- Warm Paper: `#F5F1E8`
- Smoke Brown: `#8A7F72`
- Soft Border: `#D9D0C3`
- Muted Text: `#61584F`

Use color sparingly.
Do not create a tech-brand accent system.

### Layout Language

- wide image planes
- narrow text measure
- clear section rhythm
- thin dividers
- almost-square corners
- very restrained shadows

### Motion

Allowed:

- fade in
- subtle translate on scroll
- gentle parallax or layered reveal

Avoid:

- particles
- glassmorphism
- heavy zoom hovers
- decorative motion that competes with imagery

---

## Copy Direction

Voice:

- reflective
- precise
- calm
- project-introduction, not salesy

Rules:

- short paragraphs
- no hype language
- no “best”, “ultimate”, “revolutionary”
- no enterprise positioning

---

## Interaction Principles

- clear hover and focus states
- no layout-shifting hovers
- buttons remain quiet and precise
- navigation should stay simple and visible
- mobile layout must preserve editorial rhythm without horizontal tricks

---

## Deliverable

The standalone project should ship with:

- one complete homepage
- responsive layout
- local assets or gradient-based visual placeholders if source imagery is unavailable
- clean project structure for future expansion

---

## Non-Goals

- building a full documentation site
- recreating the original application
- wiring live backend data
- implementing a CMS
- adding complex animation systems

---

## Success Criteria

The homepage is successful if:

- it feels credible as a photography-first brand page
- it clearly explains what MO Gallery is within one scroll
- it differentiates the project from generic gallery/blog templates
- it gives both creators and developers a clear next step
