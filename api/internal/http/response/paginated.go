package response

import (
	"encoding/json"
	"net/http"
)

type PaginatedData struct {
	Items      interface{} `json:"items"`
	TotalCount int         `json:"total_count"`
	Limit      int         `json:"limit"`
	Offset     int         `json:"offset"`
}

func Paginated(w http.ResponseWriter, items interface{}, totalCount, limit, offset int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(JSend{
		Status: "success",
		Data: PaginatedData{
			Items:      items,
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
		},
	})
}
