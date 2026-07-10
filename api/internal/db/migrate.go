package db

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func RunMigrations(databaseURL string) error {
	m, err := migrate.New("file://migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	// Handle dirty state from previous failed migration
	version, dirty, verErr := m.Version()
	if verErr != nil && !errors.Is(verErr, migrate.ErrNilVersion) {
		return fmt.Errorf("get version: %w", verErr)
	}
	if dirty {
		slog.Warn("dirty database detected, forcing clean state", "version", version)
		if err := m.Force(int(version) - 1); err != nil {
			return fmt.Errorf("force version: %w", err)
		}
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("run migrations: %w", err)
	}

	version, dirty, _ = m.Version()
	slog.Info("migrations applied", "version", version, "dirty", dirty)

	return nil
}

func RollbackLastMigration(databaseURL string) error {
	m, err := migrate.New("file://migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	version, dirty, err := m.Version()
	if err != nil && !errors.Is(err, migrate.ErrNilVersion) {
		return fmt.Errorf("get version: %w", err)
	}

	if dirty {
		slog.Warn("database is dirty, forcing version", "version", version)
		if err := m.Force(int(version) - 1); err != nil {
			return fmt.Errorf("force version: %w", err)
		}
		return nil
	}

	if err := m.Steps(-1); err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			slog.Info("no migrations to rollback")
			return nil
		}
		return fmt.Errorf("rollback: %w", err)
	}

	newVersion, _, _ := m.Version()
	slog.Info("migration rolled back", "from_version", version, "to_version", newVersion)

	return nil
}
