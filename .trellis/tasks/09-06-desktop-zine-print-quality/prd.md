# Fix desktop Zine print PDF quality

## Goal

Produce reliable desktop Zine PDFs for printing, following the user's explicit request to fix the print-readiness issues reviewed in the preceding response.

## Requirements

- R1: Keep text as vector PDF text and embed the actual chosen font, including Chinese and page numbers. Missing fonts or unsupported glyphs must not silently change the typeface or disappear.
- R2: Export original-resolution images, preserve transparency, avoid additional lossy JPEG compression, and measure the dimensions of the actual exported image. Missing or unreadable originals are errors.
- R3: Use 300 PPI as the photographic print target with a distinct severe warning below 150 PPI. Preflight must expose image resolution, missing content, text overflow, and critical content/bleed concerns before download.
- R4: Retain reading-order pages, existing millimetre geometry, bleed and crop marks, and write valid PDF MediaBox, TrimBox and BleedBox values.
- R5: Export explicitly color-managed RGB content and describe the output truthfully. CMYK/PDF-X certification depends on a print provider's output profile and validation; do not claim certification without these inputs.
- R6: Preserve stored project/asset compatibility and all unrelated uncommitted interaction work.

## Acceptance Criteria

- AC1 (R1): A temporary PDF containing selected Latin and Chinese typefaces and folios has embedded fonts and selectable text; preview uses the same chosen font resources.
- AC2 (R2, R3): Actual source dimensions drive preflight; a mislabeled or missing source cannot produce a silently degraded or empty print PDF. Unsupported formats use lossless conversion when safe.
- AC3 (R3): Print warnings are actionable and acknowledged before download. Invalid image/font resources block export. Text overflow and safe-margin/bleed issues identify the affected page/slot.
- AC4 (R4): An A5 print page with 3 mm bleed has 164 x 226 mm media, a 148 x 210 mm trim box inset by 8 mm, and a 154 x 216 mm bleed box inset by 5 mm.
- AC5 (R5): RGB PDF resources refer to an embedded sRGB ICC profile; wide-gamut sources are converted deliberately rather than simply relabeled. UI makes no unconditional print-ready/PDF-X claim.
- AC6 (R6): Desktop frontend build, Go build/vet, targeted static checks, and temporary PDF structural/render checks pass. Do not add a permanent test suite or use browser UI automation; the related interaction task records the user's request to stop browser checks.

## Scope

Zine PDF export, font assets, preflight UI/copy, and related print helpers only. No schema migrations, release changes, editor interaction redesign, press-specific imposition or invented CMYK output profiles.
