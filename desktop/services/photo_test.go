package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestPhotoDTOUnmarshalDominantColors(t *testing.T) {
	tests := []struct {
		name string
		body string
		want []string
	}{
		{
			name: "array",
			body: `{"id":"photo-1","dominantColors":["#112233","#abcdef"]}`,
			want: []string{"#112233", "#abcdef"},
		},
		{
			name: "encoded array",
			body: `{"id":"photo-1","dominantColors":"[\"#112233\",\"#abcdef\"]"}`,
			want: []string{"#112233", "#abcdef"},
		},
		{
			name: "null",
			body: `{"id":"photo-1","dominantColors":null}`,
			want: nil,
		},
		{
			name: "malformed optional value",
			body: `{"id":"photo-1","dominantColors":"not-json"}`,
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var photo PhotoDTO
			if err := json.Unmarshal([]byte(tt.body), &photo); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}
			if !reflect.DeepEqual(photo.DominantColors, tt.want) {
				t.Fatalf("DominantColors = %#v, want %#v", photo.DominantColors, tt.want)
			}
		})
	}
}

func TestPhotoServiceListForwardsFormats(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("formats"); got != "jpg,webp,avif" {
			t.Fatalf("formats query = %q, want %q", got, "jpg,webp,avif")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":[],"meta":{"total":0,"page":1,"pageSize":100,"totalPages":0,"hasMore":false}}`))
	}))
	defer server.Close()

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("test-token")
	service := NewPhotoService(proxy)

	_, err := service.List(ListPhotosParams{
		Formats:  []string{"jpg", "webp", "avif"},
		Page:     1,
		PageSize: 100,
	})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
}
