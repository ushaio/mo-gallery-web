package storage_plugins

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Manager struct {
	registry      *sourceRegistry
	pluginDir     string
	resolver      RuntimeResolver
	runtimeRoot   string
	developerMode bool
	trustedKeys   map[string]ed25519.PublicKey
	mu            sync.Mutex
	runtimes      map[string]*pluginRuntime
}

func NewManager(configDir string) (*Manager, error) {
	registry, err := newSourceRegistry(configDir, NewCredentialStore())
	if err != nil {
		return nil, err
	}
	runtimeRoot, err := materializeEmbeddedRuntime(configDir)
	if err != nil {
		return nil, fmt.Errorf("materialize bundled Node runtime: %w", err)
	}
	if runtimeRoot == "" {
		runtimeRoot = defaultNodeRuntimeRoot()
	}
	manager := &Manager{registry: registry, pluginDir: filepath.Join(configDir, "storage-plugins"), resolver: newDefaultRuntimeResolver(runtimeRoot), runtimeRoot: runtimeRoot, trustedKeys: make(map[string]ed25519.PublicKey), runtimes: make(map[string]*pluginRuntime)}
	if err := manager.loadBundledPluginSigningKey(); err != nil {
		return nil, err
	}
	return manager, nil
}

func NewManagerWithCredentialStore(configDir string, credentials CredentialStore) (*Manager, error) {
	registry, err := newSourceRegistry(configDir, credentials)
	if err != nil {
		return nil, err
	}
	runtimeRoot, err := materializeEmbeddedRuntime(configDir)
	if err != nil {
		return nil, fmt.Errorf("materialize bundled Node runtime: %w", err)
	}
	if runtimeRoot == "" {
		runtimeRoot = defaultNodeRuntimeRoot()
	}
	manager := &Manager{registry: registry, pluginDir: filepath.Join(configDir, "storage-plugins"), resolver: newDefaultRuntimeResolver(runtimeRoot), runtimeRoot: runtimeRoot, trustedKeys: make(map[string]ed25519.PublicKey), runtimes: make(map[string]*pluginRuntime)}
	if err := manager.loadBundledPluginSigningKey(); err != nil {
		return nil, err
	}
	return manager, nil
}

// SetDeveloperMode explicitly enables unsigned package installation for local
// development. Production callers leave it disabled.
func (m *Manager) SetDeveloperMode(enabled bool) {
	m.developerMode = enabled
	if enabled {
		m.resolver = newDevelopmentRuntimeResolver(m.runtimeRoot)
		return
	}
	m.resolver = newDefaultRuntimeResolver(m.runtimeRoot)
}

func (m *Manager) SetTrustedSigningKey(keyID string, key ed25519.PublicKey) error {
	if strings.TrimSpace(keyID) == "" || len(key) != ed25519.PublicKeySize {
		return errors.New("plugin signing key id and Ed25519 public key are required")
	}
	if m.trustedKeys == nil {
		m.trustedKeys = make(map[string]ed25519.PublicKey)
	}
	m.trustedKeys[strings.TrimSpace(keyID)] = append(ed25519.PublicKey(nil), key...)
	return nil
}

func (m *Manager) loadBundledPluginSigningKey() error {
	if strings.TrimSpace(BundledPluginSigningPublicKey) == "" {
		return nil
	}
	key, err := decodeEd25519PublicKey(BundledPluginSigningPublicKey)
	if err != nil {
		return fmt.Errorf("load bundled plugin signing key: %w", err)
	}
	return m.SetTrustedSigningKey(BundledPluginSigningKeyID, key)
}

