package db

import (
	"bytes"
	"os"
	"testing"
)

func TestLocalZinePersistsProjectsAndAssetsAcrossReconnect(t *testing.T) {
	CloseLocalZine()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalZine)

	if err := ConnectLocalZine(configDir); err != nil {
		t.Fatalf("ConnectLocalZine() error = %v", err)
	}
	projectJSON := `{"id":"project-1","title":"Draft","createdAt":100,"updatedAt":200}`
	if err := SaveLocalZineProject(projectJSON); err != nil {
		t.Fatalf("save project: %v", err)
	}
	assetData := []byte("image-data")
	if err := SaveLocalZineAsset("asset-1", "image/jpeg", assetData); err != nil {
		t.Fatalf("save asset: %v", err)
	}

	CloseLocalZine()
	if err := ConnectLocalZine(configDir); err != nil {
		t.Fatalf("reconnect local Zine database: %v", err)
	}

	loadedProject, err := GetLocalZineProject("project-1")
	if err != nil || loadedProject != projectJSON {
		t.Fatalf("loaded project = %q, err = %v", loadedProject, err)
	}
	projects, err := ListLocalZineProjects()
	if err != nil || len(projects) != 1 || projects[0] != projectJSON {
		t.Fatalf("listed projects = %#v, err = %v", projects, err)
	}
	loadedAsset, err := GetLocalZineAsset("asset-1")
	if err != nil || loadedAsset == nil {
		t.Fatalf("loaded asset = %#v, err = %v", loadedAsset, err)
	}
	if loadedAsset.MimeType != "image/jpeg" || !bytes.Equal(loadedAsset.Data, assetData) {
		t.Fatalf("loaded asset content = %#v", loadedAsset)
	}
	if _, err := os.Stat(LocalZinePath(configDir)); err != nil {
		t.Fatalf("local Zine database not created: %v", err)
	}
}

func TestLocalZineProjectUpsertAndDelete(t *testing.T) {
	CloseLocalZine()
	configDir := t.TempDir()
	t.Cleanup(CloseLocalZine)
	if err := ConnectLocalZine(configDir); err != nil {
		t.Fatalf("ConnectLocalZine() error = %v", err)
	}

	if err := SaveLocalZineProject(`{"id":"project-1","createdAt":100,"updatedAt":200}`); err != nil {
		t.Fatalf("save initial project: %v", err)
	}
	updated := `{"id":"project-1","createdAt":100,"updatedAt":300,"title":"Updated"}`
	if err := SaveLocalZineProject(updated); err != nil {
		t.Fatalf("update project: %v", err)
	}
	loaded, err := GetLocalZineProject("project-1")
	if err != nil || loaded != updated {
		t.Fatalf("loaded updated project = %q, err = %v", loaded, err)
	}

	if err := DeleteLocalZineProject("project-1"); err != nil {
		t.Fatalf("delete project: %v", err)
	}
	loaded, err = GetLocalZineProject("project-1")
	if err != nil || loaded != "" {
		t.Fatalf("loaded deleted project = %q, err = %v", loaded, err)
	}
}
