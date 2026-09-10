package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"

	"mo-gallery-desktop/db/migrate"
)

const localDraftsFileName = "drafts.db"

var DraftsDB *gorm.DB

type LocalDraftRecord struct {
	Key               string  `gorm:"column:key;type:text;primaryKey"`
	Kind              string  `gorm:"column:kind;type:text;not null;index"`
	ResourceID        *string `gorm:"column:resourceId;type:text;index"`
	Title             string  `gorm:"column:title;type:text;not null"`
	EditorType        string  `gorm:"column:editorType;type:text;not null;default:tiptap"`
	TiptapContent     string  `gorm:"column:tiptapContent;type:text;not null"`
	TiptapContentJSON *string `gorm:"column:tiptapContentJson;type:text"`
	MilkContent       *string `gorm:"column:milk_content;type:text"`
	Category          *string `gorm:"column:category;type:text;index"`
	Tags              *string `gorm:"column:tags;type:text"`
	IsPublished       bool    `gorm:"column:isPublished;not null;default:false;index"`
	CloudSynced       bool    `gorm:"column:cloudSynced;not null;default:false;index"`
	ContentDate       *string `gorm:"column:contentDate;type:text"`
	SavedAt           int64   `gorm:"column:savedAt;not null;index"`
	MetadataJSON      string  `gorm:"column:metadataJson;type:text;not null;default:'{}'"`
	UpdatedAt         int64   `gorm:"column:updatedAt;not null;index"`
}

func (LocalDraftRecord) TableName() string { return "LocalDraft" }

func LocalDraftsPath(configDir string) string { return localDBPath(configDir, localDraftsFileName) }

func ConnectLocalDrafts(configDir string) error {
	if err := ensureDBDir(configDir); err != nil {
		return fmt.Errorf("create local drafts database directory: %w", err)
	}
	database, err := OpenLocalDrafts(LocalDraftsPath(configDir))
	if err != nil {
		return err
	}
	DraftsDB = database
	return nil
}

func OpenLocalDrafts(path string) (*gorm.DB, error) {
	dsn := "file:" + filepath.ToSlash(path)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open local drafts database connection: %w", err)
	}
	database, err := gorm.Open(sqlite.Dialector{DriverName: "sqlite", DSN: dsn, Conn: sqlDB}, &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Warn),
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("open local drafts database: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	for _, statement := range []string{"PRAGMA journal_mode = WAL", "PRAGMA synchronous = FULL", "PRAGMA busy_timeout = 5000"} {
		if err := database.Exec(statement).Error; err != nil {
			_ = sqlDB.Close()
			return nil, fmt.Errorf("configure local drafts database: %w", err)
		}
	}
	if err := migrate.Run(database, localDraftMigrations()); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("migrate local drafts database: %w", err)
	}
	return database, nil
}

func localDraftMigrations() []migrate.Migration {
	return []migrate.Migration{
		{
			Version: 1,
			Name:    "baseline",
			Up:      migrateLocalDraftSchema,
		},
		{
			Version: 2,
			Name:    "milkdown_content",
			Up: func(database *gorm.DB) error {
				if database.Migrator().HasColumn(&LocalDraftRecord{}, "milk_content") {
					return nil
				}
				return database.Migrator().AddColumn(&LocalDraftRecord{}, "MilkContent")
			},
		},
		{
			Version: 3,
			Name:    "editor_content_fields",
			Up:      migrateLocalDraftEditorContent,
		},
	}
}