func (m *Manager) ListPlugins() []PluginDescriptor {
	result := make([]PluginDescriptor, 0)
	known := make(map[string]bool)
	// Official plugins are normally installed from a repository source, not
	// shipped inside the Desktop release. A bundled directory remains useful
	// for local development and offline installations.
	if bundled, err := discoverManifests(m.bundledPluginDir(), m.resolver, m.trustedKeys); err == nil {
		for _, plugin := range bundled {
			plugin.BuiltIn = false
			result = append(result, plugin)
			known[plugin.ID] = true
		}
	}
	if external, err := discoverManifests(m.pluginDir, m.resolver, m.trustedKeys); err == nil {
		for _, plugin := range external {
			if known[plugin.ID] {
				continue
			}
			result = append(result, plugin)
			known[plugin.ID] = true
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result
}

// System-plugin names are the forward-compatible API. The storage-prefixed
// methods remain below as compatibility entrypoints for existing Wails clients.
func (m *Manager) ListSystemPlugins() []PluginDescriptor { return m.ListPlugins() }
func (m *Manager) ListSystemPluginVersions(pluginID string) ([]PluginVersionDescriptor, error) {
	return m.ListPluginVersions(pluginID)
}
func (m *Manager) InstallSystemPlugin(pluginDirectory string) (PluginDescriptor, error) {
	return m.InstallPlugin(pluginDirectory)
}
func (m *Manager) InstallSystemPluginPackage(packagePath string) (PluginDescriptor, error) {
	return m.InstallPluginPackage(packagePath)
}
func (m *Manager) RollbackSystemPlugin(pluginID, version string) error {
	return m.RollbackPlugin(pluginID, version)
}
func (m *Manager) UninstallSystemPlugin(pluginID string) error { return m.UninstallPlugin(pluginID) }
func (m *Manager) SystemPluginLocation(pluginID string) (string, error) {
	return m.PluginLocation(pluginID)
}

// ListPluginVersions returns the validated versions stored for one plugin.
// Paths and executable commands stay host-side; the renderer only receives
// enough state to explain compatibility and choose a rollback target.
func (m *Manager) ListPluginVersions(pluginID string) ([]PluginVersionDescriptor, error) {
	pluginID = strings.TrimSpace(pluginID)
	if !validPluginID(pluginID) {
		return nil, errors.New("storage plugin id is invalid")
	}
	root := filepath.Join(m.pluginDir, pluginID)
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []PluginVersionDescriptor{}, nil
		}
		return nil, fmt.Errorf("list storage plugin versions: %w", err)
	}
	activeDir := activePackageDir(root)
	activeVersion := ""
	if activeDir != "" && filepath.Dir(activeDir) == filepath.Clean(root) {
		activeVersion = filepath.Base(activeDir)
	}
	result := make([]PluginVersionDescriptor, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		version := entry.Name()
		if validateVersionDirectory(version) != nil {
			continue
		}
		versionDir := filepath.Join(root, version)
		manifest, readErr := readManifest(filepath.Join(versionDir, pluginManifestFileName))
		if readErr != nil || manifest.ID != pluginID {
			continue
		}
		if payloadErr := validateInstalledPayload(versionDir, manifest); payloadErr != nil {
			continue
		}
		_, _, _, resolveErr := m.resolver.Resolve(context.Background(), manifest, versionDir)
		runtimeStatus := ""
		if resolveErr != nil {
			runtimeStatus = resolveErr.Error()
		}
		signatureStatus := manifestSignatureStatus(filepath.Join(versionDir, pluginManifestFileName), m.trustedKeys)
		result = append(result, PluginVersionDescriptor{
			PluginID: pluginID, Version: manifest.Version, Type: manifest.Type,
			Runtime: manifest.Runtime, Platforms: append([]string(nil), manifest.Platforms...),
			Active: manifest.Version == activeVersion, RuntimeAvailable: resolveErr == nil,
			RuntimeStatus: runtimeStatus, SignatureStatus: signatureStatus,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Active != result[j].Active {
			return result[i].Active
		}
		return result[i].Version > result[j].Version
	})
	return result, nil
}

func (m *Manager) bundledPluginDir() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Join(filepath.Dir(executable), "storage-plugins")
}

func (m *Manager) InstallPlugin(pluginDirectory string) (PluginDescriptor, error) {
	if strings.TrimSpace(pluginDirectory) == "" {
		return PluginDescriptor{}, errors.New("plugin directory is required")
	}
	if !m.developerMode {
		return PluginDescriptor{}, &PluginError{
			Code:    ErrorDeveloperModeRequired,
			Message: "unpacked storage plugin directory installation requires developer mode",
		}
	}
	manifestPath, err := filepath.Abs(pluginDirectory)
	if err != nil {
		return PluginDescriptor{}, fmt.Errorf("resolve plugin directory: %w", err)
	}
	if info, statErr := os.Stat(manifestPath); statErr == nil && info.IsDir() {
		manifestPath = filepath.Join(manifestPath, pluginManifestFileName)
	} else if statErr != nil {
		return PluginDescriptor{}, fmt.Errorf("stat plugin directory: %w", statErr)
	}
	if err := os.MkdirAll(m.pluginDir, 0o700); err != nil {
		return PluginDescriptor{}, fmt.Errorf("create plugin directory: %w", err)
	}
	return installManifest(manifestPath, m.pluginDir, m.resolver)
}

