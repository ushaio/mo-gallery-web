package storage_plugins

import (
	"archive/zip"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPluginPackageRejectsZipSlip(t *testing.T) {
	packagePath := filepath.Join(t.TempDir(), "malicious.zip")
	file, err := os.Create(packagePath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	entry, err := archive.Create("../escape.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = entry.Write([]byte("nope"))
	_ = archive.Close()
	_ = file.Close()
	if _, err := inspectPluginPackage(packagePath, nil, true); err == nil {
		t.Fatal("expected zip-slip package to be rejected")
	}
}

func TestPluginPackageRejectsNormalizedParentPath(t *testing.T) {
	for _, name := range []string{"nested/../escape.txt", "nested/../../escape.txt"} {
		if _, err := safeZipEntryName(name); err == nil {
			t.Fatalf("safeZipEntryName(%q) accepted a parent segment", name)
		}
	}
}

func TestPluginPackageRequiresSignatureOutsideDeveloperMode(t *testing.T) {
	packagePath := writeUnsignedTestPackage(t)
	if _, err := inspectPluginPackage(packagePath, nil, false); err == nil {
		t.Fatal("expected unsigned package to be rejected")
	}
	data, err := inspectPluginPackage(packagePath, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if data.SignatureStatus != "development" {
		t.Fatalf("signature status = %q", data.SignatureStatus)
	}
	_ = os.RemoveAll(data.Directory)
}

func TestPluginPackageAcceptsTrustedEd25519Signature(t *testing.T) {
	packagePath, publicKey := writeSignedTestPackage(t)
	data, err := inspectPluginPackage(packagePath, map[string]ed25519.PublicKey{"test-key": publicKey}, false)
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(data.Directory)
	if data.SignatureStatus != "verified" {
		t.Fatalf("signature status = %q, want verified", data.SignatureStatus)
	}
	if status := manifestSignatureStatus(filepath.Join(data.Directory, pluginManifestFileName), map[string]ed25519.PublicKey{"test-key": publicKey}); status != "verified" {
		t.Fatalf("manifest signature status = %q, want verified", status)
	}
	if err := os.WriteFile(filepath.Join(data.Directory, pluginSignatureFileName), []byte("invalid"), 0o600); err != nil {
		t.Fatal(err)
	}
	if status := manifestSignatureStatus(filepath.Join(data.Directory, pluginManifestFileName), map[string]ed25519.PublicKey{"test-key": publicKey}); status != "invalid" {
		t.Fatalf("tampered manifest signature status = %q, want invalid", status)
	}
}

func TestManagerRollbackRestoresPreviousVersion(t *testing.T) {
	configDir := t.TempDir()
	manager, err := NewManager(configDir)
	if err != nil {
		t.Fatal(err)
	}
	manager.SetDeveloperMode(true)
	for _, version := range []string{"1.0.0", "2.0.0"} {
		sourceDir := t.TempDir()
		manifest := Manifest{ID: "rollback.storage", Version: version, APIVersion: pluginAPIVersion, Entry: "plugin.exe"}
		data, _ := json.Marshal(manifest)
		if err := os.WriteFile(filepath.Join(sourceDir, pluginManifestFileName), data, 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(sourceDir, "plugin.exe"), []byte(version), 0o700); err != nil {
			t.Fatal(err)
		}
		if _, err := manager.InstallPlugin(sourceDir); err != nil {
			t.Fatal(err)
		}
	}
	if err := manager.RollbackPlugin("rollback.storage", "1.0.0"); err != nil {
		t.Fatal(err)
	}
	plugins := manager.ListPlugins()
	if len(plugins) != 1 || plugins[0].Version != "1.0.0" {
		t.Fatalf("active plugin after rollback = %+v", plugins)
	}
}

func writeUnsignedTestPackage(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	manifest := Manifest{ID: "package.storage", Version: "1.0.0", APIVersion: pluginAPIVersion, Entry: "plugin.exe"}
	manifestData, _ := json.Marshal(manifest)
	pluginData := []byte("fake executable")
	checksums := map[string]string{
		pluginManifestFileName: checksum(manifestData),
		"plugin.exe":           checksum(pluginData),
	}
	packagePath := filepath.Join(root, "plugin.zip")
	file, err := os.Create(packagePath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, data := range map[string][]byte{
		pluginManifestFileName:  manifestData,
		"plugin.exe":            pluginData,
		pluginChecksumsFileName: mustTestJSON(checksums),
	} {
		entry, err := archive.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return packagePath
}

func writeSignedTestPackage(t *testing.T) (string, ed25519.PublicKey) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	manifest := Manifest{ID: "signed.storage", Version: "1.0.0", APIVersion: pluginAPIVersion, Entry: "plugin.exe", SigningKeyID: "test-key"}
	manifestData, _ := json.Marshal(manifest)
	pluginData := []byte("fake executable")
	checksums := map[string]string{
		pluginManifestFileName: checksum(manifestData),
		"plugin.exe":           checksum(pluginData),
	}
	checksumsData := mustTestJSON(checksums)
	signature := ed25519.Sign(privateKey, checksumsData)
	packagePath := filepath.Join(root, "signed-plugin.zip")
	file, err := os.Create(packagePath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, data := range map[string][]byte{
		pluginManifestFileName:  manifestData,
		"plugin.exe":            pluginData,
		pluginChecksumsFileName: checksumsData,
		pluginSignatureFileName: signature,
	} {
		entry, err := archive.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return packagePath, publicKey
}

func checksum(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func mustTestJSON(value any) []byte {
	data, err := json.Marshal(value)
	if err != nil {
		panic(errors.New("encode test JSON"))
	}
	return data
}
