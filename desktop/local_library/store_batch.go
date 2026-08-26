package local_library

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// This file holds the set-based database APIs used by library initialization.
// The scan pipeline reads the whole index once, diffs it against the directory
// tree in memory, and then writes only what actually changed in batched
// transactions. The previous per-file `BEGIN IMMEDIATE ... COMMIT` round trip
// dominated initialization on large libraries: with a single writer connection
// it serialized one WAL commit per file even when nothing had changed.

// assetIndexRow is the part of an indexed asset the scanner needs to decide
// whether a file must be re-inspected.
type assetIndexRow struct {
	ID              AssetID
	Availability    string
	ByteSize        int64
	ModifiedAtNS    int64
	PreviewStatus   string
	MediaKind       string
	HasColors       bool
	LivePhotoProbed bool
}

// assetWriteResult mirrors the return values of the single-asset upsert so the
// scan pipeline can report created assets and queue thumbnails.
type assetWriteResult struct {
	ID           AssetID
	Created      bool
	NeedsPreview bool
	Format       string
	Extension    string
}

// previewWrite is a coalesced preview-state update produced by thumbnail
// generation.
type previewWrite struct {
	ID        AssetID
	Status    string
	Error     string
	Colors    []string
	SetColors bool
}

type folderIndexRow struct {
	ID           string
	PathKey      string
	Availability string
}

// chunkedAssetIDs yields id slices small enough to bind as SQL parameters.
func chunkedAssetIDs(ids []AssetID, size int) func(func([]AssetID) bool) {
	if size <= 0 {
		size = sqliteBatchParameters
	}
	return func(yield func([]AssetID) bool) {
		for start := 0; start < len(ids); start += size {
			end := min(start+size, len(ids))
			if !yield(ids[start:end]) {
				return
			}
		}
	}
}

// indexSnapshot loads the whole asset index keyed by path key. One sequential
// read replaces the per-file SELECT the scanner used to issue for every file on
// disk.
func (s *store) indexSnapshot(ctx context.Context) (map[string]assetIndexRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT a.path_key,a.id,a.availability,a.byte_size,a.modified_at_ns,a.preview_status,a.media_kind,a.dominant_colors,COALESCE(lp.video_length,0)
		FROM assets a LEFT JOIN asset_live_photos lp ON lp.asset_id=a.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	snapshot := make(map[string]assetIndexRow, 1024)
	for rows.Next() {
		var pathKey, dominantColors string
		var row assetIndexRow
		var videoLength int64
		if err := rows.Scan(&pathKey, &row.ID, &row.Availability, &row.ByteSize, &row.ModifiedAtNS, &row.PreviewStatus, &row.MediaKind, &dominantColors, &videoLength); err != nil {
			return nil, err
		}
		row.HasColors = dominantColors != "" && dominantColors != "[]"
		// video_length 0 (or NULL) means "never probed"; -1 means "probed and
		// not a live photo". Only never-probed files pay the slow probe again.
		row.LivePhotoProbed = videoLength != 0
		snapshot[pathKey] = row
	}
	return snapshot, rows.Err()
}

