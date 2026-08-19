package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"

	"mo-gallery-desktop/db/migrate"
)

const localAIFileName = "editor-ai.db"

// AiDB stores desktop editor conversations independently from the configured
// PostgreSQL database. Zine and the standalone AI assistant share these tables
// and separate their histories with AiConversation.ScopeID.
var AiDB *gorm.DB

func LocalAIPath(configDir string) string {
	return filepath.Join(configDir, localAIFileName)
}

func ConnectLocalAI(configDir string) error {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return fmt.Errorf("create local AI database directory: %w", err)
	}

	database, err := OpenLocalAI(LocalAIPath(configDir))
	if err != nil {
		return err
	}
	AiDB = database
	return nil
}

// OpenLocalAI opens and migrates an editor AI SQLite file without replacing
// the process-wide connection. Tests use it to exercise the production schema.
func OpenLocalAI(path string) (*gorm.DB, error) {
	dsn := "file:" + filepath.ToSlash(path)
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open local AI database connection: %w", err)
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
		return nil, fmt.Errorf("open local AI database: %w", err)
	}

	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	for _, statement := range []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA busy_timeout = 5000",
	} {
		if err := database.Exec(statement).Error; err != nil {
			_ = sqlDB.Close()
			return nil, fmt.Errorf("configure local AI database: %w", err)
		}
	}

	if err := migrate.Run(database, localAIMigrations()); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("migrate local AI database: %w", err)
	}

	return database, nil
}

func localAIMigrations() []migrate.Migration {
	return []migrate.Migration{
		{
			Version: 1,
			Name:    "baseline",
			Up: func(tx *gorm.DB) error {
				if err := tx.AutoMigrate(&AiConversation{}, &AiMessage{}); err != nil {
					return err
				}
				for _, statement := range []string{
					`CREATE INDEX IF NOT EXISTS "idx_ai_conversation_scope_updated" ON "AiConversation" ("scopeId", "updatedAt")`,
					`CREATE INDEX IF NOT EXISTS "idx_ai_conversation_updated" ON "AiConversation" ("updatedAt")`,
					`CREATE INDEX IF NOT EXISTS "idx_ai_message_conversation_created" ON "AiMessage" ("conversationId", "createdAt")`,
					`CREATE INDEX IF NOT EXISTS "idx_ai_message_status" ON "AiMessage" ("status")`,
				} {
					if err := tx.Exec(statement).Error; err != nil {
						return err
					}
				}
				return nil
			},
		},
	}
}

func CloseLocalAI() {
	if AiDB == nil {
		return
	}
	sqlDB, err := AiDB.DB()
	if err == nil {
		_ = sqlDB.Close()
	}
	AiDB = nil
}
