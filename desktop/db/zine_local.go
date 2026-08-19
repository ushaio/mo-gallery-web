package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"

	"mo-gallery-desktop/db/migrate"
)

const localZineFileName = "zine.db"

var ZineDB *gorm.DB

type ZineProjectRecord struct {
	ID          string `gorm:"column:id;type:text;primaryKey"`
	ProjectJSON string `gorm:"column:projectJson;type:text;not null"`
	CreatedAt   int64  `gorm:"column:createdAt;not null"`
	UpdatedAt   int64  `gorm:"column:updatedAt;not null;index"`
}

func (ZineProjectRecord) TableName() string { return "ZineProject" }

type ZineAssetRecord struct {
	ID       string `gorm:"column:id;type:text;primaryKey"`
	MimeType string `gorm:"column:mimeType;type:text;not null"`
	Data     []byte `gorm:"column:data;type:blob;not null"`
}

func (ZineAssetRecord) TableName() string { return "ZineAsset" }

type zineProjectMetadata struct {
	ID        string `json:"id"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

func LocalZinePath(configDir string) string {
	return filepath.Join(configDir, localZineFileName)
}

func ConnectLocalZine(configDir string) error {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return fmt.Errorf("create local Zine database directory: %w", err)
	}

	database, err := OpenLocalZine(LocalZinePath(configDir))
	if err != nil {
		return err
	}
	ZineDB = database
	return nil
}

func OpenLocalZine(path string) (*gorm.DB, error) {
	dsn := "file:" + filepath.ToSlash(path)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open local Zine database connection: %w", err)
	}

	database, err := gorm.Open(sqlite.Dialector{
		DriverName: "sqlite",
		DSN:        dsn,
		Conn:       sqlDB,
	}, &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Warn),
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("open local Zine database: %w", err)
	}

	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	for _, statement := range []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = FULL",
		"PRAGMA busy_timeout = 5000",
	} {
		if err := database.Exec(statement).Error; err != nil {
			_ = sqlDB.Close()
			return nil, fmt.Errorf("configure local Zine database: %w", err)
		}
	}

	if err := migrate.Run(database, localZineMigrations()); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("migrate local Zine database: %w", err)
	}

	return database, nil
}

func localZineMigrations() []migrate.Migration {
	return []migrate.Migration{
		{
			Version: 1,
			Name:    "baseline",
			Up: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&ZineProjectRecord{}, &ZineAssetRecord{}); err != nil {
					return err
				}
				return tx.Exec(`CREATE INDEX IF NOT EXISTS "idx_ZineProject_updatedAt" ON "ZineProject" ("updatedAt")`).Error
			},
		},
	}
}

func CloseLocalZine() {
	if ZineDB == nil {
		return
	}
	sqlDB, err := ZineDB.DB()
	if err == nil {
		_ = sqlDB.Close()
	}
	ZineDB = nil
}

func requireZineDB() (*gorm.DB, error) {
	if ZineDB == nil {
		return nil, errors.New("local Zine database is not initialized")
	}
	return ZineDB, nil
}

func parseZineProject(projectJSON string) (ZineProjectRecord, error) {
	if !json.Valid([]byte(projectJSON)) {
		return ZineProjectRecord{}, errors.New("invalid Zine project JSON")
	}

	var metadata zineProjectMetadata
	if err := json.Unmarshal([]byte(projectJSON), &metadata); err != nil {
		return ZineProjectRecord{}, fmt.Errorf("decode Zine project metadata: %w", err)
	}
	metadata.ID = strings.TrimSpace(metadata.ID)
	if metadata.ID == "" {
		return ZineProjectRecord{}, errors.New("Zine project ID is required")
	}
	if metadata.CreatedAt <= 0 || metadata.UpdatedAt <= 0 {
		return ZineProjectRecord{}, errors.New("Zine project timestamps are required")
	}

	return ZineProjectRecord{
		ID:          metadata.ID,
		ProjectJSON: projectJSON,
		CreatedAt:   metadata.CreatedAt,
		UpdatedAt:   metadata.UpdatedAt,
	}, nil
}

func ListLocalZineProjects() ([]string, error) {
	database, err := requireZineDB()
	if err != nil {
		return nil, err
	}

	var records []ZineProjectRecord
	if err := database.Order("updatedAt DESC").Find(&records).Error; err != nil {
		return nil, fmt.Errorf("list Zine projects: %w", err)
	}

	projects := make([]string, len(records))
	for index, record := range records {
		projects[index] = record.ProjectJSON
	}
	return projects, nil
}

func GetLocalZineProject(id string) (string, error) {
	database, err := requireZineDB()
	if err != nil {
		return "", err
	}

	var record ZineProjectRecord
	err = database.First(&record, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get Zine project: %w", err)
	}
	return record.ProjectJSON, nil
}

func SaveLocalZineProject(projectJSON string) error {
	database, err := requireZineDB()
	if err != nil {
		return err
	}
	record, err := parseZineProject(projectJSON)
	if err != nil {
		return err
	}
	if err := database.Save(&record).Error; err != nil {
		return fmt.Errorf("save Zine project: %w", err)
	}
	return nil
}

func DeleteLocalZineProject(id string) error {
	database, err := requireZineDB()
	if err != nil {
		return err
	}
	if err := database.Delete(&ZineProjectRecord{}, "id = ?", strings.TrimSpace(id)).Error; err != nil {
		return fmt.Errorf("delete Zine project: %w", err)
	}
	return nil
}

func GetLocalZineAsset(id string) (*ZineAssetRecord, error) {
	database, err := requireZineDB()
	if err != nil {
		return nil, err
	}

	var record ZineAssetRecord
	err = database.First(&record, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get Zine asset: %w", err)
	}
	return &record, nil
}

func SaveLocalZineAsset(id, mimeType string, data []byte) error {
	database, err := requireZineDB()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	mimeType = strings.TrimSpace(mimeType)
	if id == "" || mimeType == "" || len(data) == 0 {
		return errors.New("Zine asset ID, MIME type, and data are required")
	}

	record := ZineAssetRecord{ID: id, MimeType: mimeType, Data: data}
	if err := database.Save(&record).Error; err != nil {
		return fmt.Errorf("save Zine asset: %w", err)
	}
	return nil
}
