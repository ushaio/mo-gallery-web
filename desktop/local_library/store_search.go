package local_library

import (
	"context"
	"database/sql"
	"fmt"
)

// The search index used to be an fts5 table with an UNINDEXED asset_id column,
// maintained by triggers that ran `DELETE FROM asset_search WHERE asset_id=?`
// followed by a re-insert built from three correlated subqueries. Because an
// UNINDEXED column has no index, every delete scanned the whole index, so
// indexing N assets cost O(N^2) work inside the scan transaction.
//
// The index is now keyed by assets.local_id, which is the fts5 rowid, so
// maintenance is a rowid lookup. Triggers no longer touch the index at all:
// they append to asset_search_dirty, and the rows are rebuilt set-based by
// flushAssetSearch. Bulk indexing therefore pays one merged FTS write per
// batch instead of one expensive rebuild per row.

const assetSearchColumns = "file_name,relative_path,display_title,notes,tags,collections,camera"

var assetSearchSchema = []string{
	`CREATE VIRTUAL TABLE IF NOT EXISTS asset_search USING fts5(
        file_name, relative_path, display_title, notes, tags, collections, camera,
        tokenize='unicode61'
    )`,
	`CREATE TABLE IF NOT EXISTS asset_search_dirty (asset_id TEXT PRIMARY KEY)`,
	`CREATE VIEW IF NOT EXISTS asset_search_source AS
    SELECT a.local_id AS local_id,a.id AS asset_id,a.file_name,a.relative_path,a.display_title,a.notes,
        COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id), '') AS tags,
        COALESCE((SELECT group_concat(c.name, ' ') FROM collection_assets ca JOIN collections c ON c.id=ca.collection_id WHERE ca.asset_id=a.id), '') AS collections,
        trim(COALESCE(e.camera_make,'') || ' ' || COALESCE(e.camera_model,'') || ' ' || COALESCE(e.lens_model,'')) AS camera
    FROM assets a LEFT JOIN exif e ON e.asset_id=a.id`,
	assetSearchDirtyTrigger("asset_search_assets_insert", "AFTER INSERT ON assets", "NEW.id"),
	assetSearchDirtyTrigger("asset_search_assets_update", "AFTER UPDATE OF file_name,relative_path,display_title,notes ON assets", "NEW.id"),
	`CREATE TRIGGER IF NOT EXISTS asset_search_assets_delete AFTER DELETE ON assets BEGIN
        DELETE FROM asset_search WHERE rowid=OLD.local_id;
        DELETE FROM asset_search_dirty WHERE asset_id=OLD.id;
    END`,
	assetSearchDirtyTrigger("asset_search_exif_insert", "AFTER INSERT ON exif", "NEW.asset_id"),
	assetSearchDirtyTrigger("asset_search_exif_update", "AFTER UPDATE OF camera_make,camera_model,lens_model ON exif", "NEW.asset_id"),
	assetSearchDirtyTrigger("asset_search_exif_delete", "AFTER DELETE ON exif", "OLD.asset_id"),
	assetSearchDirtyTrigger("asset_search_asset_tags_insert", "AFTER INSERT ON asset_tags", "NEW.asset_id"),
	assetSearchDirtyTrigger("asset_search_asset_tags_delete", "AFTER DELETE ON asset_tags", "OLD.asset_id"),
	assetSearchRelatedDirtyTrigger("asset_search_tags_update", "AFTER UPDATE OF name ON tags", "asset_tags", "tag_id", "NEW.id"),
	assetSearchDirtyTrigger("asset_search_collection_assets_insert", "AFTER INSERT ON collection_assets", "NEW.asset_id"),
	assetSearchDirtyTrigger("asset_search_collection_assets_delete", "AFTER DELETE ON collection_assets", "OLD.asset_id"),
	assetSearchRelatedDirtyTrigger("asset_search_collections_update", "AFTER UPDATE OF name ON collections", "collection_assets", "collection_id", "NEW.id"),
}

