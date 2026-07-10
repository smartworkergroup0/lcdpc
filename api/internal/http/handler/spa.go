package handler

import (
	"io/fs"
	"net/http"
	"strings"
)

type SPAHandler struct {
	fs fs.FS
}

func NewSPAHandler(frontendFS fs.FS) *SPAHandler {
	return &SPAHandler{fs: frontendFS}
}

func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// Try to serve the file directly
	f, err := h.fs.Open(strings.TrimPrefix(path, "/"))
	if err != nil {
		// File not found -> serve index.html (SPA fallback)
		h.serveIndex(w, r)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		h.serveIndex(w, r)
		return
	}

	// If it's a directory, serve index.html
	if stat.IsDir() {
		h.serveIndex(w, r)
		return
	}

	http.FileServer(http.FS(h.fs)).ServeHTTP(w, r)
}

func (h *SPAHandler) serveIndex(w http.ResponseWriter, r *http.Request) {
	r.URL.Path = "/"
	http.FileServer(http.FS(h.fs)).ServeHTTP(w, r)
}
