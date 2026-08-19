package storage_plugins

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"mo-gallery-desktop/plugin_core"
)

const (
	marketplaceSchemaVersion  = 1
	marketplaceIndexMaxBytes  = 4 * 1024 * 1024
	marketplaceCacheTTL       = 15 * time.Minute
	marketplaceCacheFileName  = "repository-index.json"
	marketplaceRepositoryName = "MO Gallery 官方插件仓库"
)

// BuiltInPluginRepositoryURL is owned by the host; the renderer cannot supply a repository URL.
const BuiltInPluginRepositoryURL = "https://raw.githubusercontent.com/ushaio/mo-gallery-plugin/master/index.json"

type MarketplaceArtifact struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type MarketplacePlugin struct {
	ID                  string                         `json:"id"`
	Name                string                         `json:"name"`
	Description         string                         `json:"description,omitempty"`
	Author              string                         `json:"author,omitempty"`
	Version             string                         `json:"version"`
	CoreAPIVersion      string                         `json:"coreApiVersion"`
	Contributions       []plugin_core.Contribution     `json:"contributions,omitempty"`
	Homepage            string                         `json:"homepage,omitempty"`
	Repository          string                         `json:"repository,omitempty"`
	Platforms           map[string]MarketplaceArtifact `json:"platforms,omitempty"`
	Available           bool                           `json:"available"`
	CompatibilityStatus string                         `json:"compatibilityStatus"`
	InstalledVersion    string                         `json:"installedVersion,omitempty"`
	UpdateAvailable     bool                           `json:"updateAvailable"`
}

type MarketplaceCatalog struct {
	SchemaVersion int                 `json:"schemaVersion"`
	SourceName    string              `json:"sourceName"`
	SourceURL     string              `json:"sourceUrl"`
	UpdatedAt     string              `json:"updatedAt,omitempty"`
	FetchedAt     string              `json:"fetchedAt"`
	Cached        bool                `json:"cached"`
	Stale         bool                `json:"stale"`
	Warning       string              `json:"warning,omitempty"`
	Plugins       []MarketplacePlugin `json:"plugins"`
}

type marketplaceIndex struct {
	SchemaVersion int                 `json:"schemaVersion"`
	UpdatedAt     string              `json:"updatedAt,omitempty"`
	Plugins       []MarketplacePlugin `json:"plugins"`
}

type Marketplace struct {
	manager             *Manager
	indexURL            string
	cachePath           string
	client              *http.Client
	downloadClient      *http.Client
	now                 func() time.Time
	mu                  sync.Mutex
	cached              *MarketplaceCatalog
	cachedAt            time.Time
	downloading         map[string]bool
	validateIndexURL    func(string) error
	validateArtifactURL func(string) error
}

func NewMarketplace(configDir string, manager *Manager) *Marketplace {
	return &Marketplace{
		manager:   manager,
		indexURL:  BuiltInPluginRepositoryURL,
		cachePath: filepath.Join(configDir, "plugin-marketplace", marketplaceCacheFileName),
		client:    &http.Client{Timeout: 20 * time.Second, CheckRedirect: validateMarketplaceIndexRedirect},
		downloadClient: &http.Client{
			Transport:     &http.Transport{Proxy: http.ProxyFromEnvironment, ResponseHeaderTimeout: 30 * time.Second},
			CheckRedirect: validateMarketplaceDownloadRedirect,
		},
		now:                 time.Now,
		downloading:         make(map[string]bool),
		validateIndexURL:    validateMarketplaceIndexURL,
		validateArtifactURL: validateMarketplaceArtifactURL,
	}
}

func (m *Marketplace) Fetch(ctx context.Context, force bool) (MarketplaceCatalog, error) {
	if m == nil {
		return MarketplaceCatalog{}, errors.New("插件市场未初始化")
	}
	now := m.now()
	if !force {
		m.mu.Lock()
		cached := cloneMarketplaceCatalog(m.cached)
		cachedAt := m.cachedAt
		m.mu.Unlock()
		if cached != nil && now.Sub(cachedAt) < marketplaceCacheTTL {
			cached.Cached = true
			m.enrichInstalled(cached)
			return *cached, nil
		}
	}

	catalog, err := m.fetchRemote(ctx, now)
	if err == nil {
		m.mu.Lock()
		m.cached = cloneMarketplaceCatalog(&catalog)
		m.cachedAt = now
		m.mu.Unlock()
		m.enrichInstalled(&catalog)
		return catalog, nil
	}

	cached, cacheErr := m.readCache(now)
	if cacheErr == nil {
		cached.Cached = true
		cached.Stale = true
		cached.Warning = "无法连接插件仓库，当前显示本地缓存"
		m.enrichInstalled(&cached)
		return cached, nil
	}
	return MarketplaceCatalog{}, fmt.Errorf("获取插件市场失败: %w", err)
}

