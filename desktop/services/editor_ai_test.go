package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mo-gallery-desktop/config"
)

func TestGetModelsReturnsProviderGroupedModels(t *testing.T) {
	service := NewEditorAiService(&config.Config{AI: config.AIConfig{
		DefaultModel: "openai:gpt-5.5",
		Providers: map[string]config.AIProviderConfig{
			"openai": {
				BaseURL: "https://api.openai.example/v1",
				APIKey:  "openai-key",
				Models:  []string{"gpt-5.5", "gpt-5.6"},
			},
			"deepseek": {
				BaseURL: "https://api.deepseek.example/v1",
				APIKey:  "deepseek-key",
				Models:  []string{"deepseek-v4-pro"},
			},
		},
	}})

	result, err := service.GetModels()
	if err != nil {
		t.Fatalf("GetModels() error = %v", err)
	}
	if result.DefaultModel != "openai:gpt-5.5" {
		t.Fatalf("DefaultModel = %q", result.DefaultModel)
	}
	if len(result.Models) != 3 {
		t.Fatalf("models = %#v", result.Models)
	}
	if result.Models[0].ID != "deepseek:deepseek-v4-pro" || result.Models[0].Provider != "deepseek" || result.Models[0].Label != "deepseek / deepseek-v4-pro" {
		t.Fatalf("first model = %#v", result.Models[0])
	}
	if result.Models[1].ID != "openai:gpt-5.5" || result.Models[1].Provider != "openai" || result.Models[1].Model != "gpt-5.5" {
		t.Fatalf("second model = %#v", result.Models[1])
	}
}

func TestGetModelsFetchesSpecificProviderModels(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{{"id": "deepseek-v4-pro"}, {"id": "deepseek-v4-lite"}},
		})
	}))
	defer server.Close()

	service := NewEditorAiService(&config.Config{AI: config.AIConfig{
		DefaultModel: "deepseek:deepseek-v4-pro",
		Providers: map[string]config.AIProviderConfig{
			"deepseek": {BaseURL: server.URL, APIKey: "deepseek-key"},
		},
	}})

	result, err := service.GetProviderModels("deepseek")
	if err != nil {
		t.Fatalf("GetProviderModels() error = %v", err)
	}
	if authHeader != "Bearer deepseek-key" {
		t.Fatalf("Authorization = %q", authHeader)
	}
	if len(result.Models) != 2 || result.Models[0].ID != "deepseek:deepseek-v4-pro" || result.Models[1].ID != "deepseek:deepseek-v4-lite" {
		t.Fatalf("models = %#v", result.Models)
	}
}
