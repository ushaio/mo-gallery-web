package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
)

const (
	automationDescriptorName = "automation.json"
	automationMaxBodyBytes   = 1 << 20
)

type automationCommand struct {
	ID     string         `json:"id"`
	Method string         `json:"method"`
	Params map[string]any `json:"params,omitempty"`
}

type automationDescriptor struct {
	Version   int    `json:"version"`
	URL       string `json:"url"`
	Token     string `json:"token"`
	PID       int    `json:"pid"`
	StartedAt string `json:"startedAt"`
}

type automationBridge struct {
	app            *App
	token          string
	descriptorPath string
	server         *http.Server
	listener       net.Listener

	mu      sync.Mutex
	pending map[string]chan string
}

func randomAutomationToken(byteCount int) (string, error) {
	buffer := make([]byte, byteCount)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (a *App) startAutomationServer() {
	// Both opt-in paths work for local binaries, including Wails development
	// child processes that do not inherit the launching shell's environment.
	if !a.automationEnabled && os.Getenv("EMULSION_AUTOMATION") != "1" {
		log.Printf("Emulsion automation disabled; use --automation or EMULSION_AUTOMATION=1 to enable it")
		return
	}

	token, err := randomAutomationToken(32)
	if err != nil {
		log.Printf("create automation token: %v", err)
		return
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		log.Printf("start automation listener: %v", err)
		return
	}

	bridge := &automationBridge{
		app:            a,
		token:          token,
		descriptorPath: filepath.Join(config.ConfigDir(), automationDescriptorName),
		listener:       listener,
		pending:        make(map[string]chan string),
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/status", bridge.handleStatus)
	mux.HandleFunc("/v1/editor/command", bridge.handleEditorCommand)
	mux.HandleFunc("/v1/drafts/get", bridge.handleDraftGet)
	mux.HandleFunc("/v1/drafts/wait", bridge.handleDraftWait)
	mux.HandleFunc("/v1/drafts/restore", bridge.handleDraftRestore)
	bridge.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
	}

	port := listener.Addr().(*net.TCPAddr).Port
	descriptor := automationDescriptor{
		Version:   1,
		URL:       fmt.Sprintf("http://127.0.0.1:%d", port),
		Token:     token,
		PID:       os.Getpid(),
		StartedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	descriptorJSON, err := json.MarshalIndent(descriptor, "", "  ")
	if err != nil {
		_ = listener.Close()
		return
	}
	if err := os.MkdirAll(config.ConfigDir(), 0o700); err != nil {
		log.Printf("create automation descriptor directory: %v", err)
		_ = listener.Close()
		return
	}
	if err := os.WriteFile(bridge.descriptorPath, descriptorJSON, 0o600); err != nil {
		log.Printf("write automation descriptor: %v", err)
		_ = listener.Close()
		return
	}

	a.automation = bridge
	log.Printf("Emulsion automation enabled at %s", descriptor.URL)
	go func() {
		if err := bridge.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("automation server stopped: %v", err)
		}
	}()
}

func (b *automationBridge) authorised(r *http.Request) bool {
	provided := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if len(provided) != len(b.token) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(b.token)) == 1
}

func writeAutomationJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write automation response: %v", err)
	}
}

func (b *automationBridge) requireRequest(w http.ResponseWriter, r *http.Request, method string) bool {
	if !b.authorised(r) {
		writeAutomationJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "unauthorised"})
		return false
	}
	if r.Method != method {
		writeAutomationJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method not allowed"})
		return false
	}
	return true
}

func (b *automationBridge) handleStatus(w http.ResponseWriter, r *http.Request) {
	if !b.requireRequest(w, r, http.MethodGet) {
		return
	}
	writeAutomationJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"pid":     os.Getpid(),
		"version": 1,
	})
}

