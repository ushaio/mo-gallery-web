-- Add coverCrop column to Story table if it does not already exist
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
