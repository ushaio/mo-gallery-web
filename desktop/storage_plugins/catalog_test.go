package storage_plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"mo-gallery-desktop/plugin_core"
)

func TestPluginCatalogStartsWithoutInstalledPlugins(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if plugins := manager.ListPlugins(); len(plugins) != 0 {
		t.Fatalf("expected no installed plugins, got %d", len(plugins))
	}
}

func TestInstallAndDiscoverExternalPlugin(t *testing.T) {
	sourceDir := t.TempDir()
	manifest := Manifest{
		ID: "example-storage", Version: "1.0.0", APIVersion: "1", Name: "Example storage",
		Entry: "plugin.exe", Capabilities: []string{"plugin.health"},
		ConfigSchema: objectSchema(map[string]any{"endpoint": stringField("Endpoint", true)}),
	}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, pluginManifestFileName), manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "plugin.exe"), []byte("test plugin"), 0o700); err != nil {
		t.Fatal(err)
	}

	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)
	installed, err := manager.InstallPlugin(sourceDir)
	if err != nil {
		t.Fatal(err)
	}
	if installed.ID != "example-storage" || installed.BuiltIn || installed.Command == "" {
		t.Fatalf("unexpected installed plugin: %+v", installed)
	}
	if _, err := os.Stat(installed.Command); err != nil {
		t.Fatalf("installed executable missing: %v", err)
	}
	found := false
	for _, plugin := range manager.ListPlugins() {
		if plugin.ID == installed.ID && plugin.Command == installed.Command {
			found = true
		}
	}
	if !found {
		t.Fatal("installed plugin was not discovered")
	}
	source, err := manager.CreateSource(SourceInput{
		Name: "Example", PluginID: installed.ID, Command: "untrusted-command", Enabled: true,
	})
	if err != nil {
		t.Fatalf("CreateSource() error = %v", err)
	}
	persisted, ok := manager.GetSource(source.ID)
	if !ok || persisted.Command != installed.Command {
		t.Fatalf("source command was not resolved from installed manifest: %+v", persisted)
	}
}

func TestSystemManifestContributionCompatibility(t *testing.T) {
	data := []byte(`{
		"id":"example.publisher",
		"version":"1.0.0",
		"coreApiVersion":"1",
		"runtime":{"type":"node","version":"node22","entry":"dist/main.js"},
		"contributions":[{"domain":"storage","apiVersion":"1","capabilities":["source.validate","object.put"]}],
		"permissions":["network:https://example.test"]
	}`)
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if err := normalizeManifest(&manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Type != PluginTypeNode || manifest.Runtime != RuntimeNode22 || manifest.Entry != "dist/main.js" {
		t.Fatalf("runtime compatibility fields = %+v", manifest)
	}
	if !manifest.SupportsContribution("storage", "1") || len(manifest.Capabilities) != 2 {
		t.Fatalf("storage contribution was not normalized: %+v", manifest.Contributions)
	}
}

func TestUIDomainIsMarkedIncompatible(t *testing.T) {
	manifest := Manifest{
		ID: "ui.example", Version: "1.0.0", CoreAPIVersion: "1", Type: PluginTypeNode,
		Runtime: RuntimeNode22, Entry: "dist/main.js",
		Contributions: []plugin_core.Contribution{{Domain: "ui", APIVersion: "1", Capabilities: []string{"ui.panel"}}},
	}
	descriptor := manifestDescriptor(manifest, "node", nil, false, "manifest.json", "")
	if descriptor.CompatibilityStatus == "compatible" {
		t.Fatal("ui contribution must be marked incompatible")
	}
}
