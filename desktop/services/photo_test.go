package services

import (
	"encoding/json"
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
