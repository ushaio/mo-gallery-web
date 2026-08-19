package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
	"mo-gallery-desktop/services"
)

func TestSetAuthRejectsSessionRejectedByServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"TOKEN_INVALID","error":"expired"}`))
	}))
	defer server.Close()

	cfg := &config.Config{}
	app := NewApp(cfg)
	app.Auth = services.NewAuthService(cfg)
	if _, err := app.SetAuth(server.URL, "invalid-token"); err == nil {
		t.Fatal("SetAuth accepted a session rejected by the server")
	}
}

func TestSetAuthAcceptsSessionValidatedByServer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/me" || r.Header.Get("Authorization") != "Bearer opaque-token" {
			t.Fatalf("unexpected request: %s %q", r.URL.Path, r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"user-1","username":"admin","isAdmin":true}}`))
	}))
	defer server.Close()

	cfg := &config.Config{}
	app := NewApp(cfg)
	app.Auth = services.NewAuthService(cfg)
	user, err := app.SetAuth(server.URL, "opaque-token")
	if err != nil {
		t.Fatalf("SetAuth rejected a server-validated session: %v", err)
	}
	if user.Username != "admin" || !user.IsAdmin {
		t.Fatalf("user = %+v, want admin user", user)
	}
}

func TestGetOverviewRequiresAuthenticatedProxy(t *testing.T) {
	app := NewApp(&config.Config{})

	_, err := app.GetOverview()
	if err == nil {
		t.Fatal("GetOverview succeeded without authenticated proxy")
	}
	if !strings.Contains(err.Error(), "登录状态未就绪") {
		t.Fatalf("error = %q, want 登录状态未就绪", err.Error())
	}
}

func TestRejectedSetAuthDoesNotUnlockOverview(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"code":"TOKEN_INVALID","error":"expired"}`))
	}))
	defer server.Close()

	cfg := &config.Config{}
	app := NewApp(cfg)
	app.Auth = services.NewAuthService(cfg)

	if _, err := app.SetAuth(server.URL, "invalid-token"); err == nil {
		t.Fatal("SetAuth accepted invalid token")
	}
	if _, err := app.GetOverview(); err == nil {
		t.Fatal("GetOverview succeeded after rejected SetAuth")
	}
}

func TestSetAiCORSHeadersAllowsOpenAIClientHeaders(t *testing.T) {
	requestedHeaders := "authorization,content-type,x-stainless-lang,x-stainless-package-version,x-stainless-runtime"
	req := httptest.NewRequest(http.MethodOptions, "/v1/chat/completions", nil)
	req.Header.Set("Access-Control-Request-Headers", requestedHeaders)
	recorder := httptest.NewRecorder()

	setAiCORSHeaders(recorder, req)

	if got := recorder.Header().Get("Access-Control-Allow-Headers"); got != requestedHeaders {
		t.Fatalf("Access-Control-Allow-Headers = %q, want %q", got, requestedHeaders)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want *", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Methods"); got != "POST, OPTIONS" {
		t.Fatalf("Access-Control-Allow-Methods = %q, want POST, OPTIONS", got)
	}
}

func TestEditorAiConversationsRemainAvailableWithoutCloudAuthentication(t *testing.T) {
	db.CloseLocalAI()
	if err := db.ConnectLocalAI(t.TempDir()); err != nil {
		t.Fatalf("connect local AI database: %v", err)
	}
	t.Cleanup(db.CloseLocalAI)

	cfg := &config.Config{}
	app := NewApp(cfg)
	app.EditorAi = services.NewEditorAiService(cfg, nil)
	title := "Offline Zine"
	created, err := app.CreateEditorAiConversation(services.EditorAiConversationCreateInput{
		ScopeID: "zine:project-1",
		Title:   &title,
	})
	if err != nil {
		t.Fatalf("create offline Zine conversation: %v", err)
	}

	conversations, err := app.GetEditorAiConversations("zine:project-1")
	if err != nil {
		t.Fatalf("list offline Zine conversations: %v", err)
	}
	if len(conversations) != 1 || conversations[0].ID != created.ID {
		t.Fatalf("offline Zine conversations = %#v, want created conversation %q", conversations, created.ID)
	}
}
