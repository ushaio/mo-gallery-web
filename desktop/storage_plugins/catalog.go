package storage_plugins

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"mo-gallery-desktop/plugin_core"
)

const pluginManifestFileName = "manifest.json"

func objectSchema(properties map[string]any) map[string]any {
	return map[string]any{"type": "object", "properties": properties}
}

func stringField(title string, required bool) map[string]any {
	return map[string]any{"type": "string", "title": title, "required": required}
}

func secretField(title string, required bool) map[string]any {
	return map[string]any{"type": "string", "title": title, "format": "password", "required": required}
}

func manifestDescriptor(manifest Manifest, command string, args []string, builtIn bool, manifestPath string, runtimeStatus string) PluginDescriptor {
	_ = normalizeManifest(&manifest)
	name := strings.TrimSpace(manifest.Name)
	if name == "" {
		name = manifest.ID
	}
	descriptor := PluginDescriptor{
		ID: manifest.ID, Version: manifest.Version, APIVersion: manifest.APIVersion,
		CoreAPIVersion: manifest.CoreAPIVersion,
		Name:           name, Description: manifest.Description, Type: manifest.Type,
		Runtime: manifest.Runtime, Platform: currentPlatformKey(),
		Platforms: append([]string(nil), manifest.Platforms...), Command: command,
		Args: append([]string(nil), args...), RuntimeAvailable: command != "",
		RuntimeStatus: runtimeStatus, SignatureStatus: "unsigned",
		BuiltIn:  builtIn,
		Official: builtIn, Installed: true,
		ManifestPath: manifestPath, Capabilities: append([]string(nil), manifest.Capabilities...),
		Contributions: append([]plugin_core.Contribution(nil), manifest.Contributions...),
		Permissions:   append([]string(nil), manifest.Permissions...),
		ConfigSchema:  cloneAnyMap(manifest.ConfigSchema), CredentialSchema: cloneAnyMap(manifest.CredentialSchema),
	}
	descriptor.CompatibilityStatus = "compatible"
	for _, contribution := range manifest.Contributions {
		if contribution.Domain == "ui" {
			descriptor.CompatibilityStatus = "incompatible: ui contributions are not supported"
			break
		}
	}
	return descriptor
}

func manifestSignatureStatus(manifestPath string, trustedKeys map[string]ed25519.PublicKey) string {
	stage := filepath.Dir(manifestPath)
	manifest, err := readManifest(manifestPath)
	if err != nil {
		return "invalid"
	}
	if _, err := os.Stat(filepath.Join(stage, pluginSignatureFileName)); err != nil {
		return "unsigned"
	}
	names, err := packageFileNames(stage)
	if err != nil || verifyPackageChecksums(stage, names) != nil {
		return "invalid"
	}
	status, err := verifyPackageSignature(stage, manifest, trustedKeys, false)
	if err != nil {
		return "invalid"
	}
	return status
}

func packageFileNames(root string) (map[string]struct{}, error) {
	names := make(map[string]struct{})
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("plugin package cannot contain symbolic links")
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		names[filepath.ToSlash(relative)] = struct{}{}
		return nil
	})
	return names, err
}

func cloneAnyMap(values map[string]any) map[string]any {
	if values == nil {
		return nil
	}
	data, err := json.Marshal(values)
	if err != nil {
		return nil
	}
	var clone map[string]any
	if json.Unmarshal(data, &clone) != nil {
		return nil
	}
	return clone
}

func readManifest(path string) (Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("read plugin manifest: %w", err)
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode plugin manifest: %w", err)
	}
	if err := normalizeManifest(&manifest); err != nil {
		return Manifest{}, err
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest) error {
	if !validPluginID(manifest.ID) {
		return errors.New("plugin manifest id must contain only letters, numbers, dots, underscores, or hyphens")
	}
	if strings.TrimSpace(manifest.Version) == "" {
		return errors.New("plugin manifest version is required")
	}
	if err := normalizeManifest(&manifest); err != nil {
		return err
	}
	if manifest.SupportsContribution("storage", pluginAPIVersion) && manifest.APIVersion != pluginAPIVersion {
		return fmt.Errorf("unsupported storage plugin apiVersion: %s", manifest.APIVersion)
	}
	if strings.TrimSpace(manifest.Entry) != "" {
		if _, err := resolvePackagePath(".", manifest.Entry); err != nil {
			return fmt.Errorf("plugin manifest entry must be a relative path inside the plugin directory: %w", err)
		}
	}
	for key, entry := range manifest.Binaries {
		if !isSupportedPlatformKey(key) {
			return fmt.Errorf("plugin manifest binary platform %q is invalid", key)
		}
		if _, err := resolvePackagePath(".", entry); err != nil {
			return fmt.Errorf("plugin manifest binary %q is invalid: %w", key, err)
		}
	}
	return nil
}

