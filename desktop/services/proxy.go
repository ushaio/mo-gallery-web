package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// ProxyClient 通用 Web API 代理客户端
type ProxyClient struct {
	baseURL    string
	httpClient *http.Client
	token      string
}

func NewProxyClient() *ProxyClient {
	return &ProxyClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// SetServer 设置服务器地址
func (p *ProxyClient) SetServer(url string) {
	p.baseURL = url
}

// SetToken 设置 JWT token
func (p *ProxyClient) SetToken(token string) {
	p.token = token
}

// IsReady 是否已配置服务器和 token
func (p *ProxyClient) IsReady() bool {
	return p.baseURL != "" && p.token != ""
}

// apiResponse Web API 通用响应结构
type apiResponse struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Meta    json.RawMessage `json:"meta"`
	Error   string          `json:"error"`
	Message string          `json:"message"`
}

// GET 发起 GET 请求并解析响应
func (p *ProxyClient) GET(path string, result interface{}) error {
	return p.do("GET", path, nil, result)
}

// GETWithMeta 发起 GET 请求，解析 data 和 meta
func (p *ProxyClient) GETWithMeta(path string, data interface{}, meta interface{}) error {
	req, err := p.newRequest("GET", path, nil)
	if err != nil {
		return err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode == 401 {
		return &ApiUnauthorizedError{Message: "登录已过期，请重新登录"}
	}

	if resp.StatusCode >= 400 {
		return fmt.Errorf("API 错误 (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var apiResp apiResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return fmt.Errorf("解析响应失败: %w", err)
	}

	if !apiResp.Success && apiResp.Error != "" {
		return fmt.Errorf("API 错误: %s", apiResp.Error)
	}

	if data != nil && apiResp.Data != nil {
		if err := json.Unmarshal(apiResp.Data, data); err != nil {
			return fmt.Errorf("解析 data 失败: %w", err)
		}
	}

	if meta != nil && apiResp.Meta != nil {
		if err := json.Unmarshal(apiResp.Meta, meta); err != nil {
			return fmt.Errorf("解析 meta 失败: %w", err)
		}
	}

	return nil
}

// POST 发起 POST 请求
func (p *ProxyClient) POST(path string, body interface{}, result interface{}) error {
	return p.do("POST", path, body, result)
}

// PATCH 发起 PATCH 请求
func (p *ProxyClient) PATCH(path string, body interface{}, result interface{}) error {
	return p.do("PATCH", path, body, result)
}

// DELETE 发起 DELETE 请求
func (p *ProxyClient) DELETE(path string) error {
	return p.do("DELETE", path, nil, nil)
}

// do 通用请求方法（500 错误自动重试一次）
func (p *ProxyClient) do(method, path string, body interface{}, result interface{}) error {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		req, err := p.newRequest(method, path, body)
		if err != nil {
			return err
		}

		resp, err := p.httpClient.Do(req)
		if err != nil {
			return fmt.Errorf("请求失败: %w", err)
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return fmt.Errorf("读取响应失败: %w", err)
		}

		if resp.StatusCode == 401 {
			return &ApiUnauthorizedError{Message: "登录已过期，请重新登录"}
		}

		// 500 错误重试一次（可能是数据库连接断开）
		if resp.StatusCode >= 500 && attempt == 0 {
			lastErr = fmt.Errorf("API 错误 (HTTP %d): %s", resp.StatusCode, string(respBody))
			continue
		}

		if resp.StatusCode >= 400 {
			return fmt.Errorf("API 错误 (HTTP %d): %s", resp.StatusCode, string(respBody))
		}

		if result != nil && len(respBody) > 0 {
			log.Printf("[proxy] %s %s → %d, body=%d bytes", method, path, resp.StatusCode, len(respBody))

			var apiResp apiResponse
			if err := json.Unmarshal(respBody, &apiResp); err == nil && apiResp.Data != nil {
				log.Printf("[proxy] envelope parsed, data=%d bytes", len(apiResp.Data))
				if err := json.Unmarshal(apiResp.Data, result); err != nil {
					log.Printf("[proxy] parse data error: %v", err)
					return fmt.Errorf("解析 data 失败: %w", err)
				}
			} else {
				log.Printf("[proxy] direct parse, err=%v", err)
				if err := json.Unmarshal(respBody, result); err != nil {
					return fmt.Errorf("解析响应失败: %w", err)
				}
			}
		}

		return nil
	}
	return lastErr
}

// newRequest 构造 HTTP 请求
func (p *ProxyClient) newRequest(method, path string, body interface{}) (*http.Request, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("序列化请求体失败: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBytes)
	}

	fullURL := p.baseURL + "/api" + path
	req, err := http.NewRequest(method, fullURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.token != "" {
		req.Header.Set("Authorization", "Bearer "+p.token)
	}

	return req, nil
}

// ApiUnauthorizedError 401 错误
type ApiUnauthorizedError struct {
	Message string
}

func (e *ApiUnauthorizedError) Error() string {
	return e.Message
}
