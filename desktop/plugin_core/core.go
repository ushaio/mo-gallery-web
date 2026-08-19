package plugin_core

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

// CoreAPIVersion is the version of the host/plugin lifecycle contract. Domain
// APIs (for example storage@1) are versioned independently.
const CoreAPIVersion = "1"

type RuntimeSpec struct {
	Type    string `json:"type"`
	Version string `json:"version,omitempty"`
	Entry   string `json:"entry"`
}

type Contribution struct {
	Domain       string   `json:"domain"`
	APIVersion   string   `json:"apiVersion"`
	Capabilities []string `json:"capabilities"`
}

type Manifest struct {
	ID             string         `json:"id"`
	Version        string         `json:"version"`
	CoreAPIVersion string         `json:"coreApiVersion"`
	Runtime        RuntimeSpec    `json:"runtime"`
	Contributions  []Contribution `json:"contributions"`
	Permissions    []string       `json:"permissions,omitempty"`
}

// Normalize validates the system-level portion of a manifest and applies the
// compatibility defaults shared by every capability domain.
func (m *Manifest) Normalize() error {
	if m == nil {
		return errors.New("plugin manifest is required")
	}
	m.ID = strings.TrimSpace(m.ID)
	m.Version = strings.TrimSpace(m.Version)
	m.CoreAPIVersion = strings.TrimSpace(m.CoreAPIVersion)
	if m.ID == "" || m.Version == "" {
		return errors.New("plugin manifest id and version are required")
	}
	if m.CoreAPIVersion == "" {
		m.CoreAPIVersion = CoreAPIVersion
	}
	if m.CoreAPIVersion != CoreAPIVersion {
		return fmt.Errorf("unsupported plugin core api version: %s", m.CoreAPIVersion)
	}
	if strings.TrimSpace(m.Runtime.Type) == "" || strings.TrimSpace(m.Runtime.Entry) == "" {
		return errors.New("plugin runtime type and entry are required")
	}
	seenDomains := make(map[string]struct{}, len(m.Contributions))
	for i := range m.Contributions {
		contribution := &m.Contributions[i]
		contribution.Domain = strings.TrimSpace(contribution.Domain)
		contribution.APIVersion = strings.TrimSpace(contribution.APIVersion)
		if contribution.Domain == "" || contribution.APIVersion == "" {
			return errors.New("plugin contributions require domain and apiVersion")
		}
		if _, exists := seenDomains[contribution.Domain]; exists {
			return fmt.Errorf("plugin contribution domain is duplicated: %s", contribution.Domain)
		}
		seenDomains[contribution.Domain] = struct{}{}
		unique := make(map[string]struct{}, len(contribution.Capabilities))
		capabilities := make([]string, 0, len(contribution.Capabilities))
		for _, capability := range contribution.Capabilities {
			capability = strings.TrimSpace(capability)
			if capability == "" {
				continue
			}
			if _, exists := unique[capability]; exists {
				continue
			}
			unique[capability] = struct{}{}
			capabilities = append(capabilities, capability)
		}
		sort.Strings(capabilities)
		contribution.Capabilities = capabilities
	}
	return nil
}

type CapabilityBroker struct {
	contributions map[string]map[string]struct{}
}

func NewCapabilityBroker(manifest Manifest) (*CapabilityBroker, error) {
	if err := manifest.Normalize(); err != nil {
		return nil, err
	}
	broker := &CapabilityBroker{contributions: make(map[string]map[string]struct{}, len(manifest.Contributions))}
	for _, contribution := range manifest.Contributions {
		capabilities := make(map[string]struct{}, len(contribution.Capabilities))
		for _, capability := range contribution.Capabilities {
			capabilities[capability] = struct{}{}
		}
		broker.contributions[contribution.Domain+"@"+contribution.APIVersion] = capabilities
	}
	return broker, nil
}

func (b *CapabilityBroker) Supports(domain, apiVersion, capability string) bool {
	if b == nil {
		return false
	}
	capabilities := b.contributions[strings.TrimSpace(domain)+"@"+strings.TrimSpace(apiVersion)]
	_, ok := capabilities[strings.TrimSpace(capability)]
	return ok
}

func (b *CapabilityBroker) Authorize(domain, apiVersion, capability string) error {
	if !b.Supports(domain, apiVersion, capability) {
		return fmt.Errorf("capability is not declared: %s@%s.%s", strings.TrimSpace(domain), strings.TrimSpace(apiVersion), strings.TrimSpace(capability))
	}
	return nil
}
