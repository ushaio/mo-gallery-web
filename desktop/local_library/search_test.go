package local_library

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssetSearchIndexTracksSearchableMetadata(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "summer-memory.jpg"))
	id := indexTestFile(t, manager, root, "summer-memory.jpg")
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()

	assertSearchCount(t, manager, "summer", 1)
	if err := session.store.updateAssetMetadata(ctx, id, "旅行日志", "Final selects", 0, "", false); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "旅行日志", 1)
	assertSearchCount(t, manager, "Final sel", 1)

	tag, err := session.store.createTag(ctx, "Travel", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := session.store.setAssetTags(ctx, id, []string{tag.ID}); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Trav", 1)
	if _, err := session.store.updateTag(ctx, tag.ID, "Journey", ""); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Travel", 0)
	assertSearchCount(t, manager, "Journey", 1)
	if err := session.store.deleteTag(ctx, tag.ID); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Journey", 0)

	collection, err := session.store.createCollection(ctx, nil, "Trips", "")
	if err != nil {
		t.Fatal(err)
	}
	if err := session.store.setAssetCollections(ctx, id, []string{collection.ID}); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Trips", 1)
	if _, err := session.store.updateCollection(ctx, collection.ID, nil, "Favorites", "", 0); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Trips", 0)
	assertSearchCount(t, manager, "Favor", 1)
	if err := session.store.deleteCollection(ctx, collection.ID); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Favorites", 0)

	if _, err := session.store.db.Exec(`INSERT INTO exif_metadata(asset_id,camera_make,camera_model,lens_model) VALUES(?,?,?,?)`, id, "Nikon", "Z8", "Nikkor 50mm"); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Nikon Z8", 1)
	if _, err := session.store.db.Exec(`UPDATE exif_metadata SET camera_make='Canon',camera_model='R5' WHERE asset_id=?`, id); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Nikon", 0)
	assertSearchCount(t, manager, "Canon R5", 1)
	if _, err := session.store.db.Exec(`DELETE FROM exif_metadata WHERE asset_id=?`, id); err != nil {
		t.Fatal(err)
	}
	assertSearchCount(t, manager, "Canon", 0)

	if err := session.store.finishPermanentDelete(ctx, id); err != nil {
		t.Fatal(err)
	}
	var indexed int
	if err := session.store.db.QueryRow(`SELECT COUNT(*) FROM asset_search WHERE asset_id=?`, id).Scan(&indexed); err != nil {
		t.Fatal(err)
	}
	if indexed != 0 {
		t.Fatalf("deleted asset has %d search rows", indexed)
	}
}

func TestAssetSearchEscapesFTSSyntaxAndUsesVirtualTable(t *testing.T) {
	manager, root := openTestManager(t)
	writeTestJPEG(t, filepath.Join(root, "quoted-photo.jpg"))
	_ = indexTestFile(t, manager, root, "quoted-photo.jpg")

	for _, query := range []string{`quoted`, `quoted "photo`, `OR`, `NEAR(`, `file_name:quoted`, `*`} {
		if _, err := manager.ListAssets(AssetQuery{Search: query}); err != nil {
			t.Fatalf("search %q: %v", query, err)
		}
	}

	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	ftsQuery := buildAssetSearchQuery("quoted photo")
	rows, err := session.store.db.Query(`EXPLAIN QUERY PLAN SELECT a.id FROM assets a WHERE EXISTS (
        SELECT 1 FROM asset_search search WHERE search.asset_id=a.id AND asset_search MATCH ?
    )`, ftsQuery)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var details []string
	for rows.Next() {
		var id, parent, unused int
		var detail string
		if err := rows.Scan(&id, &parent, &unused, &detail); err != nil {
			t.Fatal(err)
		}
		details = append(details, detail)
	}
	plan := strings.ToLower(strings.Join(details, "\n"))
	if !strings.Contains(plan, "scan search virtual table index") {
		t.Fatalf("query plan does not use FTS virtual table:\n%s", plan)
	}
}

func TestStoreMigratesVersionFiveSearchIndex(t *testing.T) {
	root := createVersionFiveSearchTestDatabase(t)
	store, err := openStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	var version string
	if err := store.db.QueryRow(`SELECT value FROM library_meta WHERE key='schema_version'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != "6" {
		t.Fatalf("schema version=%q, want 6", version)
	}
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM asset_search WHERE asset_search MATCH ?`, buildAssetSearchQuery("Legacy Travel Nikon")).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("migrated search count=%d, want 1", count)
	}
}

func assertSearchCount(t *testing.T, manager *Manager, query string, want int) {
	t.Helper()
	page, err := manager.ListAssets(AssetQuery{Search: query})
	if err != nil {
		t.Fatalf("search %q: %v", query, err)
	}
	if len(page.Items) != want || page.Total != int64(want) {
		t.Fatalf("search %q items=%d total=%d, want %d", query, len(page.Items), page.Total, want)
	}
}

func createVersionFiveSearchTestDatabase(t *testing.T) string {
	t.Helper()
	root := createVersionTwoTestDatabase(t)
	store, err := openStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Exec(`DROP TRIGGER asset_search_assets_insert;
        DROP TRIGGER asset_search_assets_update;
        DROP TRIGGER asset_search_assets_delete;
        DROP TRIGGER asset_search_exif_insert;
        DROP TRIGGER asset_search_exif_update;
        DROP TRIGGER asset_search_exif_delete;
        DROP TRIGGER asset_search_asset_tags_insert;
        DROP TRIGGER asset_search_asset_tags_delete;
        DROP TRIGGER asset_search_tags_update;
        DROP TRIGGER asset_search_collection_assets_insert;
        DROP TRIGGER asset_search_collection_assets_delete;
        DROP TRIGGER asset_search_collections_update;
        DROP VIEW asset_search_source;
        DROP TABLE asset_search;
        UPDATE library_meta SET value='5' WHERE key='schema_version';
        INSERT INTO assets(id,relative_path,path_key,file_name,extension,format,mime_type,byte_size,modified_at_ns,availability,discovered_at,technical_updated_at)
            VALUES('legacy','legacy.jpg','legacy.jpg','legacy.jpg','.jpg','jpeg','image/jpeg',1,1,'active',1,1);
        INSERT INTO exif_metadata(asset_id,camera_make,camera_model,lens_model) VALUES('legacy','Nikon','Z8','');
        INSERT INTO tags(id,name,name_key,color,created_at) VALUES('legacy-tag','Travel','travel','',1);
        INSERT INTO asset_tags(asset_id,tag_id) VALUES('legacy','legacy-tag')`); err != nil {
		_ = store.Close()
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	return root
}
