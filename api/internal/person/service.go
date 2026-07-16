package person

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var identityDocumentPattern = regexp.MustCompile(`^[VEJGCP]\d{1,20}$`)

type Person struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	IdentityDocument string    `json:"identity_document"`
	TaxID            *string   `json:"tax_id"`
	WhatsAppPhone    string    `json:"whatsapp_phone"`
	FullAddress      string    `json:"full_address"`
	IsClient         bool      `json:"is_client"`
	CreatedAtUtc     time.Time `json:"created_at_utc"`
	UpdatedAtUtc     time.Time `json:"updated_at_utc"`
}

type LookupResult struct {
	Exists bool    `json:"exists"`
	Person *Person `json:"person,omitempty"`
}

type UpsertRequest struct {
	Name             string `json:"name"`
	IdentityDocument string `json:"identity_document"`
	TaxID            string `json:"tax_id"`
	WhatsAppPhone    string `json:"whatsapp_phone"`
	FullAddress      string `json:"full_address"`
}

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) LookupByDocument(ctx context.Context, userID *uuid.UUID, document string) (*LookupResult, error) {
	document = strings.ToUpper(strings.TrimSpace(document))
	if !identityDocumentPattern.MatchString(document) {
		return &LookupResult{Exists: false}, nil
	}

	if userID != nil {
		var p Person
		err := s.pool.QueryRow(ctx, `
			SELECT p.id, p.name, p.identity_document, p.tax_id, p.whatsapp_phone, p.full_address, p.is_client, p.created_at_utc, p.updated_at_utc
			FROM persons p
			JOIN users u ON u.person_id = p.id
			WHERE u.id = $1 AND p.identity_document = $2
		`, *userID, document).Scan(
			&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc,
		)
		if err == pgx.ErrNoRows {
			return &LookupResult{Exists: false}, nil
		}
		if err != nil {
			return nil, fmt.Errorf("get person: %w", err)
		}
		return &LookupResult{Exists: true, Person: &p}, nil
	}

	var p Person
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
		FROM persons
		WHERE identity_document = $1
	`, document).Scan(
		&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return &LookupResult{Exists: false}, nil
		}
		return nil, fmt.Errorf("lookup person: %w", err)
	}
	return &LookupResult{Exists: true, Person: &p}, nil
}

func (s *Service) GetByDocument(ctx context.Context, userID *uuid.UUID, document string) (*Person, error) {
	result, err := s.LookupByDocument(ctx, userID, document)
	if err != nil {
		return nil, err
	}
	if result.Person == nil {
		return nil, fmt.Errorf("PERSON_NOT_FOUND")
	}
	return result.Person, nil
}

func (s *Service) Upsert(ctx context.Context, req UpsertRequest, userID *uuid.UUID) (*Person, error) {
	if userID == nil || *userID == uuid.Nil {
		return nil, fmt.Errorf("AUTH_REQUIRED")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.IdentityDocument = strings.ToUpper(strings.TrimSpace(req.IdentityDocument))
	req.TaxID = strings.TrimSpace(req.TaxID)
	req.WhatsAppPhone = strings.TrimSpace(req.WhatsAppPhone)
	req.FullAddress = strings.TrimSpace(req.FullAddress)

	if err := validateUpsertRequest(req); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var currentPersonID *uuid.UUID
	if userID != nil {
		currentPersonID, err = s.getUserPersonID(ctx, tx, *userID)
		if err != nil {
			return nil, err
		}
	}

	existingPersonID, err := s.getPersonIDByDocument(ctx, tx, req.IdentityDocument)
	if err != nil {
		return nil, err
	}

	if currentPersonID != nil {
		if existingPersonID != nil && *existingPersonID != *currentPersonID {
			return nil, fmt.Errorf("PERSON_ALREADY_LINKED")
		}
		if existingPersonID == nil {
			existingPersonID = currentPersonID
		}

		p, err := s.updatePerson(ctx, tx, *currentPersonID, req)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit: %w", err)
		}
		return p, nil
	}

	if existingPersonID != nil {
		ownerID, err := s.getPersonOwner(ctx, tx, *existingPersonID)
		if err != nil {
			return nil, err
		}
		if userID == nil {
			return nil, fmt.Errorf("PERSON_EXISTS")
		}
		if ownerID != nil && *ownerID != *userID {
			return nil, fmt.Errorf("PERSON_ALREADY_LINKED")
		}

		p, err := s.updatePerson(ctx, tx, *existingPersonID, req)
		if err != nil {
			return nil, err
		}
		if userID != nil {
			if _, err := tx.Exec(ctx, `UPDATE users SET person_id = $2 WHERE id = $1`, *userID, p.ID); err != nil {
				return nil, fmt.Errorf("link person to user: %w", err)
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit: %w", err)
		}
		return p, nil
	}

	p, err := s.createPerson(ctx, tx, req)
	if err != nil {
		return nil, err
	}
	if userID != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET person_id = $2 WHERE id = $1`, *userID, p.ID); err != nil {
			return nil, fmt.Errorf("link person to user: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return p, nil
}

func (s *Service) getUserPersonID(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (*uuid.UUID, error) {
	var personID uuid.UUID
	var hasPerson bool
	err := tx.QueryRow(ctx, `
		SELECT person_id IS NOT NULL, COALESCE(person_id, '00000000-0000-0000-0000-000000000000'::uuid)
		FROM users
		WHERE id = $1
	`, userID).Scan(&hasPerson, &personID)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("USER_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get user person: %w", err)
	}
	if !hasPerson || personID == uuid.Nil {
		return nil, nil
	}
	return &personID, nil
}

func (s *Service) getPersonIDByDocument(ctx context.Context, tx pgx.Tx, document string) (*uuid.UUID, error) {
	var personID uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT id
		FROM persons
		WHERE identity_document = $1
	`, document).Scan(&personID)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get person by document: %w", err)
	}
	return &personID, nil
}

func (s *Service) getPersonOwner(ctx context.Context, tx pgx.Tx, personID uuid.UUID) (*uuid.UUID, error) {
	var ownerID uuid.UUID
	err := tx.QueryRow(ctx, `
		SELECT id
		FROM users
		WHERE person_id = $1
	`, personID).Scan(&ownerID)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get person owner: %w", err)
	}
	return &ownerID, nil
}

func (s *Service) updatePerson(ctx context.Context, tx pgx.Tx, personID uuid.UUID, req UpsertRequest) (*Person, error) {
	var p Person
	err := tx.QueryRow(ctx, `
		UPDATE persons
		SET name = $2,
			identity_document = $3,
			tax_id = NULLIF($4, ''),
			whatsapp_phone = $5,
			full_address = $6,
			is_client = true,
			updated_at_utc = now()
		WHERE id = $1
		RETURNING id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
	`, personID, req.Name, req.IdentityDocument, req.TaxID, req.WhatsAppPhone, req.FullAddress).Scan(
		&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("PERSON_NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update person: %w", err)
	}
	return &p, nil
}

func (s *Service) createPerson(ctx context.Context, tx pgx.Tx, req UpsertRequest) (*Person, error) {
	var p Person
	err := tx.QueryRow(ctx, `
		INSERT INTO persons (
			id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
		)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, true, now(), now())
		RETURNING id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
	`, uuid.New(), req.Name, req.IdentityDocument, req.TaxID, req.WhatsAppPhone, req.FullAddress).Scan(
		&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc,
	)
	if err != nil {
		return nil, fmt.Errorf("create person: %w", err)
	}
	return &p, nil
}

func (s *Service) CreateClient(ctx context.Context, req UpsertRequest) (*Person, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.IdentityDocument = strings.ToUpper(strings.TrimSpace(req.IdentityDocument))
	req.TaxID = strings.TrimSpace(req.TaxID)
	req.WhatsAppPhone = strings.TrimSpace(req.WhatsAppPhone)
	req.FullAddress = strings.TrimSpace(req.FullAddress)

	if err := validateUpsertRequest(req); err != nil {
		return nil, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	existingPersonID, err := s.getPersonIDByDocument(ctx, tx, req.IdentityDocument)
	if err != nil {
		return nil, err
	}

	if existingPersonID != nil {
		p, err := s.updatePerson(ctx, tx, *existingPersonID, req)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, fmt.Errorf("commit: %w", err)
		}
		return p, nil
	}

	p, err := s.createPerson(ctx, tx, req)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return p, nil
}

type ClientFilter struct {
	Limit  int
	Offset int
	Search *string
}

func (f ClientFilter) GetLimit() int {
	if f.Limit <= 0 {
		return 10
	}
	if f.Limit > 100 {
		return 100
	}
	return f.Limit
}

func (f ClientFilter) GetOffset() int {
	if f.Offset < 0 {
		return 0
	}
	return f.Offset
}

func (s *Service) ListClients(ctx context.Context, filter ClientFilter) ([]Person, int, error) {
	countQuery := `SELECT COUNT(*) FROM persons WHERE is_client = true`
	dataQuery := `
		SELECT id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
		FROM persons
		WHERE is_client = true
	`

	var args []interface{}
	argIdx := 1

	if filter.Search != nil && *filter.Search != "" {
		clause := fmt.Sprintf(` AND (name ILIKE '%%' || $%d || '%%' OR identity_document ILIKE '%%' || $%d || '%%' OR whatsapp_phone ILIKE '%%' || $%d || '%%')`, argIdx, argIdx, argIdx)
		countQuery += clause
		dataQuery += clause
		args = append(args, *filter.Search)
		argIdx++
	}

	var totalCount int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("count clients: %w", err)
	}

	dataQuery += ` ORDER BY created_at_utc DESC`
	dataQuery += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, filter.GetLimit(), filter.GetOffset())

	rows, err := s.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list clients: %w", err)
	}
	defer rows.Close()

	var persons []Person
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc); err != nil {
			return nil, 0, fmt.Errorf("scan client: %w", err)
		}
		persons = append(persons, p)
	}
	return persons, totalCount, nil
}

func (s *Service) GetClientByID(ctx context.Context, id uuid.UUID) (*Person, error) {
	var p Person
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
		FROM persons
		WHERE id = $1 AND is_client = true
	`, id).Scan(&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("get client: %w", err)
	}
	return &p, nil
}

