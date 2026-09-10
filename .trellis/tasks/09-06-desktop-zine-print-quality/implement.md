# Implementation

1. Implement installed-font resolution, standalone face resource serving, shared PDF/preview font preparation.
2. Implement PDF page boxes, ICC resources, and structural validation as an isolated finalizer.
3. Replace unsafe image fallback/conversion with actual-source measurement and lossless, color-managed preparation.
4. Integrate font runs and embedded folios, preflight layout/geometry/300 PPI checks, and warning review in the export dialog.
5. Run desktop frontend build and scoped lint; run Go build and vet after font changes settle.
6. Generate temporary representative PDFs, inspect fonts/images/page boxes/color space/text, render to PNG and visually inspect. Use temporary tooling only, no permanent test suite and no browser UI automation.
7. Review the complete scoped diff, record verified print contracts and validation results, and finish without staging/committing unrelated work.
