# Story Cover Crop Design

## Goal

Add a single reusable cover crop configuration for story covers in `admin/logs`, stored on `Story` and applied consistently across the story list, story detail hero, and admin preview.

## Decision

Use database-backed crop parameters instead of generating and storing a separate cropped image file.

## Why

- Keeps the original photo as the source of truth.
- Avoids storage duplication and cache invalidation work.
- Lets editors refine the crop later without regenerating assets.
- Fits the current architecture, where story covers already point to a `coverPhotoId`.

## Data Model

Add four optional normalized fields to `Story`:

- `coverCropX`
- `coverCropY`
- `coverCropWidth`
- `coverCropHeight`

All values are stored in the `0..1` range relative to the chosen cover photo.

## UX

- Editors choose a cover photo the same way as today.
- If the cover photo is an uploaded story photo, they can open a crop editor modal.
- The modal shows:
  - a source image with a draggable crop rectangle
  - a resize handle for the crop rectangle
  - live cover previews for card and hero usage
- Changing the cover photo resets the crop so old coordinates are not incorrectly reused.

## Rendering

- Frontend derives a focus position and zoom from the stored crop rectangle.
- The same crop data is reused by story cards, story detail hero, and admin preview.
- When no crop is stored, current `object-cover` behavior remains unchanged.

## Compatibility

- Existing stories continue to work without migration logic beyond nullable fields.
- No separate cropped files are created in storage.
