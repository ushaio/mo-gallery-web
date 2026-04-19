-- Incrementally backfill Story.content inline <img> tags with data-photo-id.
--
-- Behavior:
-- 1. Only processes HTML <img ...> tags.
-- 2. Only updates tags that do NOT already have data-photo-id.
-- 3. Matches src against unique candidates from "Photo"."url" / "thumbnailUrl".
-- 4. Supports exact URL and "origin-stripped" variants (/uploads/foo.jpg).
-- 5. Safe to run multiple times (idempotent).

DO $$
DECLARE
  story_rec RECORD;
  match_rec RECORD;
  next_content TEXT;
  next_tag TEXT;
  changed_stories INTEGER := 0;
  updated_tags INTEGER := 0;
  unmatched_tags INTEGER := 0;
  current_unmatched INTEGER := 0;
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
    WHERE "content" ~* '<img\b'
    ORDER BY "updatedAt" DESC
  LOOP
    next_content := story_rec."content";

    FOR match_rec IN
      WITH story_tags AS (
        SELECT
          tag_match[1] AS full_tag,
          (regexp_match(tag_match[1], $imgsrc$src=(["'])(.*?)\1$imgsrc$, 'i'))[2] AS src
        FROM regexp_matches(story_rec."content", '(<img\b[^>]*>)', 'gi') AS tag_match
      )
      SELECT DISTINCT
        story_tags.full_tag,
        story_tags.src,
        candidates.photo_id
      FROM story_tags
      JOIN tmp_story_photo_candidates candidates
        ON story_tags.src = candidates.candidate
      WHERE story_tags.src IS NOT NULL
        AND story_tags.full_tag !~* '\bdata-photo-id='
    LOOP
      next_tag := regexp_replace(
        match_rec.full_tag,
        '<img\b',
        format('<img data-photo-id="%s"', match_rec.photo_id),
        'i'
      );

      IF next_tag <> match_rec.full_tag THEN
        next_content := replace(next_content, match_rec.full_tag, next_tag);
        updated_tags := updated_tags + 1;
      END IF;
    END LOOP;

    WITH story_tags AS (
      SELECT
        tag_match[1] AS full_tag,
        (regexp_match(tag_match[1], $imgsrc$src=(["'])(.*?)\1$imgsrc$, 'i'))[2] AS src
      FROM regexp_matches(story_rec."content", '(<img\b[^>]*>)', 'gi') AS tag_match
    )
    SELECT COUNT(*)
    INTO current_unmatched
    FROM story_tags
    LEFT JOIN tmp_story_photo_candidates candidates
      ON story_tags.src = candidates.candidate
    WHERE story_tags.src IS NOT NULL
      AND story_tags.full_tag !~* '\bdata-photo-id='
      AND candidates.photo_id IS NULL;

    unmatched_tags := unmatched_tags + COALESCE(current_unmatched, 0);

    IF next_content <> story_rec."content" THEN
      UPDATE "Story"
      SET "content" = next_content
      WHERE "id" = story_rec."id";

      changed_stories := changed_stories + 1;
      RAISE NOTICE 'Updated story % (%)', story_rec."id", story_rec."title";
    END IF;
  END LOOP;

  RAISE NOTICE 'Story inline photo-id backfill complete.';
  RAISE NOTICE 'Changed stories: %', changed_stories;
  RAISE NOTICE 'Updated <img> tags: %', updated_tags;
  RAISE NOTICE 'Unmatched <img> tags left unchanged: %', unmatched_tags;
END
$$;
