package local_library

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"time"
)

// derivatives.db keeps the regenerable thumbnail/preview bookkeeping out of
// library.db. Separating them has three effects that matter for library
// initialization:
//
//   - Thumbnail workers no longer contend with the scanner for the single
//     library.db writer, so bulk indexing keeps the write lock to itself.
//   - The cache database is fully regenerable, so it can run with
//     synchronous=OFF and stays out of backups and integrity checks.
//   - library.db stays small, which keeps VACUUM INTO backups and
//     PRAGMA quick_check fast on large libraries.
const derivativeStoreFileName = "derivatives.db"

const derivativeStoreSchemaVersion = 1

type derivativeStore struct {
	db *sql.DB
}

// derivativeWrite is one row of derivative bookkeeping queued for a batched
// commit. Thumbnail generation produces one of these per asset.
type derivativeWrite struct {
	AssetID      AssetID
	Variant      derivativeVariant
	CacheKey     string
	MaxDimension int
	Width        int
	Height       int
	ByteSize     int64
	Status       string
	Error        string
}

func openDerivativeStore(root string) (*derivativeStore, error) {
	path := internalPath(root, derivativeStoreFileName)
	// synchronous=OFF is safe here: every row can be rebuilt from the source
	// files, and a torn cache row only causes one thumbnail to regenerate.
	dsn := "file:" + filepath.ToSlash(path) +
		"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(OFF)" +
		"&_pragma=cache_size(-8192)&_pragma=temp_store(2)&_pragma=wal_autocheckpoint(2000)&_txlock=immediate"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// Match library.db: the modernc driver keeps connection-local pager state
	// and several connections opening the same WAL database concurrently can
	// fail with a misleading SQLITE_CANTOPEN on Windows.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	store := &derivativeStore{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (d *derivativeStore) migrate() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS derivative_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
		// No foreign key to assets: SQLite cannot reference a table in another
		// database file. Orphan rows are pruned explicitly when assets are
		// removed, and a stale row can never be served because the cache key
		// embeds the source size and modification time.
		`CREATE TABLE IF NOT EXISTS asset_derivatives (
            asset_id TEXT NOT NULL,
            variant TEXT NOT NULL CHECK(variant IN ('thumbnail','preview')),
            cache_key TEXT NOT NULL, content_version TEXT NOT NULL, decoder_version TEXT NOT NULL,
            max_dimension INTEGER NOT NULL, width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
            byte_size INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', error TEXT NOT NULL DEFAULT '',
            generated_at INTEGER, last_accessed_at INTEGER NOT NULL,
            PRIMARY KEY(asset_id, variant)
        )`,
		`CREATE INDEX IF NOT EXISTS idx_asset_derivatives_variant_accessed ON asset_derivatives(variant, status, last_accessed_at)`,
	}
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return fmt.Errorf("migrate derivative cache: %w", err)
		}
	}
	if _, err := tx.Exec(`INSERT INTO derivative_meta(key,value) VALUES('schema_version',?)
		ON CONFLICT(key) DO UPDATE SET value=excluded.value`, strconv.Itoa(derivativeStoreSchemaVersion)); err != nil {
		return err
	}
	return tx.Commit()
}

func (d *derivativeStore) Close() error { return d.db.Close() }

func (d *derivativeStore) record(ctx context.Context, id AssetID, variant derivativeVariant) (record derivativeRecord, err error) {
	err = d.db.QueryRowContext(ctx, `SELECT asset_id,variant,cache_key,max_dimension,width,height,byte_size,status,error,last_accessed_at
		FROM asset_derivatives WHERE asset_id=? AND variant=?`, id, variant).
		Scan(&record.AssetID, &record.Variant, &record.CacheKey, &record.MaxDimension, &record.Width, &record.Height, &record.ByteSize, &record.Status, &record.Error, &record.LastAccessed)
	return
}

const upsertDerivativeSQL = `INSERT INTO asset_derivatives(
		asset_id,variant,cache_key,content_version,decoder_version,max_dimension,width,height,byte_size,status,error,generated_at,last_accessed_at
	) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id,variant) DO UPDATE SET
		cache_key=excluded.cache_key,content_version=excluded.content_version,decoder_version=excluded.decoder_version,
		max_dimension=excluded.max_dimension,width=excluded.width,height=excluded.height,byte_size=excluded.byte_size,
		status=excluded.status,error=excluded.error,generated_at=excluded.generated_at,last_accessed_at=excluded.last_accessed_at`

func (d *derivativeStore) setResult(ctx context.Context, id AssetID, variant derivativeVariant, cacheKey string, maxDimension, width, height int, byteSize int64, status, derivativeError string) error {
	return d.setResults(ctx, []derivativeWrite{{
		AssetID: id, Variant: variant, CacheKey: cacheKey, MaxDimension: maxDimension,
		Width: width, Height: height, ByteSize: byteSize, Status: status, Error: derivativeError,
	}})
}

