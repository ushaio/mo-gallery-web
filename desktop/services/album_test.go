package services

import (
	"encoding/json"
	"testing"
)

func TestCreateAlbumParamsOmitsEmptyCoverURL(t *testing.T) {
	payload, err := json.Marshal(CreateAlbumParams{
		Name:        "New album",
		IsPublished: false,
		SortOrder:   0,
	})
	if err != nil {
		t.Fatalf("marshal CreateAlbumParams: %v", err)
	}

	var body map[string]any
	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatalf("unmarshal request payload: %v", err)
	}

	if _, exists := body["coverUrl"]; exists {
		t.Fatalf("empty coverUrl must be omitted, got payload %s", payload)
	}
	if _, exists := body["location"]; exists {
		t.Fatalf("empty location must be omitted, got payload %s", payload)
	}
}

func TestUpdateAlbumParamsKeepsEmptyLocationForClearing(t *testing.T) {
	emptyLocation := ""
	payload, err := json.Marshal(UpdateAlbumParams{Location: &emptyLocation})
	if err != nil {
		t.Fatalf("marshal UpdateAlbumParams: %v", err)
	}

	var body map[string]any
	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatalf("unmarshal request payload: %v", err)
	}

	location, exists := body["location"]
	if !exists || location != "" {
		t.Fatalf("empty location must be preserved for clearing, got payload %s", payload)
	}
}