func (m *Manager) InstallPluginPackage(packagePath string) (PluginDescriptor, error) {
	packageData, err := inspectPluginPackage(packagePath, m.trustedKeys, m.developerMode)
	if err != nil {
		return PluginDescriptor{}, err
	}
	defer os.RemoveAll(packageData.Directory)
	return installDirectory(packageData.Directory, packageData.Manifest, m.pluginDir, m.resolver, packageData.SignatureStatus, false)
}

func (m *Manager) RollbackPlugin(pluginID, version string) error {
	pluginID = strings.TrimSpace(pluginID)
	version = strings.TrimSpace(version)
	if !validPluginID(pluginID) {
		return errors.New("storage plugin id is invalid")
	}
	if err := validateVersionDirectory(version); err != nil {
		return err
	}
	root := filepath.Join(m.pluginDir, pluginID)
	versionDir := filepath.Join(root, version)
	manifest, err := readManifest(filepath.Join(versionDir, pluginManifestFileName))
	if err != nil {
		return fmt.Errorf("plugin version is unavailable: %w", err)
	}
	if manifest.ID != pluginID {
		return errors.New("plugin version manifest id mismatch")
	}
	if err := validateInstalledPayload(versionDir, manifest); err != nil {
		return err
	}
	if err := m.validateStartIntegrity(filepath.Join(versionDir, pluginManifestFileName)); err != nil {
		return err
	}
	if err := writeCurrentVersion(root, version); err != nil {
		return fmt.Errorf("rollback plugin version: %w", err)
	}
	m.stopRuntimesForPlugin(pluginID)
	return nil
}

// UninstallPlugin removes an externally installed plugin package while keeping
// its storage source records and credentials. Sources become temporarily
// unavailable until the same plugin ID is installed again, at which point
// their configuration can be used without re-entering it.
func (m *Manager) UninstallPlugin(pluginID string) error {
	pluginID = strings.TrimSpace(pluginID)
	if pluginID == "" {
		return errors.New("storage plugin id is required")
	}
	var descriptor *PluginDescriptor
	for _, item := range m.ListPlugins() {
		if item.ID == pluginID {
			copy := item
			descriptor = &copy
			break
		}
	}
	if descriptor == nil {
		return fmt.Errorf("storage plugin not found: %s", pluginID)
	}
	pluginPath := filepath.Dir(descriptor.ManifestPath)
	pluginRoot := pluginPath
	if filepath.Base(pluginRoot) == descriptor.Version {
		pluginRoot = filepath.Dir(pluginRoot)
	}
	if filepath.Clean(filepath.Dir(pluginRoot)) != filepath.Clean(m.pluginDir) {
		return errors.New("bundled storage plugins cannot be uninstalled")
	}
	// Stop all source runtimes before removing the package. The registry and
	// credential store intentionally remain untouched so reinstalling this
	// plugin restores the existing sources automatically.
	m.stopRuntimesForPlugin(pluginID)
	if err := os.RemoveAll(pluginRoot); err != nil {
		return fmt.Errorf("remove storage plugin: %w", err)
	}
	return nil
}

func (m *Manager) PluginLocation(pluginID string) (string, error) {
	pluginID = strings.TrimSpace(pluginID)
	if pluginID == "" {
		return "", errors.New("storage plugin id is required")
	}
	for _, plugin := range m.ListPlugins() {
		if plugin.ID != pluginID {
			continue
		}
		if plugin.ManifestPath != "" {
			return filepath.Dir(plugin.ManifestPath), nil
		}
		if plugin.Command != "" {
			return filepath.Dir(plugin.Command), nil
		}
		executable, err := os.Executable()
		if err != nil {
			return "", fmt.Errorf("resolve desktop executable: %w", err)
		}
		return filepath.Dir(executable), nil
	}
	return "", fmt.Errorf("storage plugin not found: %s", pluginID)
}

func (m *Manager) ListSources() []SourceDTO {
	sources := m.registry.list()
	result := make([]SourceDTO, 0, len(sources))
	for _, source := range sources {
		result = append(result, SourceDTO{
			ID: source.ID, Name: source.Name, PluginID: source.PluginID,
			PluginVersion: source.PluginVersion, Config: cloneStringMap(source.Config),
			Enabled: source.Enabled, Status: source.Status, LastError: source.LastError,
			CreatedAt: source.CreatedAt, UpdatedAt: source.UpdatedAt,
		})
	}
	return result
}