func migrateLocalDraftEditorContent(database *gorm.DB) error {
	migrator := database.Migrator()
	columnTypes, err := migrator.ColumnTypes("LocalDraft")
	if err != nil {
		return fmt.Errorf("inspect local draft columns: %w", err)
	}
	columns := make(map[string]bool, len(columnTypes))
	for _, column := range columnTypes {
		columns[strings.ToLower(column.Name())] = true
	}
	hadEditorType := columns["editortype"]
	for _, rename := range [][2]string{{"content", "tiptapContent"}, {"contentJson", "tiptapContentJson"}} {
		if !columns[strings.ToLower(rename[0])] {
			continue
		}
		if columns[strings.ToLower(rename[1])] {
			return fmt.Errorf("draft database contains both %s and %s columns", rename[0], rename[1])
		}
		if err := migrator.RenameColumn("LocalDraft", rename[0], rename[1]); err != nil {
			return fmt.Errorf("rename draft %s: %w", rename[0], err)
		}
	}
	if err := database.AutoMigrate(&LocalDraftRecord{}); err != nil {
		return err
	}
	if hadEditorType {
		return nil
	}

	var records []LocalDraftRecord
	if err := database.Find(&records).Error; err != nil {
		return fmt.Errorf("read draft editor identities: %w", err)
	}
	for _, record := range records {
		payload := map[string]json.RawMessage{}
		if record.MetadataJSON != "" {
			if err := json.Unmarshal([]byte(record.MetadataJSON), &payload); err != nil {
				return fmt.Errorf("read draft %q metadata: %w", record.Key, err)
			}
		}
		// Builds predating a dedicated column kept unrecognized body fields in
		// metadata. Move those values too, preserving explicitly empty bodies.
		updates := map[string]any{}
		if _, exists := payload["tiptapContent"]; exists {
			value, _, err := draftString(payload, "tiptapContent")
			if err != nil {
				return fmt.Errorf("read draft %q content: %w", record.Key, err)
			}
			updates["tiptapContent"] = value
		}
		if raw, exists := payload["tiptapContentJson"]; exists {
			updates["tiptapContentJson"] = nil
			if string(raw) != "null" {
				updates["tiptapContentJson"] = string(raw)
			}
		}
		if _, exists := payload["milkContent"]; exists {
			value, hasMilkdown, err := draftString(payload, "milkContent")
			if err != nil {
				return fmt.Errorf("read draft %q content: %w", record.Key, err)
			}
			record.MilkContent = nil
			updates["milk_content"] = nil
			if hasMilkdown {
				record.MilkContent = &value
				updates["milk_content"] = value
			}
		}
		editorType, err := localDraftEditorType(payload, record.MilkContent != nil)
		if err != nil {
			return fmt.Errorf("read draft %q editor: %w", record.Key, err)
		}
		updates["editorType"] = editorType
		// UpdateColumns preserves the original savedAt/updatedAt values.
		if err := database.Model(&LocalDraftRecord{}).Where("key = ?", record.Key).UpdateColumns(updates).Error; err != nil {
			return fmt.Errorf("set draft %q editor: %w", record.Key, err)
		}
	}
	return nil
}

type legacyLocalDraftRecord struct {
	Key     string `gorm:"column:key"`
	Payload string `gorm:"column:payload"`
}

func migrateLocalDraftSchema(database *gorm.DB) error {
	migrator := database.Migrator()
	if !migrator.HasTable(&LocalDraftRecord{}) {
		return database.AutoMigrate(&LocalDraftRecord{})
	}
	legacyColumn := ""
	if migrator.HasColumn(&LocalDraftRecord{}, "data") {
		legacyColumn = "data"
	} else if migrator.HasColumn(&LocalDraftRecord{}, "value") {
		legacyColumn = "value"
	}
	if legacyColumn == "" {
		// An older structured database may not have migration history yet.
		// Rename its populated columns before AutoMigrate sees the current model.
		return migrateLocalDraftEditorContent(database)
	}

	var legacyRecords []legacyLocalDraftRecord
	query := fmt.Sprintf(`SELECT key, %q AS payload FROM "LocalDraft"`, legacyColumn)
	if err := database.Raw(query).Scan(&legacyRecords).Error; err != nil {
		return fmt.Errorf("read legacy draft rows: %w", err)
	}

	if err := database.Exec(`ALTER TABLE "LocalDraft" RENAME TO "LocalDraftLegacy"`).Error; err != nil {
		return err
	}
	// SQLite keeps explicit index names when a table is renamed. Drop the
	// legacy GORM indexes before AutoMigrate creates indexes for the new table.
	if err := database.Exec(`DROP INDEX IF EXISTS "idx_LocalDraft_updated_at"`).Error; err != nil {
		return err
	}
	if err := database.AutoMigrate(&LocalDraftRecord{}); err != nil {
		return err
	}
	for _, legacy := range legacyRecords {
		record, err := parseLocalDraft(legacy.Key, legacy.Payload)
		if err != nil {
			return fmt.Errorf("convert legacy draft %q: %w", legacy.Key, err)
		}
		if err := database.Save(&record).Error; err != nil {
			return fmt.Errorf("write converted draft %q: %w", legacy.Key, err)
		}
	}
	if err := database.Migrator().DropTable("LocalDraftLegacy"); err != nil {
		return err
	}
	return nil
}

