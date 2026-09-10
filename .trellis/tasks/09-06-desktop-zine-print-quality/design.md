# Design

## Boundaries and ownership

- Font implementer: desktop font discovery/resource routes and new shared frontend font preparation/preview helpers. Do not edit the PDF exporter or general i18n/store code.
- PDF implementer: new `lib/zine/pdf-output.ts` and sRGB profile resource. Finish generated PDFs with page boxes and ICC color resources; validate embedded fonts and output structure. Do not edit dependencies or the exporter.
- Main agent: image preparation, exporter integration, preflight, dialog, print constants/copy, dependency installation, final verification.

## Fonts

Resolve the requested CSS family using installed font metadata. Serve the selected face as a standalone SFNT, including extraction of a selected TTC face, so browser FontFace and react-pdf load identical bytes. Explicit missing fonts fail. Generic CSS families resolve to platform font candidates. Register and load real fonts (including a deliberate CJK fallback when a primary face lacks glyphs), expose PDF text runs, and use the same font stack on the canvas. Folios use an embedded font as well.

## Images and color

Load referenced originals once, fail missing sources, decode actual dimensions, and process sequentially to avoid unbounded full-resolution canvas work. Preserve suitable sRGB JPEG bytes where possible; use lossless PNG when conversion is required. Browser color-managed decoding/canvas in sRGB handles profiles and orientation. A fallback decoder must not silently reinterpret unknown wide-gamut/HDR data. Prepared assets are ephemeral and never written back into the project.

## PDF and preflight

Keep react-pdf for vector text/layout. Post-process with pdf-lib to set trim/bleed boxes and embed an sRGB DefaultRGB/ICCBased profile without rasterizing pages. Do not add an unvalidated PDF/X identifier or a made-up press output intent. Validate generated font/image resources. Use actual prepared assets for resolution and use renderer layout to detect clipped text. Pure geometry checks cover page-safe content and unfilled bleed; warn for user-reviewed print tradeoffs and block missing/unreadable resources. The dialog retains a prepared PDF while the user reviews warnings, invalidating it when the project or variant changes.

## Compatibility

Stored `fontFamily`, slot geometry, crop transforms, original URLs and blob storage remain compatible. New resource routes are same-origin and never accept arbitrary filesystem paths. Existing font-list/CJK endpoints remain usable by older callers.