func (m *Manager) GetSource(id string) (Source, bool) {
	return m.registry.get(strings.TrimSpace(id))
}

// GetSourceCredentials reads the persisted credentials for one source on
// demand. Credentials are intentionally excluded from SourceDTO/list calls.
func (m *Manager) GetSourceCredentials(id string) (map[string]string, error) {
	source, ok := m.GetSource(id)
	if !ok {
		return nil, fmt.Errorf("storage source not found: %s", strings.TrimSpace(id))
	}
	result := make(map[string]string, len(source.CredentialRefs))
	for name, reference := range source.CredentialRefs {
		value, err := m.registry.credentials.Get(reference)
		if err != nil {
			return nil, fmt.Errorf("read credential %s: %w", name, err)
		}
		result[name] = value
	}
	return result, nil
}

func (m *Manager) PluginID(sourceID string) string {
	source, ok := m.GetSource(sourceID)
	if !ok {
		return ""
	}
	return source.PluginID
}

func (m *Manager) CreateSource(input SourceInput) (SourceDTO, error) {
	input, err := m.normalizeSourceInput(input)
	if err != nil {
		return SourceDTO{}, err
	}
	source, err := m.registry.upsert(input)
	if err != nil {
		return SourceDTO{}, err
	}
	return sourceDTO(source), nil
}

func (m *Manager) UpdateSource(input SourceInput) (SourceDTO, error) {
	id := strings.TrimSpace(input.ID)
	if id == "" {
		return SourceDTO{}, errors.New("storage source id is required")
	}
	if _, ok := m.GetSource(id); !ok {
		return SourceDTO{}, fmt.Errorf("storage source not found: %s", id)
	}
	input, err := m.normalizeSourceInput(input)
	if err != nil {
		return SourceDTO{}, err
	}
	m.stopRuntime(id)
	source, err := m.registry.upsert(input)
	if err != nil {
		return SourceDTO{}, err
	}
	return sourceDTO(source), nil
}

// normalizeSourceInput makes the installed catalog authoritative. Command and
// args are never accepted from the renderer because they would allow a source
// configuration to launch an arbitrary local process.
func (m *Manager) normalizeSourceInput(input SourceInput) (SourceInput, error) {
	pluginID := strings.TrimSpace(input.PluginID)
	if pluginID == "" {
		return SourceInput{}, errors.New("storage plugin id is required")
	}
	for _, plugin := range m.ListPlugins() {
		if plugin.ID != pluginID || !plugin.Installed {
			continue
		}
		if !descriptorSupportsContribution(plugin, "storage", pluginAPIVersion) {
			return SourceInput{}, fmt.Errorf("system plugin does not contribute storage@%s: %s", pluginAPIVersion, pluginID)
		}
		if !m.developerMode && plugin.SignatureStatus != "verified" {
			return SourceInput{}, &PluginError{Code: ErrorInvalidManifest, Message: "system plugin integrity is not verified"}
		}
		if plugin.Type == PluginTypeExecutable && strings.TrimSpace(plugin.Command) == "" {
			continue
		}
		input.PluginID = pluginID
		input.Command = plugin.Command
		input.Args = append([]string(nil), plugin.Args...)
		return input, nil
	}
	return SourceInput{}, fmt.Errorf("storage plugin is not installed: %s", pluginID)
}

func (m *Manager) SetSourceEnabled(id string, enabled bool) (SourceDTO, error) {
	source, ok := m.GetSource(id)
	if !ok {
		return SourceDTO{}, fmt.Errorf("storage source not found: %s", id)
	}
	if !enabled {
		m.stopRuntime(id)
	}
	updated, err := m.registry.upsert(SourceInput{
		ID: id, Name: source.Name, PluginID: source.PluginID, Config: source.Config,
		Command: source.Command, Args: source.Args, Enabled: enabled,
	})
	if err != nil {
		return SourceDTO{}, err
	}
	if enabled {
		updated.Status = "idle"
		m.registry.updateStatus(id, "idle", "")
	} else {
		updated.Status = "disabled"
		m.registry.updateStatus(id, "disabled", "")
	}
	return sourceDTO(updated), nil
}

func (m *Manager) DeleteSource(id string) error {
	m.stopRuntime(id)
	return m.registry.remove(strings.TrimSpace(id))
}

