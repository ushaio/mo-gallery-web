package services

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOverviewServiceUsesWebAPI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/admin/overview" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer desktop-token" {
			t.Fatalf("unexpected authorization header: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"photoCount":7,"digitalCount":5,"filmCount":2,"recentPhotos":[],"recentStories":[],"recentBlogs":[]}}`))
	}))
	defer server.Close()

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("desktop-token")

	result, err := NewOverviewService(proxy).GetOverview()
	if err != nil {
		t.Fatalf("get overview: %v", err)
	}
	if result.PhotoCount != 7 || result.DigitalCount != 5 || result.FilmCount != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestOverviewServiceRequiresAuthenticatedProxy(t *testing.T) {
	if _, err := NewOverviewService(NewProxyClient()).GetOverview(); err == nil {
		t.Fatal("expected unauthenticated proxy error")
	}
}
