package local_library

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const currentSchemaVersion = 9

var createUpgradeBackup = func(ctx context.Context, root string, db *sql.DB) error {
	_, err := createBackupFile(ctx, root, BackupKindUpgrade, db)
	return err
}

type store struct {
	db       *sql.DB
	upsertMu sync.Mutex
}

type indexedFile struct {
	ID             AssetID
	RelativePath   string
	PathKey        string
	FolderPath     string
	FileName       string
	Extension      string
	Format         string
	MimeType       string
	MediaKind      string
	ByteSize       int64
	ModifiedAtNS   int64
	Width          int
	Height         int
	Orientation    int
	IsAnimated     bool
	FrameCount     int
	CapturedAt     *time.Time
	PreviewStatus  string
	PreviewError   string
	MetadataStatus string
	DominantColors []string
	EXIF           exifMetadata
}

type unchangedAsset struct {
	ID             AssetID
	PreviewStatus  string
	DominantColors string
}

func openStore(root string) (*store, error) {
	return openStoreWithMigration(root, nil)
}

func openStoreForUse(root string) (*store, error) {
	info, err := inspectStoreUpgrade(root)
	if err != nil {
		return nil, err
	}
	if info.Required {
		return nil, newError(ErrLibraryUpgradeRequired, "本地资源库需要升级数据库后才能使用", map[string]any{
			"path":           info.RootPath,
			"currentVersion": info.CurrentVersion,
			"targetVersion":  info.TargetVersion,
		})
	}
	// The caller has passed the upgrade gate. The regular opener still handles
	// first-time/empty stores; for an existing older store the check above
	// prevents opening until the explicit upgrade action has completed.
	return openStoreWithMigration(root, nil)
}

func openStoreWithMigration(root string, migrateStore func(*store) error) (*store, error) {
	dbPath := internalPath(root, "library.db")
	// Acquire the WAL write reservation when a transaction begins. Deferred
	// transactions can read an old snapshot and then fail with SQLITE_BUSY_SNAPSHOT
	// (517) when thumbnail workers commit before the scanner starts writing.
	dsn := "file:" + filepath.ToSlash(dbPath) + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	needsMigration, err := databaseNeedsMigration(db)
	if err != nil {
		db.Close()
		return nil, err
	}
	if needsMigration {
		if err := createUpgradeBackup(context.Background(), root, db); err != nil {
			db.Close()
			return nil, fmt.Errorf("create pre-upgrade backup: %w", err)
		}
		if err := pruneBackups(root, BackupKindUpgrade, upgradeBackupRetention); err != nil {
			db.Close()
			return nil, fmt.Errorf("prune pre-upgrade backups: %w", err)
		}
	}
	s := &store{db: db}
	if migrateStore == nil {
		migrateStore = func(store *store) error { return store.migrate() }
	}
	if err := migrateStore(s); err != nil {
		db.Close()
		if needsMigration {
			if restoreErr := restoreLatestBackupFile(root, BackupKindUpgrade, dbPath); restoreErr != nil {
				return nil, fmt.Errorf("migrate local library: %v; restore pre-upgrade backup: %w", err, restoreErr)
			}
		}
		return nil, err
	}
	return s, nil
}

func databaseNeedsMigration(db *sql.DB) (bool, error) {
	_, needsMigration, err := readStoreSchemaVersion(db)
	return needsMigration, err
}

func inspectStoreUpgrade(root string) (LibraryUpgradeInfo, error) {
	clean, err := cleanRoot(root)
	if err != nil {
		return LibraryUpgradeInfo{}, err
	}
	dbPath := internalPath(clean, "library.db")
	dsn := "file:" + filepath.ToSlash(dbPath) + "?mode=ro&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return LibraryUpgradeInfo{}, err
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return LibraryUpgradeInfo{}, err
	}
	version, needsMigration, err := readStoreSchemaVersion(db)
	if err != nil {
		return LibraryUpgradeInfo{}, err
	}
	return LibraryUpgradeInfo{
		RootPath:       clean,
		CurrentVersion: version,
		TargetVersion:  currentSchemaVersion,
		Required:       needsMigration,
	}, nil
}

