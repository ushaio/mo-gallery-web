package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"mo-gallery-desktop/config"
)

// OfficialUser 官方账号用户信息（official 站 /api/auth 返回的最小集合）
type OfficialUser struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// OfficialAuthResult 官方登录/注册结果
type OfficialAuthResult struct {
	Token string       `json:"token"`
	User  OfficialUser `json:"user"`
}

// officialAuthResponse official 站登录/注册响应 { success, token, user }
type officialAuthResponse struct {
	Success bool         `json:"success"`
	Token   string       `json:"token"`
	User    OfficialUser `json:"user"`
	Code    string       `json:"code"`
	Error   string       `json:"error"`
}

// officialMeResponse official 站 /api/auth/me 响应 { success, data }
type officialMeResponse struct {
	Success bool         `json:"success"`
	Data    OfficialUser `json:"data"`
	Code    string       `json:"code"`
	Error   string       `json:"error"`
}

// 官方站用户名/密码规则（与 official 站 src/hono/auth.ts 保持一致；
// Go regexp 不支持 \u 转义，中文区间用 \x{4e00}-\x{9fa5} 表示）
var officialUsernamePattern = regexp.MustCompile(`^[\w\x{4e00}-\x{9fa5}-]{2,32}$`)

const officialPasswordMinLen = 6
const officialPasswordMaxLen = 128

// OfficialAuthService 处理官方账号认证
type OfficialAuthService struct {
	cfg        *config.Config
	httpClient *http.Client
}

// NewOfficialAuthService 创建官方认证服务
func NewOfficialAuthService(cfg *config.Config) *OfficialAuthService {
	return &OfficialAuthService{
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// NormalizeOfficialBaseURL 校验并规范化官方站根地址
func NormalizeOfficialBaseURL(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("请输入官方服务器地址")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("官方服务器地址无效")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("官方服务器地址必须使用 http 或 https")
	}
	return (&url.URL{Scheme: parsed.Scheme, Host: parsed.Host}).String(), nil
}

// ValidateOfficialCredentials 客户端预校验用户名/密码规则，减少一次无效网络请求
func ValidateOfficialCredentials(username, password string) error {
	if !officialUsernamePattern.MatchString(username) {
		return errors.New("用户名需为 2-32 位字母、数字、下划线、中文或连字符")
	}
	if len(password) < officialPasswordMinLen || len(password) > officialPasswordMaxLen {
		return fmt.Errorf("密码长度需在 %d-%d 位之间", officialPasswordMinLen, officialPasswordMaxLen)
	}
	return nil
}

// Login 登录官方账号
func (s *OfficialAuthService) Login(baseURL, username, password string) (*OfficialAuthResult, error) {
	if strings.TrimSpace(username) == "" || strings.TrimSpace(password) == "" {
		return nil, errors.New("用户名和密码不能为空")
	}
	return s.postAuthEndpoint(baseURL, "/api/auth/login", map[string]string{
		"username": username,
		"password": password,
	})
}

// Register 注册官方账号，官方站注册成功即返回 token（视为已登录）
func (s *OfficialAuthService) Register(baseURL, username, password string) (*OfficialAuthResult, error) {
	if err := ValidateOfficialCredentials(username, password); err != nil {
		return nil, err
	}
	return s.postAuthEndpoint(baseURL, "/api/auth/register", map[string]string{
		"username": username,
		"password": password,
	})
}

func (s *OfficialAuthService) postAuthEndpoint(baseURL, path string, payload map[string]string) (*OfficialAuthResult, error) {
	if strings.TrimSpace(baseURL) == "" && s.cfg != nil {
		baseURL = s.cfg.Official.BaseURL
	}
	server, err := NormalizeOfficialBaseURL(baseURL)
	if err != nil {
		return nil, err
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", server+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接到官方服务器 %s: %w", server, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var authResp officialAuthResponse
	if err := json.Unmarshal(respBody, &authResp); err != nil {
		return nil, fmt.Errorf("官方服务器返回了无法识别的响应（HTTP %d）", resp.StatusCode)
	}
	if resp.StatusCode != 200 || !authResp.Success {
		return nil, officialAPIError(resp.StatusCode, authResp.Code, authResp.Error)
	}
	if authResp.Token == "" {
		return nil, errors.New("官方服务器未返回登录凭证")
	}

	return &OfficialAuthResult{
		Token: authResp.Token,
		User:  authResp.User,
	}, nil
}

// OfficialAuthError official 站错误（带原始 code，便于前端区分场景）
type OfficialAuthError struct {
	Code string
	Msg  string
}

func (e *OfficialAuthError) Error() string { return e.Msg }

func officialAPIError(statusCode int, code, message string) error {
	if message == "" {
		switch code {
		case "INVALID_CREDENTIALS":
			message = "用户名或密码错误"
		case "USERNAME_TAKEN":
			message = "用户名已被占用"
		case "USERNAME_INVALID":
			message = "用户名格式不正确"
		case "PASSWORD_INVALID":
			message = "密码格式不正确"
		case "AUTH_REQUIRED":
			message = "登录已过期，请重新登录"
		default:
			message = fmt.Sprintf("官方服务器返回错误（HTTP %d）", statusCode)
		}
	}
	return &OfficialAuthError{Code: code, Msg: message}
}

// ErrOfficialTokenInvalid 表示官方 token 已失效（401），需清除本地会话重新登录
var ErrOfficialTokenInvalid = errors.New("官方登录已过期")

// ValidateToken 用存储的 JWT 调 /api/auth/me 校验会话
// 返回 (user, nil) 有效；(nil, ErrOfficialTokenInvalid) 失效需重登；(nil, 其他错误) 网络等服务异常。
func (s *OfficialAuthService) ValidateToken(baseURL, token string) (*OfficialUser, error) {
	if strings.TrimSpace(baseURL) == "" && s.cfg != nil {
		baseURL = s.cfg.Official.BaseURL
	}
	server, err := NormalizeOfficialBaseURL(baseURL)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("GET", server+"/api/auth/me", nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接到官方服务器 %s: %w", server, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var meResp officialMeResponse
	if err := json.Unmarshal(respBody, &meResp); err != nil {
		return nil, fmt.Errorf("官方服务器返回了无法识别的响应（HTTP %d）", resp.StatusCode)
	}
	if resp.StatusCode == 401 {
		return nil, ErrOfficialTokenInvalid
	}
	if resp.StatusCode != 200 || !meResp.Success {
		return nil, officialAPIError(resp.StatusCode, meResp.Code, meResp.Error)
	}

	user := meResp.Data
	return &user, nil
}
