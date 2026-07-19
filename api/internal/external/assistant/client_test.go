package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListLeads(t *testing.T) {
	mockResp := listResponse[Lead]{
		Count: 1,
		Results: []Lead{
			{
				ID:        "lead-1",
				FirstName: "Juan",
				LastName:  "Perez",
				Phone:     "+584121234567",
				Email:     "juan@email.com",
				Status:    "nuevo",
				Score:     75,
			},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/external/v1/auth/token/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(authResponse{Access: "test-token-123"})
	})
	mux.HandleFunc("/api/external/v1/leads/", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token-123" {
			t.Errorf("expected Bearer token, got %s", r.Header.Get("Authorization"))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := NewClient(server.URL+"/api", "user", "pass")
	leads, total, err := client.ListLeads(context.Background(), ListFilter{Limit: 10})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 1 {
		t.Errorf("expected total 1, got %d", total)
	}
	if len(leads) != 1 {
		t.Fatalf("expected 1 lead, got %d", len(leads))
	}
	if leads[0].FirstName != "Juan" {
		t.Errorf("expected FirstName Juan, got %s", leads[0].FirstName)
	}
}

func TestListOrders(t *testing.T) {
	mockResp := listResponse[Order]{
		Count: 1,
		Results: []Order{
			{
				ID:           "order-1",
				CustomerName: "Juan Perez",
				Status:       "PENDIENTE",
			},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/external/v1/auth/token/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(authResponse{Access: "test-token-456"})
	})
	mux.HandleFunc("/api/external/v1/orders/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResp)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := NewClient(server.URL+"/api", "user", "pass")
	orders, total, err := client.ListOrders(context.Background(), ListFilter{Limit: 10})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if total != 1 {
		t.Errorf("expected total 1, got %d", total)
	}
	if len(orders) != 1 {
		t.Fatalf("expected 1 order, got %d", len(orders))
	}
	if orders[0].Status != "PENDIENTE" {
		t.Errorf("expected status PENDIENTE, got %s", orders[0].Status)
	}
}

func TestTokenCaching(t *testing.T) {
	authCalls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/api/external/v1/auth/token/", func(w http.ResponseWriter, r *http.Request) {
		authCalls++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(authResponse{Access: "cached-token"})
	})
	mux.HandleFunc("/api/external/v1/leads/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(listResponse[Lead]{Count: 0, Results: []Lead{}})
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	client := NewClient(server.URL+"/api", "user", "pass")

	client.ListLeads(context.Background(), ListFilter{})
	client.ListLeads(context.Background(), ListFilter{})
	client.ListLeads(context.Background(), ListFilter{})

	if authCalls != 1 {
		t.Errorf("expected 1 auth call (cached), got %d", authCalls)
	}
}
