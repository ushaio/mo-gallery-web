package services

import (
	"net/http"
	"testing"
)

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		left, right string
		want        int
	}{
		{"0.8.2", "0.8.1", 1},
		{"v1.0.0", "1.0.0", 0},
		{"1.0.0-beta", "1.0.0", -1},
		{"1.0.0", "1.0.0-beta", 1},
		{"0.10.0", "0.9.9", 1},
	}
	for _, test := range tests {
		if got := compareVersions(test.left, test.right); got != test.want {
			t.Fatalf("compareVersions(%q, %q) = %d, want %d", test.left, test.right, got, test.want)
		}
	}
}

func TestSelectReleaseAsset(t *testing.T) {
	release := githubRelease{TagName: "v0.8.2"}
	release.Assets = append(release.Assets,
		struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
			Size               int64  `json:"size"`
			Digest             string `json:"digest"`
		}{Name: "mo-gallery-desktop-0.8.2-windows-amd64-setup.exe"},
		struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
			Size               int64  `json:"size"`
			Digest             string `json:"digest"`
		}{Name: "mo-gallery-desktop-0.8.2-linux-arm64.AppImage"},
	)

	windowsAsset := selectReleaseAsset(release, "windows", "amd64")
	if windowsAsset == nil || windowsAsset.InstallMode != "installer" {
		t.Fatalf("unexpected Windows asset: %#v", windowsAsset)
	}
	linuxAsset := selectReleaseAsset(release, "linux", "arm64")
	if linuxAsset == nil || linuxAsset.InstallMode != "reveal" {
		t.Fatalf("unexpected Linux asset: %#v", linuxAsset)
	}
	if asset := selectReleaseAsset(release, "windows", "arm64"); asset != nil {
		t.Fatalf("unexpected unsupported asset: %#v", asset)
	}
}

func TestValidateAssetURL(t *testing.T) {
	valid := "https://github.com/ushaio/mo-gallery-web/releases/download/v0.8.2/update.exe"
	if err := validateAssetURL(valid); err != nil {
		t.Fatalf("valid URL rejected: %v", err)
	}
	for _, invalid := range []string{
		"http://github.com/ushaio/mo-gallery-web/releases/download/v0.8.2/update.exe",
		"https://example.com/update.exe",
		"https://github.com/other/repo/releases/download/v1/update.exe",
	} {
		if err := validateAssetURL(invalid); err == nil {
			t.Fatalf("invalid URL accepted: %s", invalid)
		}
	}
}

func TestValidateDownloadRedirect(t *testing.T) {
	request, _ := http.NewRequest(http.MethodGet, "https://release-assets.githubusercontent.com/file", nil)
	if err := validateDownloadRedirect(request, nil); err != nil {
		t.Fatalf("trusted redirect rejected: %v", err)
	}
	request, _ = http.NewRequest(http.MethodGet, "https://example.com/file", nil)
	if err := validateDownloadRedirect(request, nil); err == nil {
		t.Fatal("untrusted redirect accepted")
	}
}

func TestReleaseNotesForVersion(t *testing.T) {
	body := "# 更新日志\n\n## v0.8.2\n\n- newest\n\n## v0.8.1\n\n- old"
	if got := releaseNotesForVersion(body, "0.8.2"); got != "## v0.8.2\n\n- newest" {
		t.Fatalf("unexpected notes: %q", got)
	}
}

func TestCloneUpdateInfo(t *testing.T) {
	original := &UpdateInfo{LatestVersion: "0.8.3", Asset: &UpdateAsset{Name: "update.exe"}}
	cloned := cloneUpdateInfo(original)
	cloned.Asset.Name = "changed.exe"
	if original.Asset.Name != "update.exe" {
		t.Fatal("cloneUpdateInfo did not clone the nested asset")
	}
}
