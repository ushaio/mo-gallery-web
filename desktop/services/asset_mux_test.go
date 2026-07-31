package services

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDesktopAssetHandlerRoutesZineAndLocalLibrary(t *testing.T) {
	zine := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Handler", "zine")
		w.WriteHeader(http.StatusNoContent)
	})
	local := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Handler", "local")
		w.WriteHeader(http.StatusNoContent)
	})
	handler := NewDesktopAssetHandler(zine, local)

	cases := []struct {
		path    string
		status  int
		handler string
	}{
		{path: "/__zine/cjk-font", status: http.StatusNoContent, handler: "zine"},
		{path: "/__zine/image?src=https://example.test/image.jpg", status: http.StatusNoContent, handler: "zine"},
		{path: "/__local-library/original/asset", status: http.StatusNoContent, handler: "local"},
		{path: "/__zine/unknown", status: http.StatusNotFound},
		{path: "/__local-library", status: http.StatusNotFound},
		{path: "/unknown", status: http.StatusNotFound},
	}
	for _, testCase := range cases {
		t.Run(testCase.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, testCase.path, nil))
			if response.Code != testCase.status {
				t.Fatalf("status=%d, want %d", response.Code, testCase.status)
			}
			if got := response.Header().Get("X-Handler"); got != testCase.handler {
				t.Fatalf("handler=%q, want %q", got, testCase.handler)
			}
		})
	}
}
