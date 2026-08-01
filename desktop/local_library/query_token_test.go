package local_library

import (
	"path/filepath"
	"testing"
)

func TestAssetQueryTokenUpdatesCompleteResultSet(t *testing.T) {
	manager, root := openTestManager(t)
	for _, name := range []string{"travel-one.jpg", "travel-two.jpg", "other.jpg"} {
		writeTestJPEG(t, filepath.Join(root, name))
		_ = indexTestFile(t, manager, root, name)
	}
	token, err := manager.CreateAssetQueryToken(AssetQuery{Search: "travel", Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if token.Total != 2 {
		t.Fatalf("total=%d", token.Total)
	}
	favorite := true
	if err := manager.BatchUpdateAssetOrganizationByQuery(token.Token, BatchAssetOrganizationUpdate{IsFavorite: &favorite}); err != nil {
		t.Fatal(err)
	}
	page, err := manager.ListAssets(AssetQuery{FavoritesOnly: true, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 2 {
		t.Fatalf("favorites=%d", len(page.Items))
	}
}

func TestAssetQueryTokenRejectsDifferentSession(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "one.jpg"))
	_ = indexTestFile(t, manager, root, "one.jpg")
	token, err := manager.CreateAssetQueryToken(AssetQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}
	second := t.TempDir()
	if _, err := manager.Create(second, "Second", true); err != nil {
		t.Fatal(err)
	}
	favorite := true
	if err := manager.BatchUpdateAssetOrganizationByQuery(token.Token, BatchAssetOrganizationUpdate{IsFavorite: &favorite}); err == nil {
		t.Fatal("expected stale token rejection")
	}
}