func readStoreSchemaVersion(db *sql.DB) (int, bool, error) {
	var userTableCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&userTableCount); err != nil {
		return 0, false, err
	}
	if userTableCount == 0 {
		return 0, false, nil
	}
	var hasMetaTable int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='library_meta'`).Scan(&hasMetaTable); err != nil {
		return 0, false, err
	}
	if hasMetaTable == 0 {
		return 0, true, nil
	}
	var rawVersion string
	if err := db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&rawVersion); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, true, nil
		}
		return 0, false, err
	}
	version, err := strconv.Atoi(rawVersion)
	if err != nil || version < 0 {
		return 0, false, fmt.Errorf("invalid local library schema version %q", rawVersion)
	}
	if version > currentSchemaVersion {
		return version, false, fmt.Errorf("local library schema version %d is newer than supported version %d", version, currentSchemaVersion)
	}
	return version, version < currentSchemaVersion, nil
}

func (s *store) Close() error { return s.db.Close() }

func addColumnIfMissing(tx *sql.Tx, table, column, definition string) error {
	rows, err := tx.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	found := false
	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull, primaryKey int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &primaryKey); err != nil {
			_ = rows.Close()
			return err
		}
		if name == column {
			found = true
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if found {
		return nil
	}
	_, err = tx.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + column + ` ` + definition)
	return err
}

func (s *store) migrate() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS library_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY, parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
            availability TEXT NOT NULL DEFAULT 'active' CHECK(availability IN ('active','missing','trashed')),
            discovered_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        )`,
		`CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY, folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
            relative_path TEXT NOT NULL, path_key TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL,
            extension TEXT NOT NULL, format TEXT NOT NULL, mime_type TEXT NOT NULL, media_kind TEXT NOT NULL DEFAULT 'image',
            byte_size INTEGER NOT NULL, modified_at_ns INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0,
            height INTEGER NOT NULL DEFAULT 0, orientation INTEGER NOT NULL DEFAULT 1,
            is_animated INTEGER NOT NULL DEFAULT 0, frame_count INTEGER NOT NULL DEFAULT 1,
            availability TEXT NOT NULL DEFAULT 'active' CHECK(availability IN ('active','missing','trashed')),
            preview_status TEXT NOT NULL DEFAULT 'pending', preview_error TEXT NOT NULL DEFAULT '', metadata_status TEXT NOT NULL DEFAULT 'pending',
            display_title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
            rating INTEGER NOT NULL DEFAULT 0 CHECK(rating BETWEEN 0 AND 5), color_label TEXT NOT NULL DEFAULT '',
            dominant_colors TEXT NOT NULL DEFAULT '[]',
            is_favorite INTEGER NOT NULL DEFAULT 0, captured_at INTEGER,
            discovered_at INTEGER NOT NULL, technical_updated_at INTEGER NOT NULL,
            scan_token TEXT NOT NULL DEFAULT '', trash_entry_id TEXT,
		    cloud_photo_id TEXT
        )`,
		`CREATE TABLE IF NOT EXISTS exif_metadata (
            asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
            camera_make TEXT NOT NULL DEFAULT '', camera_model TEXT NOT NULL DEFAULT '', lens_model TEXT NOT NULL DEFAULT '',
            iso INTEGER, aperture REAL, shutter_seconds REAL, focal_length_mm REAL,
            latitude REAL, longitude REAL, raw_json TEXT NOT NULL DEFAULT ''
        )`,
		`CREATE TABLE IF NOT EXISTS asset_derivatives (
            asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
            variant TEXT NOT NULL CHECK(variant IN ('thumbnail','preview')),
            cache_key TEXT NOT NULL, content_version TEXT NOT NULL, decoder_version TEXT NOT NULL,
            max_dimension INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
            byte_size INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '',
            generated_at INTEGER, last_accessed_at INTEGER NOT NULL,
            PRIMARY KEY(asset_id, variant)
        )`,
		`CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, progress_current INTEGER NOT NULL DEFAULT 0,
            progress_total INTEGER, checkpoint_json TEXT NOT NULL DEFAULT '{}', error_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
        )`,
		`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS asset_tags (asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(asset_id, tag_id))`,
		`CREATE TABLE IF NOT EXISTS collection_groups (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES collection_groups(id) ON DELETE CASCADE, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0)`,
		`CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, group_id TEXT REFERENCES collection_groups(id) ON DELETE SET NULL, name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS collection_assets (collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, added_at INTEGER NOT NULL, PRIMARY KEY(collection_id, asset_id))`,
		`CREATE TABLE IF NOT EXISTS trash_entries (
            id TEXT PRIMARY KEY, asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
            folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
            entry_kind TEXT NOT NULL DEFAULT 'asset', original_path TEXT NOT NULL,
            payload_relative_path TEXT NOT NULL UNIQUE, state TEXT NOT NULL,
            total_bytes INTEGER NOT NULL, managed_asset_count INTEGER NOT NULL DEFAULT 0,
            other_file_count INTEGER NOT NULL DEFAULT 0, directory_count INTEGER NOT NULL DEFAULT 0,
            trashed_at INTEGER NOT NULL
        )`,
		`CREATE INDEX IF NOT EXISTS idx_assets_availability_discovered ON assets(availability, discovered_at DESC, id DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_assets_folder_name ON assets(folder_id, file_name COLLATE NOCASE, id)`,
		`CREATE INDEX IF NOT EXISTS idx_assets_modified ON assets(availability, modified_at_ns DESC, id DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_assets_favorite ON assets(availability, is_favorite, discovered_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_assets_rating ON assets(availability, rating DESC, id DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id, name COLLATE NOCASE)`,
		`CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_asset ON asset_tags(tag_id, asset_id)`,
		`CREATE INDEX IF NOT EXISTS idx_collection_assets_asset_collection ON collection_assets(asset_id, collection_id)`,
		`CREATE INDEX IF NOT EXISTS idx_collection_groups_parent_position ON collection_groups(parent_id, position, name COLLATE NOCASE)`,
		`CREATE INDEX IF NOT EXISTS idx_collections_group_position ON collections(group_id, position, name COLLATE NOCASE)`,
		`CREATE VIRTUAL TABLE IF NOT EXISTS asset_search USING fts5(
            asset_id UNINDEXED, file_name, relative_path, display_title, notes, tags, collections, camera,
            tokenize='unicode61'
        )`,
		`CREATE VIEW IF NOT EXISTS asset_search_source AS
        SELECT a.id AS asset_id,a.file_name,a.relative_path,a.display_title,a.notes,
            COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id=a.id), '') AS tags,
            COALESCE((SELECT group_concat(c.name, ' ') FROM collection_assets ca JOIN collections c ON c.id=ca.collection_id WHERE ca.asset_id=a.id), '') AS collections,
            trim(COALESCE(e.camera_make,'') || ' ' || COALESCE(e.camera_model,'') || ' ' || COALESCE(e.lens_model,'')) AS camera
        FROM assets a LEFT JOIN exif_metadata e ON e.asset_id=a.id`,
		assetSearchTrigger("asset_search_assets_insert", "AFTER INSERT ON assets", "NEW.id"),
		assetSearchTrigger("asset_search_assets_update", "AFTER UPDATE OF file_name,relative_path,display_title,notes ON assets", "NEW.id"),
		`CREATE TRIGGER IF NOT EXISTS asset_search_assets_delete AFTER DELETE ON assets BEGIN
            DELETE FROM asset_search WHERE asset_id=OLD.id;
        END`,
		assetSearchTrigger("asset_search_exif_insert", "AFTER INSERT ON exif_metadata", "NEW.asset_id"),
		assetSearchTrigger("asset_search_exif_update", "AFTER UPDATE OF camera_make,camera_model,lens_model ON exif_metadata", "NEW.asset_id"),
		assetSearchTrigger("asset_search_exif_delete", "AFTER DELETE ON exif_metadata", "OLD.asset_id"),
		assetSearchTrigger("asset_search_asset_tags_insert", "AFTER INSERT ON asset_tags", "NEW.asset_id"),
		assetSearchTrigger("asset_search_asset_tags_delete", "AFTER DELETE ON asset_tags", "OLD.asset_id"),
		assetSearchRelatedTrigger("asset_search_tags_update", "AFTER UPDATE OF name ON tags", "asset_tags", "tag_id", "NEW.id"),
		assetSearchTrigger("asset_search_collection_assets_insert", "AFTER INSERT ON collection_assets", "NEW.asset_id"),
		assetSearchTrigger("asset_search_collection_assets_delete", "AFTER DELETE ON collection_assets", "OLD.asset_id"),
		assetSearchRelatedTrigger("asset_search_collections_update", "AFTER UPDATE OF name ON collections", "collection_assets", "collection_id", "NEW.id"),
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return fmt.Errorf("migrate local library: %w", err)
		}
	}
	var rawVersion string
	version := 0
	if err := tx.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&rawVersion); err == nil {
		version, err = strconv.Atoi(rawVersion)
		if err != nil || version < 0 {
			return fmt.Errorf("invalid local library schema version %q", rawVersion)
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if err := addColumnIfMissing(tx, "assets", "preview_error", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return fmt.Errorf("migrate local library preview error: %w", err)
	}
	if err := addColumnIfMissing(tx, "assets", "dominant_colors", "TEXT NOT NULL DEFAULT '[]'"); err != nil {
		return fmt.Errorf("migrate local library dominant colors: %w", err)
	}
	if err := addColumnIfMissing(tx, "assets", "cloud_photo_id", "TEXT"); err != nil {
		return fmt.Errorf("migrate local library cloud photo id: %w", err)
	}
	if version == 8 {
		// M009 is deliberately version-gated. If a database claims to be v8 but
		// does not have this legacy column, fail and let the outer migration
		// rollback restore the user's pre-upgrade backup.
		if _, err := tx.Exec(`ALTER TABLE assets DROP COLUMN cloud_url`); err != nil {
			return fmt.Errorf("M009 drop assets.cloud_url: %w", err)
		}
		version = 9
	}
	if _, err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_assets_cloud_photo ON assets(cloud_photo_id)`); err != nil {
		return fmt.Errorf("migrate local library cloud photo index: %w", err)
	}
	trashColumns := []struct{ name, definition string }{
		{"folder_id", "TEXT REFERENCES folders(id) ON DELETE SET NULL"},
		{"entry_kind", "TEXT NOT NULL DEFAULT 'asset'"},
		{"managed_asset_count", "INTEGER NOT NULL DEFAULT 0"},
		{"other_file_count", "INTEGER NOT NULL DEFAULT 0"},
		{"directory_count", "INTEGER NOT NULL DEFAULT 0"},
	}
	for _, column := range trashColumns {
		if err := addColumnIfMissing(tx, "trash_entries", column.name, column.definition); err != nil {
			return fmt.Errorf("migrate local library trash entries: %w", err)
		}
	}
	if _, err := tx.Exec(`UPDATE trash_entries SET entry_kind='asset',managed_asset_count=1 WHERE entry_kind IS NULL OR entry_kind=''`); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO asset_search(asset_id,file_name,relative_path,display_title,notes,tags,collections,camera)
        SELECT asset_id,file_name,relative_path,display_title,notes,tags,collections,camera FROM asset_search_source source
        WHERE NOT EXISTS (SELECT 1 FROM asset_search search WHERE search.asset_id=source.asset_id)`); err != nil {
		return fmt.Errorf("migrate local library search index: %w", err)
	}
	if _, err := tx.Exec(`INSERT INTO library_meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, strconv.Itoa(currentSchemaVersion)); err != nil {
		return err
	}
	return tx.Commit()
}

func assetSearchTrigger(name, event, assetID string) string {
	return fmt.Sprintf(`CREATE TRIGGER IF NOT EXISTS %s %s BEGIN
        DELETE FROM asset_search WHERE asset_id=%s;
        INSERT INTO asset_search(asset_id,file_name,relative_path,display_title,notes,tags,collections,camera)
            SELECT asset_id,file_name,relative_path,display_title,notes,tags,collections,camera
            FROM asset_search_source WHERE asset_id=%s;
    END`, name, event, assetID, assetID)
}

func assetSearchRelatedTrigger(name, event, relation, foreignKey, relatedID string) string {
	return fmt.Sprintf(`CREATE TRIGGER IF NOT EXISTS %s %s BEGIN
        DELETE FROM asset_search WHERE asset_id IN (SELECT asset_id FROM %s WHERE %s=%s);
        INSERT INTO asset_search(asset_id,file_name,relative_path,display_title,notes,tags,collections,camera)
            SELECT source.asset_id,source.file_name,source.relative_path,source.display_title,source.notes,source.tags,source.collections,source.camera
            FROM asset_search_source source JOIN %s relation ON relation.asset_id=source.asset_id WHERE relation.%s=%s;
    END`, name, event, relation, foreignKey, relatedID, relation, foreignKey, relatedID)
}

func unixMillis(t time.Time) int64 { return t.UTC().UnixMilli() }
func timeFromMillis(value sql.NullInt64) *time.Time {
	if !value.Valid {
		return nil
	}
	t := time.UnixMilli(value.Int64).UTC()
	return &t
}

func (s *store) ensureFolder(ctx context.Context, relative string) (*string, error) {
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()
	return ensureFolderWith(ctx, s.db, relative)
}

func ensureFolderWith(ctx context.Context, executor interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}, relative string) (*string, error) {
	if relative == "" {
		return nil, nil
	}
	normalized, key, err := normalizeRelative(relative)
	if err != nil {
		return nil, err
	}
	parts := strings.Split(string(normalized), "/")
	var parentID *string
	current := ""
	for _, part := range parts {
		if current == "" {
			current = part
		} else {
			current += "/" + part
		}
		_, currentKey, _ := normalizeRelative(current)
		var id string
		err := executor.QueryRowContext(ctx, `SELECT id FROM folders WHERE path_key=?`, currentKey).Scan(&id)
		if err == sql.ErrNoRows {
			id = newID()
			now := time.Now().UnixMilli()
			_, err = executor.ExecContext(ctx, `INSERT INTO folders(id,parent_id,relative_path,path_key,name,availability,discovered_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)`, id, parentID, current, currentKey, part, now, now)
		} else if err == nil {
			_, err = executor.ExecContext(ctx, `UPDATE folders SET availability='active',updated_at=? WHERE id=?`, time.Now().UnixMilli(), id)
		}
		if err != nil {
			return nil, err
		}
		parentID = &id
	}
	_ = key
	return parentID, nil
}

func (s *store) upsertAsset(ctx context.Context, file indexedFile, scanToken string) (AssetID, bool, error) {
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback()
	folderID, err := ensureFolderWith(ctx, tx, file.FolderPath)
	if err != nil {
		return "", false, err
	}
	now := time.Now().UTC().UnixMilli()
	var existingID, oldPreviewStatus, oldPreviewError, oldDominantColors string
	var oldSize, oldMtime int64
	err = tx.QueryRowContext(ctx, `SELECT id,byte_size,modified_at_ns,preview_status,preview_error,dominant_colors FROM assets WHERE path_key=?`, file.PathKey).
		Scan(&existingID, &oldSize, &oldMtime, &oldPreviewStatus, &oldPreviewError, &oldDominantColors)
	created := false
	capturedAt := nullableUnixMillis(file.CapturedAt)
	switch err {
	case sql.ErrNoRows:
		existingID = newID()
		created = true
		_, err = tx.ExecContext(ctx, `INSERT INTO assets(
            id,folder_id,relative_path,path_key,file_name,extension,format,mime_type,media_kind,byte_size,modified_at_ns,width,height,orientation,is_animated,frame_count,
            availability,preview_status,preview_error,metadata_status,dominant_colors,captured_at,discovered_at,technical_updated_at,scan_token
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?)`,
			existingID, folderID, file.RelativePath, file.PathKey, file.FileName, file.Extension, file.Format, file.MimeType, mediaKindOrDefault(file.MediaKind),
			file.ByteSize, file.ModifiedAtNS, file.Width, file.Height, normalizedOrientation(file.Orientation), file.IsAnimated, file.FrameCount,
			file.PreviewStatus, boundedError(file.PreviewError), file.MetadataStatus, encodeDominantColors(file.DominantColors), capturedAt, now, now, scanToken)
	case nil:
		previewStatus, previewError := file.PreviewStatus, boundedError(file.PreviewError)
		dominantColors := "[]"
		if oldSize == file.ByteSize && oldMtime == file.ModifiedAtNS && oldPreviewStatus == "ready" {
			previewStatus, previewError = oldPreviewStatus, oldPreviewError
			dominantColors = oldDominantColors
		}
		_, err = tx.ExecContext(ctx, `UPDATE assets SET folder_id=?,relative_path=?,file_name=?,extension=?,format=?,mime_type=?,media_kind=?,byte_size=?,modified_at_ns=?,width=?,height=?,orientation=?,is_animated=?,frame_count=?,availability='active',preview_status=?,preview_error=?,metadata_status=?,dominant_colors=?,captured_at=?,technical_updated_at=?,scan_token=?,trash_entry_id=NULL WHERE id=?`,
			folderID, file.RelativePath, file.FileName, file.Extension, file.Format, file.MimeType, mediaKindOrDefault(file.MediaKind), file.ByteSize, file.ModifiedAtNS,
			file.Width, file.Height, normalizedOrientation(file.Orientation), file.IsAnimated, file.FrameCount, previewStatus, previewError,
			file.MetadataStatus, dominantColors, capturedAt, now, scanToken, existingID)
	default:
		return "", false, err
	}
	if err != nil {
		return "", false, err
	}
	if err := upsertEXIF(ctx, tx, AssetID(existingID), file.EXIF); err != nil {
		return "", false, err
	}
	if err := tx.Commit(); err != nil {
		return "", false, err
	}
	return AssetID(existingID), created, nil
}

func (s *store) touchUnchangedAsset(ctx context.Context, pathKey string, byteSize, modifiedAtNS int64, scanToken string) (*unchangedAsset, error) {
	var item unchangedAsset
	err := s.db.QueryRowContext(ctx, `SELECT id,preview_status,dominant_colors FROM assets WHERE path_key=? AND byte_size=? AND modified_at_ns=?`, pathKey, byteSize, modifiedAtNS).
		Scan(&item.ID, &item.PreviewStatus, &item.DominantColors)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE assets SET availability='active',scan_token=?,trash_entry_id=NULL WHERE id=?`, scanToken, item.ID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func encodeDominantColors(colors []string) string {
	if colors == nil {
		return "[]"
	}
	b, err := json.Marshal(colors)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func normalizedOrientation(value int) int {
	if value < 1 || value > 8 {
		return 1
	}
	return value
}

func mediaKindOrDefault(kind string) string {
	if kind == "" {
		return "image"
	}
	return kind
}

func nullableUnixMillis(value *time.Time) any {
	if value == nil {
		return nil
	}
	return unixMillis(*value)
}

func upsertEXIF(ctx context.Context, tx *sql.Tx, id AssetID, metadata exifMetadata) error {
	if metadata.empty() {
		_, err := tx.ExecContext(ctx, `DELETE FROM exif_metadata WHERE asset_id=?`, id)
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO exif_metadata(
        asset_id,camera_make,camera_model,lens_model,iso,aperture,shutter_seconds,focal_length_mm,latitude,longitude,raw_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET
        camera_make=excluded.camera_make,camera_model=excluded.camera_model,lens_model=excluded.lens_model,
        iso=excluded.iso,aperture=excluded.aperture,shutter_seconds=excluded.shutter_seconds,
        focal_length_mm=excluded.focal_length_mm,latitude=excluded.latitude,longitude=excluded.longitude,raw_json=excluded.raw_json`,
		id, metadata.CameraMake, metadata.CameraModel, metadata.LensModel, metadata.ISO, metadata.Aperture,
		metadata.ShutterSeconds, metadata.FocalLengthMM, metadata.Latitude, metadata.Longitude, metadata.RawJSON)
	return err
}

func (s *store) markAssetMissingPath(ctx context.Context, pathKey string) (AssetID, bool, error) {
	var id string
	err := s.db.QueryRowContext(
		ctx,
		`UPDATE assets SET availability='missing',technical_updated_at=? WHERE path_key=? AND availability='active' RETURNING id`,
		time.Now().UnixMilli(),
		pathKey,
	).Scan(&id)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return AssetID(id), true, nil
}

func (s *store) finishScan(ctx context.Context, token string, relativePaths []string, syncFolders bool) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	missingResult, err := tx.ExecContext(ctx, `UPDATE assets SET availability='missing',technical_updated_at=? WHERE availability='active' AND scan_token<>?`, time.Now().UnixMilli(), token)
	if err != nil {
		return false, err
	}
	missingCount, err := missingResult.RowsAffected()
	if err != nil {
		return false, err
	}

	var deletedCount int64
	if syncFolders {
		if _, err := tx.ExecContext(ctx, `UPDATE folders SET availability='missing' WHERE availability='active'`); err != nil {
			return false, err
		}
		for _, relative := range relativePaths {
			if _, err := ensureFolderWith(ctx, tx, relative); err != nil {
				return false, err
			}
		}
		deletedResult, err := tx.ExecContext(ctx, `DELETE FROM folders WHERE availability='missing'`)
		if err != nil {
			return false, err
		}
		deletedCount, err = deletedResult.RowsAffected()
		if err != nil {
			return false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return missingCount > 0 || deletedCount > 0, nil
}

func (s *store) markUnseenMissing(ctx context.Context, token string) (bool, error) {
	return s.finishScan(ctx, token, nil, false)
}

func (s *store) counts(ctx context.Context) (active, missing, trashed int64, err error) {
	rows, err := s.db.QueryContext(ctx, `SELECT availability,COUNT(*) FROM assets GROUP BY availability`)
	if err != nil {
		return 0, 0, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int64
		if err = rows.Scan(&status, &count); err != nil {
			return
		}
		switch status {
		case "active":
			active = count
		case "missing":
			missing = count
		case "trashed":
			trashed = count
		}
	}
	return
}

type cursorValue struct {
	Value string `json:"v"`
	ID    string `json:"id"`
}

func encodeCursor(value, id string) string {
	data, _ := json.Marshal(cursorValue{Value: value, ID: id})
	return base64.RawURLEncoding.EncodeToString(data)
}
func decodeCursor(value string) (cursorValue, error) {
	var c cursorValue
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return c, err
	}
	err = json.Unmarshal(data, &c)
	return c, err
}

func queryPlaceholders(count int) string {
	if count <= 0 {
		return ""
	}
	return strings.TrimRight(strings.Repeat("?,", count), ",")
}

func normalizedFilterValues(values []string, lower bool) []string {
	seen := make(map[string]struct{}, len(values))
	items := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if lower {
			value = strings.ToLower(value)
		}
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		items = append(items, value)
	}
	return items
}

func appendInFilter(where *[]string, args *[]any, expression string, values []string) {
	if len(values) == 0 {
		return
	}
	*where = append(*where, expression+" IN ("+queryPlaceholders(len(values))+")")
	for _, value := range values {
		*args = append(*args, value)
	}
}

func buildAssetWhere(query AssetQuery, availability string) ([]string, []any, error) {
	where := []string{"a.availability=?"}
	args := []any{availability}
	if search := buildAssetSearchQuery(query.Search); search != "" {
		where = append(where, `EXISTS (SELECT 1 FROM asset_search search WHERE search.asset_id=a.id AND asset_search MATCH ?)`)
		args = append(args, search)
	}
	if query.Folder != "" || query.DirectFolderOnly {
		_, folderKey, err := normalizeRelative(query.Folder)
		if err != nil {
			return nil, nil, err
		}
		if query.DirectFolderOnly {
			where = append(where, "COALESCE(f.path_key,'')=?")
			args = append(args, folderKey)
		} else {
			where = append(where, "(f.path_key=? OR f.path_key LIKE ? ESCAPE '\\')")
			escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(folderKey)
			args = append(args, folderKey, escaped+"/%")
		}
	}
	if query.FavoritesOnly {
		where = append(where, "a.is_favorite=1")
	}
	switch query.UploadStatus {
	case "uploaded":
		where = append(where, "a.cloud_photo_id IS NOT NULL AND a.cloud_photo_id!=''")
	case "not-uploaded":
		where = append(where, "(a.cloud_photo_id IS NULL OR a.cloud_photo_id='')")
	case "", "all":
	default:
		return nil, nil, newError(ErrInvalidPath, "不支持的上传状态筛选值", map[string]any{"uploadStatus": query.UploadStatus})
	}
	if query.PhotosOnly {
		where = append(where, "a.media_kind='image'")
	}
	if ids := uniqueIDs(query.TagIDs); len(ids) > 0 {
		where = append(where, "EXISTS (SELECT 1 FROM asset_tags qat WHERE qat.asset_id=a.id AND qat.tag_id IN ("+queryPlaceholders(len(ids))+"))")
		for _, id := range ids {
			args = append(args, id)
		}
	}
	if ids := uniqueIDs(query.CollectionIDs); len(ids) > 0 {
		where = append(where, "EXISTS (SELECT 1 FROM collection_assets qca WHERE qca.asset_id=a.id AND qca.collection_id IN ("+queryPlaceholders(len(ids))+"))")
		for _, id := range ids {
			args = append(args, id)
		}
	}
	if query.RatingMin != nil {
		if *query.RatingMin < 0 || *query.RatingMin > 5 {
			return nil, nil, newError(ErrInvalidPath, "评分必须在 0 到 5 之间", nil)
		}
		where = append(where, "a.rating>=?")
		args = append(args, *query.RatingMin)
	}
	if query.RatingMax != nil {
		if *query.RatingMax < 0 || *query.RatingMax > 5 {
			return nil, nil, newError(ErrInvalidPath, "评分必须在 0 到 5 之间", nil)
		}
		where = append(where, "a.rating<=?")
		args = append(args, *query.RatingMax)
	}
	appendInFilter(&where, &args, "a.color_label", normalizedFilterValues(query.ColorLabels, false))
	appendInFilter(&where, &args, "LOWER(a.format)", normalizedFilterValues(query.Formats, true))
	appendInFilter(&where, &args, "LOWER(a.preview_status)", normalizedFilterValues(query.PreviewStatuses, true))
	if query.CapturedFromMS != nil {
		where = append(where, "a.captured_at>=?")
		args = append(args, *query.CapturedFromMS)
	}
	if query.CapturedToMS != nil {
		where = append(where, "a.captured_at<=?")
		args = append(args, *query.CapturedToMS)
	}
	if query.DiscoveredFromMS != nil {
		where = append(where, "a.discovered_at>=?")
		args = append(args, *query.DiscoveredFromMS)
	}
	if query.DiscoveredToMS != nil {
		where = append(where, "a.discovered_at<=?")
		args = append(args, *query.DiscoveredToMS)
	}
	appendInFilter(&where, &args, "LOWER(e.camera_make)", normalizedFilterValues(query.CameraMakes, true))
	appendInFilter(&where, &args, "LOWER(e.camera_model)", normalizedFilterValues(query.CameraModels, true))
	appendInFilter(&where, &args, "LOWER(e.lens_model)", normalizedFilterValues(query.LensModels, true))
	if query.ISOMin != nil {
		where = append(where, "e.iso>=?")
		args = append(args, *query.ISOMin)
	}
	if query.ISOMax != nil {
		where = append(where, "e.iso<=?")
		args = append(args, *query.ISOMax)
	}
	if query.ApertureMin != nil {
		where = append(where, "e.aperture>=?")
		args = append(args, *query.ApertureMin)
	}
	if query.ApertureMax != nil {
		where = append(where, "e.aperture<=?")
		args = append(args, *query.ApertureMax)
	}
	if query.FocalLengthMin != nil {
		where = append(where, "e.focal_length_mm>=?")
		args = append(args, *query.FocalLengthMin)
	}
	if query.FocalLengthMax != nil {
		where = append(where, "e.focal_length_mm<=?")
		args = append(args, *query.FocalLengthMax)
	}
	switch query.Orientation {
	case "landscape":
		where = append(where, "a.width>a.height")
	case "portrait":
		where = append(where, "a.height>a.width")
	case "square":
		where = append(where, "a.width=a.height AND a.width>0")
	case "":
	default:
		return nil, nil, newError(ErrInvalidPath, "不支持的方向筛选值", map[string]any{"orientation": query.Orientation})
	}
	if query.WidthMin != nil {
		where = append(where, "a.width>=?")
		args = append(args, *query.WidthMin)
	}
	if query.WidthMax != nil {
		where = append(where, "a.width<=?")
		args = append(args, *query.WidthMax)
	}
	if query.HeightMin != nil {
		where = append(where, "a.height>=?")
		args = append(args, *query.HeightMin)
	}
	if query.HeightMax != nil {
		where = append(where, "a.height<=?")
		args = append(args, *query.HeightMax)
	}
	return where, args, nil
}

func buildAssetSearchQuery(value string) string {
	terms := strings.Fields(strings.TrimSpace(value))
	if len(terms) == 0 {
		return ""
	}
	for index, term := range terms {
		terms[index] = `"` + strings.ReplaceAll(term, `"`, `""`) + `"*`
	}
	return strings.Join(terms, " ")
}

func (s *store) listAssets(ctx context.Context, query AssetQuery, sessionID string, scan ScanStatus) (AssetPage, error) {
	limit := query.Limit
	if limit <= 0 {
		limit = 60
	}
	if limit > 200 {
		limit = 200
	}
	availability := query.Availability
	if availability == "" {
		availability = "active"
	}
	where, args, err := buildAssetWhere(query, availability)
	if err != nil {
		return AssetPage{}, err
	}
	sortExpr, direction, sortKey := "a.discovered_at", "DESC", "discovered"
	switch query.Sort {
	case "name":
		sortExpr, direction, sortKey = "a.file_name COLLATE NOCASE", "ASC", "name"
	case "modified":
		sortExpr, direction, sortKey = "a.modified_at_ns", "DESC", "modified"
	case "size":
		sortExpr, direction, sortKey = "a.byte_size", "DESC", "size"
	case "rating":
		sortExpr, direction, sortKey = "a.rating", "DESC", "rating"
	case "captured":
		sortExpr, direction, sortKey = "COALESCE(a.captured_at,0)", "DESC", "captured"
	}
	if strings.EqualFold(query.SortDirection, "asc") {
		direction = "ASC"
	} else if strings.EqualFold(query.SortDirection, "desc") {
		direction = "DESC"
	} else if query.SortDirection != "" {
		return AssetPage{}, newError(ErrInvalidPath, "不支持的排序方向", map[string]any{"direction": query.SortDirection})
	}
	if query.Cursor != "" {
		c, err := decodeCursor(query.Cursor)
		if err != nil {
			return AssetPage{}, newError(ErrInvalidPath, "分页游标无效", nil)
		}
		op := "<"
		if direction == "ASC" {
			op = ">"
		}
		where = append(where, fmt.Sprintf("(%s %s ? OR (%s = ? AND a.id %s ?))", sortExpr, op, sortExpr, op))
		var cursorArg any = c.Value
		if sortKey != "name" {
			numeric, parseErr := strconv.ParseInt(c.Value, 10, 64)
			if parseErr != nil {
				return AssetPage{}, parseErr
			}
			cursorArg = numeric
		}
		args = append(args, cursorArg, cursorArg, c.ID)
	}
	baseWhere := strings.Join(where, " AND ")
	var total int64
	countWhere, countArgs, err := buildAssetWhere(query, availability)
	if err != nil {
		return AssetPage{}, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM assets a LEFT JOIN folders f ON f.id=a.folder_id LEFT JOIN exif_metadata e ON e.asset_id=a.id WHERE `+strings.Join(countWhere, " AND "), countArgs...).Scan(&total); err != nil {
		return AssetPage{}, err
	}
	args = append(args, limit+1)
	sqlQuery := `SELECT a.id,a.relative_path,a.file_name,a.extension,a.format,a.mime_type,a.media_kind,a.byte_size,a.modified_at_ns,a.width,a.height,a.orientation,a.is_animated,a.frame_count,a.availability,COALESCE(t.id,''),COALESCE(t.entry_kind,''),a.preview_status,a.preview_error,a.metadata_status,a.display_title,a.notes,a.rating,a.color_label,a.is_favorite,a.captured_at,a.discovered_at,a.dominant_colors,a.cloud_photo_id,
        e.camera_make,e.camera_model,e.lens_model,e.iso,e.aperture,e.shutter_seconds,e.focal_length_mm,e.latitude,e.longitude,` + sortExpr + `
        FROM assets a LEFT JOIN folders f ON f.id=a.folder_id LEFT JOIN exif_metadata e ON e.asset_id=a.id LEFT JOIN trash_entries t ON t.id=a.trash_entry_id
        WHERE ` + baseWhere + ` ORDER BY ` + sortExpr + ` ` + direction + `,a.id ` + direction + ` LIMIT ?`
	rows, err := s.db.QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		return AssetPage{}, err
	}
	defer rows.Close()
	items := make([]AssetDTO, 0, limit)
	var lastValue, lastID string
	hasMore := false
	for rows.Next() {
		if len(items) >= limit {
			hasMore = true
			break
		}
		var item AssetDTO
		var animated, favorite int
		var captured sql.NullInt64
		var discovered int64
		var cameraMake, cameraModel, lensModel sql.NullString
		var iso sql.NullInt64
		var aperture, shutterSeconds, focalLengthMM, latitude, longitude sql.NullFloat64
		var sortValue any
		var dominantColors string
		var cloudPhotoID sql.NullString
		if err := rows.Scan(&item.ID, &item.RelativePath, &item.FileName, &item.Extension, &item.Format, &item.MimeType, &item.MediaKind, &item.ByteSize, &item.ModifiedAtNS, &item.Width, &item.Height, &item.Orientation, &animated, &item.FrameCount, &item.Availability, &item.TrashEntryID, &item.TrashEntryKind, &item.PreviewStatus, &item.PreviewError, &item.MetadataStatus, &item.DisplayTitle, &item.Notes, &item.Rating, &item.ColorLabel, &favorite, &captured, &discovered, &dominantColors, &cloudPhotoID, &cameraMake, &cameraModel, &lensModel, &iso, &aperture, &shutterSeconds, &focalLengthMM, &latitude, &longitude, &sortValue); err != nil {
			return AssetPage{}, err
		}
		item.IsAnimated = animated != 0
		item.IsFavorite = favorite != 0
		item.CloudPhotoID = cloudPhotoID.String
		item.UploadStatus = assetUploadStatus(item.CloudPhotoID)
		item.IsUploaded = item.UploadStatus == AssetUploadStatusUploaded
		item.CapturedAt = timeFromMillis(captured)
		_ = json.Unmarshal([]byte(dominantColors), &item.DominantColors)
		if cameraMake.Valid || cameraModel.Valid || lensModel.Valid || iso.Valid || aperture.Valid || shutterSeconds.Valid || focalLengthMM.Valid || latitude.Valid || longitude.Valid {
			item.EXIF = &ExifMetadataDTO{
				CameraMake: cameraMake.String, CameraModel: cameraModel.String, LensModel: lensModel.String,
				ISO: nullableInt(iso), Aperture: nullableFloat(aperture), ShutterSeconds: nullableFloat(shutterSeconds),
				FocalLengthMM: nullableFloat(focalLengthMM), Latitude: nullableFloat(latitude), Longitude: nullableFloat(longitude),
			}
		}
		item.DiscoveredAt = time.UnixMilli(discovered).UTC()
		thumbnailKey := derivativeCacheKey(item.ID, item.ModifiedAtNS, item.ByteSize, derivativeThumbnail)
		previewKey := derivativeCacheKey(item.ID, item.ModifiedAtNS, item.ByteSize, derivativePreview)
		item.ThumbnailURL = "/__local-library/thumbnail/" + string(item.ID) + "?session=" + sessionID + "&v=" + thumbnailKey
		item.PreviewURL = "/__local-library/preview/" + string(item.ID) + "?session=" + sessionID + "&v=" + previewKey
		item.OriginalURL = "/__local-library/original/" + string(item.ID) + "?session=" + sessionID
		items = append(items, item)
		lastID = string(item.ID)
		switch value := sortValue.(type) {
		case int64:
			lastValue = strconv.FormatInt(value, 10)
		case float64:
			lastValue = strconv.FormatInt(int64(value), 10)
		case string:
			lastValue = value
		case []byte:
			lastValue = string(value)
		default:
			lastValue = fmt.Sprint(value)
		}
	}
	if err := s.loadAssetOrganization(ctx, items); err != nil {
		return AssetPage{}, err
	}
	next := ""
	if hasMore {
		next = encodeCursor(lastValue, lastID)
	}
	return AssetPage{Items: items, NextCursor: next, Total: total, IsComplete: scan.State == "completed", Scan: scan}, rows.Err()
}

func (s *store) assetIDsForQuery(ctx context.Context, query AssetQuery) ([]AssetID, int64, error) {
	availability := query.Availability
	if availability == "" {
		availability = "active"
	}
	where, args, err := buildAssetWhere(query, availability)
	if err != nil {
		return nil, 0, err
	}
	whereSQL := strings.Join(where, " AND ")
	var total int64
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM assets a LEFT JOIN folders f ON f.id=a.folder_id LEFT JOIN exif_metadata e ON e.asset_id=a.id WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT a.id FROM assets a LEFT JOIN folders f ON f.id=a.folder_id LEFT JOIN exif_metadata e ON e.asset_id=a.id WHERE `+whereSQL+` ORDER BY a.id`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ids := make([]AssetID, 0, total)
	for rows.Next() {
		var id AssetID
		if err := rows.Scan(&id); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	return ids, total, rows.Err()
}

func (s *store) listFolders(ctx context.Context) ([]FolderDTO, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT f.id,f.parent_id,f.relative_path,f.name,COUNT(a.id) FROM folders f LEFT JOIN assets a ON a.folder_id=f.id AND a.availability='active' WHERE f.availability='active' GROUP BY f.id ORDER BY f.relative_path COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []FolderDTO{}
	for rows.Next() {
		var item FolderDTO
		var parent sql.NullString
		if err := rows.Scan(&item.ID, &parent, &item.RelativePath, &item.Name, &item.AssetCount); err != nil {
			return nil, err
		}
		if parent.Valid {
			item.ParentID = &parent.String
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func nullableInt(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	result := int(value.Int64)
	return &result
}

func nullableFloat(value sql.NullFloat64) *float64 {
	if !value.Valid {
		return nil
	}
	result := value.Float64
	return &result
}

func (s *store) validateAssetMove(ctx context.Context, id AssetID, sourceKey, destinationKey string) error {
	var currentKey, availability string
	if err := s.db.QueryRowContext(ctx, `SELECT path_key,availability FROM assets WHERE id=?`, id).Scan(&currentKey, &availability); err != nil {
		if err == sql.ErrNoRows {
			return newError(ErrAssetNotFound, "未找到资产", map[string]any{"assetId": id})
		}
		return err
	}
	if availability != "active" || currentKey != sourceKey {
		return newError(ErrInvalidPath, "资产不可用或源路径已变更", map[string]any{"assetId": id})
	}
	var conflictingID string
	err := s.db.QueryRowContext(ctx, `SELECT id FROM assets WHERE path_key=?`, destinationKey).Scan(&conflictingID)
	if err == nil && conflictingID != string(id) {
		return newError(ErrPathConflict, "目标路径已存在另一项资产，不会覆盖", map[string]any{"assetId": conflictingID})
	}
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	return nil
}

func (s *store) finishMoveActiveAsset(ctx context.Context, id AssetID, oldRelative, newRelative string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	oldNormalized, oldKey, err := normalizeRelative(oldRelative)
	if err != nil || oldNormalized == "" {
		if err != nil {
			return err
		}
		return newError(ErrInvalidPath, "源路径无效", nil)
	}
	newNormalized, newKey, err := normalizeRelative(newRelative)
	if err != nil || newNormalized == "" {
		if err != nil {
			return err
		}
		return newError(ErrInvalidPath, "目标路径无效", nil)
	}
	var currentID string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM assets WHERE id=? AND path_key=? AND availability='active'`, id, oldKey).Scan(&currentID); err != nil {
		if err == sql.ErrNoRows {
			return newError(ErrInvalidPath, "资产源路径已变更或不可用", map[string]any{"assetId": id, "path": oldNormalized})
		}
		return err
	}
	var conflictingID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM assets WHERE path_key=?`, newKey).Scan(&conflictingID)
	if err == nil && conflictingID != string(id) {
		return newError(ErrPathConflict, "目标路径已存在另一项资产，不会覆盖", map[string]any{"assetId": conflictingID, "path": newNormalized})
	}
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	folderRelative := filepath.ToSlash(filepath.Dir(string(newNormalized)))
	if folderRelative == "." {
		folderRelative = ""
	}
	var folderID any
	if folderRelative != "" {
		_, folderKey, err := normalizeRelative(folderRelative)
		if err != nil {
			return err
		}
		var targetFolderID string
		if err := tx.QueryRowContext(ctx, `SELECT id FROM folders WHERE path_key=? AND availability='active'`, folderKey).Scan(&targetFolderID); err != nil {
			if err == sql.ErrNoRows {
				return newError(ErrInvalidPath, "目标文件夹不存在或不可用", map[string]any{"path": folderRelative})
			}
			return err
		}
		folderID = targetFolderID
	}
	fileName := filepath.Base(filepath.FromSlash(string(newNormalized)))
	extension := strings.ToLower(filepath.Ext(fileName))
	if _, err := tx.ExecContext(ctx, `UPDATE assets SET folder_id=?,relative_path=?,path_key=?,file_name=?,extension=?,technical_updated_at=? WHERE id=?`,
		folderID, string(newNormalized), newKey, fileName, extension, time.Now().UnixMilli(), id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *store) assetPath(ctx context.Context, id AssetID) (relative, mime, status string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT relative_path,mime_type,availability FROM assets WHERE id=?`, id).Scan(&relative, &mime, &status)
	if err == sql.ErrNoRows {
		err = newError(ErrAssetNotFound, "资产不存在", map[string]any{"assetId": id})
	}
	return
}

type derivativeRecord struct {
	AssetID      AssetID
	Variant      derivativeVariant
	CacheKey     string
	MaxDimension int
	Width        int
	Height       int
	ByteSize     int64
	Status       string
	Error        string
	LastAccessed int64
}

func (s *store) derivativeSource(ctx context.Context, id AssetID) (source derivativeSource, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT relative_path,mime_type,availability,modified_at_ns,byte_size,orientation FROM assets WHERE id=?`, id).
		Scan(&source.RelativePath, &source.MimeType, &source.Availability, &source.ModifiedAtNS, &source.ByteSize, &source.Orientation)
	if err == sql.ErrNoRows {
		err = newError(ErrAssetNotFound, "asset does not exist", map[string]any{"assetId": id})
	}
	return
}

func (s *store) derivativeRecord(ctx context.Context, id AssetID, variant derivativeVariant) (record derivativeRecord, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT asset_id,variant,cache_key,max_dimension,width,height,byte_size,status,error,last_accessed_at
		FROM asset_derivatives WHERE asset_id=? AND variant=?`, id, variant).
		Scan(&record.AssetID, &record.Variant, &record.CacheKey, &record.MaxDimension, &record.Width, &record.Height, &record.ByteSize, &record.Status, &record.Error, &record.LastAccessed)
	return
}

func (s *store) setDerivativeResult(ctx context.Context, id AssetID, variant derivativeVariant, cacheKey string, maxDimension, width, height int, byteSize int64, status, derivativeError string) error {
	now := time.Now().UTC().UnixMilli()
	var generatedAt any
	if status == "ready" {
		generatedAt = now
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO asset_derivatives(
		asset_id,variant,cache_key,content_version,decoder_version,max_dimension,width,height,byte_size,status,error,generated_at,last_accessed_at
	) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id,variant) DO UPDATE SET
		cache_key=excluded.cache_key,content_version=excluded.content_version,decoder_version=excluded.decoder_version,
		max_dimension=excluded.max_dimension,width=excluded.width,height=excluded.height,byte_size=excluded.byte_size,
		status=excluded.status,error=excluded.error,generated_at=excluded.generated_at,last_accessed_at=excluded.last_accessed_at`,
		id, variant, cacheKey, derivativeContentVersion, derivativeDecoderVersion, maxDimension, width, height, byteSize, status, boundedError(derivativeError), generatedAt, now)
	return err
}

func (s *store) touchDerivative(ctx context.Context, id AssetID, variant derivativeVariant) error {
	_, err := s.db.ExecContext(ctx, `UPDATE asset_derivatives SET last_accessed_at=? WHERE asset_id=? AND variant=?`, time.Now().UTC().UnixMilli(), id, variant)
	return err
}

func (s *store) previewDerivativeEntries(ctx context.Context) ([]derivativeRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT asset_id,variant,cache_key,max_dimension,width,height,byte_size,status,error,last_accessed_at
		FROM asset_derivatives WHERE variant='preview' AND status='ready' ORDER BY last_accessed_at ASC, asset_id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]derivativeRecord, 0)
	for rows.Next() {
		var entry derivativeRecord
		if err := rows.Scan(&entry.AssetID, &entry.Variant, &entry.CacheKey, &entry.MaxDimension, &entry.Width, &entry.Height, &entry.ByteSize, &entry.Status, &entry.Error, &entry.LastAccessed); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (s *store) deleteDerivative(ctx context.Context, id AssetID, variant derivativeVariant, cacheKey string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM asset_derivatives WHERE asset_id=? AND variant=? AND cache_key=?`, id, variant, cacheKey)
	return err
}

func (s *store) setPreviewResult(ctx context.Context, id AssetID, status, previewError string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE assets SET preview_status=?,preview_error=?,technical_updated_at=? WHERE id=?`, status, boundedError(previewError), time.Now().UnixMilli(), id)
	return err
}

func (s *store) setDominantColors(ctx context.Context, id AssetID, colors []string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE assets SET dominant_colors=?,technical_updated_at=? WHERE id=?`, encodeDominantColors(colors), time.Now().UnixMilli(), id)
	return err
}

func (s *store) setAssetCloudLink(ctx context.Context, id AssetID, photoID string) error {
	photoID = strings.TrimSpace(photoID)
	if photoID == "" {
		return newError(ErrInvalidPath, "云端照片 ID 不能为空", nil)
	}
	result, err := s.db.ExecContext(ctx, `UPDATE assets SET cloud_photo_id=? WHERE id=?`, photoID, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return newError(ErrAssetNotFound, "资产不存在", map[string]any{"id": id})
	}
	return nil
}

func (s *store) clearAssetCloudLink(ctx context.Context, id AssetID) error {
	result, err := s.db.ExecContext(ctx, `UPDATE assets SET cloud_photo_id=NULL WHERE id=?`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return newError(ErrAssetNotFound, "资产不存在", map[string]any{"id": id})
	}
	return nil
}

func (s *store) assetCloudLink(ctx context.Context, id AssetID) (photoID string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(cloud_photo_id,'') FROM assets WHERE id=?`, id).Scan(&photoID)
	if errors.Is(err, sql.ErrNoRows) {
		err = newError(ErrAssetNotFound, "资产不存在", map[string]any{"id": id})
	}
	return
}

func (s *store) updateAssetMetadata(ctx context.Context, id AssetID, title, notes string, rating int, color string, favorite bool) error {
	if rating < 0 || rating > 5 {
		return newError(ErrInvalidPath, "评分必须在 0 到 5 之间", nil)
	}
	result, err := s.db.ExecContext(ctx, `UPDATE assets SET display_title=?,notes=?,rating=?,color_label=?,is_favorite=? WHERE id=?`, title, notes, rating, color, favorite, id)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return newError(ErrAssetNotFound, "资产不存在", nil)
	}
	return nil
}

func (s *store) trashAsset(ctx context.Context, id AssetID, trashID, payloadRelative string, size int64) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var original string
	if err := tx.QueryRowContext(ctx, `SELECT relative_path FROM assets WHERE id=? AND availability<>'trashed'`, id).Scan(&original); err != nil {
		if err == sql.ErrNoRows {
			return "", newError(ErrAssetNotFound, "资产不存在或已在回收站中", nil)
		}
		return "", err
	}
	now := time.Now().UnixMilli()
	if _, err := tx.ExecContext(ctx, `INSERT INTO trash_entries(id,asset_id,original_path,payload_relative_path,state,total_bytes,trashed_at) VALUES(?,?,?,?,?,?,?)`, trashID, id, original, payloadRelative, "trashed", size, now); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE assets SET availability='trashed',trash_entry_id=? WHERE id=?`, trashID, id); err != nil {
		return "", err
	}
	return original, tx.Commit()
}

func (s *store) restoreAsset(ctx context.Context, id AssetID) (trashID, original, payload string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT t.id,t.original_path,t.payload_relative_path FROM trash_entries t JOIN assets a ON a.id=t.asset_id WHERE a.id=? AND t.state='trashed'`, id).Scan(&trashID, &original, &payload)
	if err == sql.ErrNoRows {
		err = newError(ErrAssetNotFound, "回收站中没有该资产", nil)
	}
	return
}

func (s *store) permanentDeleteInfo(ctx context.Context, id AssetID) (availability, relative, trashID, payload string, err error) {
	var nullableTrashID, nullablePayload sql.NullString
	err = s.db.QueryRowContext(ctx, `
		SELECT a.availability,a.relative_path,t.id,t.payload_relative_path
		FROM assets a LEFT JOIN trash_entries t ON t.id=a.trash_entry_id
		WHERE a.id=?`, id).Scan(&availability, &relative, &nullableTrashID, &nullablePayload)
	if err == sql.ErrNoRows {
		err = newError(ErrAssetNotFound, "资产不存在", map[string]any{"assetId": id})
		return
	}
	if nullableTrashID.Valid {
		trashID = nullableTrashID.String
	}
	if nullablePayload.Valid {
		payload = nullablePayload.String
	}
	return
}

func (s *store) removeMissingAsset(ctx context.Context, id AssetID) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM assets WHERE id=? AND availability='missing'`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return newError(ErrAssetNotFound, "失联资产不存在或状态已变更", map[string]any{"assetId": id})
	}
	return nil
}

func (s *store) finishPermanentDelete(ctx context.Context, id AssetID) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM assets WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return newError(ErrAssetNotFound, "资产不存在", map[string]any{"assetId": id})
	}
	return nil
}

func (s *store) finishRestore(ctx context.Context, id AssetID, trashID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE assets SET availability='active',trash_entry_id=NULL WHERE id=?`, id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM trash_entries WHERE id=?`, trashID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *store) folderByPathKey(ctx context.Context, pathKey string) (FolderDTO, error) {
	var item FolderDTO
	var parent sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT f.id,f.parent_id,f.relative_path,f.name,
		(SELECT COUNT(*) FROM assets a WHERE a.folder_id=f.id AND a.availability='active')
		FROM folders f WHERE f.path_key=? AND f.availability='active'`, pathKey).
		Scan(&item.ID, &parent, &item.RelativePath, &item.Name, &item.AssetCount)
	if parent.Valid {
		item.ParentID = &parent.String
	}
	return item, err
}