func (m *Manager) TestSource(ctx context.Context, sourceID string) (HealthResult, error) {
	runtime, source, err := m.runtimeForSource(ctx, sourceID)
	if err != nil {
		return HealthResult{Status: "error", Message: err.Error()}, err
	}
	if !runtime.supports(capabilityHealth) {
		return HealthResult{Status: "error", Message: "storage plugin does not support health checks"}, errors.New("storage plugin does not support health checks")
	}
	healthCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	var result HealthResult
	if err := runtime.request(healthCtx, "plugin.health", map[string]any{"sourceId": source.ID}, &result); err != nil {
		m.stopRuntime(source.ID)
		m.registry.updateStatus(source.ID, "error", err.Error())
		return HealthResult{Status: "error", Message: err.Error()}, err
	}
	m.registry.updateStatus(source.ID, result.Status, result.Message)
	return result, nil
}

func (m *Manager) Put(ctx context.Context, req PutRequest) (ObjectInfo, error) {
	if strings.TrimSpace(req.SourceID) == "" {
		return ObjectInfo{}, errors.New("storage source id is required")
	}
	if strings.TrimSpace(req.FilePath) == "" {
		return ObjectInfo{}, errors.New("upload file path is required")
	}
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return ObjectInfo{}, err
	}
	if !runtime.supports(capabilityPut) {
		return ObjectInfo{}, errors.New("storage plugin does not support object.put")
	}
	key, err := resolveObjectKey(source.Config, req.Key, req.Path, req.UseFullPath)
	if err != nil {
		return ObjectInfo{}, err
	}
	handle, err := runtime.registerTransfer(req.FilePath, req.Progress)
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("open upload transfer: %w", err)
	}
	defer runtime.unregisterTransfer(handle.ID)
	params := map[string]any{
		"sourceId": source.ID, "transferId": handle.ID, "key": key,
		"size": handle.Size, "contentType": req.ContentType,
		"checksum": req.Checksum, "idempotencyKey": req.IdempotencyKey,
	}
	var result ObjectInfo
	if err := runtime.request(ctx, "object.put", params, &result); err != nil {
		m.registry.updateStatus(source.ID, "error", err.Error())
		return ObjectInfo{}, err
	}
	if result.Key == "" {
		result.Key = key
	}
	if result.URLType == "" {
		result.URLType = urlTypePublic
	}
	if result.Size == 0 {
		result.Size = handle.Size
	}
	m.registry.updateStatus(source.ID, "ready", "")
	return result, nil
}

func (m *Manager) Delete(ctx context.Context, req DeleteRequest) error {
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return err
	}
	if !runtime.supports(capabilityDelete) {
		return errors.New("storage plugin does not support object.delete")
	}
	key, err := resolveObjectKey(source.Config, req.Key, "", true)
	if err != nil {
		return err
	}
	if err := runtime.request(ctx, "object.delete", map[string]any{"sourceId": source.ID, "key": key}, nil); err != nil {
		m.registry.updateStatus(source.ID, "error", err.Error())
		return err
	}
	return nil
}

func (m *Manager) Get(ctx context.Context, req GetRequest) (ObjectInfo, error) {
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return ObjectInfo{}, err
	}
	if !runtime.supports(capabilityGet) {
		return ObjectInfo{}, &PluginError{Code: ErrorCapabilityMissing, Message: "storage plugin does not support object.get"}
	}
	key, err := resolveObjectKey(source.Config, req.Key, "", true)
	if err != nil {
		return ObjectInfo{}, err
	}
	if strings.TrimSpace(req.DestinationPath) == "" {
		return ObjectInfo{}, errors.New("download destination path is required")
	}
	handle, err := runtime.registerDownloadTransfer(req.DestinationPath)
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("open download transfer: %w", err)
	}
	defer runtime.unregisterTransfer(handle.ID)
	var result ObjectInfo
	if err := runtime.request(ctx, "object.get", map[string]any{"sourceId": source.ID, "key": key, "transferId": handle.ID}, &result); err != nil {
		return ObjectInfo{}, err
	}
	written, err := runtime.commitDownloadTransfer(handle.ID)
	if err != nil {
		return ObjectInfo{}, err
	}
	if result.Key == "" {
		result.Key = key
	}
	if result.Size == 0 {
		result.Size = written
	}
	return result, nil
}

