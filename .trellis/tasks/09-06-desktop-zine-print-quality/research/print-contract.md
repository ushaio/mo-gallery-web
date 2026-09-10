# Reviewed print-export contract

The preceding user-approved audit found vector text with silent font substitution, original JPEG/PNG use but JPEG 0.92 conversion of other images, 150 PPI-only warnings, crop marks without PDF trim/bleed boxes, and an sRGB claim without complete color management.

Existing physical constants: 3 mm default bleed, 5 mm crop-mark area, 5 mm content safe margin. Print pages are in reading order; cover front is first and cover back is last. Shared project geometry is millimetres; text size is points.

Fonts and image quality must be fixed without rasterizing page text. Explicit ICC RGB tagging is appropriate for a generic output; press-specific CMYK or PDF/X requires a real provider profile. Image source dimensions must be measured after decoding, and 300 PPI is a quality target rather than a universal mandatory lower bound.

Keep current unrelated user edits. Desktop convention is no unnecessary permanent tests; perform temporary deterministic/PDF verification and builds. No browser UI automation, following the related task's recorded user constraint.