func (s *store) folderUsage(ctx context.Context, folderID string) (childFolders, assets int64, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM folders WHERE parent_id=?),
		(SELECT COUNT(*) FROM assets WHERE folder_id=?)`, folderID, folderID).Scan(&childFolders, &assets)
	return
}

func (s *store) deleteEmptyFolder(ctx context.Context, pathKey string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM folders
		WHERE path_key=?
		AND NOT EXISTS (SELECT 1 FROM folders child WHERE child.parent_id=folders.id)
		AND NOT EXISTS (SELECT 1 FROM assets asset WHERE asset.folder_id=folders.id)`, pathKey)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return newError(ErrPathConflict, "文件夹不为空或索引不存在", nil)
	}
	return nil
}

type folderTrashRecord struct {
	ID                    string
	FolderID              string
	OriginalPath          string
	PayloadRelativePath   string
	TotalBytes            int64
	ManagedAssetCount     int64
	OtherFileCount        int64
	DirectoryCount        int64
	TrashedAtMilliseconds int64
}

func escapeLike(value string) string {
	return strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(value)
}

func (s *store) activeAssetPathsBelow(ctx context.Context, folderKey string) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.relative_path FROM assets a
		JOIN folders f ON f.id=a.folder_id
		WHERE a.availability='active' AND (f.path_key=? OR f.path_key LIKE ? ESCAPE '\')`,
		folderKey, escapeLike(folderKey)+"/%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]struct{})
	for rows.Next() {
		var relative string
		if err := rows.Scan(&relative); err != nil {
			return nil, err
		}
		_, key, err := normalizeRelative(relative)
		if err != nil {
			return nil, err
		}
		result[key] = struct{}{}
	}
	return result, rows.Err()
}

