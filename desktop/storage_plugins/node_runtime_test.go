package storage_plugins

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDevelopmentNodeRuntimeRequiresNode22(t *testing.T) {
	tests := map[string]bool{
		"22.14.0": true,
		"22.23.2": true,
		"21.7.3":  false,
		"23.0.0":  false,
		"22":      false,
		"":        false,
	}
	for version, want := range tests {
		if got := isDevelopmentNodeRuntimeVersion(version); got != want {
			t.Fatalf("isDevelopmentNodeRuntimeVersion(%q) = %t, want %t", version, got, want)
		}
	}
}
func TestVerifyBundledNodeRuntimeChecksSignatureAndChecksums(t *testing.T) {
	root := t.TempDir()
	files := make(map[string]string, len(supportedPlatformKeys))
	checksums := make(map[string]string, len(supportedPlatformKeys))
	for _, platform := range supportedPlatformKeys {
		name := "node"
		if platform == "windows-amd64" {
			name = "node.exe"
		}
		relative := filepath.ToSlash(filepath.Join(platform, name))
		path := filepath.Join(root, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		data := []byte("fake node " + platform)
		if err := os.WriteFile(path, data, 0o700); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(data)
		files[platform] = relative
		checksums[platform] = hex.EncodeToString(digest[:])
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(nodeRuntimeSignedPayload{Version: BundledNodeRuntimeVersion, Files: files, SHA256: checksums})
	if err != nil {
		t.Fatal(err)
	}
	manifest := nodeRuntimeManifest{
		Version:   BundledNodeRuntimeVersion,
		Files:     files,
		SHA256:    checksums,
		Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, payload)),
	}
	manifestData, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "runtime-manifest.json"), manifestData, 0o600); err != nil {
		t.Fatal(err)
	}
	previousKey := BundledNodeRuntimePublicKey
	BundledNodeRuntimePublicKey = base64.StdEncoding.EncodeToString(publicKey)
	t.Cleanup(func() { BundledNodeRuntimePublicKey = previousKey })

	if err := verifyBundledNodeRuntime(root); err != nil {
		t.Fatalf("verifyBundledNodeRuntime() error = %v", err)
	}

	if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(files["linux-amd64"])), []byte("tampered"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := verifyBundledNodeRuntime(root); err == nil {
		t.Fatal("expected checksum tampering to be rejected")
	}
}

func TestVerifyBundledNodeRuntimeRejectsUnexpectedLayout(t *testing.T) {
	root := t.TempDir()
	files := make(map[string]string, len(supportedPlatformKeys))
	checksums := make(map[string]string, len(supportedPlatformKeys))
	for _, platform := range supportedPlatformKeys {
		name := "node"
		if platform == "windows-amd64" {
			name = "node.exe"
		}
		relative := filepath.ToSlash(filepath.Join(platform, name))
		path := filepath.Join(root, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		data := []byte("fake node " + platform)
		if err := os.WriteFile(path, data, 0o700); err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(data)
		files[platform] = relative
		checksums[platform] = hex.EncodeToString(digest[:])
	}
	files["linux-amd64"] = "linux-amd64/../linux-amd64/node"
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(nodeRuntimeSignedPayload{Version: BundledNodeRuntimeVersion, Files: files, SHA256: checksums})
	if err != nil {
		t.Fatal(err)
	}
	manifestData, err := json.Marshal(nodeRuntimeManifest{
		Version:   BundledNodeRuntimeVersion,
		Files:     files,
		SHA256:    checksums,
		Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, payload)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "runtime-manifest.json"), manifestData, 0o600); err != nil {
		t.Fatal(err)
	}
	previousKey := BundledNodeRuntimePublicKey
	BundledNodeRuntimePublicKey = base64.StdEncoding.EncodeToString(publicKey)
	t.Cleanup(func() { BundledNodeRuntimePublicKey = previousKey })
	if err := verifyBundledNodeRuntime(root); err == nil {
		t.Fatal("expected unexpected runtime layout to be rejected")
	}
}
