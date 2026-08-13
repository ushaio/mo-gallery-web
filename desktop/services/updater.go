package services

import (
	"bufio"
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
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	githubLatestReleaseURL = "https://api.github.com/repos/ushaio/mo-gallery-web/releases/latest"
	githubLatestPageURL    = "https://github.com/ushaio/mo-gallery-web/releases/latest"
	updateCheckCacheTTL    = 15 * time.Minute
)

type UpdateAsset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
	Size        int64  `json:"size"`
	Digest      string `json:"digest"`
	Platform    string `json:"platform"`
	Arch        string `json:"arch"`
	InstallMode string `json:"installMode"`
}

type UpdateInfo struct {
	CurrentVersion  string       `json:"currentVersion"`
	LatestVersion   string       `json:"latestVersion"`
	UpdateAvailable bool         `json:"updateAvailable"`
	ReleaseURL      string       `json:"releaseUrl"`
	PublishedAt     string       `json:"publishedAt"`
	Notes           string       `json:"notes"`
	Asset           *UpdateAsset `json:"asset,omitempty"`
}

type UpdateDownloadProgress struct {
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Percent    float64 `json:"percent"`
}

type UpdateDownloadResult struct {
	Path        string `json:"path"`
	Name        string `json:"name"`
	InstallMode string `json:"installMode"`
}

