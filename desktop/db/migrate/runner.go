package migrate

import (
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"
)

// Migration is one forward-only schema/data migration for a local SQLite
// database. A migration must be safe to run inside a transaction and should
// be written so that it can tolerate a database created by an older desktop
// build without migration metadata.
type Migration struct {
	Version int
	Name    string
	Up      func(*gorm.DB) error
}

const migrationTable = "schema_migrations"

// Run applies all pending migrations in order. The migration history is kept
// in the database being migrated, so each local SQLite file has an independent
// version and can be upgraded lazily when the user opens it.
func Run(database *gorm.DB, migrations []Migration) error {
	if database == nil {
		return fmt.Errorf("database is nil")
	}
	if err := validate(migrations); err != nil {
		return err
	}

	if err := database.Exec(`CREATE TABLE IF NOT EXISTS "schema_migrations" (
		"version" INTEGER PRIMARY KEY,
		"name" TEXT NOT NULL,
		"appliedAt" INTEGER NOT NULL
	)`).Error; err != nil {
		return fmt.Errorf("create migration history: %w", err)
	}

	current, err := currentVersion(database)
	if err != nil {
		return err
	}
	if len(migrations) > 0 && current > migrations[len(migrations)-1].Version {
		return fmt.Errorf("database schema version %d is newer than supported version %d", current, migrations[len(migrations)-1].Version)
	}

	for _, migration := range migrations {
		if migration.Version <= current {
			continue
		}
		migration := migration
		if err := database.Transaction(func(tx *gorm.DB) error {
			if err := migration.Up(tx); err != nil {
				return fmt.Errorf("apply migration %03d_%s: %w", migration.Version, migration.Name, err)
			}
			if err := tx.Exec(
				`INSERT INTO "schema_migrations" ("version", "name", "appliedAt") VALUES (?, ?, ?)`,
				migration.Version, migration.Name, time.Now().UTC().UnixMilli(),
			).Error; err != nil {
				return fmt.Errorf("record migration %03d_%s: %w", migration.Version, migration.Name, err)
			}
			return nil
		}); err != nil {
			return err
		}
		current = migration.Version
	}

	return nil
}

func currentVersion(database *gorm.DB) (int, error) {
	var version int
	err := database.Raw(`SELECT COALESCE(MAX("version"), 0) FROM "schema_migrations"`).Scan(&version).Error
	if err != nil {
		return 0, fmt.Errorf("read migration version: %w", err)
	}
	return version, nil
}

func validate(migrations []Migration) error {
	if len(migrations) == 0 {
		return nil
	}
	copyOfMigrations := append([]Migration(nil), migrations...)
	sort.Slice(copyOfMigrations, func(i, j int) bool {
		return copyOfMigrations[i].Version < copyOfMigrations[j].Version
	})
	for index, migration := range copyOfMigrations {
		if migration.Version <= 0 {
			return fmt.Errorf("migration version must be positive: %d", migration.Version)
		}
		if migration.Name == "" {
			return fmt.Errorf("migration %d has empty name", migration.Version)
		}
		if migration.Up == nil {
			return fmt.Errorf("migration %d has nil Up function", migration.Version)
		}
		if index > 0 && copyOfMigrations[index-1].Version == migration.Version {
			return fmt.Errorf("duplicate migration version: %d", migration.Version)
		}
	}
	for index := range migrations {
		if index > 0 && migrations[index-1].Version >= migrations[index].Version {
			return fmt.Errorf("migrations must be ordered by increasing version")
		}
	}
	return nil
}