func CloseLocalDrafts() {
	if DraftsDB == nil {
		return
	}
	if sqlDB, err := DraftsDB.DB(); err == nil {
		_ = sqlDB.Close()
	}
	DraftsDB = nil
}

func requireDraftsDB() (*gorm.DB, error) {
	if DraftsDB == nil {
		return nil, errors.New("local drafts database is not initialized")
	}
	return DraftsDB, nil
}

func draftString(payload map[string]json.RawMessage, key string) (string, bool, error) {
	raw, ok := payload[key]
	if !ok || string(raw) == "null" {
		return "", false, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false, fmt.Errorf("draft %s must be a string", key)
	}
	return value, true, nil
}

func decodeLocalDraftPayload(data string) (map[string]json.RawMessage, error) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &payload); err != nil || payload == nil {
		return nil, errors.New("draft data must be a JSON object")
	}
	// Compatibility belongs at the storage boundary. A present renamed field,
	// including an empty string or null, always wins over its legacy alias.
	for _, rename := range [][2]string{{"content", "tiptapContent"}, {"contentJson", "tiptapContentJson"}} {
		if _, exists := payload[rename[1]]; !exists {
			if legacy, ok := payload[rename[0]]; ok {
				payload[rename[1]] = legacy
			}
		}
		delete(payload, rename[0])
	}
	return payload, nil
}

func localDraftEditorType(payload map[string]json.RawMessage, hasMilkdown bool) (string, error) {
	editorType, exists, err := draftString(payload, "editorType")
	if err != nil {
		return "", err
	}
	if exists {
		if editorType != "tiptap" && editorType != "milkdown" {
			return "", errors.New("draft editorType must be tiptap or milkdown")
		}
		return editorType, nil
	}
	// Cloud backfill is always TipTap; local drafts may already contain
	// unsynced Milkdown work, including an intentionally empty document.
	if hasMilkdown {
		return "milkdown", nil
	}
	return "tiptap", nil
}

func draftBool(payload map[string]json.RawMessage, key string) (bool, error) {
	raw, ok := payload[key]
	if !ok || string(raw) == "null" {
		return false, nil
	}
	var value bool
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, fmt.Errorf("draft %s must be a boolean", key)
	}
	return value, nil
}

func draftInt64(payload map[string]json.RawMessage, key string) (int64, bool, error) {
	raw, ok := payload[key]
	if !ok || string(raw) == "null" {
		return 0, false, nil
	}
	var value int64
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, false, fmt.Errorf("draft %s must be an integer", key)
	}
	return value, true, nil
}

func draftKindAndResourceID(key string, payload map[string]json.RawMessage) (string, *string, error) {
	kind := "quick_story"
	resourceKey := ""
	if strings.HasPrefix(key, "blog_draft_") {
		kind, resourceKey = "blog", "blogId"
	} else if strings.HasPrefix(key, "story_editor_") {
		kind, resourceKey = "story", "storyId"
	}
	if resourceKey == "" {
		return kind, nil, nil
	}
	resourceID, ok, err := draftString(payload, resourceKey)
	if err != nil || !ok || strings.TrimSpace(resourceID) == "" {
		return kind, nil, err
	}
	resourceID = strings.TrimSpace(resourceID)
	return kind, &resourceID, nil
}