func (s *store) trashFolder(ctx context.Context, folderID, folderKey, trashID, originalPath, payloadRelative string, preview FolderDeletionPreview) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var currentID string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM folders WHERE id=? AND path_key=? AND availability='active'`, folderID, folderKey).Scan(&currentID); err != nil {
		if err == sql.ErrNoRows {
			return newError(ErrInvalidPath, "文件夹索引不存在或状态已变更", nil)
		}
		return err
	}
	now := time.Now().UnixMilli()
	if _, err := tx.ExecContext(ctx, `INSERT INTO trash_entries(
		id,asset_id,folder_id,entry_kind,original_path,payload_relative_path,state,total_bytes,
		managed_asset_count,other_file_count,directory_count,trashed_at
	) VALUES(?,NULL,?,'folder',?,?, 'trashed',?,?,?,?,?)`,
		trashID, folderID, originalPath, payloadRelative, preview.TotalBytes,
		preview.ManagedAssetCount, preview.OtherFileCount, preview.DirectoryCount, now); err != nil {
		return err
	}
	like := escapeLike(folderKey) + "/%"
	if _, err := tx.ExecContext(ctx, `UPDATE assets SET availability='trashed',trash_entry_id=?
		WHERE folder_id IN (SELECT id FROM folders WHERE path_key=? OR path_key LIKE ? ESCAPE '\')
		AND availability='active'`, trashID, folderKey, like); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE folders SET availability='trashed',updated_at=?
		WHERE path_key=? OR path_key LIKE ? ESCAPE '\'`, now, folderKey, like); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *store) folderTrashRecord(ctx context.Context, trashID string) (folderTrashRecord, error) {
	var record folderTrashRecord
	var folderID sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT id,folder_id,original_path,payload_relative_path,total_bytes,
		managed_asset_count,other_file_count,directory_count,trashed_at
		FROM trash_entries WHERE id=? AND entry_kind='folder' AND state='trashed'`, trashID).
		Scan(&record.ID, &folderID, &record.OriginalPath, &record.PayloadRelativePath, &record.TotalBytes,
			&record.ManagedAssetCount, &record.OtherFileCount, &record.DirectoryCount, &record.TrashedAtMilliseconds)
	if err == sql.ErrNoRows {
		return folderTrashRecord{}, newError(ErrInvalidPath, "回收站中没有该文件夹", map[string]any{"trashId": trashID})
	}
	if err != nil {
		return folderTrashRecord{}, err
	}
	if !folderID.Valid || folderID.String == "" {
		return folderTrashRecord{}, newError(ErrInvalidLibrary, "文件夹回收站记录已损坏", map[string]any{"trashId": trashID})
	}
	record.FolderID = folderID.String
	return record, nil
}

func (s *store) listFolderTrash(ctx context.Context) ([]FolderTrashEntry, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,original_path,total_bytes,managed_asset_count,other_file_count,directory_count,trashed_at
		FROM trash_entries WHERE entry_kind='folder' AND state='trashed' ORDER BY trashed_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []FolderTrashEntry{}
	for rows.Next() {
		var item FolderTrashEntry
		var trashedAt int64
		if err := rows.Scan(&item.ID, &item.OriginalPath, &item.TotalBytes, &item.ManagedAssetCount, &item.OtherFileCount, &item.DirectoryCount, &trashedAt); err != nil {
			return nil, err
		}
		item.Name = filepath.Base(filepath.FromSlash(item.OriginalPath))
		item.TrashedAt = time.UnixMilli(trashedAt).UTC()
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *store) finishRestoreFolder(ctx context.Context, record folderTrashRecord, newRoot string, parentID *string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	oldRoot, oldRootKey, err := normalizeRelative(record.OriginalPath)
	if err != nil {
		return err
	}
	newRootNormalized, newRootKey, err := normalizeRelative(newRoot)
	if err != nil {
		return err
	}
	oldLike := escapeLike(oldRootKey) + "/%"

	folderRows, err := tx.QueryContext(ctx, `SELECT id,relative_path FROM folders WHERE path_key=? OR path_key LIKE ? ESCAPE '\' ORDER BY length(path_key)`, oldRootKey, oldLike)
	if err != nil {
		return err
	}
	type folderPathUpdate struct{ id, relative, key, name string }
	folderUpdates := []folderPathUpdate{}
	for folderRows.Next() {
		var id, relative string
		if err := folderRows.Scan(&id, &relative); err != nil {
			folderRows.Close()
			return err
		}
		suffix := strings.TrimPrefix(relative, string(oldRoot))
		rewritten, key, err := normalizeRelative(string(newRootNormalized) + suffix)
		if err != nil {
			folderRows.Close()
			return err
		}
		folderUpdates = append(folderUpdates, folderPathUpdate{id: id, relative: string(rewritten), key: key, name: filepath.Base(filepath.FromSlash(string(rewritten)))})
	}
	if err := folderRows.Close(); err != nil {
		return err
	}
	if len(folderUpdates) == 0 || folderUpdates[0].id != record.FolderID {
		return newError(ErrInvalidLibrary, "folder trash record no longer matches its folder", map[string]any{"trashId": record.ID})
	}

	assetRows, err := tx.QueryContext(ctx, `SELECT id,relative_path FROM assets WHERE trash_entry_id=? AND availability='trashed'`, record.ID)
	if err != nil {
		return err
	}
	type assetPathUpdate struct{ id, relative, key, fileName string }
	assetUpdates := []assetPathUpdate{}
	for assetRows.Next() {
		var id, relative string
		if err := assetRows.Scan(&id, &relative); err != nil {
			assetRows.Close()
			return err
		}
		suffix := strings.TrimPrefix(relative, string(oldRoot))
		rewritten, key, err := normalizeRelative(string(newRootNormalized) + suffix)
		if err != nil {
			assetRows.Close()
			return err
		}
		assetUpdates = append(assetUpdates, assetPathUpdate{id: id, relative: string(rewritten), key: key, fileName: filepath.Base(filepath.FromSlash(string(rewritten)))})
	}
	if err := assetRows.Close(); err != nil {
		return err
	}

	// Move path keys out of the unique-key namespace before assigning their final values.
	for _, update := range folderUpdates {
		if _, err := tx.ExecContext(ctx, `UPDATE folders SET path_key=? WHERE id=?`, "restore:"+record.ID+":"+update.id, update.id); err != nil {
			return err
		}
	}
	for _, update := range assetUpdates {
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET path_key=? WHERE id=?`, "restore:"+record.ID+":"+update.id, update.id); err != nil {
			return err
		}
	}
	for index, update := range folderUpdates {
		updatedParentID := parentID
		if index > 0 {
			parentRelative := filepath.ToSlash(filepath.Dir(update.relative))
			if parentRelative == "." {
				parentRelative = ""
			}
			_, parentKey, err := normalizeRelative(parentRelative)
			if err != nil {
				return err
			}
			for _, candidate := range folderUpdates {
				if candidate.key == parentKey {
					id := candidate.id
					updatedParentID = &id
					break
				}
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE folders SET parent_id=?,relative_path=?,path_key=?,name=?,availability='active',updated_at=? WHERE id=?`,
			updatedParentID, update.relative, update.key, update.name, time.Now().UnixMilli(), update.id); err != nil {
			return err
		}
	}
	for _, update := range assetUpdates {
		folderRelative := filepath.ToSlash(filepath.Dir(update.relative))
		if folderRelative == "." {
			folderRelative = ""
		}
		var folderID any
		if folderRelative != "" {
			_, folderKey, err := normalizeRelative(folderRelative)
			if err != nil {
				return err
			}
			var resolvedFolderID string
			if err := tx.QueryRowContext(ctx, `SELECT id FROM folders WHERE path_key=?`, folderKey).Scan(&resolvedFolderID); err != nil {
				return err
			}
			folderID = resolvedFolderID
		}
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET folder_id=?,relative_path=?,path_key=?,file_name=?,availability='active',trash_entry_id=NULL WHERE id=?`,
			folderID, update.relative, update.key, update.fileName, update.id); err != nil {
			return err
		}
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM trash_entries WHERE id=? AND entry_kind='folder'`, record.ID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return newError(ErrInvalidLibrary, "folder trash record disappeared during restore", nil)
	}
	_ = newRootKey
	return tx.Commit()
}

