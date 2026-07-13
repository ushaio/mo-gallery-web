package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"mo-gallery-desktop/config"
)

// LinuxDoBindingDTO Linux DO 绑定信息
type LinuxDoBindingDTO struct {
	Username   string `json:"username"`
	AvatarURL  string `json:"avatarUrl,omitempty"`
	TrustLevel *int   `json:"trustLevel,omitempty"`
}

// LinuxDoAuthUrlDTO Linux DO 授权 URL
type LinuxDoAuthUrlDTO struct {
	URL   string `json:"url"`
	State string `json:"state"`
}

// AuthService 处理认证逻辑
type AuthService struct {
	cfg        *config.Config
	httpClient *http.Client
	proxy      *ProxyClient
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SetProxy 设置 ProxyClient（用于需要认证的 API 调用）
func (s *AuthService) SetProxy(proxy *ProxyClient) {
	s.proxy = proxy
}

// LoginResult 登录结果
type LoginResult struct {
	Token  string   `json:"token"`
	User   UserInfo `json:"user"`
	Server string   `json:"server"` // 实际使用的服务器地址
}

// UserInfo 用户信息
type UserInfo struct {
	ID        string  `json:"id,omitempty"`
	Username  string  `json:"username"`
	IsAdmin   bool    `json:"isAdmin"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

// JWTClaims JWT 声明
type JWTClaims struct {
	Sub      string `json:"sub"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"isAdmin,omitempty"`
	jwt.RegisteredClaims
}

// webLoginResponse Web 端 /api/auth/login 的响应
type webLoginResponse struct {
	Success bool     `json:"success"`
	Token   string   `json:"token"`
	User    UserInfo `json:"user"`
	Error   string   `json:"error"`
}

// LoginEndpoint separates the API root from the optional administrator gate slug.
type LoginEndpoint struct {
	BaseURL   string
	LoginURL  string
	LoginSlug string
}

// ParseLoginEndpoint accepts either a server root or /login/<slug> URL.
func ParseLoginEndpoint(raw string) (LoginEndpoint, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return LoginEndpoint{}, errors.New("服务器地址无效")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return LoginEndpoint{}, errors.New("服务器地址必须使用 http 或 https")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return LoginEndpoint{}, errors.New("服务器地址不能包含用户信息、查询参数或片段")
	}

	loginSlug := ""
	escapedPath := strings.Trim(parsed.EscapedPath(), "/")
	if escapedPath != "" {
		segments := strings.Split(escapedPath, "/")
		if len(segments) != 2 || segments[0] != "login" || segments[1] == "" {
			return LoginEndpoint{}, errors.New("服务器地址只能是站点根地址或 /login/<安全后缀>")
		}
		loginSlug, err = url.PathUnescape(segments[1])
		if err != nil || loginSlug == "" || strings.Contains(loginSlug, "/") {
			return LoginEndpoint{}, errors.New("管理员登录安全后缀无效")
		}
	}

	baseURL := (&url.URL{Scheme: parsed.Scheme, Host: parsed.Host}).String()
	loginURL := baseURL
	if loginSlug != "" {
		loginURL += "/login/" + url.PathEscape(loginSlug)
	}

	return LoginEndpoint{
		BaseURL:   baseURL,
		LoginURL:  loginURL,
		LoginSlug: loginSlug,
	}, nil
}

// Login 通过 Web API 验证管理员凭据
// serverURL: Web 根地址或管理员登录地址，如 http://localhost:3000/login/private
// rememberLogin: 是否记住登录凭据（仅开发使用，明文存储，不安全）
func (s *AuthService) Login(serverURL, username, password, jwtSecret string, rememberLogin bool) (*LoginResult, error) {
	if serverURL == "" {
		return nil, errors.New("请输入服务器地址")
	}
	if username == "" || password == "" {
		return nil, errors.New("用户名和密码不能为空")
	}
	jwtSecret = strings.TrimSpace(jwtSecret)
	if jwtSecret == "" {
		return nil, errors.New("JWT Secret 不能为空")
	}
	s.cfg.API.JWTSecret = jwtSecret

	endpoint, err := ParseLoginEndpoint(serverURL)
	if err != nil {
		return nil, err
	}
	serverURL = endpoint.BaseURL

	// 构造请求
	loginBody := map[string]string{
		"username": username,
		"password": password,
	}
	if endpoint.LoginSlug != "" {
		loginBody["loginSlug"] = endpoint.LoginSlug
	}
	body, _ := json.Marshal(loginBody)

	apiURL := serverURL + "/api/auth/login"
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	// 发送请求
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接到服务器 %s: %w", serverURL, err)
	}
	defer resp.Body.Close()

	// 读取响应
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var loginResp webLoginResponse
	if err := json.Unmarshal(respBody, &loginResp); err != nil {
		return nil, fmt.Errorf("解析响应失败: %s", string(respBody))
	}

	// 检查结果
	if resp.StatusCode == 401 || !loginResp.Success {
		errMsg := loginResp.Error
		if errMsg == "" {
			errMsg = "用户名或密码错误"
		}
		return nil, errors.New(errMsg)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("服务器返回错误 (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	if loginResp.Token == "" {
		return nil, errors.New("服务器未返回 token")
	}
	if _, err := s.ValidateToken(loginResp.Token); err != nil {
		return nil, fmt.Errorf("服务器返回的 token 无效: %w", err)
	}

	// 保存配置到文件
	s.cfg.API.BaseURL = serverURL
	s.cfg.API.LoginURL = endpoint.LoginURL
	s.cfg.API.JWTSecret = jwtSecret
	if rememberLogin {
		s.cfg.API.RememberLogin = true
		s.cfg.API.SavedUsername = username
		// 加密密码后保存
		encryptedPassword, err := config.EncryptPassword(password)
		if err != nil {
			return nil, fmt.Errorf("加密密码失败: %w", err)
		}
		s.cfg.API.SavedPassword = encryptedPassword
	} else {
		s.cfg.API.RememberLogin = false
		s.cfg.API.SavedUsername = ""
		s.cfg.API.SavedPassword = ""
	}
	_ = s.cfg.Save("")

	return &LoginResult{
		Token:  loginResp.Token,
		User:   loginResp.User,
		Server: serverURL,
	}, nil
}

// ValidateToken 验证 JWT token（本地签名校验，不请求网络）
func (s *AuthService) ValidateToken(tokenStr string) (*UserInfo, error) {
	secret := strings.TrimSpace(s.cfg.API.JWTSecret)
	if secret == "" {
		return nil, errors.New("未配置 JWT 密钥")
	}

	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %s", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, errors.New("登录已过期，请重新登录")
		}
		if errors.Is(err, jwt.ErrTokenSignatureInvalid) {
			return nil, errors.New("Token 签名无效，请检查 JWT 密钥配置后重新登录")
		}
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return &UserInfo{
		ID:       claims.Sub,
		Username: claims.Username,
		IsAdmin:  claims.IsAdmin,
	}, nil
}

// ─── Linux DO OAuth ───────────────────────────────────

type linuxDoEnabledResponse struct {
	Enabled bool `json:"enabled"`
}

type linuxDoBindingResponse struct {
	Binding *LinuxDoBindingDTO `json:"binding"`
}

type linuxDoAuthUrlResponse struct {
	URL   string `json:"url"`
	State string `json:"state"`
}

// IsLinuxDoEnabled 检查 Linux DO OAuth 是否已配置
func (s *AuthService) IsLinuxDoEnabled() (bool, error) {
	serverURL := s.cfg.API.BaseURL
	if serverURL == "" {
		return false, nil
	}
	serverURL = strings.TrimRight(serverURL, "/")

	resp, err := s.httpClient.Get(serverURL + "/api/auth/linuxdo/enabled")
	if err != nil {
		return false, nil // 网络错误时返回 false 而非报错
	}
	defer resp.Body.Close()

	var result linuxDoEnabledResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, nil
	}
	return result.Enabled, nil
}

// GetLinuxDoBinding 获取管理员绑定的 Linux DO 账户信息
func (s *AuthService) GetLinuxDoBinding() (*LinuxDoBindingDTO, error) {
	if s.proxy == nil || !s.proxy.IsReady() {
		return nil, errors.New("未连接到服务器")
	}

	var resp linuxDoBindingResponse
	if err := s.proxy.GET("/auth/linuxdo/binding", &resp); err != nil {
		return nil, err
	}
	return resp.Binding, nil
}

// GetLinuxDoAuthUrl 获取 Linux DO OAuth 授权 URL
func (s *AuthService) GetLinuxDoAuthUrl() (*LinuxDoAuthUrlDTO, error) {
	serverURL := s.cfg.API.BaseURL
	if serverURL == "" {
		return nil, errors.New("未连接到服务器")
	}
	serverURL = strings.TrimRight(serverURL, "/")

	resp, err := s.httpClient.Get(serverURL + "/api/auth/linuxdo")
	if err != nil {
		return nil, fmt.Errorf("获取授权 URL 失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("服务器返回错误: %s", string(body))
	}

	var result linuxDoAuthUrlResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}
	return &LinuxDoAuthUrlDTO{URL: result.URL, State: result.State}, nil
}

// UnbindLinuxDoAccount 解绑管理员的 Linux DO 账户
func (s *AuthService) UnbindLinuxDoAccount() error {
	if s.proxy == nil || !s.proxy.IsReady() {
		return errors.New("未连接到服务器")
	}

	return s.proxy.DELETE("/auth/linuxdo/bind")
}
