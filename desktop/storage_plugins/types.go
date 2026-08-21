package storage_plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"mo-gallery-desktop/plugin_core"
)

const (
	RuntimeWeb           = "web"
	RuntimeDesktopPlugin = "desktop-plugin"

	PluginGitHub       = "github"
	PluginS3Compatible = "s3-compatible"
	pluginAPIVersion   = "1"

	PluginTypeExecutable = "executable"
	PluginTypeNode       = "node"
	RuntimeNode22        = "node22"

	ErrorInvalidManifest       = "invalid_manifest"
	ErrorUnsupportedPlatform   = "unsupported_platform"
	ErrorRuntimeMissing        = "runtime_missing"
	ErrorCapabilityMissing     = "capability_missing"
	ErrorRequestTimeout        = "request_timeout"
	ErrorRequestCanceled       = "request_canceled"
	ErrorPluginCrashed         = "plugin_crashed"
	ErrorCredentialUnavailable = "credential_unavailable"
	ErrorTransferFailed        = "transfer_failed"
	ErrorDeveloperModeRequired = "developer_mode_required"

	urlTypePublic    = "public"
	urlTypeSigned    = "signed"
	urlTypeTemporary = "temporary"
	urlTypeLocal     = "local"
)

// Source is the non-secret Desktop-local description of one plugin source.
// CredentialRefs point to the OS credential store and are never serialized as
// credential values.
type Source struct {
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	PluginID       string            `json:"pluginId"`
	PluginVersion  string            `json:"pluginVersion,omitempty"`
	Config         map[string]string `json:"config,omitempty"`
	CredentialRefs map[string]string `json:"credentialRefs,omitempty"`
	Command        string            `json:"command,omitempty"`
	Args           []string          `json:"args,omitempty"`
	Enabled        bool              `json:"enabled"`
	Status         string            `json:"status,omitempty"`
	LastError      string            `json:"lastError,omitempty"`
	CreatedAt      time.Time         `json:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt"`
}

type SourceInput struct {
	ID          string            `json:"id,omitempty"`
	Name        string            `json:"name"`
	PluginID    string            `json:"pluginId"`
	Config      map[string]string `json:"config,omitempty"`
	Credentials map[string]string `json:"credentials,omitempty"`
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	Enabled     bool              `json:"enabled"`
}

