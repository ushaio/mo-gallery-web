package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMigratesLegacyAIConfigToProvider(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	data := []byte(`{
  "ai": {
    "base_url": "https://api.example.com/v1",
    "api_key": "legacy-key",
    "model": "gpt-4o"
  }
}`)
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	provider := cfg.AI.Providers["default"]
	if provider.BaseURL != "https://api.example.com/v1" {
		t.Fatalf("provider.BaseURL = %q", provider.BaseURL)
	}
	if provider.APIKey != "legacy-key" {
		t.Fatalf("provider.APIKey = %q", provider.APIKey)
	}
	if len(provider.Models) != 1 || provider.Models[0] != "gpt-4o" {
		t.Fatalf("provider.Models = %#v", provider.Models)
	}
	if cfg.AI.DefaultModel != "default:gpt-4o" {
		t.Fatalf("DefaultModel = %q", cfg.AI.DefaultModel)
	}
}

func TestResolveModelUsesProviderQualifiedModel(t *testing.T) {
	cfg := &Config{AI: AIConfig{
		DefaultModel: "openai:gpt-5.5",
		Providers: map[string]AIProviderConfig{
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
	}}

	providerID, provider, model, err := cfg.AI.ResolveModel("deepseek:deepseek-v4-pro")
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if providerID != "deepseek" {
		t.Fatalf("providerID = %q", providerID)
	}
	if provider.BaseURL != "https://api.deepseek.example/v1" || provider.APIKey != "deepseek-key" {
		t.Fatalf("provider = %#v", provider)
	}
	if model != "deepseek-v4-pro" {
		t.Fatalf("model = %q", model)
	}
}

func TestResolveModelFallsBackToDefaultModel(t *testing.T) {
	cfg := &Config{AI: AIConfig{
		DefaultModel: "openai:gpt-5.5",
		Providers: map[string]AIProviderConfig{
			"openai": {
				BaseURL: "https://api.openai.example/v1",
				APIKey:  "openai-key",
				Models:  []string{"gpt-5.5"},
			},
		},
	}}

	providerID, _, model, err := cfg.AI.ResolveModel("")
	if err != nil {
		t.Fatalf("ResolveModel() error = %v", err)
	}
	if providerID != "openai" || model != "gpt-5.5" {
		t.Fatalf("providerID, model = %q, %q", providerID, model)
	}
}
