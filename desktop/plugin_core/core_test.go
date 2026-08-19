package plugin_core

import "testing"

func TestCapabilityBrokerKeepsDomainsIsolated(t *testing.T) {
	manifest := Manifest{
		ID: "example.publisher", Version: "1.0.0", CoreAPIVersion: CoreAPIVersion,
		Runtime: RuntimeSpec{Type: "node", Version: "node22", Entry: "dist/main.js"},
		Contributions: []Contribution{
			{Domain: "storage", APIVersion: "1", Capabilities: []string{"object.put"}},
			{Domain: "export", APIVersion: "1", Capabilities: []string{"export.publish"}},
		},
	}
	broker, err := NewCapabilityBroker(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if !broker.Supports("storage", "1", "object.put") {
		t.Fatal("storage capability was not registered")
	}
	if broker.Supports("storage", "1", "export.publish") {
		t.Fatal("export capability leaked into the storage domain")
	}
	if err := broker.Authorize("export", "1", "object.put"); err == nil {
		t.Fatal("cross-domain capability authorization must fail")
	}
}

func TestManifestRejectsDuplicateContributionDomain(t *testing.T) {
	manifest := Manifest{
		ID: "example.duplicate", Version: "1.0.0", Runtime: RuntimeSpec{Type: "node", Entry: "dist/main.js"},
		Contributions: []Contribution{
			{Domain: "storage", APIVersion: "1"},
			{Domain: "storage", APIVersion: "2"},
		},
	}
	if err := manifest.Normalize(); err == nil {
		t.Fatal("duplicate contribution domains must be rejected")
	}
}
