ALTER TABLE "Photo" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Photo_updatedAt_id_idx" ON "Photo"("updatedAt", "id");

CREATE TABLE "PhotoChange" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "path" TEXT,
    "thumbPath" TEXT,
    "storageSourceId" TEXT,
    "storagePluginId" TEXT,
    "storageUrlType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PhotoChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PhotoChange_updatedAt_id_idx" ON "PhotoChange"("updatedAt", "id");
CREATE INDEX "PhotoChange_photoId_updatedAt_idx" ON "PhotoChange"("photoId", "updatedAt");

INSERT INTO "PhotoChange" (
    "id", "photoId", "path", "thumbPath", "storageSourceId", "storagePluginId",
    "storageUrlType", "updatedAt", "deletedAt"
)
SELECT gen_random_uuid()::text, "id", "path", "thumbPath", "storageSourceId", "storagePluginId",
       "storageUrlType", "updatedAt", NULL
FROM "Photo";

CREATE FUNCTION photo_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER photo_touch_updated_at_before_update
BEFORE UPDATE ON "Photo"
FOR EACH ROW EXECUTE FUNCTION photo_touch_updated_at();

CREATE FUNCTION photo_change_feed_record() RETURNS trigger AS $$
DECLARE
    source "Photo"%ROWTYPE;
    change_time TIMESTAMP(3);
BEGIN
    IF TG_OP = 'DELETE' THEN
        source := OLD;
        change_time := CURRENT_TIMESTAMP;
    ELSE
        source := NEW;
        change_time := NEW."updatedAt";
    END IF;

    INSERT INTO "PhotoChange" (
        "id", "photoId", "path", "thumbPath", "storageSourceId", "storagePluginId",
        "storageUrlType", "updatedAt", "deletedAt"
    ) VALUES (
        gen_random_uuid()::text, source."id", source."path", source."thumbPath",
        source."storageSourceId", source."storagePluginId", source."storageUrlType",
        change_time, CASE WHEN TG_OP = 'DELETE' THEN change_time ELSE NULL END
    );
    -- AFTER trigger return values are ignored.
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER photo_change_feed_after_write
AFTER INSERT OR UPDATE OR DELETE ON "Photo"
FOR EACH ROW EXECUTE FUNCTION photo_change_feed_record();