func normalizeManifest(manifest *Manifest) error {
	if manifest == nil {
		return errors.New("plugin manifest is required")
	}
	manifest.Type = strings.TrimSpace(manifest.Type)
	if manifest.Type == "" {
		// Manifests written before the runtime split are executable plugins.
		manifest.Type = PluginTypeExecutable
	}
	if manifest.Type != PluginTypeExecutable && manifest.Type != PluginTypeNode {
		return fmt.Errorf("unsupported plugin type: %s", manifest.Type)
	}
	manifest.Runtime = strings.TrimSpace(manifest.Runtime)
	if manifest.Type == PluginTypeNode {
		if manifest.Runtime == "" {
			manifest.Runtime = RuntimeNode22
		}
		if strings.TrimSpace(manifest.Entry) == "" {
			return errors.New("node plugin manifest entry is required")
		}
	} else if len(manifest.Binaries) == 0 && strings.TrimSpace(manifest.Entry) == "" {
		return errors.New("plugin manifest entry or binaries are required")
	}
	if len(manifest.Binaries) > 0 {
		if manifest.Type != PluginTypeExecutable {
			return errors.New("plugin manifest binaries are only valid for executable plugins")
		}
		if len(manifest.Platforms) == 0 {
			manifest.Platforms = make([]string, 0, len(manifest.Binaries))
			for key := range manifest.Binaries {
				manifest.Platforms = append(manifest.Platforms, key)
			}
			sort.Strings(manifest.Platforms)
		}
	}
	for _, platform := range manifest.Platforms {
		if !isSupportedPlatformKey(platform) {
			return fmt.Errorf("unsupported plugin platform: %s", platform)
		}
	}
	manifest.CoreAPIVersion = strings.TrimSpace(manifest.CoreAPIVersion)
	if manifest.CoreAPIVersion == "" {
		manifest.CoreAPIVersion = plugin_core.CoreAPIVersion
	}
	if len(manifest.Contributions) == 0 {
		if strings.TrimSpace(manifest.APIVersion) == "" {
			return errors.New("legacy storage plugin manifest apiVersion is required")
		}
		manifest.Contributions = []plugin_core.Contribution{{
			Domain: "storage", APIVersion: strings.TrimSpace(manifest.APIVersion),
			Capabilities: append([]string(nil), manifest.Capabilities...),
		}}
	}
	coreManifest := manifest.CoreManifest()
	if err := coreManifest.Normalize(); err != nil {
		return err
	}
	manifest.CoreAPIVersion = coreManifest.CoreAPIVersion
	manifest.Contributions = coreManifest.Contributions
	for _, contribution := range manifest.Contributions {
		if contribution.Domain != "storage" {
			continue
		}
		if contribution.APIVersion != pluginAPIVersion {
			return fmt.Errorf("unsupported storage capability apiVersion: %s", contribution.APIVersion)
		}
		manifest.APIVersion = contribution.APIVersion
		manifest.Capabilities = append([]string(nil), contribution.Capabilities...)
		break
	}
	return nil
}

func isSupportedPlatformKey(value string) bool {
	switch value {
	case "windows-amd64", "darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64":
		return true
	default:
		return false
	}
}

func manifestSupportsPlatform(manifest Manifest, key string) bool {
	if len(manifest.Platforms) == 0 {
		return true
	}
	for _, platform := range manifest.Platforms {
		if platform == key {
			return true
		}
	}
	return false
}

