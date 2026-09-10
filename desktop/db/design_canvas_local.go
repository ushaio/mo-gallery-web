package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"

	"mo-gallery-desktop/db/migrate"
)

const localDesignCanvasFileName = "design-canvas.db"

var DesignCanvasDB *gorm.DB

type DesignCanvasProjectRecord struct {
	ID          string `gorm:"column:id;type:text;primaryKey"`
	ProjectJSON string `gorm:"column:projectJson;type:text;not null"`
	CreatedAt   int64  `gorm:"column:createdAt;not null"`
	UpdatedAt   int64  `gorm:"column:updatedAt;not null;index"`
}

func (DesignCanvasProjectRecord) TableName() string { return "DesignCanvasProject" }

type DesignCanvasAssetRecord struct {
	ID       string `gorm:"column:id;type:text;primaryKey"`
	MimeType string `gorm:"column:mimeType;type:text;not null"`
	Data     []byte `gorm:"column:data;type:blob;not null"`
}

func (DesignCanvasAssetRecord) TableName() string { return "DesignCanvasAsset" }

type designCanvasProjectMetadata struct {
	ID        string `json:"id"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

func ConnectLocalDesignCanvas(configDir string) error {
	if err := ensureDBDir(configDir); err != nil {
		return fmt.Errorf("create local design canvas database directory: %w", err)
	}
	database, err := openLocalDesignCanvas(localDBPath(configDir, localDesignCanvasFileName))
	if err != nil {
		return err
	}
	DesignCanvasDB = database
	return nil
}

func openLocalDesignCanvas(path string) (*gorm.DB, error) {
	dsn := "file:" + filepath.ToSlash(path)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open local design canvas database connection: %w", err)
	}
	database, err := gorm.Open(sqlite.Dialector{DriverName: "sqlite", DSN: dsn, Conn: sqlDB}, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn), DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("open local design canvas database: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	for _, statement := range []string{"PRAGMA journal_mode = WAL", "PRAGMA synchronous = FULL", "PRAGMA busy_timeout = 5000"} {
		if err := database.Exec(statement).Error; err != nil {
			_ = sqlDB.Close()
			return nil, fmt.Errorf("configure local design canvas database: %w", err)
		}
	}
	if err := migrate.Run(database, []migrate.Migration{{
		Version: 1,
		Name:    "baseline",
		Up: func(tx *gorm.DB) error {
			if err := tx.AutoMigrate(&DesignCanvasProjectRecord{}, &DesignCanvasAssetRecord{}); err != nil {
				return err
			}
			return tx.Exec(`CREATE INDEX IF NOT EXISTS "idx_DesignCanvasProject_updatedAt" ON "DesignCanvasProject" ("updatedAt")`).Error
		},
	}}); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("migrate local design canvas database: %w", err)
	}
	return database, nil
}

func CloseLocalDesignCanvas() {
	if DesignCanvasDB == nil {
		return
	}
	if sqlDB, err := DesignCanvasDB.DB(); err == nil {
		_ = sqlDB.Close()
	}
	DesignCanvasDB = nil
}

func requireDesignCanvasDB() (*gorm.DB, error) {
	if DesignCanvasDB == nil {
		return nil, errors.New("local design canvas database is not initialized")
	}
	return DesignCanvasDB, nil
}

func parseDesignCanvasProject(projectJSON string) (DesignCanvasProjectRecord, error) {
	if !json.Valid([]byte(projectJSON)) {
		return DesignCanvasProjectRecord{}, errors.New("invalid design canvas project JSON")
	}
	var metadata designCanvasProjectMetadata
	if err := json.Unmarshal([]byte(projectJSON), &metadata); err != nil {
		return DesignCanvasProjectRecord{}, fmt.Errorf("decode design canvas project metadata: %w", err)
	}
	metadata.ID = strings.TrimSpace(metadata.ID)
	if metadata.ID == "" || metadata.CreatedAt <= 0 || metadata.UpdatedAt <= 0 {
		return DesignCanvasProjectRecord{}, errors.New("design canvas project ID and timestamps are required")
	}
	return DesignCanvasProjectRecord{ID: metadata.ID, ProjectJSON: projectJSON, CreatedAt: metadata.CreatedAt, UpdatedAt: metadata.UpdatedAt}, nil
}

func ListLocalDesignCanvasProjects() ([]string, error) {
	database, err := requireDesignCanvasDB()
	if err != nil {
		return nil, err
	}
	var records []DesignCanvasProjectRecord
	if err := database.Order("updatedAt DESC").Find(&records).Error; err != nil {
		return nil, fmt.Errorf("list design canvas projects: %w", err)
	}
	projects := make([]string, len(records))
	for index, record := range records {
		projects[index] = record.ProjectJSON
	}
	return projects, nil
}

func GetLocalDesignCanvasProject(id string) (string, error) {
	database, err := requireDesignCanvasDB()
	if err != nil {
		return "", err
	}
	var record DesignCanvasProjectRecord
	err = database.First(&record, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("get design canvas project: %w", err)
	}
	return record.ProjectJSON, nil
}

func SaveLocalDesignCanvasProject(projectJSON string) error {
	database, err := requireDesignCanvasDB()
	if err != nil {
		return err
	}
	record, err := parseDesignCanvasProject(projectJSON)
	if err != nil {
		return err
	}
	if err := database.Save(&record).Error; err != nil {
		return fmt.Errorf("save design canvas project: %w", err)
	}
	return nil
}

func DeleteLocalDesignCanvasProject(id string) error {
	database, err := requireDesignCanvasDB()
	if err != nil {
		return err
	}
	if err := database.Delete(&DesignCanvasProjectRecord{}, "id = ?", strings.TrimSpace(id)).Error; err != nil {
		return fmt.Errorf("delete design canvas project: %w", err)
	}
	return nil
}

func GetLocalDesignCanvasAsset(id string) (*DesignCanvasAssetRecord, error) {
	database, err := requireDesignCanvasDB()
	if err != nil {
		return nil, err
	}
	var record DesignCanvasAssetRecord
	err = database.First(&record, "id = ?", strings.TrimSpace(id)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get design canvas asset: %w", err)
	}
	return &record, nil
}

func SaveLocalDesignCanvasAsset(id, mimeType string, data []byte) error {
	database, err := requireDesignCanvasDB()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	mimeType = strings.TrimSpace(mimeType)
	if id == "" || mimeType == "" || len(data) == 0 {
		return errors.New("design canvas asset ID, MIME type, and data are required")
	}
	if err := database.Save(&DesignCanvasAssetRecord{ID: id, MimeType: mimeType, Data: data}).Error; err != nil {
		return fmt.Errorf("save design canvas asset: %w", err)
	}
	return nil
}