func (m *Manager) Stat(ctx context.Context, req StatRequest) (ObjectInfo, error) {
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return ObjectInfo{}, err
	}
	if !runtime.supports(capabilityStat) {
		return ObjectInfo{}, &PluginError{Code: ErrorCapabilityMissing, Message: "storage plugin does not support object.stat"}
	}
	key, err := resolveObjectKey(source.Config, req.Key, "", true)
	if err != nil {
		return ObjectInfo{}, err
	}
	var result ObjectInfo
	if err := runtime.request(ctx, "object.stat", map[string]any{"sourceId": source.ID, "key": key}, &result); err != nil {
		return ObjectInfo{}, err
	}
	return result, nil
}

func (m *Manager) List(ctx context.Context, req ListRequest) (ListResult, error) {
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return ListResult{}, err
	}
	if !runtime.supports(capabilityList) {
		return ListResult{}, &PluginError{Code: ErrorCapabilityMissing, Message: "storage plugin does not support object.list"}
	}
	prefix := strings.TrimSpace(strings.ReplaceAll(req.Prefix, "\\", "/"))
	if strings.HasPrefix(prefix, "/") || strings.Split(prefix, "/")[0] == ".." || strings.Contains(prefix, "/../") || strings.Contains(prefix, "/./") {
		return ListResult{}, errors.New("invalid storage object prefix")
	}
	if req.Limit < 0 || req.Limit > 1000 {
		return ListResult{}, errors.New("storage object list limit must be between 0 and 1000")
	}
	// The prefix is a full bucket prefix: the source basePath is already part of
	// the stored keys, and the plugin env carries basePath="" (see
	// pluginEnvironment), so the worker never prepends it. Forwarding an empty
	// cursor string would make S3-compatible backends reject the request with
	// InvalidContinuation, so omit the key when there is no continuation token.
	params := map[string]any{"sourceId": source.ID, "prefix": prefix, "limit": req.Limit}
	if cursor := strings.TrimSpace(req.Cursor); cursor != "" {
		params["cursor"] = cursor
	}
	var result ListResult
	if err := runtime.request(ctx, "object.list", params, &result); err != nil {
		return ListResult{}, err
	}
	return result, nil
}

func (m *Manager) Move(ctx context.Context, req MoveRequest) (ObjectInfo, error) {
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return ObjectInfo{}, err
	}
	if !runtime.supports(capabilityMove) {
		return ObjectInfo{}, &PluginError{Code: ErrorCapabilityMissing, Message: "storage plugin does not support object.move"}
	}
	fromKey, err := resolveObjectKey(source.Config, req.FromKey, "", true)
	if err != nil {
		return ObjectInfo{}, err
	}
	toKey, err := resolveObjectKey(source.Config, req.ToKey, "", true)
	if err != nil {
		return ObjectInfo{}, err
	}
	var result ObjectInfo
	if err := runtime.request(ctx, "object.move", map[string]any{"sourceId": source.ID, "fromKey": fromKey, "toKey": toKey}, &result); err != nil {
		return ObjectInfo{}, err
	}
	return result, nil
}

func (m *Manager) GetURL(ctx context.Context, req URLRequest) (ObjectInfo, error) {
	runtime, source, err := m.runtimeForSource(ctx, req.SourceID)
	if err != nil {
		return ObjectInfo{}, err
	}
	if !runtime.supports(capabilityGetURL) {
		return ObjectInfo{}, errors.New("storage plugin does not support object.getUrl")
	}
	key, err := resolveObjectKey(source.Config, req.Key, "", true)
	if err != nil {
		return ObjectInfo{}, err
	}
	var result ObjectInfo
	if err := runtime.request(ctx, "object.getUrl", map[string]any{"sourceId": source.ID, "key": key}, &result); err != nil {
		return ObjectInfo{}, err
	}
	return result, nil
}