func currentPlatformKey() string {
	key, err := platformKey()
	if err != nil {
		return "unknown"
	}
	return key
}

func validPluginID(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '.' || char == '_' || char == '-' {
			continue
		}
		return false
	}
	return true
}

func discoverManifests(pluginDir string, resolver RuntimeResolver, trustedKeys map[string]ed25519.PublicKey) ([]PluginDescriptor, error) {
	entries, err := os.ReadDir(pluginDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []PluginDescriptor{}, nil
		}
		return nil, err
	}
	result := make([]PluginDescriptor, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		packageDir := activePackageDir(filepath.Join(pluginDir, entry.Name()))
		if packageDir == "" {
			continue
		}
		manifestPath := filepath.Join(packageDir, pluginManifestFileName)
		manifest, err := readManifest(manifestPath)
		if err != nil {
			continue
		}
		command, args, _, resolveErr := resolver.Resolve(context.Background(), manifest, packageDir)
		status := ""
		if resolveErr != nil {
			status = resolveErr.Error()
		}
		descriptor := manifestDescriptor(manifest, command, args, false, manifestPath, status)
		descriptor.SignatureStatus = manifestSignatureStatus(manifestPath, trustedKeys)
		result = append(result, descriptor)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result, nil
}

// installManifest copies a plugin directory into the desktop plugin catalog.
// The first version intentionally accepts an unpacked directory; signed zip
// installation can build on this boundary without changing source handling.
func installManifest(manifestPath, pluginDir string, resolver RuntimeResolver) (PluginDescriptor, error) {
	manifestPath, err := filepath.Abs(manifestPath)
	if err != nil {
		return PluginDescriptor{}, err
	}
	manifest, err := readManifest(manifestPath)
	if err != nil {
		return PluginDescriptor{}, err
	}
	sourceDir := filepath.Dir(manifestPath)
	return installDirectory(sourceDir, manifest, pluginDir, resolver, "development", true)
}

func installDirectory(sourceDir string, manifest Manifest, pluginDir string, resolver RuntimeResolver, signatureStatus string, developmentSource bool) (PluginDescriptor, error) {
	if err := validateVersionDirectory(manifest.Version); err != nil {
		return PluginDescriptor{}, err
	}
	if err := os.MkdirAll(pluginDir, 0o700); err != nil {
		return PluginDescriptor{}, fmt.Errorf("create plugin directory: %w", err)
	}
	stage, err := os.MkdirTemp(pluginDir, ".staging-"+manifest.ID+"-")
	if err != nil {
		return PluginDescriptor{}, fmt.Errorf("create plugin staging directory: %w", err)
	}
	defer os.RemoveAll(stage)
	if err := copyPluginDirectory(sourceDir, stage, developmentSource); err != nil {
		return PluginDescriptor{}, err
	}
	stagedManifestPath := filepath.Join(stage, pluginManifestFileName)
	staged, err := readManifest(stagedManifestPath)
	if err != nil {
		return PluginDescriptor{}, err
	}
	if err := validateInstalledPayload(stage, staged); err != nil {
		return PluginDescriptor{}, err
	}
	packageDir, err := commitInstalledPackage(stage, pluginDir, staged)
	if err != nil {
		return PluginDescriptor{}, err
	}
	command, args, _, resolveErr := resolver.Resolve(context.Background(), staged, packageDir)
	status := ""
	if resolveErr != nil {
		status = resolveErr.Error()
	}
	descriptor := manifestDescriptor(staged, command, args, false, filepath.Join(packageDir, pluginManifestFileName), status)
	descriptor.SignatureStatus = signatureStatus
	return descriptor, nil
}

