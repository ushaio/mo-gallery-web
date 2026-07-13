package services

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const maxZineAiImageBytes = 25 * 1024 * 1024

func newZineImageRequest(ctx context.Context, proxy *ProxyClient, src string) (*http.Request, error) {
	parsed, err := url.Parse(src)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, fmt.Errorf("invalid image URL")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return nil, fmt.Errorf("create image request: %w", err)
	}
	if proxy != nil && proxy.token != "" && proxy.baseURL != "" && strings.HasPrefix(src, proxy.baseURL) {
		req.Header.Set("Authorization", "Bearer "+proxy.token)
	}
	return req, nil
}

// GetZineImageDataURL loads a remote Zine asset outside WebView CORS rules.
// The bounded data URL is used transiently by the editor AI snapshot and is
// never persisted in the Zine project.
func GetZineImageDataURL(ctx context.Context, proxy *ProxyClient, src string) (string, error) {
	req, err := newZineImageRequest(ctx, proxy, src)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch image: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("fetch image: HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxZineAiImageBytes+1))
	if err != nil {
		return "", fmt.Errorf("read image: %w", err)
	}
	if len(data) > maxZineAiImageBytes {
		return "", fmt.Errorf("image exceeds %d bytes", maxZineAiImageBytes)
	}

	contentType := strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0])
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = http.DetectContentType(data)
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		return "", fmt.Errorf("remote resource is not an image")
	}

	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

// ZineCJKFontInfo Zine PDF 导出可用的系统中文字体信息。
// react-pdf 内置的 14 种标准字体只支持 WinAnsi 编码，中文文本必须注册
// 一个系统 CJK 字体；TTC 集合文件通过 postscriptName 选取具体字体。
type ZineCJKFontInfo struct {
	Found          bool   `json:"found"`
	Path           string `json:"path"`
	PostscriptName string `json:"postscriptName"`
}

type zineFontCandidate struct {
	path           string
	postscriptName string
}

func zineFontCandidates() []zineFontCandidate {
	switch runtime.GOOS {
	case "windows":
		windir := os.Getenv("WINDIR")
		if windir == "" {
			windir = `C:\Windows`
		}
		fonts := filepath.Join(windir, "Fonts")
		return []zineFontCandidate{
			{filepath.Join(fonts, "msyh.ttc"), "MicrosoftYaHei"},
			{filepath.Join(fonts, "msyh.ttf"), "MicrosoftYaHei"},
			{filepath.Join(fonts, "simhei.ttf"), "SimHei"},
			{filepath.Join(fonts, "simsun.ttc"), "SimSun"},
			{filepath.Join(fonts, "msjh.ttc"), "MicrosoftJhengHei"},
		}
	case "darwin":
		return []zineFontCandidate{
			{"/System/Library/Fonts/PingFang.ttc", "PingFangSC-Regular"},
			{"/System/Library/Fonts/Hiragino Sans GB.ttc", "HiraginoSansGB-W3"},
			{"/System/Library/Fonts/Supplemental/Songti.ttc", "STSongti-SC-Regular"},
			{"/Library/Fonts/Arial Unicode.ttf", "ArialUnicodeMS"},
		}
	default:
		return []zineFontCandidate{
			{"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "NotoSansCJKsc-Regular"},
			{"/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "NotoSansCJKsc-Regular"},
			{"/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", "WenQuanYiMicroHei"},
			{"/usr/share/fonts/wenquanyi/wqy-microhei/wqy-microhei.ttc", "WenQuanYiMicroHei"},
			{"/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "WenQuanYiZenHei"},
		}
	}
}

// ResolveZineCJKFont 返回第一个存在的系统 CJK 字体。
func ResolveZineCJKFont() ZineCJKFontInfo {
	for _, candidate := range zineFontCandidates() {
		if info, err := os.Stat(candidate.path); err == nil && !info.IsDir() {
			return ZineCJKFontInfo{Found: true, Path: candidate.path, PostscriptName: candidate.postscriptName}
		}
	}
	return ZineCJKFontInfo{}
}

// NewZineAssetHandler 挂在 Wails AssetServer 上的同源处理器：
//   - GET /__zine/cjk-font        提供系统中文字体文件（react-pdf Font.register 拉取）
//   - GET /__zine/image?src=<url> 代理远程图片。webview 里 fetch 远程图片受 CORS
//     限制（画布 <img> 显示不受限，PDF 导出读取像素受限），由 Go 侧转发即可绕开，
//     且访问图库服务器时自动附带登录 token。
func NewZineAssetHandler(proxy *ProxyClient) http.Handler {
	// 图片下载可能远超 ProxyClient 30s 的 API 超时，单独用长超时客户端。
	imageClient := &http.Client{Timeout: 5 * time.Minute}
	mux := http.NewServeMux()

	mux.HandleFunc("/__zine/cjk-font", func(w http.ResponseWriter, r *http.Request) {
		info := ResolveZineCJKFont()
		if !info.Found {
			http.Error(w, "no CJK font available", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, info.Path)
	})

	mux.HandleFunc("/__zine/image", func(w http.ResponseWriter, r *http.Request) {
		src := r.URL.Query().Get("src")
		parsed, err := url.Parse(src)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			http.Error(w, "invalid src", http.StatusBadRequest)
			return
		}

		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, src, nil)
		if err != nil {
			http.Error(w, "invalid src", http.StatusBadRequest)
			return
		}
		if proxy != nil && proxy.token != "" && proxy.baseURL != "" && strings.HasPrefix(src, proxy.baseURL) {
			req.Header.Set("Authorization", "Bearer "+proxy.token)
		}

		resp, err := imageClient.Do(req)
		if err != nil {
			http.Error(w, "fetch image failed: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 400 {
			http.Error(w, "fetch image failed", resp.StatusCode)
			return
		}

		if contentType := resp.Header.Get("Content-Type"); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = io.Copy(w, resp.Body)
	})

	return mux
}