// folderSnapshot loads every folder row so folder pruning can be computed in
// memory instead of rewriting the whole table on each scan.
func (s *store) folderSnapshot(ctx context.Context) (map[string]folderIndexRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,path_key,availability FROM folders`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	snapshot := make(map[string]folderIndexRow, 256)
	for rows.Next() {
		var row folderIndexRow
		if err := rows.Scan(&row.ID, &row.PathKey, &row.Availability); err != nil {
			return nil, err
		}
		snapshot[row.PathKey] = row
	}
	return snapshot, rows.Err()
}

// ensureFolders creates or reactivates every folder on the given relative paths
// in one transaction and returns the deepest folder id per path. Ancestors are
// resolved once through an in-memory cache, so a library with 50k files in 500
// folders performs 500 lookups instead of one per file.
func (s *store) ensureFolders(ctx context.Context, relatives []string) (map[string]*string, error) {
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()

	result := make(map[string]*string, len(relatives))
	if len(relatives) == 0 {
		return result, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	selectStatement, err := tx.PrepareContext(ctx, `SELECT id,availability FROM folders WHERE path_key=?`)
	if err != nil {
		return nil, err
	}
	defer selectStatement.Close()
	insertStatement, err := tx.PrepareContext(ctx, `INSERT INTO folders(id,parent_id,relative_path,path_key,name,availability,discovered_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)`)
	if err != nil {
		return nil, err
	}
	defer insertStatement.Close()
	activateStatement, err := tx.PrepareContext(ctx, `UPDATE folders SET availability='active',updated_at=? WHERE id=?`)
	if err != nil {
		return nil, err
	}
	defer activateStatement.Close()

	cache := make(map[string]string, len(relatives)*2)
	for _, relative := range relatives {
		if relative == "" || relative == "." {
			continue
		}
		normalized, _, err := normalizeRelative(relative)
		if err != nil {
			return nil, err
		}
		if string(normalized) == "" {
			continue
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
			_, currentKey, keyErr := normalizeRelative(current)
			if keyErr != nil {
				return nil, keyErr
			}
			if cached, ok := cache[currentKey]; ok {
				parent := cached
				parentID = &parent
				continue
			}
			var id, availability string
			scanErr := selectStatement.QueryRowContext(ctx, currentKey).Scan(&id, &availability)
			now := time.Now().UnixMilli()
			switch {
			case errors.Is(scanErr, sql.ErrNoRows):
				id = newID()
				if _, err := insertStatement.ExecContext(ctx, id, parentID, current, currentKey, part, now, now); err != nil {
					return nil, err
				}
			case scanErr != nil:
				return nil, scanErr
			case availability != "active":
				if _, err := activateStatement.ExecContext(ctx, now, id); err != nil {
					return nil, err
				}
			}
			cache[currentKey] = id
			parent := id
			parentID = &parent
		}
		result[string(normalized)] = parentID
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

// pruneFolders deletes folder rows that are no longer present on disk.
func (s *store) pruneFolders(ctx context.Context, staleIDs []string) (int64, error) {
	if len(staleIDs) == 0 {
		return 0, nil
	}
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	var deleted int64
	for start := 0; start < len(staleIDs); start += sqliteBatchParameters {
		end := min(start+sqliteBatchParameters, len(staleIDs))
		chunk := staleIDs[start:end]
		args := make([]any, 0, len(chunk))
		for _, id := range chunk {
			args = append(args, id)
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM folders WHERE id IN (`+queryPlaceholders(len(chunk))+`)`, args...)
		if err != nil {
			return 0, err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		deleted += affected
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return deleted, nil
}