func commitInstalledPackage(stage, pluginDir string, manifest Manifest) (string, error) {
	root := filepath.Join(pluginDir, manifest.ID)
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", fmt.Errorf("create installed plugin root: %w", err)
	}
	versionDir := filepath.Join(root, manifest.Version)
	backupDir := ""
	if _, err := os.Stat(versionDir); err == nil {
		backupDir = versionDir + ".backup-" + time.Now().UTC().Format("20060102T150405.000000000")
		if err := os.Rename(versionDir, backupDir); err != nil {
			return "", fmt.Errorf("stage previous plugin version: %w", err)
		}
	}
	if err := os.Rename(stage, versionDir); err != nil {
		if backupDir != "" {
			_ = os.Rename(backupDir, versionDir)
		}
		return "", fmt.Errorf("commit plugin version: %w", err)
	}
	previousVersion := readCurrentVersion(root)
	if err := writeCurrentVersion(root, manifest.Version); err != nil {
		_ = os.RemoveAll(versionDir)
		if backupDir != "" {
			_ = os.Rename(backupDir, versionDir)
		}
		if previousVersion != "" {
			_ = writeCurrentVersion(root, previousVersion)
		}
		return "", fmt.Errorf("activate plugin version: %w", err)
	}
	if backupDir != "" {
		_ = os.RemoveAll(backupDir)
	}
	return versionDir, nil
}

func activePackageDir(pluginRoot string) string {
	if info, err := os.Stat(filepath.Join(pluginRoot, pluginManifestFileName)); err == nil && !info.IsDir() {
		return pluginRoot
	}
	version := readCurrentVersion(pluginRoot)
	if version != "" {
		candidate := filepath.Join(pluginRoot, version)
		if info, err := os.Stat(filepath.Join(candidate, pluginManifestFileName)); err == nil && !info.IsDir() {
			return candidate
		}
	}
	entries, err := os.ReadDir(pluginRoot)
	if err != nil {
		return ""
	}
	versions := make([]string, 0)
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if _, err := os.Stat(filepath.Join(pluginRoot, entry.Name(), pluginManifestFileName)); err == nil {
			versions = append(versions, entry.Name())
		}
	}
	if len(versions) == 0 {
		return ""
	}
	sort.Strings(versions)
	return filepath.Join(pluginRoot, versions[len(versions)-1])
}

func readCurrentVersion(pluginRoot string) string {
	data, err := os.ReadFile(filepath.Join(pluginRoot, "current"))
	if err != nil {
		return ""
	}
	value := strings.TrimSpace(string(data))
	if validateVersionDirectory(value) != nil {
		return ""
	}
	return value
}

func writeCurrentVersion(pluginRoot, version string) error {
	if err := validateVersionDirectory(version); err != nil {
		return err
	}
	tmp := filepath.Join(pluginRoot, ".current.tmp")
	if err := os.WriteFile(tmp, []byte(version+"\n"), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, filepath.Join(pluginRoot, "current")); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func validateVersionDirectory(version string) error {
	version = strings.TrimSpace(version)
	if version == "" || version == "." || version == ".." || strings.ContainsAny(version, `/\\`) || strings.ContainsRune(version, '\x00') {
		return errors.New("plugin version must be a single safe directory name")
	}
	return nil
}

func validateInstalledPayload(pluginDir string, manifest Manifest) error {
	if manifest.Type == PluginTypeNode {
		entry, err := resolvePackagePath(pluginDir, manifest.Entry)
		if err != nil {
			return fmt.Errorf("plugin entry is invalid: %w", err)
		}
		if err := validateRegularFile(entry, "node plugin entry"); err != nil {
			return err
		}
		return nil
	}
	entries := manifest.Binaries
	if len(entries) == 0 {
		entries = map[string]string{"legacy": manifest.Entry}
	}
	for platform, entry := range entries {
		if platform == "legacy" && strings.TrimSpace(entry) == "" {
			return errors.New("plugin executable entry is required")
		}
		path, err := resolvePackagePath(pluginDir, entry)
		if err != nil {
			return fmt.Errorf("plugin executable %q is invalid: %w", platform, err)
		}
		if err := validateRegularFile(path, "plugin executable"); err != nil {
			return err
		}
	}
	return nil
}

func copyPluginDirectory(source, target string, developmentSource bool) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path != source && developmentSource && (entry.Name() == "node_modules" || entry.Name() == ".git") {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		destination := filepath.Join(target, relative)
		if entry.IsDir() {
			return os.MkdirAll(destination, 0o700)
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("plugin packages cannot contain symbolic links")
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		defer input.Close()
		if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
			return err
		}
		output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o700)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(output, input)
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}