func (m *Marketplace) fetchRemote(ctx context.Context, now time.Time) (MarketplaceCatalog, error) {
	if err := m.validateIndexURL(m.indexURL); err != nil {
		return MarketplaceCatalog{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, m.indexURL, nil)
	if err != nil {
		return MarketplaceCatalog{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "mo-gallery-desktop-plugin-marketplace")
	resp, err := m.client.Do(req)
	if err != nil {
		return MarketplaceCatalog{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return MarketplaceCatalog{}, fmt.Errorf("插件仓库返回 HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, marketplaceIndexMaxBytes+1))
	if err != nil {
		return MarketplaceCatalog{}, err
	}
	if len(data) > marketplaceIndexMaxBytes {
		return MarketplaceCatalog{}, errors.New("插件仓库索引超过大小限制")
	}
	catalog, err := parseMarketplaceIndex(data, m.indexURL, now)
	if err != nil {
		return MarketplaceCatalog{}, err
	}
	if err := m.writeCache(data); err != nil {
		catalog.Warning = "插件列表已更新，但无法写入本地缓存"
	}
	return catalog, nil
}

func parseMarketplaceIndex(data []byte, sourceURL string, fetchedAt time.Time) (MarketplaceCatalog, error) {
	var index marketplaceIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return MarketplaceCatalog{}, fmt.Errorf("解析插件仓库索引失败: %w", err)
	}
	if index.SchemaVersion != marketplaceSchemaVersion {
		return MarketplaceCatalog{}, fmt.Errorf("不支持的插件仓库索引版本: %d", index.SchemaVersion)
	}
	// Keep the Wails JSON contract stable even when a repository omits the list
	// or explicitly sends null: the renderer expects an array.
	if index.Plugins == nil {
		index.Plugins = []MarketplacePlugin{}
	}
	seen := make(map[string]struct{}, len(index.Plugins))
	platform := currentPlatformKey()
	for i := range index.Plugins {
		plugin := &index.Plugins[i]
		plugin.ID = strings.TrimSpace(plugin.ID)
		plugin.Name = strings.TrimSpace(plugin.Name)
		plugin.Version = strings.TrimSpace(plugin.Version)
		plugin.CoreAPIVersion = strings.TrimSpace(plugin.CoreAPIVersion)
		if !validPluginID(plugin.ID) || plugin.Name == "" || !validMarketplaceVersion(plugin.Version) {
			return MarketplaceCatalog{}, fmt.Errorf("插件仓库包含无效条目: %s", plugin.ID)
		}
		if _, exists := seen[plugin.ID]; exists {
			return MarketplaceCatalog{}, fmt.Errorf("插件仓库包含重复插件: %s", plugin.ID)
		}
		seen[plugin.ID] = struct{}{}
		for key, artifact := range plugin.Platforms {
			if !isSupportedPlatformKey(key) {
				return MarketplaceCatalog{}, fmt.Errorf("插件 %s 包含无效平台: %s", plugin.ID, key)
			}
			if err := validateMarketplaceArtifact(artifact); err != nil {
				return MarketplaceCatalog{}, fmt.Errorf("插件 %s 的 %s 包无效: %w", plugin.ID, key, err)
			}
		}
		plugin.Available = false
		plugin.CompatibilityStatus = "compatible"
		if plugin.CoreAPIVersion != pluginAPIVersion {
			plugin.CompatibilityStatus = "需要 Plugin Core API " + plugin.CoreAPIVersion
		} else if _, ok := plugin.Platforms[platform]; !ok {
			plugin.CompatibilityStatus = "当前平台暂无安装包"
		} else {
			plugin.Available = true
		}
	}
	sort.Slice(index.Plugins, func(i, j int) bool {
		return strings.ToLower(index.Plugins[i].Name) < strings.ToLower(index.Plugins[j].Name)
	})
	return MarketplaceCatalog{
		SchemaVersion: index.SchemaVersion,
		SourceName:    marketplaceRepositoryName,
		SourceURL:     sourceURL,
		UpdatedAt:     index.UpdatedAt,
		FetchedAt:     fetchedAt.UTC().Format(time.RFC3339),
		Plugins:       index.Plugins,
	}, nil
}

func (m *Marketplace) Install(ctx context.Context, pluginID, version string) (PluginDescriptor, error) {
	if m == nil || m.manager == nil {
		return PluginDescriptor{}, errors.New("插件市场未初始化")
	}
	pluginID, version = strings.TrimSpace(pluginID), strings.TrimSpace(version)
	catalog, err := m.Fetch(ctx, false)
	if err != nil {
		return PluginDescriptor{}, err
	}
	var selected *MarketplacePlugin
	for i := range catalog.Plugins {
		if catalog.Plugins[i].ID == pluginID && catalog.Plugins[i].Version == version {
			selected = &catalog.Plugins[i]
			break
		}
	}
	if selected == nil {
		return PluginDescriptor{}, errors.New("插件或版本不在内置仓库中")
	}
	if !selected.Available {
		return PluginDescriptor{}, errors.New(selected.CompatibilityStatus)
	}
	artifact := selected.Platforms[currentPlatformKey()]
	key := pluginID + "@" + version
	m.mu.Lock()
	if m.downloading[key] {
		m.mu.Unlock()
		return PluginDescriptor{}, errors.New("该插件正在下载安装")
	}
	m.downloading[key] = true
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		delete(m.downloading, key)
		m.mu.Unlock()
	}()

	packagePath, err := m.download(ctx, pluginID, version, artifact)
	if err != nil {
		return PluginDescriptor{}, err
	}
	defer os.Remove(packagePath)
	return m.manager.InstallSystemPluginPackage(packagePath)
}

func (m *Marketplace) download(ctx context.Context, pluginID, version string, artifact MarketplaceArtifact) (string, error) {
	if err := m.validateArtifactURL(artifact.URL); err != nil {
		return "", err
	}
	downloadDir := filepath.Join(filepath.Dir(m.cachePath), "downloads")
	if err := os.MkdirAll(downloadDir, 0o700); err != nil {
		return "", fmt.Errorf("创建插件下载目录失败: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, artifact.URL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "mo-gallery-desktop-plugin-marketplace")
	resp, err := m.downloadClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("下载插件失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("下载插件失败: HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > artifact.Size || resp.ContentLength > maxPluginPackageBytes {
		return "", errors.New("插件包响应超过大小限制")
	}
	file, err := os.CreateTemp(downloadDir, ".plugin-*.zip.part")
	if err != nil {
		return "", err
	}
	partialPath := file.Name()
	completed := false
	defer func() {
		_ = file.Close()
		if !completed {
			_ = os.Remove(partialPath)
		}
	}()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(resp.Body, maxPluginPackageBytes+1))
	if err != nil {
		return "", fmt.Errorf("保存插件包失败: %w", err)
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	if written != artifact.Size {
		return "", fmt.Errorf("插件包大小不匹配: 期望 %d，实际 %d", artifact.Size, written)
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, normalizeSHA256(artifact.SHA256)) {
		return "", errors.New("插件包 SHA-256 校验失败")
	}
	target := filepath.Join(downloadDir, pluginID+"-"+version+"-"+runtime.GOOS+"-"+runtime.GOARCH+".zip")
	_ = os.Remove(target)
	if err := os.Rename(partialPath, target); err != nil {
		return "", err
	}
	completed = true
	return target, nil
}

func (m *Marketplace) enrichInstalled(catalog *MarketplaceCatalog) {
	if catalog == nil || m.manager == nil {
		return
	}
	installed := make(map[string]string)
	for _, plugin := range m.manager.ListSystemPlugins() {
		if plugin.Installed {
			installed[plugin.ID] = plugin.Version
		}
	}
	for i := range catalog.Plugins {
		version := installed[catalog.Plugins[i].ID]
		catalog.Plugins[i].InstalledVersion = version
		catalog.Plugins[i].UpdateAvailable = version != "" && compareMarketplaceVersions(catalog.Plugins[i].Version, version) > 0
	}
}

func (m *Marketplace) writeCache(data []byte) error {
	if err := os.MkdirAll(filepath.Dir(m.cachePath), 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(m.cachePath), ".repository-*.json")
	if err != nil {
		return err
	}
	name := temporary.Name()
	defer os.Remove(name)
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	_ = os.Remove(m.cachePath)
	return os.Rename(name, m.cachePath)
}

func (m *Marketplace) readCache(now time.Time) (MarketplaceCatalog, error) {
	data, err := os.ReadFile(m.cachePath)
	if err != nil {
		return MarketplaceCatalog{}, err
	}
	return parseMarketplaceIndex(data, m.indexURL, now)
}

func validateMarketplaceIndexURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "raw.githubusercontent.com") || parsed.Path != "/ushaio/mo-gallery-plugin/master/index.json" {
		return errors.New("内置插件仓库地址无效")
	}
	return nil
}

func validateMarketplaceIndexRedirect(req *http.Request, _ []*http.Request) error {
	return validateMarketplaceIndexURL(req.URL.String())
}

func validateMarketplaceArtifactURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "github.com") || !strings.HasPrefix(parsed.Path, "/ushaio/mo-gallery-plugin/releases/download/") {
		return errors.New("插件包下载地址无效")
	}
	return nil
}

func validateMarketplaceDownloadRedirect(req *http.Request, _ []*http.Request) error {
	if req.URL.Scheme != "https" {
		return errors.New("插件包重定向地址必须使用 HTTPS")
	}
	host := strings.ToLower(req.URL.Hostname())
	if host != "github.com" && host != "objects.githubusercontent.com" && host != "release-assets.githubusercontent.com" {
		return errors.New("插件包重定向到了不受信任的主机")
	}
	return nil
}

func validateMarketplaceArtifact(artifact MarketplaceArtifact) error {
	if err := validateMarketplaceArtifactURL(artifact.URL); err != nil {
		return err
	}
	digest := normalizeSHA256(artifact.SHA256)
	if len(digest) != sha256.Size*2 {
		return errors.New("缺少有效的 SHA-256")
	}
	if _, err := hex.DecodeString(digest); err != nil {
		return errors.New("SHA-256 格式无效")
	}
	if artifact.Size <= 0 || artifact.Size > maxPluginPackageBytes {
		return errors.New("插件包大小无效")
	}
	return nil
}

func normalizeSHA256(value string) string {
	return strings.TrimPrefix(strings.ToLower(strings.TrimSpace(value)), "sha256:")
}

func parseMarketplaceVersion(value string) ([3]int, bool) {
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	if len(value) == 0 || len(value) > 32 {
		return [3]int{}, false
	}
	parts := strings.Split(value, ".")
	if len(parts) != 3 {
		return [3]int{}, false
	}
	var result [3]int
	for i, part := range parts {
		parsed, err := strconv.Atoi(part)
		if err != nil || parsed < 0 {
			return [3]int{}, false
		}
		result[i] = parsed
	}
	return result, true
}

func validMarketplaceVersion(value string) bool {
	_, ok := parseMarketplaceVersion(value)
	return ok
}

func compareMarketplaceVersions(left, right string) int {
	a, aOK := parseMarketplaceVersion(left)
	b, bOK := parseMarketplaceVersion(right)
	if !aOK || !bOK {
		return 0
	}
	for i := range a {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}

func cloneMarketplaceCatalog(value *MarketplaceCatalog) *MarketplaceCatalog {
	if value == nil {
		return nil
	}
	cloned := *value
	cloned.Plugins = append([]MarketplacePlugin(nil), value.Plugins...)
	for i := range cloned.Plugins {
		cloned.Plugins[i].Contributions = append([]plugin_core.Contribution(nil), value.Plugins[i].Contributions...)
		if value.Plugins[i].Platforms != nil {
			cloned.Plugins[i].Platforms = make(map[string]MarketplaceArtifact, len(value.Plugins[i].Platforms))
			for key, artifact := range value.Plugins[i].Platforms {
				cloned.Plugins[i].Platforms[key] = artifact
			}
		}
	}
	return &cloned
}
