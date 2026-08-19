package migrate

import (
	"database/sql"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"
)

func openTestDatabase(t *testing.T, name string) *gorm.DB {
	t.Helper()
	dsn := "file:" + name + "?mode=memory&cache=shared"
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	database, err := gorm.Open(sqlite.Dialector{DriverName: "sqlite", DSN: dsn, Conn: sqlDB}, &gorm.Config{})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return database
}

func TestRunAppliesMigrationsInOrderAndIsIdempotent(t *testing.T) {
	database := openTestDatabase(t, "migrate-test")

	var calls []int
	migrations := []Migration{
		{Version: 1, Name: "create", Up: func(tx *gorm.DB) error {
			calls = append(calls, 1)
			return tx.Exec(`CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`).Error
		}},
		{Version: 2, Name: "seed", Up: func(tx *gorm.DB) error {
			calls = append(calls, 2)
			return tx.Exec(`INSERT INTO records (id, value) VALUES (1, 'ok')`).Error
		}},
	}

	if err := Run(database, migrations); err != nil {
		t.Fatal(err)
	}
	if err := Run(database, migrations); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 2 || calls[0] != 1 || calls[1] != 2 {
		t.Fatalf("migration calls = %v, want [1 2]", calls)
	}

	var count int
	if err := database.Raw(`SELECT COUNT(*) FROM records`).Scan(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("record count = %d, want 1", count)
	}
}

func TestRunRollsBackFailedMigration(t *testing.T) {
	database := openTestDatabase(t, "migrate-rollback")

	err := Run(database, []Migration{{Version: 1, Name: "failed", Up: func(tx *gorm.DB) error {
		if err := tx.Exec(`CREATE TABLE should_rollback (id INTEGER)`).Error; err != nil {
			return err
		}
		return gorm.ErrInvalidData
	}}})
	if err == nil {
		t.Fatal("Run() error = nil, want failure")
	}

	if database.Migrator().HasTable("should_rollback") {
		t.Fatal("failed migration table still exists")
	}
	var count int
	if err := database.Raw(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("migration history count = %d, want 0", count)
	}
}
