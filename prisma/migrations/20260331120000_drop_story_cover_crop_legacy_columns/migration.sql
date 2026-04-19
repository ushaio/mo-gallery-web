-- Add coverCrop JSONB column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'coverCrop'
  ) THEN
    ALTER TABLE "Story" ADD COLUMN "coverCrop" JSONB;
  END IF;
END;
$$;

-- Drop legacy split columns if they exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'coverCropX'
  ) THEN
    ALTER TABLE "Story" DROP COLUMN "coverCropX";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'coverCropY'
  ) THEN
    ALTER TABLE "Story" DROP COLUMN "coverCropY";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'coverCropWidth'
  ) THEN
    ALTER TABLE "Story" DROP COLUMN "coverCropWidth";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'coverCropHeight'
  ) THEN
    ALTER TABLE "Story" DROP COLUMN "coverCropHeight";
  END IF;
END;
$$;
