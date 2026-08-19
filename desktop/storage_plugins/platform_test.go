package storage_plugins

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPlatformKeyForSupportedTargets(t *testing.T) {
	tests := []struct {
		goos, goarch, want string
	}{
		{"windows", "amd64", "windows-amd64"},
		{"darwin", "amd64", "darwin-amd64"},
		{"darwin", "arm64", "darwin-arm64"},
		{"linux", "amd64", "linux-amd64"},
		{"linux", "arm64", "linux-arm64"},
	}
	for _, test := range tests {
		got, err := platformKeyFor(test.goos, test.goarch)
		if err != nil || got != test.want {
			t.Fatalf("platformKeyFor(%q, %q) = %q, %v; want %q", test.goos, test.goarch, got, err, test.want)
		}
	}
	_, err := platformKeyFor("freebsd", "amd64")
	var pluginErr *PluginError
	if !errors.As(err, &pluginErr) || pluginErr.Code != ErrorUnsupportedPlatform {
		t.Fatalf("unsupported platform error = %v", err)
	}
}

func TestLegacyManifestNormalizesToExecutable(t *testing.T) {
	manifest := Manifest{ID: "legacy.storage", Version: "1.0.0", APIVersion: pluginAPIVersion, Entry: "bin/plugin.exe"}
	if err := normalizeManifest(&manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Type != PluginTypeExecutable {
		t.Fatalf("legacy manifest type = %q", manifest.Type)
	}
}

func TestNodeRuntimeResolverUsesBundledRuntimeAndEntry(t *testing.T) {
	root := t.TempDir()
	pluginDir := filepath.Join(root, "plugin")
	runtimeDir := filepath.Join(root, "runtimes", "node")
	if err := os.MkdirAll(filepath.Join(pluginDir, "dist"), 0o700); err != nil {
		t.Fatal(err)
	}
	key, err := platformKey()
	if err != nil {
		t.Skipf("current test platform is not supported: %v", err)
	}
	nodeName := "node"
	if runtime.GOOS == "windows" {
		nodeName += ".exe"
	}
	if err := os.MkdirAll(filepath.Join(runtimeDir, key), 0o700); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(pluginDir, "dist", "main.js")
	if err := os.WriteFile(entry, []byte("console.log('fake')"), 0o700); err != nil {
		t.Fatal(err)
	}
	nodePath := filepath.Join(runtimeDir, key, nodeName)
	if err := os.WriteFile(nodePath, []byte("fake node"), 0o700); err != nil {
		t.Fatal(err)
	}
	resolver := NewNodeRuntimeResolver(runtimeDir)
	command, args, env, err := resolver.Resolve(context.Background(), Manifest{
		ID: "node.storage", Version: "1.0.0", APIVersion: pluginAPIVersion,
		Type: PluginTypeNode, Runtime: RuntimeNode22, Entry: "dist/main.js",
		Platforms: []string{key}, Capabilities: []string{capabilityValidate},
	}, pluginDir)
	if err != nil {
		t.Fatal(err)
	}
	if command != nodePath || len(args) != 1 || args[0] != entry || len(env) != 1 || env[0] != "MO_GALLERY_PLUGIN_RUNTIME=node22" {
		t.Fatalf("resolved node runtime = command %q args %#v env %#v", command, args, env)
	}
}

func TestNodeRuntimeResolverReportsMissingRuntime(t *testing.T) {
	pluginDir := t.TempDir()
	entry := filepath.Join(pluginDir, "main.js")
	if err := os.WriteFile(entry, []byte(""), 0o700); err != nil {
		t.Fatal(err)
	}
	key, err := platformKey()
	if err != nil {
		t.Skipf("current test platform is not supported: %v", err)
	}
	_, _, _, err = NewNodeRuntimeResolver(filepath.Join(t.TempDir(), "missing")).Resolve(context.Background(), Manifest{
		ID: "node.storage", Version: "1.0.0", APIVersion: pluginAPIVersion,
		Type: PluginTypeNode, Runtime: RuntimeNode22, Entry: "main.js", Platforms: []string{key},
	}, pluginDir)
	var pluginErr *PluginError
	if !errors.As(err, &pluginErr) || pluginErr.Code != ErrorRuntimeMissing {
		t.Fatalf("missing runtime error = %v", err)
	}
}
