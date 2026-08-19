package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"

	"mo-gallery-desktop/db/migrate"
)

const localDraftsFileName = "drafts.db"

var DraftsDB *gorm.DB

type LocalDraftRecord struct {
	Key          string  `gorm:"column:key;type:text;primaryKey"`
	Kind         string  `gorm:"column:kind;type:text;not null;index"`
	ResourceID   *string `gorm:"column:resourceId;type:text;index"`
	Title        string  `gorm:"column:title;type:text;not null"`
	Content      string  `gorm:"column:content;type:text;not null"`
	ContentJSON  *string `gorm:"column:contentJson;type:text"`
	Category     *string `gorm:"column:category;type:text;index"`
	Tags         *string `gorm:"column:tags;type:text"`
	IsPublished  bool    `gorm:"column:isPublished;not null;default:false;index"`
	CloudSynced  bool    `gorm:"column:cloudSynced;not null;default:false;index"`
	ContentDate  *string `gorm:"column:contentDate;type:text"`
	SavedAt      int64   `gorm:"column:savedAt;not null;index"`
	MetadataJSON string  `gorm:"column:metadataJson;type:text;not null;default:'{}'"`
	UpdatedAt    int64   `gorm:"column:updatedAt;not null;index"`
}

func (LocalDraftRecord) TableName() string { return "LocalDraft" }

func LocalDraftsPath(configDir string) string { return filepath.Join(configDir, localDraftsFileName) }

func ConnectLocalDrafts(configDir string) error {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
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
	}
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
		return database.AutoMigrate(&LocalDraftRecord{})
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
	var payload map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return LocalDraftRecord{}, errors.New("draft data must be a JSON object")
	}
	title, _, err := draftString(payload, "title")
	if err != nil {
		return LocalDraftRecord{}, err
	}
	content, _, err := draftString(payload, "content")
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
		Key: key, Kind: kind, ResourceID: resourceID, Title: title, Content: content,
		IsPublished: published, CloudSynced: false, SavedAt: savedAt, UpdatedAt: time.Now().UnixMilli(),
	}
	if synced, syncedErr := draftBool(payload, "cloudSynced"); syncedErr != nil {
		return LocalDraftRecord{}, syncedErr
	} else {
		record.CloudSynced = synced
	}
	if raw, exists := payload["contentJson"]; exists && string(raw) != "null" {
		if !json.Valid(raw) {
			return LocalDraftRecord{}, errors.New("draft contentJson must be valid JSON")
		}
		value := string(raw)
		record.ContentJSON = &value
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

	for _, field := range []string{"id", "storyId", "blogId", "title", "content", "contentJson", "category", "tags", "isPublished", "cloudSynced", "createdAt", "savedAt"} {
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
	set := func(key string, value any) error {
		encoded, err := json.Marshal(value)
		if err == nil {
			payload[key] = encoded
		}
		return err
	}
	_ = set("id", record.Key)
	_ = set("title", record.Title)
	_ = set("content", record.Content)
	_ = set("isPublished", record.IsPublished)
	_ = set("cloudSynced", record.CloudSynced)
	_ = set("savedAt", record.SavedAt)
	if record.ContentJSON != nil {
		payload["contentJson"] = json.RawMessage(*record.ContentJSON)
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
	if err := database.Save(&record).Error; err != nil {
		return fmt.Errorf("save local draft: %w", err)
	}
	return nil
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
