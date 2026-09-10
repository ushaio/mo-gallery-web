package services

import (
	"net/http"
	"strings"
)

// NewDesktopAssetMiddleware intercepts media URLs that must be resolved by a
// desktop storage plugin before Wails' default asset handler gets a chance to
// fall back to the Vite dev server or the embedded frontend. Wails invokes the
// asset middleware for both embedded and development asset-server requests.
func NewDesktopAssetMiddleware(pluginMedia http.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if pluginMedia != nil && strings.HasPrefix(r.URL.Path, pluginMediaPrefix) {
				pluginMedia.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func NewDesktopAssetHandler(zine http.Handler, local http.Handler, pluginMedia http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/__zine/cjk-font" || r.URL.Path == "/__zine/font-info" || r.URL.Path == "/__zine/font" || r.URL.Path == "/__zine/image":
			zine.ServeHTTP(w, r)
		case len(r.URL.Path) >= len("/__local-library/") && r.URL.Path[:len("/__local-library/")] == "/__local-library/":
			local.ServeHTTP(w, r)
		case len(r.URL.Path) >= len(pluginMediaPrefix) && r.URL.Path[:len(pluginMediaPrefix)] == pluginMediaPrefix:
			pluginMedia.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}
