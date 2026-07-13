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

func TestNormalizeSelectsDefaultImageModel(t *testing.T) {
	ai := AIConfig{Providers: map[string]AIProviderConfig{
		"openai": {
			Models:      []string{"gpt-5.5"},
			ImageModels: []string{"gpt-image-1"},
		},
	}}

	ai.Normalize()

	if ai.DefaultImageModel != "openai:gpt-image-1" {
		t.Fatalf("DefaultImageModel = %q", ai.DefaultImageModel)
	}
}

func TestResolveImageModelRequiresImageCapability(t *testing.T) {
	ai := AIConfig{
		DefaultImageModel: "openai:gpt-image-1",
		Providers: map[string]AIProviderConfig{
			"openai": {
				BaseURL:     "https://api.openai.example/v1",
				APIKey:      "openai-key",
				Models:      []string{"gpt-5.5", "gpt-image-1"},
				ImageModels: []string{"gpt-image-1"},
			},
		},
	}

	if _, _, _, err := ai.ResolveImageModel("openai:gpt-5.5"); err == nil {
		t.Fatal("ResolveImageModel() accepted a model without image capability")
	}
	providerID, _, model, err := ai.ResolveImageModel("")
	if err != nil {
		t.Fatalf("ResolveImageModel() error = %v", err)
	}
	if providerID != "openai" || model != "gpt-image-1" {
		t.Fatalf("providerID, model = %q, %q", providerID, model)
	}
}

func TestNormalizeModelCapabilities(t *testing.T) {
	ai := AIConfig{Providers: map[string]AIProviderConfig{
		"openai": {
			Models:                 []string{"gpt-5.6", "vision-looking-model"},
			ImageModels:            []string{"image-looking-model"},
			VisionModels:           []string{" gpt-5.6 ", "", "gpt-5.6", " vision-explicit "},
			ToolModels:             []string{" tool-model ", "tool-model", ""},
			StructuredOutputModels: []string{" structured-model ", "structured-model"},
			ContextWindows: map[string]int{
				"":          128000,
				" invalid ": 0,
				"negative":  -1,
				" model":    16000,
				"model":     32000,
				"model ":    64000,
			},
		},
		"nil-map": {},
	}}

	ai.Normalize()

	provider := ai.Providers["openai"]
	if got := provider.VisionModels; len(got) != 2 || got[0] != "gpt-5.6" || got[1] != "vision-explicit" {
		t.Fatalf("VisionModels = %#v", got)
	}
	if got := provider.ToolModels; len(got) != 1 || got[0] != "tool-model" {
		t.Fatalf("ToolModels = %#v", got)
	}
	if got := provider.StructuredOutputModels; len(got) != 1 || got[0] != "structured-model" {
		t.Fatalf("StructuredOutputModels = %#v", got)
	}
	if len(provider.ContextWindows) != 1 || provider.ContextWindows["model"] != 64000 {
		t.Fatalf("ContextWindows = %#v", provider.ContextWindows)
	}
	if ai.Providers["nil-map"].ContextWindows == nil {
		t.Fatal("nil ContextWindows was not initialized")
	}
	if containsString(provider.VisionModels, "vision-looking-model") || containsString(provider.VisionModels, "image-looking-model") {
		t.Fatalf("Normalize inferred vision capability: %#v", provider.VisionModels)
	}
}

func TestNormalizedCopyDoesNotMutateSource(t *testing.T) {
	ai := AIConfig{Providers: map[string]AIProviderConfig{
		"openai": {
			Models:                 []string{"gpt-5.6"},
			VisionModels:           []string{" gpt-5.6 ", "gpt-5.6"},
			ToolModels:             []string{" gpt-5.6 "},
			StructuredOutputModels: []string{" gpt-5.6 "},
			ContextWindows:         map[string]int{" gpt-5.6 ": 128000},
		},
	}}

	normalized := ai.NormalizedCopy()
	normalizedProvider := normalized.Providers["openai"]
	if len(normalizedProvider.VisionModels) != 1 || normalizedProvider.VisionModels[0] != "gpt-5.6" {
		t.Fatalf("normalized VisionModels = %#v", normalizedProvider.VisionModels)
	}
	if normalizedProvider.ContextWindows["gpt-5.6"] != 128000 {
		t.Fatalf("normalized ContextWindows = %#v", normalizedProvider.ContextWindows)
	}

	sourceProvider := ai.Providers["openai"]
	if len(sourceProvider.VisionModels) != 2 || sourceProvider.VisionModels[0] != " gpt-5.6 " {
		t.Fatalf("source VisionModels mutated: %#v", sourceProvider.VisionModels)
	}
	if sourceProvider.ContextWindows[" gpt-5.6 "] != 128000 {
		t.Fatalf("source ContextWindows mutated: %#v", sourceProvider.ContextWindows)
	}

	normalizedProvider.Models[0] = "changed"
	normalizedProvider.ContextWindows["gpt-5.6"] = 1
	if ai.Providers["openai"].Models[0] != "gpt-5.6" {
		t.Fatalf("source Models shares storage with normalized copy")
	}
	if ai.Providers["openai"].ContextWindows[" gpt-5.6 "] != 128000 {
		t.Fatalf("source ContextWindows shares storage with normalized copy")
	}
}