type githubRelease struct {
	TagName     string `json:"tag_name"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Body        string `json:"body"`
	Assets      []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Size               int64  `json:"size"`
		Digest             string `json:"digest"`
	} `json:"assets"`
}

type UpdateService struct {
	mu             sync.Mutex
	apiClient      *http.Client
	pageClient     *http.Client
	downloadClient *http.Client
	apiURL         string
	downloadDir    string
	selectedAsset  *UpdateAsset
	downloadedPath string
	downloading    bool
	cachedInfo     *UpdateInfo
	cachedAt       time.Time
}

func NewUpdateService(configDir string) *UpdateService {
	return &UpdateService{
		apiClient: &http.Client{Timeout: 30 * time.Second},
		pageClient: &http.Client{
			Timeout: 15 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		downloadClient: &http.Client{
			Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				ResponseHeaderTimeout: 30 * time.Second,
			},
			CheckRedirect: validateDownloadRedirect,
		},
		apiURL:      githubLatestReleaseURL,
		downloadDir: filepath.Join(configDir, "updates"),
	}
}

func (s *UpdateService) Check(ctx context.Context, currentVersion string, force bool) (*UpdateInfo, error) {
	currentVersion = normalizeVersion(currentVersion)
	if _, ok := parseVersion(currentVersion); !ok {
		return nil, errors.New("当前应用版本无效")
	}
	if !force {
		s.mu.Lock()
		cachedInfo := cloneUpdateInfo(s.cachedInfo)
		cachedAt := s.cachedAt
		s.mu.Unlock()
		if cachedInfo != nil && time.Since(cachedAt) < updateCheckCacheTTL {
			cachedInfo.CurrentVersion = currentVersion
			cachedInfo.UpdateAvailable = compareVersions(cachedInfo.LatestVersion, currentVersion) > 0
			return cachedInfo, nil
		}
	}

	latestFromPage, releaseURL, pageErr := s.latestVersionFromPage(ctx)
	if pageErr == nil && compareVersions(latestFromPage, currentVersion) <= 0 {
		info := &UpdateInfo{
			CurrentVersion: currentVersion,
			LatestVersion:  latestFromPage,
			ReleaseURL:     releaseURL,
		}
		s.cacheInfo(info)
		return info, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "mo-gallery-desktop/"+currentVersion)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := s.apiClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("检查更新失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, githubAPIError(resp)
	}

	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&release); err != nil {
		return nil, fmt.Errorf("解析更新信息失败: %w", err)
	}
	latestVersion := normalizeVersion(release.TagName)
	if _, ok := parseVersion(latestVersion); !ok {
		return nil, errors.New("最新版本号无效")
	}

	asset := selectReleaseAsset(release, runtime.GOOS, runtime.GOARCH)
	available := compareVersions(latestVersion, currentVersion) > 0
	info := &UpdateInfo{
		CurrentVersion:  currentVersion,
		LatestVersion:   latestVersion,
		UpdateAvailable: available,
		ReleaseURL:      release.HTMLURL,
		PublishedAt:     release.PublishedAt,
		Notes:           releaseNotesForVersion(release.Body, latestVersion),
		Asset:           asset,
	}

	s.cacheInfo(info)
	return info, nil
}

func (s *UpdateService) cacheInfo(info *UpdateInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cachedInfo = cloneUpdateInfo(info)
	s.cachedAt = time.Now()
	if info.UpdateAvailable && info.Asset != nil {
		asset := *info.Asset
		s.selectedAsset = &asset
	} else {
		s.selectedAsset = nil
	}
	s.downloadedPath = ""
}

func (s *UpdateService) latestVersionFromPage(ctx context.Context) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubLatestPageURL, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", "mo-gallery-desktop-updater")
	resp, err := s.pageClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusMovedPermanently && resp.StatusCode != http.StatusTemporaryRedirect && resp.StatusCode != http.StatusPermanentRedirect {
		return "", "", fmt.Errorf("GitHub Release 页面返回 HTTP %d", resp.StatusCode)
	}

	location, err := resp.Location()
	if err != nil || location.Scheme != "https" || !strings.EqualFold(location.Hostname(), "github.com") ||
		!strings.HasPrefix(location.Path, "/ushaio/mo-gallery-web/releases/tag/v") {
		return "", "", errors.New("GitHub Release 页面返回了无效地址")
	}
	version := normalizeVersion(strings.TrimPrefix(location.Path, "/ushaio/mo-gallery-web/releases/tag/"))
	if _, ok := parseVersion(version); !ok {
		return "", "", errors.New("GitHub Release 页面返回了无效版本")
	}
	return version, location.String(), nil
}

func githubAPIError(resp *http.Response) error {
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		resetAt := ""
		if resetUnix, err := strconv.ParseInt(resp.Header.Get("X-RateLimit-Reset"), 10, 64); err == nil && resetUnix > 0 {
			resetAt = time.Unix(resetUnix, 0).Local().Format("15:04")
		}
		if resetAt != "" {
			return fmt.Errorf("GitHub API 请求频率已达上限，请在 %s 后重试，或直接打开 Release 页面", resetAt)
		}
		return errors.New("GitHub API 暂时拒绝了更新检查，请稍后重试，或直接打开 Release 页面")
	}
	return fmt.Errorf("检查更新失败: GitHub 返回 HTTP %d", resp.StatusCode)
}

func cloneUpdateInfo(info *UpdateInfo) *UpdateInfo {
	if info == nil {
		return nil
	}
	cloned := *info
	if info.Asset != nil {
		asset := *info.Asset
		cloned.Asset = &asset
	}
	return &cloned
}

func (s *UpdateService) Download(ctx context.Context, progress func(UpdateDownloadProgress)) (*UpdateDownloadResult, error) {
	s.mu.Lock()
	if s.downloading {
		s.mu.Unlock()
		return nil, errors.New("更新正在下载")
	}
	if s.selectedAsset == nil {
		s.mu.Unlock()
		return nil, errors.New("请先检查更新")
	}
	asset := *s.selectedAsset
	s.downloading = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		s.downloading = false
		s.mu.Unlock()
	}()

	if err := validateAssetURL(asset.DownloadURL); err != nil {
		return nil, err
	}
	if !strings.HasPrefix(strings.ToLower(asset.Digest), "sha256:") {
		return nil, errors.New("更新包缺少 SHA-256 校验值")
	}
	if err := os.MkdirAll(s.downloadDir, 0o700); err != nil {
		return nil, fmt.Errorf("创建更新目录失败: %w", err)
	}

	targetPath := filepath.Join(s.downloadDir, filepath.Base(asset.Name))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.DownloadURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "mo-gallery-desktop-updater")
	resp, err := s.downloadClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("下载更新失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("下载更新失败: HTTP %d", resp.StatusCode)
	}

	partialFile, err := os.CreateTemp(s.downloadDir, ".update-*.part")
	if err != nil {
		return nil, fmt.Errorf("创建更新文件失败: %w", err)
	}
	partialPath := partialFile.Name()
	file := partialFile
	completed := false
	defer func() {
		_ = file.Close()
		if !completed {
			_ = os.Remove(partialPath)
		}
	}()

	hash := sha256.New()
	total := asset.Size
	if total <= 0 {
		total = resp.ContentLength
	}
	written, err := copyWithProgress(file, io.TeeReader(resp.Body, hash), total, progress)
	if err != nil {
		return nil, fmt.Errorf("保存更新失败: %w", err)
	}
	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("保存更新失败: %w", err)
	}
	if asset.Size > 0 && written != asset.Size {
		return nil, fmt.Errorf("更新包大小不匹配: 期望 %d，实际 %d", asset.Size, written)
	}
	expectedDigest := strings.TrimPrefix(strings.ToLower(asset.Digest), "sha256:")
	actualDigest := hex.EncodeToString(hash.Sum(nil))
	if actualDigest != expectedDigest {
		return nil, errors.New("更新包校验失败，文件可能不完整")
	}
	_ = os.Remove(targetPath)
	if err := os.Rename(partialPath, targetPath); err != nil {
		return nil, fmt.Errorf("完成更新下载失败: %w", err)
	}
	if asset.InstallMode == "reveal" {
		_ = os.Chmod(targetPath, 0o755)
	}
	completed = true

	s.mu.Lock()
	s.downloadedPath = targetPath
	s.mu.Unlock()
	return &UpdateDownloadResult{Path: targetPath, Name: asset.Name, InstallMode: asset.InstallMode}, nil
}

func (s *UpdateService) OpenDownloaded() (bool, error) {
	s.mu.Lock()
	path := s.downloadedPath
	asset := s.selectedAsset
	s.mu.Unlock()
	if path == "" || asset == nil {
		return false, errors.New("尚未下载更新包")
	}
	if _, err := os.Stat(path); err != nil {
		return false, errors.New("已下载的更新包不存在，请重新下载")
	}

	switch runtime.GOOS {
	case "windows":
		if err := exec.Command(path).Start(); err != nil {
			return false, fmt.Errorf("启动安装程序失败: %w", err)
		}
		return true, nil
	case "darwin":
		if err := exec.Command("open", path).Start(); err != nil {
			return false, fmt.Errorf("打开安装程序失败: %w", err)
		}
		return false, nil
	default:
		if err := exec.Command("xdg-open", filepath.Dir(path)).Start(); err != nil {
			return false, fmt.Errorf("打开更新目录失败: %w", err)
		}
		return false, nil
	}
}

func validateAssetURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "github.com") ||
		!strings.HasPrefix(parsed.Path, "/ushaio/mo-gallery-web/releases/download/") {
		return errors.New("更新包下载地址无效")
	}
	return nil
}

func validateDownloadRedirect(req *http.Request, _ []*http.Request) error {
	if req.URL.Scheme != "https" {
		return errors.New("更新包重定向地址必须使用 HTTPS")
	}
	host := strings.ToLower(req.URL.Hostname())
	if host != "github.com" && host != "objects.githubusercontent.com" && host != "release-assets.githubusercontent.com" {
		return errors.New("更新包重定向到了不受信任的主机")
	}
	return nil
}

func copyWithProgress(dst io.Writer, src io.Reader, total int64, progress func(UpdateDownloadProgress)) (int64, error) {
	buffer := make([]byte, 256*1024)
	var written int64
	for {
		count, readErr := src.Read(buffer)
		if count > 0 {
			n, writeErr := dst.Write(buffer[:count])
			written += int64(n)
			if writeErr != nil {
				return written, writeErr
			}
			if n != count {
				return written, io.ErrShortWrite
			}
			if progress != nil {
				percent := float64(0)
				if total > 0 {
					percent = float64(written) / float64(total) * 100
				}
				progress(UpdateDownloadProgress{Downloaded: written, Total: total, Percent: percent})
			}
		}
		if readErr == io.EOF {
			return written, nil
		}
		if readErr != nil {
			return written, readErr
		}
	}
}

func selectReleaseAsset(release githubRelease, platform, arch string) *UpdateAsset {
	archName := arch
	if archName == "386" {
		archName = "386"
	}
	patterns := []struct {
		suffix      string
		installMode string
	}{}
	switch platform {
	case "windows":
		patterns = append(patterns, struct {
			suffix      string
			installMode string
		}{"-windows-" + archName + "-setup.exe", "installer"})
	case "darwin":
		patterns = append(patterns,
			struct{ suffix, installMode string }{"-macos-" + archName + ".pkg", "installer"},
			struct{ suffix, installMode string }{"-macos-universal.pkg", "installer"},
		)
	case "linux":
		patterns = append(patterns, struct {
			suffix      string
			installMode string
		}{"-linux-" + archName + ".AppImage", "reveal"})
	}

	for _, pattern := range patterns {
		for _, candidate := range release.Assets {
			if strings.HasSuffix(candidate.Name, pattern.suffix) {
				return &UpdateAsset{
					Name: candidate.Name, DownloadURL: candidate.BrowserDownloadURL,
					Size: candidate.Size, Digest: candidate.Digest, Platform: platform,
					Arch: arch, InstallMode: pattern.installMode,
				}
			}
		}
	}
	return nil
}

type semanticVersion struct {
	major, minor, patch int
	prerelease          string
}

func normalizeVersion(value string) string {
	return strings.TrimPrefix(strings.TrimSpace(value), "v")
}

func parseVersion(value string) (semanticVersion, bool) {
	value = normalizeVersion(value)
	core, prerelease, _ := strings.Cut(value, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return semanticVersion{}, false
	}
	numbers := make([]int, 3)
	for index, part := range parts {
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return semanticVersion{}, false
		}
		numbers[index] = number
	}
	return semanticVersion{numbers[0], numbers[1], numbers[2], prerelease}, true
}

func compareVersions(left, right string) int {
	a, aOK := parseVersion(left)
	b, bOK := parseVersion(right)
	if !aOK || !bOK {
		return 0
	}
	for _, pair := range [][2]int{{a.major, b.major}, {a.minor, b.minor}, {a.patch, b.patch}} {
		if pair[0] < pair[1] {
			return -1
		}
		if pair[0] > pair[1] {
			return 1
		}
	}
	if a.prerelease == b.prerelease {
		return 0
	}
	if a.prerelease == "" {
		return 1
	}
	if b.prerelease == "" {
		return -1
	}
	return strings.Compare(a.prerelease, b.prerelease)
}

func releaseNotesForVersion(body, version string) string {
	scanner := bufio.NewScanner(strings.NewReader(body))
	lines := make([]string, 0)
	found := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "## ") {
			if found {
				break
			}
			if strings.Contains(line, "v"+normalizeVersion(version)) {
				found = true
			}
		}
		if found {
			lines = append(lines, line)
		}
	}
	if !found {
		return strings.TrimSpace(body)
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}
