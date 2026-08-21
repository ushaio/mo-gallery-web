package storage_plugins

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type testCredentialStore struct{ values map[string]string }

func (s *testCredentialStore) Set(reference, value string) error {
	if s.values == nil {
		s.values = map[string]string{}
	}
	s.values[reference] = value
	return nil
}

func (s *testCredentialStore) Get(reference string) (string, error) {
	return s.values[reference], nil
}

func (s *testCredentialStore) Delete(reference string) error {
	delete(s.values, reference)
	return nil
}

func TestManagerSourceLifecyclePersistsCredentialsAndEnabledState(t *testing.T) {
	manager, err := NewManagerWithCredentialStore(t.TempDir(), &testCredentialStore{})
	if err != nil {
		t.Fatalf("NewManagerWithCredentialStore() error = %v", err)
	}
	manager.SetDeveloperMode(true)
	packageDir := t.TempDir()
	manifestPath := filepath.Join(packageDir, pluginManifestFileName)
	manifestBytes, err := json.Marshal(Manifest{ID: "test.storage", Version: "1.0.0", APIVersion: "1", Entry: "plugin.exe", Capabilities: []string{capabilityValidate}})
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)
	if err := os.WriteFile(manifestPath, manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "plugin.exe"), []byte("test"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed, err := manager.InstallPlugin(packageDir)
	if err != nil {
		t.Fatalf("InstallPlugin() error = %v", err)
	}
	created, err := manager.CreateSource(SourceInput{
		Name: "Test storage", PluginID: installed.ID,
		Config:      map[string]string{"repo": "owner/repo"},
		Credentials: map[string]string{"token": "secret"}, Enabled: true,
	})
	if err != nil {
		t.Fatalf("CreateSource() error = %v", err)
	}
	if !created.Enabled || created.ID == "" {
		t.Fatalf("created source = %+v", created)
	}
	credentials, err := manager.GetSourceCredentials(created.ID)
	if err != nil {
		t.Fatalf("GetSourceCredentials() error = %v", err)
	}
	if credentials["token"] != "secret" {
		t.Fatalf("credentials = %#v", credentials)
	}
	updated, err := manager.SetSourceEnabled(created.ID, false)
	if err != nil {
		t.Fatalf("SetSourceEnabled() error = %v", err)
	}
	if updated.Enabled {
		t.Fatalf("disabled source = %+v", updated)
	}
	if err := manager.DeleteSource(created.ID); err != nil {
		t.Fatalf("DeleteSource() error = %v", err)
	}
}

