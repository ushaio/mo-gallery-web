package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"

	"mo-gallery-desktop/config"
)

func TestGetCurrentUserUsesAuthenticatedWebAPI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/me" {
			t.Fatalf("path = %q, want /api/auth/me", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer opaque-token" {
			t.Fatalf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"user-1","username":"admin","isAdmin":true}}`))
	}))
	defer server.Close()

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("opaque-token")
	service := NewAuthService(&config.Config{})
	service.SetProxy(proxy)

	user, err := service.GetCurrentUser()
	if err != nil {
		t.Fatalf("GetCurrentUser() error = %v", err)
	}
	if user.ID != "user-1" || user.Username != "admin" || !user.IsAdmin {
		t.Fatalf("user = %+v", user)
	}
}

func TestGetCurrentUserRejectsInvalidServerSession(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"TOKEN_INVALID","error":"Your session is invalid or has expired"}`))
	}))
	defer server.Close()

	proxy := NewProxyClient()
	proxy.SetServer(server.URL)
	proxy.SetToken("invalid-token")
	service := NewAuthService(&config.Config{})
	service.SetProxy(proxy)

	if _, err := service.GetCurrentUser(); err == nil {
		t.Fatal("GetCurrentUser() accepted an invalid server session")
	}
}

func TestLoginAcceptsServerIssuedOpaqueToken(t *testing.T) {
	setTestConfigHome(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/login" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(webLoginResponse{
			Success: true,
			Token:   "opaque-server-token",
			User:    UserInfo{ID: "user-1", Username: "admin", IsAdmin: true},
		})
	}))
	defer server.Close()

	cfg := &config.Config{}
	result, err := NewAuthService(cfg).Login(server.URL, "admin", "password", false)
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if result.Token != "opaque-server-token" || result.User.ID != "user-1" {
		t.Fatalf("result = %+v", result)
	}
	if cfg.API.BaseURL != server.URL {
		t.Fatalf("BaseURL = %q", cfg.API.BaseURL)
	}
}

func TestLoginReportsWrongServerWithoutDumpingHTML(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("<!DOCTYPE html><html><head><title>Not Found</title></head><body>wrong app</body></html>"))
	}))
	defer server.Close()

	_, err := NewAuthService(&config.Config{}).Login(server.URL, "admin", "password", false)
	if err == nil {
		t.Fatal("Login() accepted an HTML response")
	}
	if !strings.Contains(err.Error(), "未指向 MO Gallery API") {
		t.Fatalf("error = %q", err.Error())
	}
	if strings.Contains(strings.ToLower(err.Error()), "<!doctype") {
		t.Fatalf("error leaked HTML response: %q", err.Error())
	}
}

func TestLoginUsesSavedPasswordWhenInputIsEmpty(t *testing.T) {
	setTestConfigHome(t)

	encryptedPassword, err := config.EncryptPassword("saved-password")
	if err != nil {
		t.Fatalf("EncryptPassword() error = %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode login body: %v", err)
		}
		if body["password"] != "saved-password" {
			t.Fatalf("password = %q, want saved password", body["password"])
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(webLoginResponse{
			Success: true,
			Token:   "opaque-server-token",
			User:    UserInfo{ID: "user-1", Username: "admin", IsAdmin: true},
		})
	}))
	defer server.Close()

	cfg := &config.Config{API: config.APIConfig{
		RememberLogin: true,
		SavedUsername: "admin",
		SavedPassword: encryptedPassword,
	}}
	if _, err := NewAuthService(cfg).Login(server.URL, "admin", "", true); err != nil {
		t.Fatalf("Login() with saved password error = %v", err)
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
		{name: "root URL", input: "http://localhost:3000/", baseURL: "http://localhost:3000", loginURL: "http://localhost:3000"},
		{name: "administrator gate URL", input: "https://gallery.example.com/login/shai/", baseURL: "https://gallery.example.com", loginURL: "https://gallery.example.com/login/shai", loginSlug: "shai"},
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
	setTestConfigHome(t)

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
			Token:   "opaque-server-token",
			User:    UserInfo{ID: "user-1", Username: "admin", IsAdmin: true},
		})
	}))
	defer server.Close()

	cfg := &config.Config{}
	result, err := NewAuthService(cfg).Login(server.URL+"/login/shai", "admin", "password", false)
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if result.Server != server.URL || cfg.API.LoginURL != server.URL+"/login/shai" {
		t.Fatalf("result = %+v, LoginURL = %q", result, cfg.API.LoginURL)
	}
}

func setTestConfigHome(t *testing.T) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Setenv("APPDATA", t.TempDir())
		return
	}
	t.Setenv("HOME", t.TempDir())
}

func TestParseLoginEndpointRejectsWhitespaceOnly(t *testing.T) {
	if _, err := ParseLoginEndpoint(strings.Repeat(" ", 3)); err == nil {
		t.Fatal("expected invalid server address")
	}
}