func (s *store) assetIDsForTrashEntry(ctx context.Context, trashID string) ([]AssetID, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM assets WHERE trash_entry_id=?`, trashID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make([]AssetID, 0)
	for rows.Next() {
		var id AssetID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (s *store) finishMoveActiveFolder(ctx context.Context, folderID, oldRoot, newRoot string, parentID *string) (FolderDTO, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return FolderDTO{}, err
	}
	defer tx.Rollback()

	oldRootNormalized, oldRootKey, err := normalizeRelative(oldRoot)
	if err != nil || oldRootNormalized == "" {
		if err != nil {
			return FolderDTO{}, err
		}
		return FolderDTO{}, newError(ErrInvalidPath, "\u4e0d\u80fd\u79fb\u52a8\u8d44\u6e90\u5e93\u6839\u76ee\u5f55", nil)
	}
	newRootNormalized, newRootKey, err := normalizeRelative(newRoot)
	if err != nil || newRootNormalized == "" {
		if err != nil {
			return FolderDTO{}, err
		}
		return FolderDTO{}, newError(ErrInvalidPath, "\u76ee\u6807\u6587\u4ef6\u5939\u8def\u5f84\u65e0\u6548", nil)
	}
	if err := tx.QueryRowContext(ctx, `SELECT id FROM folders WHERE id=? AND path_key=? AND availability='active'`, folderID, oldRootKey).Scan(new(string)); err != nil {
		if err == sql.ErrNoRows {
			return FolderDTO{}, newError(ErrInvalidPath, "\u6587\u4ef6\u5939\u7d22\u5f15\u4e0d\u5b58\u5728\u6216\u72b6\u6001\u5df2\u53d8\u66f4", map[string]any{"path": oldRootNormalized})
		}
		return FolderDTO{}, err
	}
	var conflictingID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM folders WHERE path_key=?`, newRootKey).Scan(&conflictingID)
	if err == nil && conflictingID != folderID {
		return FolderDTO{}, newError(ErrPathConflict, "\u76ee\u6807\u4f4d\u7f6e\u5df2\u5b58\u5728\u540c\u540d\u6587\u4ef6\u5939\uff0c\u8d44\u6e90\u5e93\u4e0d\u4f1a\u8986\u76d6", map[string]any{"path": newRootNormalized})
	}
	if err != nil && err != sql.ErrNoRows {
		return FolderDTO{}, err
	}

	oldLike := escapeLike(oldRootKey) + "/%"
	folderRows, err := tx.QueryContext(ctx, `SELECT id,relative_path FROM folders
		WHERE availability='active' AND (path_key=? OR path_key LIKE ? ESCAPE '\') ORDER BY length(path_key)`, oldRootKey, oldLike)
	if err != nil {
		return FolderDTO{}, err
	}
	type folderPathUpdate struct{ id, relative, key, name string }
	folderUpdates := []folderPathUpdate{}
	for folderRows.Next() {
		var id, relative string
		if err := folderRows.Scan(&id, &relative); err != nil {
			_ = folderRows.Close()
			return FolderDTO{}, err
		}
		suffix := strings.TrimPrefix(relative, string(oldRootNormalized))
		rewritten, key, err := normalizeRelative(string(newRootNormalized) + suffix)
		if err != nil {
			_ = folderRows.Close()
			return FolderDTO{}, err
		}
		folderUpdates = append(folderUpdates, folderPathUpdate{id: id, relative: string(rewritten), key: key, name: filepath.Base(filepath.FromSlash(string(rewritten)))})
	}
	if err := folderRows.Close(); err != nil {
		return FolderDTO{}, err
	}
	if len(folderUpdates) == 0 || folderUpdates[0].id != folderID {
		return FolderDTO{}, newError(ErrInvalidLibrary, "\u6587\u4ef6\u5939\u5b50\u6811\u7d22\u5f15\u5df2\u635f\u574f", map[string]any{"path": oldRootNormalized})
	}

	assetRows, err := tx.QueryContext(ctx, `SELECT id,relative_path FROM assets WHERE availability<>'trashed' AND folder_id IN (
		SELECT id FROM folders WHERE availability='active' AND (path_key=? OR path_key LIKE ? ESCAPE '\')
	)`, oldRootKey, oldLike)
	if err != nil {
		return FolderDTO{}, err
	}
	type assetPathUpdate struct{ id, relative, key, fileName string }
	assetUpdates := []assetPathUpdate{}
	for assetRows.Next() {
		var id, relative string
		if err := assetRows.Scan(&id, &relative); err != nil {
			_ = assetRows.Close()
			return FolderDTO{}, err
		}
		suffix := strings.TrimPrefix(relative, string(oldRootNormalized))
		rewritten, key, err := normalizeRelative(string(newRootNormalized) + suffix)
		if err != nil {
			_ = assetRows.Close()
			return FolderDTO{}, err
		}
		assetUpdates = append(assetUpdates, assetPathUpdate{id: id, relative: string(rewritten), key: key, fileName: filepath.Base(filepath.FromSlash(string(rewritten)))})
	}
	if err := assetRows.Close(); err != nil {
		return FolderDTO{}, err
	}

	for _, update := range folderUpdates {
		if _, err := tx.ExecContext(ctx, `UPDATE folders SET path_key=? WHERE id=?`, "move:"+folderID+":"+update.id, update.id); err != nil {
			return FolderDTO{}, err
		}
	}
	for _, update := range assetUpdates {
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET path_key=? WHERE id=?`, "move:"+folderID+":"+update.id, update.id); err != nil {
			return FolderDTO{}, err
		}
	}
	folderIDsByKey := make(map[string]string, len(folderUpdates))
	for _, update := range folderUpdates {
		folderIDsByKey[update.key] = update.id
	}
	now := time.Now().UnixMilli()
	for index, update := range folderUpdates {
		updatedParentID := parentID
		if index > 0 {
			parentRelative := filepath.ToSlash(filepath.Dir(update.relative))
			if parentRelative == "." {
				parentRelative = ""
			}
			_, parentKey, err := normalizeRelative(parentRelative)
			if err != nil {
				return FolderDTO{}, err
			}
			parent, found := folderIDsByKey[parentKey]
			if !found {
				return FolderDTO{}, newError(ErrInvalidLibrary, "\u6587\u4ef6\u5939\u5b50\u6811\u7f3a\u5c11\u7236\u7ea7\u7d22\u5f15", map[string]any{"path": update.relative})
			}
			updatedParentID = &parent
		}
		if _, err := tx.ExecContext(ctx, `UPDATE folders SET parent_id=?,relative_path=?,path_key=?,name=?,updated_at=? WHERE id=?`,
			updatedParentID, update.relative, update.key, update.name, now, update.id); err != nil {
			return FolderDTO{}, err
		}
	}
	for _, update := range assetUpdates {
		folderRelative := filepath.ToSlash(filepath.Dir(update.relative))
		if folderRelative == "." {
			folderRelative = ""
		}
		var assetFolderID any
		if folderRelative != "" {
			_, folderKey, err := normalizeRelative(folderRelative)
			if err != nil {
				return FolderDTO{}, err
			}
			if id, found := folderIDsByKey[folderKey]; found {
				assetFolderID = id
			} else if err := tx.QueryRowContext(ctx, `SELECT id FROM folders WHERE path_key=? AND availability='active'`, folderKey).Scan(&assetFolderID); err != nil {
				return FolderDTO{}, err
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET folder_id=?,relative_path=?,path_key=?,file_name=? WHERE id=?`,
			assetFolderID, update.relative, update.key, update.fileName, update.id); err != nil {
			return FolderDTO{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return FolderDTO{}, err
	}
	return s.folderByPathKey(ctx, newRootKey)
}

func (s *store) finishPermanentDeleteFolder(ctx context.Context, record folderTrashRecord) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM assets WHERE trash_entry_id=? AND availability='trashed'`, record.ID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM folders WHERE id=? AND availability='trashed'`, record.FolderID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM trash_entries WHERE id=? AND entry_kind='folder'`, record.ID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *store) trashEntryKindForAsset(ctx context.Context, id AssetID) (trashID, kind string, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT t.id,t.entry_kind FROM assets a JOIN trash_entries t ON t.id=a.trash_entry_id
		WHERE a.id=? AND a.availability='trashed' AND t.state='trashed'`, id).Scan(&trashID, &kind)
	if err == sql.ErrNoRows {
		err = newError(ErrAssetNotFound, "回收站中没有该资产", map[string]any{"assetId": id})
	}
	return
}

func (s *store) trashEntryKind(ctx context.Context, trashID string) (string, error) {
	var kind string
	err := s.db.QueryRowContext(ctx, `SELECT entry_kind FROM trash_entries WHERE id=? AND state='trashed'`, trashID).Scan(&kind)
	if err == sql.ErrNoRows {
		return "", newError(ErrAssetNotFound, "回收站条目不存在", map[string]any{"trashId": trashID})
	}
	return kind, err
}