func parseLocalDraft(key, data string) (LocalDraftRecord, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return LocalDraftRecord{}, errors.New("draft key is required")
	}
	payload, err := decodeLocalDraftPayload(data)
	if err != nil {
		return LocalDraftRecord{}, err
	}
	title, _, err := draftString(payload, "title")
	if err != nil {
		return LocalDraftRecord{}, err
	}
	content, _, err := draftString(payload, "tiptapContent")
	if err != nil {
		return LocalDraftRecord{}, err
	}
	milkContent, hasMilkdown, err := draftString(payload, "milkContent")
	if err != nil {
		return LocalDraftRecord{}, err
	}
	editorType, err := localDraftEditorType(payload, hasMilkdown)
	if err != nil {
		return LocalDraftRecord{}, err
	}
	kind, resourceID, err := draftKindAndResourceID(key, payload)
	if err != nil {
		return LocalDraftRecord{}, err
	}
	published, err := draftBool(payload, "isPublished")
	if err != nil {
		return LocalDraftRecord{}, err
	}
	savedAt, ok, err := draftInt64(payload, "savedAt")
	if err != nil {
		return LocalDraftRecord{}, err
	}
	if !ok || savedAt <= 0 {
		savedAt = time.Now().UnixMilli()
	}

	record := LocalDraftRecord{
		Key: key, Kind: kind, ResourceID: resourceID, Title: title,
		EditorType: editorType, TiptapContent: content,
		IsPublished: published, CloudSynced: false, SavedAt: savedAt, UpdatedAt: time.Now().UnixMilli(),
	}
	if hasMilkdown {
		record.MilkContent = &milkContent
	}
	if synced, syncedErr := draftBool(payload, "cloudSynced"); syncedErr != nil {
		return LocalDraftRecord{}, syncedErr
	} else {
		record.CloudSynced = synced
	}
	if raw, exists := payload["tiptapContentJson"]; exists && string(raw) != "null" {
		if !json.Valid(raw) {
			return LocalDraftRecord{}, errors.New("draft tiptapContentJson must be valid JSON")
		}
		value := string(raw)
		record.TiptapContentJSON = &value
	}
	if value, exists, parseErr := draftString(payload, "category"); parseErr != nil {
		return LocalDraftRecord{}, parseErr
	} else if exists {
		record.Category = &value
	}
	if value, exists, parseErr := draftString(payload, "tags"); parseErr != nil {
		return LocalDraftRecord{}, parseErr
	} else if exists {
		record.Tags = &value
	}
	if value, exists, parseErr := draftString(payload, "createdAt"); parseErr != nil {
		return LocalDraftRecord{}, parseErr
	} else if exists {
		record.ContentDate = &value
	}

	for _, field := range []string{"id", "storyId", "blogId", "title", "editorType", "tiptapContent", "tiptapContentJson", "milkContent", "category", "tags", "isPublished", "cloudSynced", "createdAt", "savedAt"} {
		delete(payload, field)
	}
	metadata, err := json.Marshal(payload)
	if err != nil {
		return LocalDraftRecord{}, fmt.Errorf("encode draft metadata: %w", err)
	}
	record.MetadataJSON = string(metadata)
	return record, nil
}

func localDraftJSON(record LocalDraftRecord) (string, error) {
	payload := map[string]json.RawMessage{}
	if record.MetadataJSON != "" {
		if err := json.Unmarshal([]byte(record.MetadataJSON), &payload); err != nil {
			return "", fmt.Errorf("decode draft metadata: %w", err)
		}
	}
	if payload == nil {
		payload = map[string]json.RawMessage{}
	}
	for _, field := range []string{"content", "contentJson", "tiptapContentJson", "milkContent"} {
		delete(payload, field)
	}
	set := func(key string, value any) error {
		encoded, err := json.Marshal(value)
		if err == nil {
			payload[key] = encoded
		}
		return err
	}
	_ = set("id", record.Key)
	_ = set("title", record.Title)
	_ = set("editorType", record.EditorType)
	_ = set("tiptapContent", record.TiptapContent)
	_ = set("isPublished", record.IsPublished)
	_ = set("cloudSynced", record.CloudSynced)
	_ = set("savedAt", record.SavedAt)
	if record.TiptapContentJSON != nil {
		payload["tiptapContentJson"] = json.RawMessage(*record.TiptapContentJSON)
	}
	if record.MilkContent != nil {
		_ = set("milkContent", *record.MilkContent)
	}
	if record.Category != nil {
		_ = set("category", *record.Category)
	}
	if record.Tags != nil {
		_ = set("tags", *record.Tags)
	}
	if record.ContentDate != nil {
		_ = set("createdAt", *record.ContentDate)
	}
	if record.ResourceID != nil {
		if record.Kind == "blog" {
			_ = set("blogId", *record.ResourceID)
		} else if record.Kind == "story" {
			_ = set("storyId", *record.ResourceID)
		}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode local draft: %w", err)
	}
	return string(encoded), nil
}