func TestManagerDevelopmentInstallSkipsDependencyAndVCSDirectories(t *testing.T) {
	configDir := t.TempDir()
	manager, err := NewManager(configDir)
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)

	sourceDir := t.TempDir()
	manifestData, err := json.Marshal(Manifest{
		ID: "development.storage", Version: "1.0.0", APIVersion: pluginAPIVersion, Entry: "plugin.exe",
	})
	if err != nil {
		t.Fatal(err)
	}
	files := map[string][]byte{
		pluginManifestFileName:                 manifestData,
		"plugin.exe":                           []byte("test"),
		"assets/config.json":                   []byte("{}"),
		"node_modules/package/index.js":        []byte("ignored"),
		"nested/node_modules/package/index.js": []byte("ignored"),
		".git/config":                          []byte("ignored"),
	}
	for name, data := range files {
		path := filepath.Join(sourceDir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	installed, err := manager.InstallPlugin(sourceDir)
	if err != nil {
		t.Fatalf("InstallPlugin() error = %v", err)
	}
	installedDir := filepath.Dir(installed.ManifestPath)
	if _, err := os.Stat(filepath.Join(installedDir, "assets", "config.json")); err != nil {
		t.Fatalf("ordinary plugin asset was not installed: %v", err)
	}
	for _, ignored := range []string{"node_modules", filepath.Join("nested", "node_modules"), ".git"} {
		if _, err := os.Stat(filepath.Join(installedDir, ignored)); !os.IsNotExist(err) {
			t.Fatalf("development artifact %q was installed: %v", ignored, err)
		}
	}
}

func TestManagerDeveloperModeControlsSystemNodeFallback(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	assertFallback := func(want bool) {
		t.Helper()
		resolver, ok := manager.resolver.(defaultRuntimeResolver)
		if !ok {
			t.Fatalf("manager resolver type = %T", manager.resolver)
		}
		if resolver.node.AllowDevelopmentFallback != want {
			t.Fatalf("development fallback = %t, want %t", resolver.node.AllowDevelopmentFallback, want)
		}
	}

	assertFallback(false)
	manager.SetDeveloperMode(true)
	assertFallback(true)
	manager.SetDeveloperMode(false)
	assertFallback(false)
}

func TestManagerRejectsUninstalledExternalPluginCommand(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	_, err = manager.CreateSource(SourceInput{
		Name: "Untrusted", PluginID: "example.storage",
		Command: "C:\\Windows\\System32\\cmd.exe", Enabled: true,
	})
	if err == nil {
		t.Fatal("expected uninstalled external plugin to be rejected")
	}
}

func TestManagerRejectsUnpackedPluginOutsideDeveloperMode(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	sourceDir := t.TempDir()
	manifestData, err := json.Marshal(Manifest{ID: "production.storage", Version: "1.0.0", APIVersion: pluginAPIVersion, Entry: "plugin.exe"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, pluginManifestFileName), manifestData, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "plugin.exe"), []byte("test"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.InstallPlugin(sourceDir); err == nil {
		t.Fatal("expected unpacked plugin installation to require developer mode")
	} else {
		var pluginErr *PluginError
		if !errors.As(err, &pluginErr) || pluginErr.Code != ErrorDeveloperModeRequired {
			t.Fatalf("installation error = %v, want %s", err, ErrorDeveloperModeRequired)
		}
	}
}

func TestManagerRejectsUnsignedSystemPluginSourceInProduction(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)
	packageDir := t.TempDir()
	manifestData, err := json.Marshal(Manifest{ID: "unsigned.system", Version: "1.0.0", APIVersion: pluginAPIVersion, Entry: "plugin.exe", Capabilities: []string{capabilityValidate}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, pluginManifestFileName), manifestData, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "plugin.exe"), []byte("test"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed, err := manager.InstallPlugin(packageDir)
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(false)
	if _, err := manager.CreateSource(SourceInput{Name: "Unsigned", PluginID: installed.ID, Enabled: true}); err == nil {
		t.Fatal("production mode must reject an unsigned system plugin")
	}
}

func TestManagerRechecksSignedPluginIntegrityBeforeStart(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.SetTrustedSigningKey("test-key", publicKey); err != nil {
		t.Fatal(err)
	}
	packageDir := t.TempDir()
	manifestData, err := json.Marshal(Manifest{ID: "signed.system", Version: "1.0.0", APIVersion: pluginAPIVersion, SigningKeyID: "test-key", Entry: "plugin.exe", Capabilities: []string{capabilityValidate}})
	if err != nil {
		t.Fatal(err)
	}
	pluginData := []byte("signed plugin")
	if err := os.WriteFile(filepath.Join(packageDir, pluginManifestFileName), manifestData, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "plugin.exe"), pluginData, 0o700); err != nil {
		t.Fatal(err)
	}
	checksumsData := mustTestJSON(map[string]string{
		pluginManifestFileName: checksum(manifestData),
		"plugin.exe":           checksum(pluginData),
	})
	if err := os.WriteFile(filepath.Join(packageDir, pluginChecksumsFileName), checksumsData, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, pluginSignatureFileName), ed25519.Sign(privateKey, checksumsData), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := manager.validateStartIntegrity(filepath.Join(packageDir, pluginManifestFileName)); err != nil {
		t.Fatalf("signed package should pass integrity validation: %v", err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "plugin.exe"), []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := manager.validateStartIntegrity(filepath.Join(packageDir, pluginManifestFileName)); err == nil {
		t.Fatal("tampered signed package must fail integrity validation")
	}
}

func TestManagerUninstallPluginRemovesPackage(t *testing.T) {
	configDir := t.TempDir()
	manager, err := NewManager(configDir)
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)
	packageDir := t.TempDir()
	manifest := Manifest{ID: "removable.storage", Version: "1.0.0", APIVersion: "1", Entry: "plugin.exe"}
	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, pluginManifestFileName), manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "plugin.exe"), []byte("test"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed, err := manager.InstallPlugin(packageDir)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.UninstallPlugin(installed.ID); err != nil {
		t.Fatalf("UninstallPlugin() error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(configDir, "storage-plugins", installed.ID)); !os.IsNotExist(err) {
		t.Fatalf("plugin directory still exists: %v", err)
	}
}

func TestManagerUninstallKeepsSourcesForReinstall(t *testing.T) {
	configDir := t.TempDir()
	credentialsStore := &testCredentialStore{}
	manager, err := NewManagerWithCredentialStore(configDir, credentialsStore)
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)
	packageDir := t.TempDir()
	manifestBytes, err := json.Marshal(Manifest{ID: "in-use.storage", Version: "1.0.0", APIVersion: "1", Entry: "plugin.exe"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, pluginManifestFileName), manifestBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageDir, "plugin.exe"), []byte("test"), 0o700); err != nil {
		t.Fatal(err)
	}
	installed, err := manager.InstallPlugin(packageDir)
	if err != nil {
		t.Fatal(err)
	}
	created, err := manager.CreateSource(SourceInput{
		Name: "In use", PluginID: installed.ID, Enabled: true,
		Config:      map[string]string{"repo": "owner/repo"},
		Credentials: map[string]string{"token": "secret"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.UninstallPlugin(installed.ID); err != nil {
		t.Fatalf("UninstallPlugin() error = %v", err)
	}
	if _, ok := manager.GetSource(created.ID); !ok {
		t.Fatal("storage source was removed during plugin uninstall")
	}
	credentials, err := manager.GetSourceCredentials(created.ID)
	if err != nil {
		t.Fatalf("GetSourceCredentials() after uninstall error = %v", err)
	}
	if credentials["token"] != "secret" {
		t.Fatalf("credentials after uninstall = %#v", credentials)
	}
	restarted, err := NewManagerWithCredentialStore(configDir, credentialsStore)
	if err != nil {
		t.Fatalf("restart manager error = %v", err)
	}
	restarted.SetDeveloperMode(true)
	if _, ok := restarted.GetSource(created.ID); !ok {
		t.Fatal("storage source did not persist across manager restart")
	}
	if _, err := restarted.InstallPlugin(packageDir); err != nil {
		t.Fatalf("reinstall plugin error = %v", err)
	}
	if _, ok := restarted.GetSource(created.ID); !ok {
		t.Fatal("storage source was not available after reinstall")
	}
}
