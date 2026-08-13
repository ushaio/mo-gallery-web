package services

import (
	"errors"
	"strings"
	"testing"
)

func TestParseAPIErrorSummarizesHTMLResponse(t *testing.T) {
	err := parseAPIError(404, []byte(`<!DOCTYPE html><html><body><div>not found</div><script>"unauthorized":"$undefined"</script></body></html>`))
	message := err.Error()

	if !strings.Contains(message, "HTTP 404") || !strings.Contains(message, "HTML") {
		t.Fatalf("unexpected error: %q", message)
	}
	if strings.Contains(message, "unauthorized") || len(message) > 200 {
		t.Fatalf("HTML response leaked into error: %q", message)
	}
}

func TestParseAPIErrorTruncatesNonJSONResponse(t *testing.T) {
	err := parseAPIError(502, []byte(strings.Repeat("x", 1024)))

	if len(err.Error()) > 600 || !strings.HasSuffix(err.Error(), "...") {
		t.Fatalf("response preview was not truncated: %q", err.Error())
	}
}

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
