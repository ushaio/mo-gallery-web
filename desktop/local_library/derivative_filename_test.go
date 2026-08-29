package local_library

import "testing"

// The orphan sweep matches files against recorded cache keys. Asset IDs are
// UUIDs containing hyphens, so the round trip has to survive the separator being
// ambiguous.
func TestParseDerivativeFileNameRoundTrip(t *testing.T) {
	id := AssetID(newID())
	cacheKey := derivativeCacheKey(id, 1717171717000000000, 4096, derivativeThumbnail)
	if len(cacheKey) != derivativeCacheKeyLength {
		t.Fatalf("cache key length = %d, want %d", len(cacheKey), derivativeCacheKeyLength)
	}

	parsedID, parsedKey, ok := parseDerivativeFileName(derivativeFileName(id, cacheKey))
	if !ok {
		t.Fatal("parseDerivativeFileName reported no match for a generated name")
	}
	if parsedID != id {
		t.Errorf("id = %q, want %q", parsedID, id)
	}
	if parsedKey != cacheKey {
		t.Errorf("cacheKey = %q, want %q", parsedKey, cacheKey)
	}
}

func TestParseDerivativeFileNameRejectsNonMatches(t *testing.T) {
	uuid := "1955803e-2db6-410e-9a1e-2ecbc9b72b6a"
	cases := map[string]string{
		"legacy name without cache key": uuid + ".jpg",
		"not a jpg":                     uuid + "-15b7e6bfe01a615ab10d4fb638b3bb07.png",
		"no separator":                  "thumbnail.jpg",
		"short cache key":               uuid + "-15b7e6bf.jpg",
		"non-hex cache key":             uuid + "-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.jpg",
	}
	for name, fileName := range cases {
		if _, _, ok := parseDerivativeFileName(fileName); ok {
			t.Errorf("%s: parseDerivativeFileName(%q) matched, want no match", name, fileName)
		}
	}
}

// A recorded, current file must be kept; a stale cache key must be sweepable.
func TestParseDerivativeFileNameSweepDecision(t *testing.T) {
	id := AssetID("1955803e-2db6-410e-9a1e-2ecbc9b72b6a")
	current := map[AssetID]string{id: "15b7e6bfe01a615ab10d4fb638b3bb07"}

	keep := derivativeFileName(id, "15b7e6bfe01a615ab10d4fb638b3bb07")
	parsedID, parsedKey, ok := parseDerivativeFileName(keep)
	if !ok || current[parsedID] != parsedKey {
		t.Errorf("current file %q would be swept (id=%q key=%q ok=%v)", keep, parsedID, parsedKey, ok)
	}

	stale := derivativeFileName(id, "c97d29ace5f7cade6d86bf430794a48c")
	parsedID, parsedKey, ok = parseDerivativeFileName(stale)
	if !ok {
		t.Fatalf("stale file %q did not parse", stale)
	}
	if current[parsedID] == parsedKey {
		t.Errorf("stale file %q would be kept", stale)
	}
}