// legacyAssetSearchObjects are dropped before the new schema is created so a
// pre-M014 library does not keep the expensive triggers around.
var legacyAssetSearchObjects = []string{
	`DROP TRIGGER IF EXISTS asset_search_assets_insert`,
	`DROP TRIGGER IF EXISTS asset_search_assets_update`,
	`DROP TRIGGER IF EXISTS asset_search_assets_delete`,
	`DROP TRIGGER IF EXISTS asset_search_exif_insert`,
	`DROP TRIGGER IF EXISTS asset_search_exif_update`,
	`DROP TRIGGER IF EXISTS asset_search_exif_delete`,
	`DROP TRIGGER IF EXISTS asset_search_asset_tags_insert`,
	`DROP TRIGGER IF EXISTS asset_search_asset_tags_delete`,
	`DROP TRIGGER IF EXISTS asset_search_tags_update`,
	`DROP TRIGGER IF EXISTS asset_search_collection_assets_insert`,
	`DROP TRIGGER IF EXISTS asset_search_collection_assets_delete`,
	`DROP TRIGGER IF EXISTS asset_search_collections_update`,
	`DROP VIEW IF EXISTS asset_search_source`,
	`DROP TABLE IF EXISTS asset_search`,
}

func assetSearchDirtyTrigger(name, event, assetID string) string {
	return fmt.Sprintf(`CREATE TRIGGER IF NOT EXISTS %s %s BEGIN
        INSERT OR IGNORE INTO asset_search_dirty(asset_id) VALUES(%s);
    END`, name, event, assetID)
}

func assetSearchRelatedDirtyTrigger(name, event, relation, foreignKey, relatedID string) string {
	return fmt.Sprintf(`CREATE TRIGGER IF NOT EXISTS %s %s BEGIN
        INSERT OR IGNORE INTO asset_search_dirty(asset_id) SELECT asset_id FROM %s WHERE %s=%s;
    END`, name, event, relation, foreignKey, relatedID)
}

// migrateAssetSearch installs the rowid-keyed index. A library that still has
// the legacy asset_id column is rebuilt from scratch; the index is fully
// derivable from assets/exif/tags/collections, so a rebuild is always safe.
func migrateAssetSearch(tx *sql.Tx) error {
	legacy, err := hasLegacyAssetSearch(tx)
	if err != nil {
		return err
	}
	if legacy {
		for _, statement := range legacyAssetSearchObjects {
			if _, err := tx.Exec(statement); err != nil {
				return fmt.Errorf("drop legacy search index: %w", err)
			}
		}
	}
	for _, statement := range assetSearchSchema {
		if _, err := tx.Exec(statement); err != nil {
			return fmt.Errorf("create search index: %w", err)
		}
	}
	// Populate rows that are not indexed yet. On a fresh or rebuilt index this
	// covers the whole library; afterwards it is a no-op.
	if _, err := tx.Exec(`INSERT INTO asset_search(rowid,` + assetSearchColumns + `)
        SELECT source.local_id,source.file_name,source.relative_path,source.display_title,source.notes,source.tags,source.collections,source.camera
        FROM asset_search_source source
        WHERE source.local_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM asset_search search WHERE search.rowid=source.local_id)`); err != nil {
		return fmt.Errorf("populate search index: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM asset_search_dirty`); err != nil {
		return err
	}
	return nil
}

func hasLegacyAssetSearch(tx *sql.Tx) (bool, error) {
	var tables int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='asset_search'`).Scan(&tables); err != nil {
		return false, err
	}
	if tables == 0 {
		return false, nil
	}
	return tableHasColumn(tx, "asset_search", "asset_id")
}

// flushAssetSearch rebuilds the index rows queued by the triggers. It is called
// before any search query and once at the end of a scan, and returns quickly
// when the queue is empty.
func (s *store) flushAssetSearch(ctx context.Context) error {
	s.searchFlushMu.Lock()
	defer s.searchFlushMu.Unlock()
	var pending int
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM asset_search_dirty)`).Scan(&pending); err != nil {
		return err
	}
	if pending == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM asset_search WHERE rowid IN (
        SELECT a.local_id FROM asset_search_dirty dirty JOIN assets a ON a.id=dirty.asset_id WHERE a.local_id IS NOT NULL)`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO asset_search(rowid,`+assetSearchColumns+`)
        SELECT source.local_id,source.file_name,source.relative_path,source.display_title,source.notes,source.tags,source.collections,source.camera
        FROM asset_search_source source JOIN asset_search_dirty dirty ON dirty.asset_id=source.asset_id
        WHERE source.local_id IS NOT NULL`); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM asset_search_dirty`); err != nil {
		return err
	}
	return tx.Commit()
}
