package pricing

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
)

const DefaultLimit = 10
const MaxLimit = 100

type ProductFilter struct {
	Limit      int
	Offset     int
	CategoryID *uuid.UUID
	Name       *string
	Sku        *string
	IsActive   *bool
	BranchID   *uuid.UUID
}

func (f ProductFilter) GetLimit() int {
	if f.Limit <= 0 {
		return DefaultLimit
	}
	if f.Limit > MaxLimit {
		return MaxLimit
	}
	return f.Limit
}

func (f ProductFilter) GetOffset() int {
	if f.Offset < 0 {
		return 0
	}
	return f.Offset
}

type BundleFilter struct {
	Limit      int
	Offset     int
	CategoryID *uuid.UUID
	Name       *string
	Code       *string
	Status     *string
	BranchID   *uuid.UUID
}

func (f BundleFilter) GetLimit() int {
	if f.Limit <= 0 {
		return DefaultLimit
	}
	if f.Limit > MaxLimit {
		return MaxLimit
	}
	return f.Limit
}

func (f BundleFilter) GetOffset() int {
	if f.Offset < 0 {
		return 0
	}
	return f.Offset
}

func ParseProductFilter(r *http.Request) ProductFilter {
	q := r.URL.Query()
	f := ProductFilter{}

	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Offset = n
		}
	}
	if v := q.Get("category_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.CategoryID = &id
		}
	}
	if v := q.Get("name"); v != "" {
		f.Name = &v
	}
	if v := q.Get("sku"); v != "" {
		f.Sku = &v
	}
	if v := q.Get("is_active"); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			f.IsActive = &b
		}
	}
	if v := q.Get("branch_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.BranchID = &id
		}
	}

	return f
}

func ParseBundleFilter(r *http.Request) BundleFilter {
	q := r.URL.Query()
	f := BundleFilter{}

	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			f.Offset = n
		}
	}
	if v := q.Get("category_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.CategoryID = &id
		}
	}
	if v := q.Get("name"); v != "" {
		f.Name = &v
	}
	if v := q.Get("code"); v != "" {
		f.Code = &v
	}
	if v := q.Get("status"); v != "" {
		f.Status = &v
	}
	if v := q.Get("branch_id"); v != "" {
		if id, err := uuid.Parse(v); err == nil {
			f.BranchID = &id
		}
	}

	return f
}