func (m *Manager) runtimeForSource(ctx context.Context, sourceID string) (*pluginRuntime, Source, error) {
	source, ok := m.registry.get(strings.TrimSpace(sourceID))
	if !ok {
		return nil, Source{}, fmt.Errorf("storage source not found: %s", sourceID)
	}
	if !source.Enabled {
		return nil, source, errors.New("storage source is disabled")
	}
	m.mu.Lock()
	if runtime := m.runtimes[source.ID]; runtime != nil {
		select {
		case <-runtime.closed:
			delete(m.runtimes, source.ID)
		default:
			m.mu.Unlock()
			return runtime, source, nil
		}
	}
	m.mu.Unlock()
	command, args, resolverEnv, err := m.commandFor(ctx, source)
	if err != nil {
		return nil, source, err
	}
	environment, err := m.pluginEnvironment(source)
	if err != nil {
		return nil, source, err
	}
	environment = append(environment, resolverEnv...)
	runtime, err := startPluginRuntime(command, args, environment)
	if err != nil {
		m.registry.updateStatus(source.ID, "error", err.Error())
		return nil, source, err
	}
	var manifest Manifest
	manifestCtx, cancel := withTimeout(ctx)
	defer cancel()
	if err := runtime.request(manifestCtx, "plugin.getManifest", nil, &manifest); err != nil {
		_ = runtime.stop()
		m.registry.updateStatus(source.ID, "error", err.Error())
		return nil, source, err
	}
	if manifest.ID != source.PluginID {
		_ = runtime.stop()
		return nil, source, fmt.Errorf("storage plugin manifest id %q does not match source plugin %q", manifest.ID, source.PluginID)
	}
	if err := normalizeManifest(&manifest); err != nil {
		_ = runtime.stop()
		return nil, source, &PluginError{Code: ErrorInvalidManifest, Message: "system plugin returned an invalid manifest", Cause: err}
	}
	if !manifest.SupportsContribution("storage", pluginAPIVersion) {
		_ = runtime.stop()
		return nil, source, fmt.Errorf("system plugin does not contribute storage@%s", pluginAPIVersion)
	}
	capabilities := make(map[string]struct{}, len(manifest.Capabilities))
	for _, capability := range manifest.Capabilities {
		if strings.TrimSpace(capability) != "" {
			capabilities[strings.TrimSpace(capability)] = struct{}{}
		}
	}
	if _, ok := capabilities[capabilityValidate]; !ok {
		_ = runtime.stop()
		return nil, source, errors.New("storage plugin must declare source.validate")
	}
	runtime.mu.Lock()
	runtime.capabilities = capabilities
	runtime.mu.Unlock()
	m.registry.updatePluginVersion(source.ID, manifest.Version)
	var validation struct {
		Valid bool   `json:"valid"`
		Error string `json:"error,omitempty"`
	}
	if err := runtime.request(manifestCtx, "source.validate", map[string]any{"sourceId": source.ID, "config": source.Config}, &validation); err != nil {
		_ = runtime.stop()
		m.registry.updateStatus(source.ID, "error", err.Error())
		return nil, source, err
	}
	if !validation.Valid {
		_ = runtime.stop()
		message := validation.Error
		if message == "" {
			message = "storage source validation failed"
		}
		m.registry.updateStatus(source.ID, "error", message)
		return nil, source, errors.New(message)
	}
	m.mu.Lock()
	if existing := m.runtimes[source.ID]; existing != nil {
		m.mu.Unlock()
		_ = runtime.stop()
		return existing, source, nil
	}
	m.runtimes[source.ID] = runtime
	m.mu.Unlock()
	m.registry.updateStatus(source.ID, "ready", "")
	return runtime, source, nil
}

func descriptorSupportsContribution(plugin PluginDescriptor, domain, apiVersion string) bool {
	for _, contribution := range plugin.Contributions {
		if contribution.Domain == domain && contribution.APIVersion == apiVersion {
			return true
		}
	}
	return len(plugin.Contributions) == 0 && domain == "storage" && plugin.APIVersion == apiVersion
}

func (m *Manager) validateStartIntegrity(manifestPath string) error {
	stage := filepath.Dir(manifestPath)
	manifest, err := readManifest(manifestPath)
	if err != nil {
		return &PluginError{Code: ErrorInvalidManifest, Message: "storage plugin manifest is invalid", Cause: err}
	}
	if m.developerMode {
		if _, statErr := os.Stat(filepath.Join(stage, pluginSignatureFileName)); os.IsNotExist(statErr) {
			return nil
		}
	}
	names, err := packageFileNames(stage)
	if err != nil {
		return &PluginError{Code: ErrorInvalidManifest, Message: "storage plugin package is invalid", Cause: err}
	}
	if err := verifyPackageChecksums(stage, names); err != nil {
		return &PluginError{Code: ErrorInvalidManifest, Message: "storage plugin integrity verification failed", Cause: err}
	}
	status, err := verifyPackageSignature(stage, manifest, m.trustedKeys, m.developerMode)
	if err != nil || (!m.developerMode && status != "verified") {
		if err == nil {
			err = errors.New("storage plugin signature is not verified")
		}
		return &PluginError{Code: ErrorInvalidManifest, Message: "storage plugin trust verification failed", Cause: err}
	}
	return nil
}

