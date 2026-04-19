-- Follow-up backfill for story inline image references.
--
-- Why this migration exists:
-- 1. Existing content may still use Markdown image syntax: ![alt](url)
-- 2. Existing HTML <img> tags may still be missing data-photo-id
-- 3. Internal gallery images are normalized to data-photo-id only
--
-- Notes:
-- - This migration is idempotent.
-- - It only updates images whose src uniquely matches Photo.url or Photo.thumbnailUrl.
-- - Unmatched external images are left untouched.

DO $$
DECLARE
  story_rec RECORD;
  html_match RECORD;
  md_match RECORD;
  next_content TEXT;
  next_tag TEXT;
  next_block TEXT;
  changed_stories INTEGER := 0;
  updated_html_tags INTEGER := 0;
  updated_markdown_images INTEGER := 0;
BEGIN
  CREATE TEMP TABLE tmp_story_photo_candidates (
    candidate TEXT PRIMARY KEY,
    photo_id TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_story_photo_candidates (candidate, photo_id)
  WITH raw_candidates AS (
    SELECT "id" AS photo_id, "url" AS candidate
    FROM "Photo"
    WHERE "url" IS NOT NULL AND btrim("url") <> ''

    UNION ALL

    SELECT "id" AS photo_id, "thumbnailUrl" AS candidate
    FROM "Photo"
    WHERE "thumbnailUrl" IS NOT NULL AND btrim("thumbnailUrl") <> ''
  ),
  normalized_candidates AS (
    SELECT photo_id, btrim(candidate) AS candidate
    FROM raw_candidates

    UNION ALL

    SELECT photo_id, regexp_replace(btrim(candidate), '^(https?:)?//[^/]+', '')
    FROM raw_candidates
    WHERE candidate ~* '^(https?:)?//'

    UNION ALL

    SELECT photo_id, regexp_replace(regexp_replace(btrim(candidate), '^(https?:)?//[^/]+', ''), '^/+', '')
    FROM raw_candidates
    WHERE candidate ~* '^(https?:)?//'
  ),
  unique_candidates AS (
    SELECT
      candidate,
      MIN(photo_id) AS photo_id
    FROM normalized_candidates
    WHERE candidate IS NOT NULL AND candidate <> ''
    GROUP BY candidate
    HAVING COUNT(DISTINCT photo_id) = 1
  )
  SELECT candidate, photo_id
  FROM unique_candidates;

  FOR story_rec IN
    SELECT "id", "title", "content"
    FROM "Story"
    WHERE "content" ~* '<img\b|!\['
    ORDER BY "updatedAt" DESC
  LOOP
    next_content := story_rec."content";

    -- Normalize HTML <img> tags to data-photo-id only.
    FOR html_match IN
      WITH story_tags AS (
        SELECT
          tag_match[1] AS full_tag,
          (regexp_match(tag_match[1], $imgsrc$src=(["'])(.*?)\1$imgsrc$, 'i'))[2] AS src
        FROM regexp_matches(next_content, '(<img\b[^>]*>)', 'gi') AS tag_match
      )
      SELECT DISTINCT
        story_tags.full_tag,
        story_tags.src,
        candidates.photo_id
      FROM story_tags
      JOIN tmp_story_photo_candidates candidates
        ON story_tags.src = candidates.candidate
      WHERE story_tags.src IS NOT NULL
    LOOP
      next_tag := regexp_replace(html_match.full_tag, $srcattr$\s*src=(["'])(.*?)\1$srcattr$, '', 'i');
      IF next_tag ~* '\bdata-photo-id=' THEN
        next_tag := regexp_replace(
          next_tag,
          $photoid$\bdata-photo-id=(["'])(.*?)\1$photoid$,
          format('data-photo-id="%s"', html_match.photo_id),
          'i'
        );
      ELSE
        next_tag := regexp_replace(
          next_tag,
          '<img\b',
          format('<img data-photo-id="%s"', html_match.photo_id),
          'i'
        );
      END IF;

      IF next_tag <> html_match.full_tag THEN
        next_content := replace(next_content, html_match.full_tag, next_tag);
        updated_html_tags := updated_html_tags + 1;
      END IF;
    END LOOP;

    -- Convert Markdown images to HTML img tags with data-photo-id only.
    FOR md_match IN
      WITH markdown_images AS (
        SELECT
          image_match[1] AS full_match,
          image_match[2] AS alt_text,
          image_match[3] AS src,
          image_match[4] AS width
        FROM regexp_matches(
          next_content,
          $mdimg$(!\[([^\]]*)\]\(([^)\s]+)(?:\s+=(\d+)x)?\))$mdimg$,
          'g'
        ) AS image_match
      )
      SELECT DISTINCT
        markdown_images.full_match,
        markdown_images.alt_text,
        markdown_images.src,
        markdown_images.width,
        candidates.photo_id
      FROM markdown_images
      JOIN tmp_story_photo_candidates candidates
        ON markdown_images.src = candidates.candidate
      WHERE markdown_images.src IS NOT NULL
    LOOP
      next_block := format(
        E'\n<p style="text-align: center"><img alt="%s" data-photo-id="%s"%s></p>\n',
        replace(replace(replace(replace(replace(COALESCE(md_match.alt_text, ''), '&', '&amp;'), '"', '&quot;'), '''', '&#39;'), '<', '&lt;'), '>', '&gt;'),
        md_match.photo_id,
        CASE
          WHEN md_match.width IS NOT NULL AND btrim(md_match.width) <> '' THEN format(' width="%s"', md_match.width)
          ELSE ''
        END
      );

      IF next_block <> md_match.full_match THEN
        next_content := replace(next_content, md_match.full_match, next_block);
        updated_markdown_images := updated_markdown_images + 1;
      END IF;
    END LOOP;

    IF next_content <> story_rec."content" THEN
      UPDATE "Story"
      SET "content" = next_content
      WHERE "id" = story_rec."id";

      changed_stories := changed_stories + 1;
      RAISE NOTICE 'Updated story % (%)', story_rec."id", story_rec."title";
    END IF;
  END LOOP;

  RAISE NOTICE 'Story content photo-id backfill v2 complete.';
  RAISE NOTICE 'Changed stories: %', changed_stories;
  RAISE NOTICE 'Updated HTML <img> tags: %', updated_html_tags;
  RAISE NOTICE 'Converted Markdown images: %', updated_markdown_images;
END
$$;