func (b *automationBridge) handleEditorCommand(w http.ResponseWriter, r *http.Request) {
	if !b.requireRequest(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Method string         `json:"method"`
		Params map[string]any `json:"params"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, automationMaxBodyBytes)).Decode(&input); err != nil {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "invalid request body"})
		return
	}
	allowed := map[string]bool{
		"status": true, "location": true, "navigate": true, "open_document": true,
		"focus": true, "set_content": true,
		"type_text": true, "press_key": true, "set_selection": true, "get_state": true,
		"toolbar_state": true, "toolbar_click": true, "toolbar_select": true, "toolbar_color": true,
		"list_metrics": true,
	}
	if !allowed[input.Method] {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "unsupported editor method"})
		return
	}

	result, err := b.execute(r.Context(), input.Method, input.Params)
	if err != nil {
		writeAutomationJSON(w, http.StatusGatewayTimeout, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(result))
}

func (b *automationBridge) execute(ctx context.Context, method string, params map[string]any) (string, error) {
	id, err := randomAutomationToken(12)
	if err != nil {
		return "", err
	}
	response := make(chan string, 1)
	b.mu.Lock()
	b.pending[id] = response
	b.mu.Unlock()
	defer func() {
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
	}()

	runtime.EventsEmit(b.app.ctx, "emulsion:automation:command", automationCommand{
		ID: id, Method: method, Params: params,
	})
	timer := time.NewTimer(8 * time.Second)
	defer timer.Stop()
	select {
	case result := <-response:
		return result, nil
	case <-ctx.Done():
		return "", ctx.Err()
	case <-timer.C:
		return "", errors.New("Emulsion automation command timed out")
	}
}

func (a *App) CompleteAutomationCommand(requestID, result string) {
	if a.automation == nil || requestID == "" {
		return
	}
	a.automation.mu.Lock()
	response := a.automation.pending[requestID]
	a.automation.mu.Unlock()
	if response == nil {
		return
	}
	select {
	case response <- result:
	default:
	}
}

func decodeDraftPayload(data string) any {
	if data == "" {
		return nil
	}
	var payload any
	if json.Unmarshal([]byte(data), &payload) != nil {
		return data
	}
	return payload
}

func (b *automationBridge) handleDraftGet(w http.ResponseWriter, r *http.Request) {
	if !b.requireRequest(w, r, http.MethodGet) {
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "key is required"})
		return
	}
	data, err := db.GetLocalDraft(key)
	if err != nil {
		writeAutomationJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeAutomationJSON(w, http.StatusOK, map[string]any{"ok": true, "data": decodeDraftPayload(data)})
}

func draftSavedAt(data string) int64 {
	var payload struct {
		SavedAt int64 `json:"savedAt"`
	}
	_ = json.Unmarshal([]byte(data), &payload)
	return payload.SavedAt
}

func (b *automationBridge) handleDraftWait(w http.ResponseWriter, r *http.Request) {
	if !b.requireRequest(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Key          string `json:"key"`
		AfterSavedAt int64  `json:"afterSavedAt"`
		TimeoutMS    int    `json:"timeoutMs"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&input); err != nil || strings.TrimSpace(input.Key) == "" {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "valid key is required"})
		return
	}
	if input.TimeoutMS <= 0 {
		input.TimeoutMS = 5000
	}
	if input.TimeoutMS > 30000 {
		input.TimeoutMS = 30000
	}

	deadline := time.NewTimer(time.Duration(input.TimeoutMS) * time.Millisecond)
	ticker := time.NewTicker(75 * time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()
	for {
		data, err := db.GetLocalDraft(strings.TrimSpace(input.Key))
		if err != nil {
			writeAutomationJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		if data != "" && draftSavedAt(data) > input.AfterSavedAt {
			writeAutomationJSON(w, http.StatusOK, map[string]any{"ok": true, "data": decodeDraftPayload(data)})
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-deadline.C:
			writeAutomationJSON(w, http.StatusRequestTimeout, map[string]any{"ok": false, "error": "draft autosave timed out"})
			return
		case <-ticker.C:
		}
	}
}

func (b *automationBridge) handleDraftRestore(w http.ResponseWriter, r *http.Request) {
	if !b.requireRequest(w, r, http.MethodPost) {
		return
	}
	var input struct {
		Key  string          `json:"key"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, automationMaxBodyBytes)).Decode(&input); err != nil {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "invalid request body"})
		return
	}
	input.Key = strings.TrimSpace(input.Key)
	if input.Key == "" || len(input.Data) == 0 || string(input.Data) == "null" {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "key and draft data are required"})
		return
	}
	if err := db.SaveLocalDraft(input.Key, string(input.Data)); err != nil {
		writeAutomationJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	data, err := db.GetLocalDraft(input.Key)
	if err != nil {
		writeAutomationJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeAutomationJSON(w, http.StatusOK, map[string]any{"ok": true, "data": decodeDraftPayload(data)})
}

func (b *automationBridge) close() {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if b.server != nil {
		_ = b.server.Shutdown(ctx)
	}

	data, err := os.ReadFile(b.descriptorPath)
	if err != nil {
		return
	}
	var descriptor automationDescriptor
	if json.Unmarshal(data, &descriptor) == nil && descriptor.Token == b.token {
		_ = os.Remove(b.descriptorPath)
	}
}