type SourceDTO struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	PluginID      string            `json:"pluginId"`
	PluginVersion string            `json:"pluginVersion,omitempty"`
	Config        map[string]string `json:"config,omitempty"`
	Enabled       bool              `json:"enabled"`
	Status        string            `json:"status,omitempty"`
	LastError     string            `json:"lastError,omitempty"`
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`
}

type Manifest struct {
	ID               string                     `json:"id"`
	Version          string                     `json:"version"`
	APIVersion       string                     `json:"apiVersion"`
	CoreAPIVersion   string                     `json:"coreApiVersion,omitempty"`
	Name             string                     `json:"name,omitempty"`
	Description      string                     `json:"description,omitempty"`
	Type             string                     `json:"type,omitempty"`
	Runtime          string                     `json:"runtime,omitempty"`
	Entry            string                     `json:"entry,omitempty"`
	Args             []string                   `json:"args,omitempty"`
	Platforms        []string                   `json:"platforms,omitempty"`
	Binaries         map[string]string          `json:"binaries,omitempty"`
	SigningKeyID     string                     `json:"signingKeyId,omitempty"`
	Capabilities     []string                   `json:"capabilities"`
	Contributions    []plugin_core.Contribution `json:"contributions,omitempty"`
	Permissions      []string                   `json:"permissions,omitempty"`
	ConfigSchema     map[string]any             `json:"configSchema,omitempty"`
	CredentialSchema map[string]any             `json:"credentialSchema,omitempty"`
	runtimeSpec      *plugin_core.RuntimeSpec
}

// UnmarshalJSON accepts both the legacy storage manifest and the system
// plugin runtime object. The in-memory legacy fields remain stable so existing
// storage code and persisted source records do not need a migration.
func (m *Manifest) UnmarshalJSON(data []byte) error {
	type wire struct {
		ID               string                     `json:"id"`
		Version          string                     `json:"version"`
		APIVersion       string                     `json:"apiVersion"`
		CoreAPIVersion   string                     `json:"coreApiVersion"`
		Name             string                     `json:"name"`
		Description      string                     `json:"description"`
		Type             string                     `json:"type"`
		Runtime          json.RawMessage            `json:"runtime"`
		Entry            string                     `json:"entry"`
		Args             []string                   `json:"args"`
		Platforms        []string                   `json:"platforms"`
		Binaries         map[string]string          `json:"binaries"`
		SigningKeyID     string                     `json:"signingKeyId"`
		Capabilities     []string                   `json:"capabilities"`
		Contributions    []plugin_core.Contribution `json:"contributions"`
		Permissions      []string                   `json:"permissions"`
		ConfigSchema     map[string]any             `json:"configSchema"`
		CredentialSchema map[string]any             `json:"credentialSchema"`
	}
	var value wire
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	*m = Manifest{
		ID: value.ID, Version: value.Version, APIVersion: value.APIVersion,
		CoreAPIVersion: value.CoreAPIVersion, Name: value.Name, Description: value.Description,
		Type: value.Type, Entry: value.Entry, Args: value.Args, Platforms: value.Platforms,
		Binaries: value.Binaries, SigningKeyID: value.SigningKeyID, Capabilities: value.Capabilities,
		Contributions: value.Contributions, Permissions: value.Permissions,
		ConfigSchema: value.ConfigSchema, CredentialSchema: value.CredentialSchema,
	}
	if len(value.Runtime) > 0 && string(value.Runtime) != "null" {
		var runtimeString string
		if err := json.Unmarshal(value.Runtime, &runtimeString); err == nil {
			m.Runtime = runtimeString
		} else {
			var runtimeObject plugin_core.RuntimeSpec
			if err := json.Unmarshal(value.Runtime, &runtimeObject); err != nil {
				return fmt.Errorf("decode plugin runtime: %w", err)
			}
			m.runtimeSpec = &runtimeObject
			m.Runtime = runtimeObject.Version
			if m.Type == "" {
				m.Type = runtimeObject.Type
			}
			if m.Entry == "" {
				m.Entry = runtimeObject.Entry
			}
		}
	}
	return nil
}

func (m Manifest) MarshalJSON() ([]byte, error) {
	type alias Manifest
	value := struct {
		alias
		Runtime any `json:"runtime,omitempty"`
	}{alias: alias(m)}
	if m.runtimeSpec != nil {
		value.Runtime = *m.runtimeSpec
	} else {
		value.Runtime = m.Runtime
	}
	return json.Marshal(value)
}

func (m Manifest) CoreManifest() plugin_core.Manifest {
	contributions := append([]plugin_core.Contribution(nil), m.Contributions...)
	if len(contributions) == 0 {
		contributions = []plugin_core.Contribution{{Domain: "storage", APIVersion: firstNonEmpty(m.APIVersion, pluginAPIVersion), Capabilities: append([]string(nil), m.Capabilities...)}}
	}
	runtimeType := m.Type
	runtimeVersion := m.Runtime
	runtimeEntry := m.Entry
	if runtimeEntry == "" && len(m.Binaries) > 0 {
		for _, entry := range m.Binaries {
			runtimeEntry = entry
			break
		}
	}
	if m.runtimeSpec != nil {
		runtimeType, runtimeVersion, runtimeEntry = m.runtimeSpec.Type, m.runtimeSpec.Version, m.runtimeSpec.Entry
	}
	return plugin_core.Manifest{ID: m.ID, Version: m.Version, CoreAPIVersion: m.CoreAPIVersion, Runtime: plugin_core.RuntimeSpec{Type: runtimeType, Version: runtimeVersion, Entry: runtimeEntry}, Contributions: contributions, Permissions: append([]string(nil), m.Permissions...)}
}

func (m Manifest) SupportsContribution(domain, apiVersion string) bool {
	for _, contribution := range m.CoreManifest().Contributions {
		if strings.EqualFold(contribution.Domain, strings.TrimSpace(domain)) && contribution.APIVersion == strings.TrimSpace(apiVersion) {
			return true
		}
	}
	return false
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

const (
	capabilityHealth   = "plugin.health"
	capabilityValidate = "source.validate"
	capabilityPut      = "object.put"
	capabilityGet      = "object.get"
	capabilityStat     = "object.stat"
	capabilityList     = "object.list"
	capabilityMove     = "object.move"
	capabilityDelete   = "object.delete"
	capabilityGetURL   = "object.getUrl"
)

// PluginDescriptor is the host-side catalog entry used to render a source
// configuration form and to start an external plugin process.
type PluginDescriptor struct {
	ID                  string                     `json:"id"`
	Version             string                     `json:"version"`
	APIVersion          string                     `json:"apiVersion"`
	CoreAPIVersion      string                     `json:"coreApiVersion"`
	Name                string                     `json:"name"`
	Description         string                     `json:"description,omitempty"`
	Type                string                     `json:"type"`
	Runtime             string                     `json:"runtime,omitempty"`
	Platform            string                     `json:"platform,omitempty"`
	Platforms           []string                   `json:"platforms,omitempty"`
	Command             string                     `json:"command,omitempty"`
	Args                []string                   `json:"args,omitempty"`
	RuntimeAvailable    bool                       `json:"runtimeAvailable"`
	RuntimeStatus       string                     `json:"runtimeStatus,omitempty"`
	SignatureStatus     string                     `json:"signatureStatus,omitempty"`
	CompatibilityStatus string                     `json:"compatibilityStatus,omitempty"`
	BuiltIn             bool                       `json:"builtIn"`
	Official            bool                       `json:"official"`
	Installed           bool                       `json:"installed"`
	ManifestPath        string                     `json:"manifestPath,omitempty"`
	Capabilities        []string                   `json:"capabilities,omitempty"`
	Contributions       []plugin_core.Contribution `json:"contributions,omitempty"`
	Permissions         []string                   `json:"permissions,omitempty"`
	ConfigSchema        map[string]any             `json:"configSchema,omitempty"`
	CredentialSchema    map[string]any             `json:"credentialSchema,omitempty"`
}

// PluginVersionDescriptor is the safe, renderer-facing summary of one
// installed version. It deliberately omits executable paths and manifest
// internals; rollback only accepts the validated version name through the
// host-side Manager.
type PluginVersionDescriptor struct {
	PluginID         string   `json:"pluginId"`
	Version          string   `json:"version"`
	Type             string   `json:"type"`
	Runtime          string   `json:"runtime,omitempty"`
	Platforms        []string `json:"platforms,omitempty"`
	Active           bool     `json:"active"`
	RuntimeAvailable bool     `json:"runtimeAvailable"`
	RuntimeStatus    string   `json:"runtimeStatus,omitempty"`
	SignatureStatus  string   `json:"signatureStatus,omitempty"`
}

type ObjectInfo struct {
	Key         string     `json:"key"`
	URL         string     `json:"url"`
	URLType     string     `json:"urlType"`
	Size        int64      `json:"size"`
	ContentType string     `json:"contentType,omitempty"`
	Checksum    string     `json:"checksum,omitempty"`
	Version     string     `json:"version,omitempty"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
}

