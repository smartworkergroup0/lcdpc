package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/nfnt/resize"
	"golang.org/x/image/webp"
)

type StaticHandler struct {
	staticDir string
}

func NewStaticHandler(staticDir string) *StaticHandler {
	return &StaticHandler{staticDir: staticDir}
}

func (h *StaticHandler) ServeImage(w http.ResponseWriter, r *http.Request) {
	// Extract path after /static/
	reqPath := strings.TrimPrefix(r.URL.Path, "/static/")
	if reqPath == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(h.staticDir, filepath.Clean(reqPath))

	// Security: prevent directory traversal
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(h.staticDir)) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	info, err := os.Stat(filePath)
	if err != nil || info.IsDir() {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Parse resize query parameter
	widthStr := r.URL.Query().Get("w")
	heightStr := r.URL.Query().Get("h")

	// If resize requested, serve resized image
	if widthStr != "" || heightStr != "" {
		h.serveResized(w, r, filePath, widthStr, heightStr)
		return
	}

	// Set cache headers
	h.setCacheHeaders(w, filePath, info.ModTime())

	http.ServeFile(w, r, filePath)
}

func (h *StaticHandler) serveResized(w http.ResponseWriter, r *http.Request, filePath, widthStr, heightStr string) {
	var targetWidth, targetHeight uint

	if widthStr != "" {
		parsed, err := strconv.Atoi(widthStr)
		if err != nil || parsed <= 0 || parsed > 4096 {
			http.Error(w, "invalid width", http.StatusBadRequest)
			return
		}
		targetWidth = uint(parsed)
	}
	if heightStr != "" {
		parsed, err := strconv.Atoi(heightStr)
		if err != nil || parsed <= 0 || parsed > 4096 {
			http.Error(w, "invalid height", http.StatusBadRequest)
			return
		}
		targetHeight = uint(parsed)
	}

	// Check cache with resize params
	info, err := os.Stat(filePath)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	etag := h.generateETag(filePath, info.ModTime(), targetWidth, targetHeight)
	ifNoneMatch := r.Header.Get("If-None-Match")
	if ifNoneMatch == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(filePath))
	var img image.Image

	switch ext {
	case ".jpg", ".jpeg":
		img, err = jpeg.Decode(file)
	case ".png":
		img, err = png.Decode(file)
	case ".gif":
		img, err = gif.Decode(file)
	case ".webp":
		img, err = webp.Decode(file)
	default:
		http.Error(w, "unsupported format for resize", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "failed to decode image", http.StatusInternalServerError)
		return
	}

	resized := resize.Resize(targetWidth, targetHeight, img, resize.Lanczos3)

	w.Header().Set("Content-Type", h.getMimeType(ext))
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age=604800")
	w.Header().Set("Last-Modified", info.ModTime().UTC().Format(http.TimeFormat))

	switch ext {
	case ".jpg", ".jpeg":
		jpeg.Encode(w, resized, &jpeg.Options{Quality: 85})
	case ".png":
		png.Encode(w, resized)
	case ".gif":
		gif.Encode(w, resized, nil)
	}
}

func (h *StaticHandler) setCacheHeaders(w http.ResponseWriter, filePath string, modTime time.Time) {
	etag := h.generateETag(filePath, modTime, 0, 0)

	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", modTime.UTC().Format(http.TimeFormat))
}

func (h *StaticHandler) generateETag(filePath string, modTime time.Time, width, height uint) string {
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%d:%d", filePath, modTime.Unix(), width, height)))
	return `"` + hex.EncodeToString(hash[:8]) + `"`
}

func (h *StaticHandler) getMimeType(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}