// setResults commits a batch of derivative rows in one transaction. Bulk
// thumbnail generation funnels through here so a full library warm-up costs
// one commit per batch instead of one commit per image.
func (d *derivativeStore) setResults(ctx context.Context, writes []derivativeWrite) error {
	if len(writes) == 0 {
		return nil
	}
	now := time.Now().UTC().UnixMilli()
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	statement, err := tx.PrepareContext(ctx, upsertDerivativeSQL)
	if err != nil {
		return err
	}
	defer statement.Close()
	for _, write := range writes {
		var generatedAt any
		if write.Status == "ready" {
			generatedAt = now
		}
		if _, err := statement.ExecContext(ctx, write.AssetID, write.Variant, write.CacheKey, derivativeContentVersion,
			derivativeDecoderVersion, write.MaxDimension, write.Width, write.Height, write.ByteSize, write.Status,
			boundedError(write.Error), generatedAt, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *derivativeStore) touch(ctx context.Context, id AssetID, variant derivativeVariant) error {
	_, err := d.db.ExecContext(ctx, `UPDATE asset_derivatives SET last_accessed_at=? WHERE asset_id=? AND variant=?`, time.Now().UTC().UnixMilli(), id, variant)
	return err
}

func (d *derivativeStore) previewEntries(ctx context.Context) ([]derivativeRecord, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT asset_id,variant,cache_key,max_dimension,width,height,byte_size,status,error,last_accessed_at
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

func (d *derivativeStore) delete(ctx context.Context, id AssetID, variant derivativeVariant, cacheKey string) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM asset_derivatives WHERE asset_id=? AND variant=? AND cache_key=?`, id, variant, cacheKey)
	return err
}

func (d *derivativeStore) deleteVariant(ctx context.Context, variant derivativeVariant) error {
	_, err := d.db.ExecContext(ctx, `DELETE FROM asset_derivatives WHERE variant=?`, variant)
	return err
}

// deleteAssets removes every derivative row of the given assets. It replaces the
// ON DELETE CASCADE that was available while the table lived in library.db.
func (d *derivativeStore) deleteAssets(ctx context.Context, ids []AssetID) error {
	if len(ids) == 0 {
		return nil
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for chunk := range chunkedAssetIDs(ids, sqliteBatchParameters) {
		args := make([]any, 0, len(chunk))
		for _, id := range chunk {
			args = append(args, id)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM asset_derivatives WHERE asset_id IN (`+queryPlaceholders(len(chunk))+`)`, args...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// readyCacheKeys returns the current thumbnail/preview cache keys so orphaned
// files can be swept in a single pass instead of globbing per asset.
func (d *derivativeStore) readyCacheKeys(ctx context.Context, variant derivativeVariant) (map[AssetID]string, error) {
	rows, err := d.db.QueryContext(ctx, `SELECT asset_id,cache_key FROM asset_derivatives WHERE variant=? AND status='ready'`, variant)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := make(map[AssetID]string)
	for rows.Next() {
		var id AssetID
		var key string
		if err := rows.Scan(&id, &key); err != nil {
			return nil, err
		}
		keys[id] = key
	}
	return keys, rows.Err()
}

// migrateDerivativesFromLibrary moves a pre-v14 asset_derivatives table out of
// library.db. It is idempotent: a partially completed move is finished on the
// next open, and losing a row only costs one regenerated thumbnail.
func migrateDerivativesFromLibrary(ctx context.Context, library *sql.DB, cache *derivativeStore) error {
	var legacyTables int
	if err := library.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='asset_derivatives'`).Scan(&legacyTables); err != nil {
		return err
	}
	if legacyTables == 0 {
		return nil
	}
	rows, err := library.QueryContext(ctx, `SELECT asset_id,variant,cache_key,content_version,decoder_version,max_dimension,width,height,byte_size,status,error,generated_at,last_accessed_at FROM asset_derivatives`)
	if err != nil {
		return err
	}
	type legacyRow struct {
		values [13]any
	}
	pending := make([]legacyRow, 0, 1024)
	for rows.Next() {
		var assetID, variant, cacheKey, contentVersion, decoderVersion, status, message string
		var maxDimension, width, height int
		var byteSize, lastAccessed int64
		var generatedAt sql.NullInt64
		if err := rows.Scan(&assetID, &variant, &cacheKey, &contentVersion, &decoderVersion, &maxDimension, &width, &height, &byteSize, &status, &message, &generatedAt, &lastAccessed); err != nil {
			rows.Close()
			return err
		}
		var generated any
		if generatedAt.Valid {
			generated = generatedAt.Int64
		}
		pending = append(pending, legacyRow{values: [13]any{assetID, variant, cacheKey, contentVersion, decoderVersion, maxDimension, width, height, byteSize, status, message, generated, lastAccessed}})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if len(pending) > 0 {
		tx, err := cache.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		statement, err := tx.PrepareContext(ctx, upsertDerivativeSQL)
		if err != nil {
			return err
		}
		for _, row := range pending {
			if _, err := statement.ExecContext(ctx, row.values[0], row.values[1], row.values[2], row.values[3], row.values[4],
				row.values[5], row.values[6], row.values[7], row.values[8], row.values[9], row.values[10], row.values[11], row.values[12]); err != nil {
				statement.Close()
				return err
			}
		}
		if err := statement.Close(); err != nil {
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	if _, err := library.ExecContext(ctx, `DROP TABLE asset_derivatives`); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("M014 drop library asset_derivatives: %w", err)
	}
	return nil
}
