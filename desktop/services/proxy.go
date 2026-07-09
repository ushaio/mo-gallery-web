package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ProxyClient 通用 Web API 代理客户端
type ProxyClient struct {
	baseURL    string
	httpClient *http.Client
	// uploadClient 用于文件上传：服务端要做 AVIF 压缩 + 存储上传，
	// 大文件耗时远超普通请求。30s 超时会导致客户端报错而服务端
	// 仍完成入库，用户重试后产生重复记录。
	uploadClient *http.Client
	token        string
	logger       *Logger
}

func NewProxyClient() *ProxyClient {
	return &ProxyClient{
		httpClient:   &http.Client{Timeout: 30 * time.Second},
		uploadClient: &http.Client{Timeout: 10 * time.Minute},
	}
}

// SetLogger 设置日志记录器
func (p *ProxyClient) SetLogger(logger *Logger) {
	p.logger = logger
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
		log.Printf("[proxy] GETWithMeta newRequest error: %v", err)
		return err
	}

	log.Printf("[proxy] GETWithMeta %s, logger=%v", path, p.logger != nil)

	start := time.Now()
	resp, err := p.httpClient.Do(req)
	if err != nil {
		log.Printf("[proxy] GETWithMeta %s request error: %v", path, err)
		if p.logger != nil {
			p.logger.Error(LogCategorySystem, "api_request_failed", fmt.Sprintf("GET %s 请求失败", path), err.Error())
		}
		return fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}

	duration := time.Since(start).Milliseconds()
	log.Printf("[proxy] GETWithMeta %s → %d, %dms, %d bytes", path, resp.StatusCode, duration, len(body))

	if resp.StatusCode == 401 {
		if p.logger != nil {
			p.logger.Warn(LogCategoryAuth, "api_unauthorized", fmt.Sprintf("GET %s 认证失败", path), fmt.Sprintf("HTTP %d", resp.StatusCode))
		}
		return &ApiUnauthorizedError{Message: "登录已过期，请重新登录"}
	}

	if resp.StatusCode >= 400 {
		if p.logger != nil {
			p.logger.Error(LogCategorySystem, "api_error", fmt.Sprintf("GET %s 请求错误", path), fmt.Sprintf("HTTP %d, %dms", resp.StatusCode, duration))
		}
		return parseAPIError(resp.StatusCode, body)
	}

	// 记录成功请求
	if p.logger != nil {
		p.logger.Info(LogCategorySystem, "api_request", fmt.Sprintf("GET %s", path), fmt.Sprintf("HTTP %d, %dms, %d bytes", resp.StatusCode, duration, len(body)))
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

// POSTMultipart 发送 multipart/form-data 请求（用于文件上传）
// fields: 表单字段 map，files: 字段名 → 文件路径 map
func (p *ProxyClient) POSTMultipart(path string, fields map[string]string, files map[string]string, result interface{}) error {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// 添加表单字段
	for key, val := range fields {
		if err := writer.WriteField(key, val); err != nil {
			return fmt.Errorf("写入字段 %s 失败: %w", key, err)
		}
	}

	// 添加文件
	for fieldName, filePath := range files {
		f, err := os.Open(filePath)
		if err != nil {
			return fmt.Errorf("打开文件失败: %w", err)
		}
		part, err := writer.CreateFormFile(fieldName, filepath.Base(filePath))
		if err != nil {
			f.Close()
			return fmt.Errorf("创建表单文件失败: %w", err)
		}
		if _, err := io.Copy(part, f); err != nil {
			f.Close()
			return fmt.Errorf("写入文件失败: %w", err)
		}
		f.Close()
	}
	writer.Close()

	fullURL := p.baseURL + "/api" + path
	req, err := http.NewRequest("POST", fullURL, &buf)
	if err != nil {
		return fmt.Errorf("创建请求失败: %w", err)
	}
	// bytes.Buffer 会让 net/http 自动填充 GetBody，连接复用出错时
	// transport 会静默重放整个 POST——上传接口非幂等，禁止重放。
	req.GetBody = nil
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if p.token != "" {
		req.Header.Set("Authorization", "Bearer "+p.token)
	}

	start := time.Now()
	resp, err := p.uploadClient.Do(req)
	if err != nil {
		if p.logger != nil {
			p.logger.Error(LogCategorySystem, "api_request_failed", fmt.Sprintf("POST %s 请求失败", path), err.Error())
		}
		return fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}

	duration := time.Since(start).Milliseconds()

	if resp.StatusCode == 401 {
		if p.logger != nil {
			p.logger.Warn(LogCategoryAuth, "api_unauthorized", fmt.Sprintf("POST %s 认证失败", path), fmt.Sprintf("HTTP %d", resp.StatusCode))
		}
		return &ApiUnauthorizedError{Message: "登录已过期，请重新登录"}
	}

	if resp.StatusCode >= 400 {
		if p.logger != nil {
			p.logger.Error(LogCategorySystem, "api_error", fmt.Sprintf("POST %s 请求错误", path), fmt.Sprintf("HTTP %d, %dms", resp.StatusCode, duration))
		}
		return parseAPIError(resp.StatusCode, bodyBytes)
	}

	if p.logger != nil {
		p.logger.Info(LogCategorySystem, "api_request", fmt.Sprintf("POST %s", path), fmt.Sprintf("HTTP %d, %dms, %d bytes", resp.StatusCode, duration, len(bodyBytes)))
	}

	if result != nil && len(bodyBytes) > 0 {
		var apiResp apiResponse
		if err := json.Unmarshal(bodyBytes, &apiResp); err == nil && apiResp.Data != nil {
			if err := json.Unmarshal(apiResp.Data, result); err != nil {
				return fmt.Errorf("解析 data 失败: %w", err)
			}
		} else {
			if err := json.Unmarshal(bodyBytes, result); err != nil {
				return fmt.Errorf("解析响应失败: %w", err)
			}
		}
	}

	return nil
}

// PATCH 发起 PATCH 请求
func (p *ProxyClient) PATCH(path string, body interface{}, result interface{}) error {
	return p.do("PATCH", path, body, result)
}

// DELETE 发起 DELETE 请求
func (p *ProxyClient) DELETE(path string) error {
	return p.do("DELETE", path, nil, nil)
}

// DELETEWithResult 发起 DELETE 请求并解析响应
func (p *ProxyClient) DELETEWithResult(path string, result interface{}) error {
	return p.do("DELETE", path, nil, result)
}

// do 通用请求方法（500 错误自动重试一次）
func (p *ProxyClient) do(method, path string, body interface{}, result interface{}) error {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		req, err := p.newRequest(method, path, body)
		if err != nil {
			return err
		}

		start := time.Now()
		resp, err := p.httpClient.Do(req)
		if err != nil {
			if p.logger != nil {
				p.logger.Error(LogCategorySystem, "api_request_failed", fmt.Sprintf("%s %s 请求失败", method, path), err.Error())
			}
			return fmt.Errorf("请求失败: %w", err)
		}

		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return fmt.Errorf("读取响应失败: %w", err)
		}

		duration := time.Since(start).Milliseconds()

		if resp.StatusCode == 401 {
			if p.logger != nil {
				p.logger.Warn(LogCategoryAuth, "api_unauthorized", fmt.Sprintf("%s %s 认证失败", method, path), fmt.Sprintf("HTTP %d", resp.StatusCode))
			}
			return &ApiUnauthorizedError{Message: "登录已过期，请重新登录"}
		}

		// 500 错误重试一次（可能是数据库连接断开）
		if resp.StatusCode >= 500 && attempt == 0 {
			lastErr = parseAPIError(resp.StatusCode, respBody)
			if p.logger != nil {
				p.logger.Warn(LogCategorySystem, "api_retry", fmt.Sprintf("%s %s 服务器错误，重试中", method, path), fmt.Sprintf("HTTP %d, %dms", resp.StatusCode, duration))
			}
			continue
		}

		if resp.StatusCode >= 400 {
			if p.logger != nil {
				p.logger.Error(LogCategorySystem, "api_error", fmt.Sprintf("%s %s 请求错误", method, path), fmt.Sprintf("HTTP %d, %dms", resp.StatusCode, duration))
			}
			return parseAPIError(resp.StatusCode, respBody)
		}

		// 记录成功请求
		if p.logger != nil {
			p.logger.Info(LogCategorySystem, "api_request", fmt.Sprintf("%s %s", method, path), fmt.Sprintf("HTTP %d, %dms, %d bytes", resp.StatusCode, duration, len(respBody)))
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

// APIError 服务端返回的结构化业务错误（4xx/5xx 且响应体带 error/message 字段）。
// 调用方可用 errors.As 取出错误码做分支（如上传去重的 DUPLICATE_PHOTO）。
type APIError struct {
	StatusCode      int
	Code            string // 服务端 error 字段
	Message         string // 服务端 message 字段
	ExistingPhotoID string // DUPLICATE_PHOTO 时的已有照片 ID
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Code != "" {
		return e.Code
	}
	return fmt.Sprintf("API 错误 (HTTP %d)", e.StatusCode)
}

// parseAPIError 把 4xx/5xx 响应体解析为 APIError；响应体不是预期 JSON 时
// 回退为包含原始响应体的通用错误，避免信息丢失。
func parseAPIError(statusCode int, body []byte) error {
	var errBody struct {
		Error           string `json:"error"`
		Message         string `json:"message"`
		ExistingPhotoID string `json:"existingPhotoId"`
	}
	if json.Unmarshal(body, &errBody) == nil && (errBody.Error != "" || errBody.Message != "") {
		return &APIError{
			StatusCode:      statusCode,
			Code:            errBody.Error,
			Message:         errBody.Message,
			ExistingPhotoID: errBody.ExistingPhotoID,
		}
	}
	return fmt.Errorf("API 错误 (HTTP %d): %s", statusCode, string(body))
}