func (m *Manager) commandFor(ctx context.Context, source Source) (string, []string, []string, error) {
	for _, plugin := range m.ListPlugins() {
		if plugin.ID != source.PluginID || !plugin.Installed || plugin.ManifestPath == "" {
			continue
		}
		manifest, err := readManifest(plugin.ManifestPath)
		if err != nil {
			return "", nil, nil, &PluginError{Code: ErrorInvalidManifest, Message: "storage plugin manifest is invalid", Cause: err}
		}
		if err := m.validateStartIntegrity(plugin.ManifestPath); err != nil {
			return "", nil, nil, err
		}
		if hasUnsupportedContribution(manifest) {
			return "", nil, nil, &PluginError{Code: ErrorInvalidManifest, Message: "system plugin declares an unsupported contribution domain"}
		}
		command, args, env, err := m.resolver.Resolve(ctx, manifest, filepath.Dir(plugin.ManifestPath))
		if err != nil {
			return "", nil, nil, err
		}
		return command, args, env, nil
	}
	return "", nil, nil, fmt.Errorf("storage plugin is not installed: %s", source.PluginID)
}

func hasUnsupportedContribution(manifest Manifest) bool {
	for _, contribution := range manifest.Contributions {
		if contribution.Domain == "ui" {
			return true
		}
	}
	return false
}

func (m *Manager) pluginEnvironment(source Source) ([]string, error) {
	config := cloneStringMap(source.Config)
	// The host resolves the source base path into object keys. The worker must
	// not prepend it a second time.
	config["basePath"] = ""
	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil, fmt.Errorf("encode plugin config: %w", err)
	}
	environment := []string{
		"MO_STORAGE_PLUGIN_SOURCE_ID=" + source.ID,
		"MO_STORAGE_PLUGIN_ID=" + source.PluginID,
		"MO_STORAGE_PLUGIN_CONFIG=" + string(configJSON),
	}
	for name, ref := range source.CredentialRefs {
		value, err := m.registry.credentials.Get(ref)
		if err != nil {
			return nil, fmt.Errorf("read credential %s: %w", name, err)
		}
		environment = append(environment, "MO_STORAGE_PLUGIN_CREDENTIAL_"+envKey(name)+"="+value)
	}
	return environment, nil
}

func (m *Manager) stopRuntime(sourceID string) {
	m.mu.Lock()
	runtime := m.runtimes[sourceID]
	delete(m.runtimes, sourceID)
	m.mu.Unlock()
	if runtime != nil {
		_ = runtime.stop()
	}
}

func (m *Manager) stopRuntimesForPlugin(pluginID string) {
	for _, source := range m.registry.list() {
		if source.PluginID == pluginID {
			m.stopRuntime(source.ID)
		}
	}
}

func (m *Manager) StopAll() {
	m.mu.Lock()
	runtimes := make([]*pluginRuntime, 0, len(m.runtimes))
	for id, runtime := range m.runtimes {
		runtimes = append(runtimes, runtime)
		delete(m.runtimes, id)
	}
	m.mu.Unlock()
	for _, runtime := range runtimes {
		_ = runtime.stop()
	}
}

func sourceDTO(source Source) SourceDTO {
	return SourceDTO{
		ID: source.ID, Name: source.Name, PluginID: source.PluginID,
		PluginVersion: source.PluginVersion, Config: cloneStringMap(source.Config),
		Enabled: source.Enabled, Status: source.Status, LastError: source.LastError,
		CreatedAt: source.CreatedAt, UpdatedAt: source.UpdatedAt,
	}
}

func resolveObjectKey(config map[string]string, key, subpath string, fullPath bool) (string, error) {
	key = strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	subpath = strings.TrimSpace(strings.ReplaceAll(subpath, "\\", "/"))
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "..") {
		return "", errors.New("invalid storage object key")
	}
	if subpath != "" {
		if strings.HasPrefix(subpath, "/") || strings.Contains(subpath, "..") {
			return "", errors.New("invalid storage object path")
		}
		key = path.Join(subpath, key)
	}
	if !fullPath {
		if basePath := strings.Trim(strings.ReplaceAll(config["basePath"], "\\", "/"), "/"); basePath != "" {
			key = path.Join(basePath, key)
		}
	}
	key = strings.TrimPrefix(filepath.ToSlash(key), "/")
	if key == "" || key == "." {
		return "", errors.New("storage object key is empty")
	}
	return key, nil
}

func envKey(value string) string {
	var builder strings.Builder
	for _, r := range strings.ToUpper(value) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
		} else {
			builder.WriteByte('_')
		}
	}
	return builder.String()
}
