package rbac

import (
	"context"
	"fmt"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	mu               sync.RWMutex
	profileResources map[uuid.UUID]map[string]struct{}
}

func NewStore() *Store {
	return &Store{
		profileResources: make(map[uuid.UUID]map[string]struct{}),
	}
}

func (s *Store) LoadFromDB(ctx context.Context, pool *pgxpool.Pool) error {
	return s.load(ctx, pool)
}

func (s *Store) ReloadAll(ctx context.Context, pool *pgxpool.Pool) error {
	return s.load(ctx, pool)
}

func (s *Store) HasPermission(profileID uuid.UUID, resourceCode string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	resources, ok := s.profileResources[profileID]
	if !ok {
		return false
	}
	_, found := resources[resourceCode]
	return found
}

func (s *Store) GetPermissions(profileID uuid.UUID) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	resources, ok := s.profileResources[profileID]
	if !ok {
		return nil
	}
	codes := make([]string, 0, len(resources))
	for code := range resources {
		codes = append(codes, code)
	}
	return codes
}

func (s *Store) load(ctx context.Context, pool *pgxpool.Pool) error {
	rows, err := pool.Query(ctx, `
		SELECT pra.profile_id, res.code
		FROM profile_role_assignments pra
		JOIN role_resources rr ON rr.role_id = pra.role_id
		JOIN resources res ON res.id = rr.resource_id
		WHERE pra.active = true
	`)
	if err != nil {
		return fmt.Errorf("query rbac: %w", err)
	}
	defer rows.Close()

	newMap := make(map[uuid.UUID]map[string]struct{})
	for rows.Next() {
		var profileID uuid.UUID
		var code string
		if err := rows.Scan(&profileID, &code); err != nil {
			return fmt.Errorf("scan rbac: %w", err)
		}
		if _, ok := newMap[profileID]; !ok {
			newMap[profileID] = make(map[string]struct{})
		}
		newMap[profileID][code] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows rbac: %w", err)
	}

	s.mu.Lock()
	s.profileResources = newMap
	s.mu.Unlock()
	return nil
}