// writeIndexedFiles upserts a batch of inspected files in a single transaction.
func (s *store) writeIndexedFiles(ctx context.Context, files []indexedFile, folderIDs map[string]*string, scanToken string) ([]assetWriteResult, error) {
	if len(files) == 0 {
		return nil, nil
	}
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	existingStatement, err := tx.PrepareContext(ctx, `SELECT id,byte_size,modified_at_ns,preview_status,preview_error,dominant_colors FROM assets WHERE path_key=?`)
	if err != nil {
		return nil, err
	}
	defer existingStatement.Close()
	insertStatement, err := tx.PrepareContext(ctx, `INSERT INTO assets(
            id,folder_id,relative_path,path_key,file_name,extension,format,mime_type,media_kind,byte_size,modified_at_ns,width,height,orientation,is_animated,frame_count,
            availability,preview_status,preview_error,metadata_status,dominant_colors,captured_at,discovered_at,technical_updated_at,scan_token
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?)`)
	if err != nil {
		return nil, err
	}
	defer insertStatement.Close()
	updateStatement, err := tx.PrepareContext(ctx, `UPDATE assets SET folder_id=?,relative_path=?,file_name=?,extension=?,format=?,mime_type=?,media_kind=?,byte_size=?,modified_at_ns=?,width=?,height=?,orientation=?,is_animated=?,frame_count=?,availability='active',preview_status=?,preview_error=?,metadata_status=?,dominant_colors=?,captured_at=?,technical_updated_at=?,scan_token=?,trash_entry_id=NULL WHERE id=?`)
	if err != nil {
		return nil, err
	}
	defer updateStatement.Close()

	now := time.Now().UTC().UnixMilli()
	results := make([]assetWriteResult, 0, len(files))
	for _, file := range files {
		folderID, ok := folderIDs[file.FolderPath]
		if !ok {
			resolved, folderErr := ensureFolderWith(ctx, tx, file.FolderPath)
			if folderErr != nil {
				return nil, folderErr
			}
			folderID = resolved
		}
		var existingID, oldPreviewStatus, oldPreviewError, oldDominantColors string
		var oldSize, oldMtime int64
		scanErr := existingStatement.QueryRowContext(ctx, file.PathKey).
			Scan(&existingID, &oldSize, &oldMtime, &oldPreviewStatus, &oldPreviewError, &oldDominantColors)
		created := false
		capturedAt := nullableUnixMillis(file.CapturedAt)
		switch {
		case errors.Is(scanErr, sql.ErrNoRows):
			existingID = newID()
			created = true
			if _, err := insertStatement.ExecContext(ctx,
				existingID, folderID, file.RelativePath, file.PathKey, file.FileName, file.Extension, file.Format, file.MimeType, mediaKindOrDefault(file.MediaKind),
				file.ByteSize, file.ModifiedAtNS, file.Width, file.Height, normalizedOrientation(file.Orientation), file.IsAnimated, file.FrameCount,
				file.PreviewStatus, boundedError(file.PreviewError), file.MetadataStatus, encodeDominantColors(file.DominantColors), capturedAt, now, now, scanToken); err != nil {
				return nil, err
			}
		case scanErr != nil:
			return nil, scanErr
		default:
			previewStatus, previewError := file.PreviewStatus, boundedError(file.PreviewError)
			dominantColors := "[]"
			if oldSize == file.ByteSize && oldMtime == file.ModifiedAtNS && oldPreviewStatus == "ready" {
				previewStatus, previewError = oldPreviewStatus, oldPreviewError
				dominantColors = oldDominantColors
			}
			if _, err := updateStatement.ExecContext(ctx,
				folderID, file.RelativePath, file.FileName, file.Extension, file.Format, file.MimeType, mediaKindOrDefault(file.MediaKind), file.ByteSize, file.ModifiedAtNS,
				file.Width, file.Height, normalizedOrientation(file.Orientation), file.IsAnimated, file.FrameCount, previewStatus, previewError,
				file.MetadataStatus, dominantColors, capturedAt, now, scanToken, existingID); err != nil {
				return nil, err
			}
		}
		if err := upsertLivePhoto(ctx, tx, AssetID(existingID), file.LivePhoto); err != nil {
			return nil, err
		}
		if err := upsertEXIF(ctx, tx, AssetID(existingID), file.EXIF); err != nil {
			return nil, err
		}
		results = append(results, assetWriteResult{
			ID:           AssetID(existingID),
			Created:      created,
			NeedsPreview: file.PreviewStatus == "pending" && !isRAWExtension(file.Extension),
			Format:       file.Format,
			Extension:    file.Extension,
		})
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return results, nil
}

// markAssetsMissing flags the given assets as missing. Assets stamped with the
// running scan token (application-managed changes that completed during the
// scan) and assets modified after the scan started are left alone.
func (s *store) markAssetsMissing(ctx context.Context, ids []AssetID, scanToken string, startedAtMS int64) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	now := time.Now().UnixMilli()
	var affected int64
	for chunk := range chunkedAssetIDs(ids, sqliteBatchParameters) {
		args := make([]any, 0, len(chunk)+4)
		args = append(args, now)
		for _, id := range chunk {
			args = append(args, id)
		}
		args = append(args, scanToken, startedAtMS)
		result, err := tx.ExecContext(ctx, `UPDATE assets SET availability='missing',technical_updated_at=?
			WHERE id IN (`+queryPlaceholders(len(chunk))+`) AND availability='active' AND scan_token<>? AND technical_updated_at<=?`, args...)
		if err != nil {
			return 0, err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		affected += count
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return affected, nil
}

// stampScanToken marks unchanged assets as seen by the current scan without
// rewriting any other column. It is only used for assets that a concurrent
// operation could otherwise mistake for stale rows.
func (s *store) stampScanToken(ctx context.Context, ids []AssetID, scanToken string) error {
	if len(ids) == 0 {
		return nil
	}
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for chunk := range chunkedAssetIDs(ids, sqliteBatchParameters) {
		args := make([]any, 0, len(chunk)+1)
		args = append(args, scanToken)
		for _, id := range chunk {
			args = append(args, id)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET scan_token=? WHERE id IN (`+queryPlaceholders(len(chunk))+`)`, args...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// reactivateAssets restores assets whose file reappeared unchanged on disk.
func (s *store) reactivateAssets(ctx context.Context, ids []AssetID, scanToken string) error {
	if len(ids) == 0 {
		return nil
	}
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().UnixMilli()
	for chunk := range chunkedAssetIDs(ids, sqliteBatchParameters) {
		args := make([]any, 0, len(chunk)+2)
		args = append(args, scanToken, now)
		for _, id := range chunk {
			args = append(args, id)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET availability='active',scan_token=?,technical_updated_at=?,trash_entry_id=NULL
			WHERE id IN (`+queryPlaceholders(len(chunk))+`)`, args...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// setPreviewResults commits a batch of preview-state changes. Thumbnail workers
// funnel through here so warming a whole library costs one commit per batch
// instead of three writes per image.
func (s *store) setPreviewResults(ctx context.Context, writes []previewWrite) error {
	if len(writes) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	withColors, err := tx.PrepareContext(ctx, `UPDATE assets SET preview_status=?,preview_error=?,dominant_colors=?,technical_updated_at=? WHERE id=?`)
	if err != nil {
		return err
	}
	defer withColors.Close()
	withoutColors, err := tx.PrepareContext(ctx, `UPDATE assets SET preview_status=?,preview_error=?,technical_updated_at=? WHERE id=?`)
	if err != nil {
		return err
	}
	defer withoutColors.Close()
	now := time.Now().UnixMilli()
	for _, write := range writes {
		if write.SetColors {
			if _, err := withColors.ExecContext(ctx, write.Status, boundedError(write.Error), encodeDominantColors(write.Colors), now, write.ID); err != nil {
				return err
			}
			continue
		}
		if _, err := withoutColors.ExecContext(ctx, write.Status, boundedError(write.Error), now, write.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// pendingThumbnailAssets returns the assets that still need a grid thumbnail,
// together with the format details needed to skip formats that have no decoder.
// Assets whose preview permanently failed are excluded: retrying them on every
// open would stall initialization without ever succeeding.
func (s *store) pendingThumbnailAssets(ctx context.Context, onlyMissing bool) ([]thumbnailCandidate, error) {
	query := `SELECT id,format,extension FROM assets
		WHERE availability='active' AND media_kind IN ('image','live-photo')`
	if onlyMissing {
		query += ` AND (preview_status IN ('pending','generating') OR (preview_status='ready' AND (dominant_colors='[]' OR dominant_colors='')))`
	}
	query += ` ORDER BY relative_path`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	candidates := make([]thumbnailCandidate, 0)
	for rows.Next() {
		var candidate thumbnailCandidate
		if err := rows.Scan(&candidate.ID, &candidate.Format, &candidate.Extension); err != nil {
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	return candidates, rows.Err()
}

// derivativeSources loads the rows needed to build derivative requests for many
// assets at once, so a bulk warm-up does not issue one query per image.
func (s *store) derivativeSources(ctx context.Context, ids []AssetID) (map[AssetID]derivativeSource, error) {
	sources := make(map[AssetID]derivativeSource, len(ids))
	if len(ids) == 0 {
		return sources, nil
	}
	for chunk := range chunkedAssetIDs(ids, sqliteBatchParameters) {
		args := make([]any, 0, len(chunk))
		for _, id := range chunk {
			args = append(args, id)
		}
		rows, err := s.db.QueryContext(ctx, `SELECT id,relative_path,mime_type,availability,modified_at_ns,byte_size,orientation,format,extension
			FROM assets WHERE id IN (`+queryPlaceholders(len(chunk))+`)`, args...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id AssetID
			var source derivativeSource
			if err := rows.Scan(&id, &source.RelativePath, &source.MimeType, &source.Availability, &source.ModifiedAtNS, &source.ByteSize, &source.Orientation, &source.Format, &source.Extension); err != nil {
				rows.Close()
				return nil, err
			}
			sources[id] = source
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		if err := rows.Close(); err != nil {
			return nil, err
		}
	}
	return sources, nil
}

type thumbnailCandidate struct {
	ID        AssetID
	Format    string
	Extension string
}

// livePhotoWrite carries the result of a one-time Live Photo backfill probe.
type livePhotoWrite struct {
	ID   AssetID
	Desc livePhotoDescriptor
}

// updateLivePhotos commits a batch of Live Photo backfills. The upsert only
// overwrites rows that were never probed (video_length 0 or NULL), so a probe
// that raced with a full re-index cannot downgrade a real descriptor.
func (s *store) updateLivePhotos(ctx context.Context, writes []livePhotoWrite) error {
	if len(writes) == 0 {
		return nil
	}
	s.upsertMu.Lock()
	defer s.upsertMu.Unlock()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	descriptorStatement, err := tx.PrepareContext(ctx, `INSERT INTO asset_live_photos(asset_id,is_live_photo,video_mime,video_length)
		VALUES(?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET
		is_live_photo=excluded.is_live_photo,video_mime=excluded.video_mime,video_length=excluded.video_length
		WHERE asset_live_photos.video_length IS NULL OR asset_live_photos.video_length=0`)
	if err != nil {
		return err
	}
	defer descriptorStatement.Close()
	kindStatement, err := tx.PrepareContext(ctx, `UPDATE assets SET media_kind=CASE WHEN media_kind='file' THEN 'file' ELSE ? END,technical_updated_at=? WHERE id=?`)
	if err != nil {
		return err
	}
	defer kindStatement.Close()
	now := time.Now().UnixMilli()
	for _, write := range writes {
		mediaKind, isLive, mime := "image", 0, ""
		length := int64(-1) // sentinel: probed, not a live photo
		if write.Desc.VideoOffset > 0 {
			mediaKind, isLive, mime, length = "live-photo", 1, write.Desc.VideoMIME, write.Desc.VideoLength
		}
		if _, err := descriptorStatement.ExecContext(ctx, write.ID, isLive, mime, length); err != nil {
			return err
		}
		if _, err := kindStatement.ExecContext(ctx, mediaKind, now, write.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
