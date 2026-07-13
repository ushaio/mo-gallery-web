package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"mo-gallery-desktop/config"
)

func signedTestToken(t *testing.T, secret string, expiresAt time.Time) string {
	t.Helper()

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, JWTClaims{
		Sub:      "user-1",
		Username: "admin",
		IsAdmin:  true,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func TestValidateTokenRequiresConfiguredJWTSecret(t *testing.T) {
	service := NewAuthService(&config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}})
	token := signedTestToken(t, "wrong-secret", time.Now().Add(time.Hour))

	if _, err := service.ValidateToken(token); err == nil {
		t.Fatal("ValidateToken accepted a token signed with the wrong secret")
	}
}

func TestValidateTokenAcceptsMatchingJWTSecret(t *testing.T) {
	service := NewAuthService(&config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}})
	token := signedTestToken(t, "expected-secret", time.Now().Add(time.Hour))

	user, err := service.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken rejected matching token: %v", err)
	}
	if user.ID != "user-1" || user.Username != "admin" || !user.IsAdmin {
		t.Fatalf("user = %+v, want id=user-1 username=admin isAdmin=true", user)
	}
}

func TestValidateTokenReportsExpiredToken(t *testing.T) {
	service := NewAuthService(&config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}})
	token := signedTestToken(t, "expected-secret", time.Now().Add(-time.Hour))

	_, err := service.ValidateToken(token)
	if err == nil {
		t.Fatal("ValidateToken accepted an expired token")
	}
	if !strings.Contains(err.Error(), "登录已过期") {
		t.Fatalf("error = %q, want 登录已过期", err.Error())
	}
}

func TestLoginRejectsTokenWithInvalidSignature(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/login" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(webLoginResponse{
			Success: true,
			Token:   signedTestToken(t, "wrong-secret", time.Now().Add(time.Hour)),
			User:    UserInfo{ID: "user-1", Username: "admin", IsAdmin: true},
		})
	}))
	defer server.Close()

	service := NewAuthService(&config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}})
	if _, err := service.Login(server.URL, "admin", "password", "expected-secret", true); err == nil {
		t.Fatal("Login accepted a server token signed with the wrong secret")
	}
}

func TestLoginUsesProvidedJWTSecret(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Setenv("APPDATA", t.TempDir())
	} else {
		t.Setenv("HOME", t.TempDir())
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/login" {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(webLoginResponse{
			Success: true,
			Token:   signedTestToken(t, "new-secret", time.Now().Add(time.Hour)),
			User:    UserInfo{ID: "user-1", Username: "admin", IsAdmin: true},
		})
	}))
	defer server.Close()

	cfg := &config.Config{API: config.APIConfig{JWTSecret: "old-secret"}}
	service := NewAuthService(cfg)

	result, err := service.Login(server.URL, "admin", "password", "new-secret", true)
	if err != nil {
		t.Fatalf("Login rejected token signed with provided secret: %v", err)
	}
	if result.Token == "" {
		t.Fatal("Login returned empty token")
	}
	if cfg.API.JWTSecret != "new-secret" {
		t.Fatalf("JWTSecret = %q, want %q", cfg.API.JWTSecret, "new-secret")
	}
}

func TestParseLoginEndpoint(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		baseURL   string
		loginURL  string
		loginSlug string
		wantErr   bool
	}{
		{
			name:     "root URL",
			input:    "http://localhost:3000/",
			baseURL:  "http://localhost:3000",
			loginURL: "http://localhost:3000",
		},
		{
			name:      "administrator gate URL",
			input:     "https://gallery.example.com/login/shai/",
			baseURL:   "https://gallery.example.com",
			loginURL:  "https://gallery.example.com/login/shai",
			loginSlug: "shai",
		},
		{name: "reject arbitrary path", input: "https://gallery.example.com/admin", wantErr: true},
		{name: "reject missing slug", input: "https://gallery.example.com/login", wantErr: true},
		{name: "reject query", input: "https://gallery.example.com/login/shai?x=1", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			endpoint, err := ParseLoginEndpoint(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("ParseLoginEndpoint(%q) unexpectedly succeeded", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseLoginEndpoint(%q) error = %v", tt.input, err)
			}
			if endpoint.BaseURL != tt.baseURL || endpoint.LoginURL != tt.loginURL || endpoint.LoginSlug != tt.loginSlug {
				t.Fatalf("endpoint = %+v", endpoint)
			}
		})
	}
}

func TestLoginSendsGateSlugToRootAPI(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Setenv("APPDATA", t.TempDir())
	} else {
		t.Setenv("HOME", t.TempDir())
	}

	const secret = "expected-secret"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/login" {
			t.Fatalf("request path = %q, want /api/auth/login", r.URL.Path)
		}

		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode login body: %v", err)
		}
		if body["loginSlug"] != "shai" {
			t.Fatalf("loginSlug = %q, want shai", body["loginSlug"])
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(webLoginResponse{
			Success: true,
			Token:   signedTestToken(t, secret, time.Now().Add(time.Hour)),
			User:    UserInfo{ID: "user-1", Username: "admin", IsAdmin: true},
		})
	}))
	defer server.Close()

	cfg := &config.Config{API: config.APIConfig{JWTSecret: secret}}
	service := NewAuthService(cfg)
	result, err := service.Login(server.URL+"/login/shai", "admin", "password", secret, false)
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if result.Server != server.URL {
		t.Fatalf("result.Server = %q, want %q", result.Server, server.URL)
	}
	if cfg.API.LoginURL != server.URL+"/login/shai" {
		t.Fatalf("LoginURL = %q", cfg.API.LoginURL)
	}
}