func (s *Service) UpdateClient(ctx context.Context, id uuid.UUID, req UpsertRequest) (*Person, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.IdentityDocument = strings.ToUpper(strings.TrimSpace(req.IdentityDocument))
	req.TaxID = strings.TrimSpace(req.TaxID)
	req.WhatsAppPhone = strings.TrimSpace(req.WhatsAppPhone)
	req.FullAddress = strings.TrimSpace(req.FullAddress)

	if req.Name != "" && len(req.Name) > 200 {
		return nil, fmt.Errorf("name is too long")
	}
	if req.IdentityDocument != "" && !identityDocumentPattern.MatchString(req.IdentityDocument) {
		return nil, fmt.Errorf("invalid identity_document")
	}
	if req.WhatsAppPhone != "" && len(req.WhatsAppPhone) > 30 {
		return nil, fmt.Errorf("whatsapp_phone is too long")
	}
	if req.FullAddress != "" && len(req.FullAddress) > 500 {
		return nil, fmt.Errorf("full_address is too long")
	}
	if len(req.TaxID) > 50 {
		return nil, fmt.Errorf("tax_id is too long")
	}

	var p Person
	err := s.pool.QueryRow(ctx, `
		UPDATE persons SET
			name = COALESCE(NULLIF($2, ''), name),
			identity_document = COALESCE(NULLIF($3, ''), identity_document),
			tax_id = NULLIF($4, ''),
			whatsapp_phone = COALESCE(NULLIF($5, ''), whatsapp_phone),
			full_address = COALESCE(NULLIF($6, ''), full_address),
			updated_at_utc = now()
		WHERE id = $1 AND is_client = true
		RETURNING id, name, identity_document, tax_id, whatsapp_phone, full_address, is_client, created_at_utc, updated_at_utc
	`, id, req.Name, req.IdentityDocument, req.TaxID, req.WhatsAppPhone, req.FullAddress).Scan(
		&p.ID, &p.Name, &p.IdentityDocument, &p.TaxID, &p.WhatsAppPhone, &p.FullAddress, &p.IsClient, &p.CreatedAtUtc, &p.UpdatedAtUtc,
	)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("NOT_FOUND")
	}
	if err != nil {
		return nil, fmt.Errorf("update client: %w", err)
	}
	return &p, nil
}

func (s *Service) DeleteClient(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM persons WHERE id = $1 AND is_client = true`, id)
	if err != nil {
		return fmt.Errorf("delete client: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("NOT_FOUND")
	}
	return nil
}

func validateUpsertRequest(req UpsertRequest) error {
	if req.Name == "" {
		return fmt.Errorf("name is required")
	}
	if len(req.Name) > 200 {
		return fmt.Errorf("name is too long")
	}
	if !identityDocumentPattern.MatchString(req.IdentityDocument) {
		return fmt.Errorf("invalid identity_document")
	}
	if req.WhatsAppPhone == "" {
		return fmt.Errorf("whatsapp_phone is required")
	}
	if len(req.WhatsAppPhone) > 30 {
		return fmt.Errorf("whatsapp_phone is too long")
	}
	if req.FullAddress == "" {
		return fmt.Errorf("full_address is required")
	}
	if len(req.FullAddress) > 500 {
		return fmt.Errorf("full_address is too long")
	}
	if len(req.TaxID) > 50 {
		return fmt.Errorf("tax_id is too long")
	}
	return nil
}