func SaveLocalDraft(key, data string) error {
	database, err := requireDraftsDB()
	if err != nil {
		return err
	}
	record, err := parseLocalDraft(key, data)
	if err != nil {
		return err
	}
	// Omitted editor fields must survive writes from another editor/version.
	payload, err := decodeLocalDraftPayload(data)
	if err != nil {
		return err
	}
	columns := []string{"kind", "resourceId", "title", "category", "tags", "isPublished", "cloudSynced", "contentDate", "savedAt", "metadataJson", "updatedAt"}
	hasBody := false
	for field, column := range map[string]string{"tiptapContent": "tiptapContent", "tiptapContentJson": "tiptapContentJson", "milkContent": "milk_content"} {
		if _, exists := payload[field]; exists {
			hasBody = true
			columns = append(columns, column)
		}
	}
	if _, hasEditorType := payload["editorType"]; hasEditorType || hasBody {
		columns = append(columns, "editorType")
	}
	if record.EditorType == "tiptap" {
		_, hasText := payload["tiptapContent"]
		_, hasJSON := payload["tiptapContentJson"]
		if hasText && !hasJSON {
			columns = append(columns, "tiptapContentJson")
		} else if hasJSON && !hasText {
			columns = append(columns, "tiptapContent")
		}
	}
	if err := database.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns(columns),
	}).Create(&record).Error; err != nil {
		return fmt.Errorf("save local draft: %w", err)
	}
	return nil
}

func MarkLocalDraftSynced(key string, expectedSavedAt int64) error {
	database, err := requireDraftsDB()
	if err != nil {
		return err
	}
	key = strings.TrimSpace(key)
	if key == "" || expectedSavedAt <= 0 {
		return errors.New("draft key and expected savedAt are required")
	}
	// A newer autosave is left untouched, and no body is replayed into storage.
	return database.Model(&LocalDraftRecord{}).
		Where("key = ? AND savedAt = ?", key, expectedSavedAt).
		UpdateColumn("cloudSynced", true).Error
}

func RekeyLocalDraft(oldKey, newKey, documentID string) error {
	database, err := requireDraftsDB()
	if err != nil {
		return err
	}
	oldKey, newKey, documentID = strings.TrimSpace(oldKey), strings.TrimSpace(newKey), strings.TrimSpace(documentID)
	if oldKey == "" || newKey == "" || documentID == "" {
		return errors.New("draft keys and document ID are required")
	}
	if oldKey == newKey {
		return database.Model(&LocalDraftRecord{}).Where("key = ?", newKey).UpdateColumn("resourceId", documentID).Error
	}
	return database.Transaction(func(tx *gorm.DB) error {
		var source LocalDraftRecord
		result := tx.Where("key = ?", oldKey).Limit(1).Find(&source)
		if result.Error != nil || result.RowsAffected == 0 {
			return result.Error
		}
		var destination LocalDraftRecord
		result = tx.Where("key = ?", newKey).Limit(1).Find(&destination)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 && destination.SavedAt >= source.SavedAt {
			if err := tx.Model(&LocalDraftRecord{}).Where("key = ?", newKey).UpdateColumn("resourceId", documentID).Error; err != nil {
				return err
			}
			return tx.Delete(&LocalDraftRecord{}, "key = ?", oldKey).Error
		}
		if result.RowsAffected > 0 {
			if err := tx.Delete(&LocalDraftRecord{}, "key = ?", newKey).Error; err != nil {
				return err
			}
		}
		// Moving the existing row keeps every body, metadata and timestamp field.
		return tx.Model(&LocalDraftRecord{}).Where("key = ?", oldKey).
			UpdateColumns(map[string]any{"key": newKey, "resourceId": documentID}).Error
	})
}

func GetLocalDraft(key string) (string, error) {
	database, err := requireDraftsDB()
	if err != nil {
		return "", err
	}
	var record LocalDraftRecord
	err = database.First(&record, "key = ?", strings.TrimSpace(key)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get local draft: %w", err)
	}
	return localDraftJSON(record)
}

func ListLocalDrafts() ([]string, error) {
	database, err := requireDraftsDB()
	if err != nil {
		return nil, err
	}
	var records []LocalDraftRecord
	if err := database.Order("savedAt DESC").Find(&records).Error; err != nil {
		return nil, fmt.Errorf("list local drafts: %w", err)
	}
	keys := make([]string, len(records))
	for index, record := range records {
		keys[index] = record.Key
	}
	return keys, nil
}

func DeleteLocalDraft(key string) error {
	database, err := requireDraftsDB()
	if err != nil {
		return err
	}
	if err := database.Delete(&LocalDraftRecord{}, "key = ?", strings.TrimSpace(key)).Error; err != nil {
		return fmt.Errorf("delete local draft: %w", err)
	}
	return nil
}
