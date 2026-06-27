package storage

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// GitHubProvider GitHub 存储
type GitHubProvider struct {
	token        string
	repo         string // owner/repo
	branch       string
	basePath     string
	accessMethod string // raw, jsdelivr, pages
	pagesURL     string
	httpClient   *http.Client
}

func NewGitHubProvider(cfg Config) (*GitHubProvider, error) {
	if cfg.Token == "" {
		return nil, fmt.Errorf("GitHub token is required")
	}
	if cfg.Repo == "" {
		return nil, fmt.Errorf("GitHub repo is required")
	}

	branch := cfg.Branch
	if branch == "" {
		branch = "main"
	}

	return &GitHubProvider{
		token:        cfg.Token,
		repo:         cfg.Repo,
		branch:       branch,
		basePath:     strings.Trim(cfg.BasePath, "/"),
		accessMethod: cfg.AccessMethod,
		pagesURL:     strings.TrimRight(cfg.PagesURL, "/"),
		httpClient:   &http.Client{Timeout: 60 * time.Second},
	}, nil
}

// Upload 通过 GitHub Contents API 上传文件
func (p *GitHubProvider) Upload(key string, data io.Reader, contentType string) (string, error) {
	fullPath := key
	if p.basePath != "" {
		fullPath = p.basePath + "/" + key
	}

	// 读取内容并 base64 编码
	buf, err := io.ReadAll(data)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}
	content := base64.StdEncoding.EncodeToString(buf)

	// GitHub Contents API
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s", p.repo, fullPath)

	body, _ := json.Marshal(map[string]interface{}{
		"message": fmt.Sprintf("Upload %s", fullPath),
		"content": content,
		"branch":  p.branch,
	})

	req, err := http.NewRequest("PUT", apiURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+p.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 201 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GitHub API 错误 (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	// 构造公开 URL
	return p.buildURL(fullPath), nil
}

// Delete 通过 GitHub Contents API 删除文件
func (p *GitHubProvider) Delete(key string) error {
	fullPath := key
	if p.basePath != "" {
		fullPath = p.basePath + "/" + key
	}

	// 先获取文件 SHA（删除需要）
	getURL := fmt.Sprintf("https://api.github.com/repos/%s/contents/%s?ref=%s", p.repo, fullPath, p.branch)
	req, _ := http.NewRequest("GET", getURL, nil)
	req.Header.Set("Authorization", "Bearer "+p.token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil // 文件不存在，视为成功
	}

	var fileInfo struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&fileInfo); err != nil {
		return fmt.Errorf("解析文件信息失败: %w", err)
	}

	// 删除文件
	deleteBody, _ := json.Marshal(map[string]interface{}{
		"message": fmt.Sprintf("Delete %s", fullPath),
		"sha":     fileInfo.SHA,
		"branch":  p.branch,
	})

	deleteReq, _ := http.NewRequest("DELETE", getURL, bytes.NewReader(deleteBody))
	deleteReq.Header.Set("Authorization", "Bearer "+p.token)
	deleteReq.Header.Set("Content-Type", "application/json")
	deleteReq.Header.Set("Accept", "application/vnd.github+json")

	deleteResp, err := p.httpClient.Do(deleteReq)
	if err != nil {
		return err
	}
	defer deleteResp.Body.Close()

	if deleteResp.StatusCode != 200 {
		respBody, _ := io.ReadAll(deleteResp.Body)
		return fmt.Errorf("GitHub 删除失败 (HTTP %d): %s", deleteResp.StatusCode, string(respBody))
	}

	return nil
}

// buildURL 根据访问方式构造公开 URL
func (p *GitHubProvider) buildURL(path string) string {
	switch p.accessMethod {
	case "jsdelivr":
		return fmt.Sprintf("https://cdn.jsdelivr.net/gh/%s@%s/%s", p.repo, p.branch, path)
	case "pages":
		if p.pagesURL != "" {
			return p.pagesURL + "/" + path
		}
		fallthrough
	default: // raw
		return fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s", p.repo, p.branch, path)
	}
}
