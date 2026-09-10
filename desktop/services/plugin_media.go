package services

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"mo-gallery-desktop/storage_plugins"
)

const pluginMediaPrefix = "/__plugin-media/"

// PluginMediaHandler serves photo bytes for storage-plugin sources whose
// object URLs are not fetchable by the WebView (Basic-Auth WebDAV endpoints
// such as 坚果云 or fnOS without a public reverse proxy). It fetches the
// object through the plugin runtime — which holds the credentials — and
// streams the bytes back. Objects are cached on disk so repeated thumbnail
// renders do not re-run the plugin.
type PluginMediaHandler struct {
	manager  *storage_plugins.Manager
	cacheDir string

	mu       sync.Mutex
	inflight map[string]*sync.WaitGroup
}

func NewPluginMediaHandler(manager *storage_plugins.Manager, cacheDir string) *PluginMediaHandler {
	return &PluginMediaHandler{manager: manager, cacheDir: cacheDir, inflight: make(map[string]*sync.WaitGroup)}
}

func (h *PluginMediaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Path shape: /__plugin-media/{sourceId}/{object key...}
	rest := strings.TrimPrefix(r.URL.Path, pluginMediaPrefix)
	slash := strings.Index(rest, "/")
	if slash <= 0 || slash == len(rest)-1 {
		http.NotFound(w, r)
		return
	}
	sourceID, key := rest[:slash], rest[slash+1:]
	if h.manager == nil || !validPluginMediaSegment(sourceID) || !validPluginMediaKey(key) {
		http.NotFound(w, r)
		return
	}
	pluginID := strings.TrimSpace(h.manager.PluginID(sourceID))
	if !validPluginMediaSegment(pluginID) {
		http.NotFound(w, r)
		return
	}

	cachePath := filepath.Join(h.cacheDir, "plugin-media", pluginID, sourceID, filepath.FromSlash(key))
	if err := h.ensure(r.Context(), pluginID, sourceID, key, cachePath); err != nil {
		http.Error(w, "plugin media unavailable", http.StatusNotFound)
		return
	}

	file, err := os.Open(cachePath)
	if err != nil {
		http.Error(w, "plugin media unavailable", http.StatusNotFound)
		return
	}
	defer file.Close()
	info, statErr := file.Stat()
	if statErr != nil || !info.Mode().IsRegular() {
		http.Error(w, "plugin media unavailable", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", contentTypeForName(key))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", info.Size()))
	// Cache-control lets the WebView keep thumbnails without re-asking the
	// plugin; a source config change changes the object key set anyway.
	w.Header().Set("Cache-Control", "private, max-age=86400")
	if r.Method == http.MethodHead {
		return
	}
	http.ServeContent(w, r, "", info.ModTime(), file)
}

// ensure makes cachePath exist, downloading through the plugin at most once
// per (source, key) across concurrent requests.
func (h *PluginMediaHandler) ensure(ctx context.Context, pluginID, sourceID, key, cachePath string) error {
	if _, err := os.Stat(cachePath); err == nil {
		return nil
	}

	cacheID := pluginID + "/" + sourceID + "/" + key
	group := h.groupFor(cacheID)
	if group != nil {
		group.Wait()
		if _, err := os.Stat(cachePath); err == nil {
			return nil
		}
		// The first attempt failed; let this request try again.
	}

	if err := os.MkdirAll(filepath.Dir(cachePath), 0o700); err != nil {
		h.releaseGroup(cacheID)
		return err
	}
	_, err := h.manager.Get(ctx, storage_plugins.GetRequest{
		SourceID:        sourceID,
		Key:             key,
		DestinationPath: cachePath,
	})
	h.releaseGroup(cacheID)
	return err
}

func validPluginMediaSegment(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && value != "." && value != ".." && !strings.ContainsAny(value, `/\\`)
}

func validPluginMediaKey(value string) bool {
	value = strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	cleaned := path.Clean(value)
	return value != "" && !strings.HasPrefix(value, "/") && cleaned == value && cleaned != "." && !strings.HasPrefix(cleaned, "../")
}

func (h *PluginMediaHandler) groupFor(id string) *sync.WaitGroup {
	h.mu.Lock()
	defer h.mu.Unlock()
	if existing, ok := h.inflight[id]; ok {
		return existing
	}
	group := &sync.WaitGroup{}
	group.Add(1)
	h.inflight[id] = group
	return nil
}

func (h *PluginMediaHandler) releaseGroup(id string) {
	h.mu.Lock()
	group := h.inflight[id]
	delete(h.inflight, id)
	h.mu.Unlock()
	if group != nil {
		group.Done()
	}
}

func contentTypeForName(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".avif":
		return "image/avif"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".heic", ".heif":
		return "image/heif"
	default:
		return "application/octet-stream"
	}
}
