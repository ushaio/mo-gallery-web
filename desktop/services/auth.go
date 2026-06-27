package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"mo-gallery-desktop/config"
)

// AuthService 处理认证逻辑
type AuthService struct {
	cfg        *config.Config
	httpClient *http.Client
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// LoginResult 登录结果
type LoginResult struct {
	Token   string   `json:"token"`
	User    UserInfo `json:"user"`
	Server  string   `json:"server"` // 实际使用的服务器地址
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

// Login 通过 Web API 验证管理员凭据
// serverURL: Web 端地址，如 http://localhost:3000
func (s *AuthService) Login(serverURL, username, password string) (*LoginResult, error) {
	if serverURL == "" {
		return nil, errors.New("请输入服务器地址")
	}
	if username == "" || password == "" {
		return nil, errors.New("用户名和密码不能为空")
	}

	// 规范化地址
	serverURL = strings.TrimRight(serverURL, "/")

	// 构造请求
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

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

	// 保存服务器地址到配置
	s.cfg.API.BaseURL = serverURL
	_ = s.cfg.Save("")

	return &LoginResult{
		Token:  loginResp.Token,
		User:   loginResp.User,
		Server: serverURL,
	}, nil
}

// ValidateToken 验证 JWT token（本地解析，不请求网络）
func (s *AuthService) ValidateToken(tokenStr string) (*UserInfo, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		// 注意：本地无法验证签名（没有 JWT secret），只解析 payload
		// 真正的鉴权由 Web API 的 auth middleware 完成
		return []byte{}, nil
	})
	if err != nil {
		// JWT 解析失败，但可能只是签名不匹配
		// 尝试手动解析 payload
		return s.parseTokenPayload(tokenStr)
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	return &UserInfo{
		Username: claims.Username,
		IsAdmin:  claims.IsAdmin,
	}, nil
}

// parseTokenPayload 手动解析 JWT payload（跳过签名验证）
func (s *AuthService) parseTokenPayload(tokenStr string) (*UserInfo, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token format")
	}

	// 解码 payload (第二段)
	payload, err := jwt.NewParser().DecodeSegment(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode payload failed: %w", err)
	}

	var claims JWTClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("parse payload failed: %w", err)
	}

	// 检查过期时间
	if claims.ExpiresAt != nil && claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, errors.New("token 已过期")
	}

	return &UserInfo{
		Username: claims.Username,
		IsAdmin:  claims.IsAdmin,
	}, nil
}
