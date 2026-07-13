package services

import (
	"errors"
	"testing"
)

func TestParseUnauthorizedErrorPreservesGateReason(t *testing.T) {
	err := parseUnauthorizedError([]byte(`{
		"code":"ADMIN_LOGIN_GATE_CHANGED",
		"error":"Administrator login URL has changed; sign in again using the new URL"
	}`))

	var unauthorized *ApiUnauthorizedError
	if !errors.As(err, &unauthorized) {
		t.Fatalf("expected ApiUnauthorizedError, got %T", err)
	}
	if unauthorized.Code != "ADMIN_LOGIN_GATE_CHANGED" {
		t.Fatalf("unexpected code: %q", unauthorized.Code)
	}
	if unauthorized.Message != "Administrator login URL has changed; sign in again using the new URL" {
		t.Fatalf("unexpected message: %q", unauthorized.Message)
	}
}

func TestParseUnauthorizedErrorFallsBackToSessionMessage(t *testing.T) {
	err := parseUnauthorizedError([]byte(`not-json`))

	if err.Code != "TOKEN_INVALID" {
		t.Fatalf("unexpected code: %q", err.Code)
	}
	if err.Message != "登录状态已失效，请重新登录。" {
		t.Fatalf("unexpected message: %q", err.Message)
	}
}