type PutRequest struct {
	SourceID       string
	Key            string
	Path           string
	UseFullPath    bool
	FilePath       string
	ContentType    string
	Checksum       string
	IdempotencyKey string
}

type GetRequest struct {
	SourceID        string
	Key             string
	DestinationPath string
}

type StatRequest struct {
	SourceID string
	Key      string
}

type ListRequest struct {
	SourceID string
	Prefix   string
	Cursor   string
	Limit    int
}

type MoveRequest struct {
	SourceID string
	FromKey  string
	ToKey    string
}

type DeleteRequest struct {
	SourceID string
	Key      string
}

type URLRequest struct {
	SourceID string
	Key      string
}

type TransferHandle struct {
	ID   string
	Size int64
}

type StoragePort interface {
	Validate(ctx context.Context, sourceID string) error
	Health(ctx context.Context, sourceID string) (HealthResult, error)
	Put(ctx context.Context, req PutRequest) (ObjectInfo, error)
	Get(ctx context.Context, req GetRequest) (ObjectInfo, error)
	Stat(ctx context.Context, req StatRequest) (ObjectInfo, error)
	List(ctx context.Context, req ListRequest) (ListResult, error)
	Move(ctx context.Context, req MoveRequest) (ObjectInfo, error)
	Delete(ctx context.Context, req DeleteRequest) error
	GetURL(ctx context.Context, req URLRequest) (ObjectInfo, error)
}

type HealthResult struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

type ListResult struct {
	Objects    []ObjectInfo `json:"objects"`
	NextCursor string       `json:"nextCursor,omitempty"`
	HasMore    bool         `json:"hasMore,omitempty"`
}

// PluginError keeps an actionable machine-readable code alongside a safe
// human-facing message. Secret values and signed URLs must never be placed in
// Message or Cause by a host adapter.
type PluginError struct {
	Code    string
	Message string
	Cause   error
}

func (e *PluginError) Error() string {
	if e == nil {
		return ""
	}
	if e.Cause == nil {
		return e.Message
	}
	return e.Message + ": " + e.Cause.Error()
}

func (e *PluginError) Unwrap() error { return e.Cause }

type rpcError struct {
	// Code is `any` because the JSON-RPC transport carries both host-side
	// numeric codes (e.g. -32601 for method-not-found) and plugin-side string
	// codes (e.g. "request_timeout" from the SDK's PluginError). Unmarshaling a
	// string code into an int field would fail and silently drop the whole
	// response, so the field must accept both shapes.
	Code    any    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func publicURLType(value string) string {
	switch value {
	case urlTypeSigned, urlTypeTemporary, urlTypeLocal:
		return value
	default:
		return urlTypePublic
	}
}
