package main

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/services"
)

func signedAppTestToken(t *testing.T, secret string) string {
	t.Helper()

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, services.JWTClaims{
		Sub:      "user-1",
		Username: "admin",
		IsAdmin:  true,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func TestSetAuthRejectsTokenWithInvalidSignature(t *testing.T) {
	cfg := &config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}}
	app := NewApp(cfg)
	app.Auth = services.NewAuthService(cfg)

	if _, err := app.SetAuth("http://localhost:3000", signedAppTestToken(t, "wrong-secret")); err == nil {
		t.Fatal("SetAuth accepted a token signed with the wrong secret")
	}
}

func TestSetAuthAcceptsTokenWithValidSignature(t *testing.T) {
	cfg := &config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}}
	app := NewApp(cfg)
	app.Auth = services.NewAuthService(cfg)

	user, err := app.SetAuth("http://localhost:3000", signedAppTestToken(t, "expected-secret"))
	if err != nil {
		t.Fatalf("SetAuth rejected a valid token: %v", err)
	}
	if user.Username != "admin" || !user.IsAdmin {
		t.Fatalf("user = %+v, want admin user", user)
	}
}

func TestGetOverviewRequiresAuthenticatedProxy(t *testing.T) {
	app := NewApp(&config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}})

	_, err := app.GetOverview()
	if err == nil {
		t.Fatal("GetOverview succeeded without authenticated proxy")
	}
	if !strings.Contains(err.Error(), "登录状态未就绪") {
		t.Fatalf("error = %q, want 登录状态未就绪", err.Error())
	}
}

func TestRejectedSetAuthDoesNotUnlockOverview(t *testing.T) {
	cfg := &config.Config{API: config.APIConfig{JWTSecret: "expected-secret"}}
	app := NewApp(cfg)
	app.Auth = services.NewAuthService(cfg)

	if _, err := app.SetAuth("http://localhost:3000", signedAppTestToken(t, "wrong-secret")); err == nil {
		t.Fatal("SetAuth accepted invalid token")
	}
	if _, err := app.GetOverview(); err == nil {
		t.Fatal("GetOverview succeeded after rejected SetAuth")
	}
}
