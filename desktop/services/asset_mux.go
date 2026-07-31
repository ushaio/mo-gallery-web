package services

import "net/http"

func NewDesktopAssetHandler(zine http.Handler, local http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/__zine/cjk-font" || r.URL.Path == "/__zine/image":
			zine.ServeHTTP(w, r)
		case len(r.URL.Path) >= len("/__local-library/") && r.URL.Path[:len("/__local-library/")] == "/__local-library/":
			local.ServeHTTP(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}
