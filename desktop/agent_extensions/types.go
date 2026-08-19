package agent_extensions

import "time"

const (
	SourceTypeSkill = "skill"
	SourceTypeMCP   = "mcp"

	RiskRead    = "read"
	RiskWrite   = "write"
	RiskExecute = "execute"
	RiskDelete  = "delete"
	RiskNetwork = "network"
)

type Skill struct {
	ID                     string    `json:"id"`
	Name                   string    `json:"name"`
	Description            string    `json:"description"`
	Version                string    `json:"version,omitempty"`
	SourceType             string    `json:"sourceType"`
	SourcePath             string    `json:"sourcePath"`
	InstallPath            string    `json:"installPath"`
	ContentHash            string    `json:"contentHash"`
	Enabled                bool      `json:"enabled"`
	ScriptExecutionEnabled bool      `json:"scriptExecutionEnabled"`
	ValidationStatus       string    `json:"validationStatus"`
	ValidationError        string    `json:"validationError,omitempty"`
	InstalledAt            time.Time `json:"installedAt"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

type SkillContent struct {
	Readme       string           `json:"readme"`
	Skill        Skill            `json:"skill"`
	Instructions string           `json:"instructions"`
	References   []SkillReference `json:"references"`
}

type SkillResource struct {
	Skill      Skill    `json:"skill"`
	Path       string   `json:"path"`
	Content    string   `json:"content"`
	References []string `json:"references"`
}

type SkillReference struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type MCPEnvironmentVariable struct {
	Name          string `json:"name"`
	Value         string `json:"value,omitempty"`
	Secret        bool   `json:"secret"`
	Configured    bool   `json:"configured"`
	CredentialRef string `json:"credentialRef,omitempty"`
}

type MCPServer struct {
	ID                    string                   `json:"id"`
	Name                  string                   `json:"name"`
	Description           string                   `json:"description,omitempty"`
	Command               string                   `json:"command"`
	Args                  []string                 `json:"args"`
	Env                   []MCPEnvironmentVariable `json:"env"`
	Enabled               bool                     `json:"enabled"`
	CapabilityFingerprint string                   `json:"capabilityFingerprint"`
	RuntimeStatus         string                   `json:"runtimeStatus"`
	LastError             string                   `json:"lastError,omitempty"`
	LastStartedAt         *time.Time               `json:"lastStartedAt,omitempty"`
	LastUsedAt            *time.Time               `json:"lastUsedAt,omitempty"`
	IdleTimeoutSeconds    int                      `json:"idleTimeoutSeconds"`
	RequestTimeoutSeconds int                      `json:"requestTimeoutSeconds"`
	Tools                 []MCPTool                `json:"tools,omitempty"`
	CreatedAt             time.Time                `json:"createdAt"`
	UpdatedAt             time.Time                `json:"updatedAt"`
}

type MCPServerInput struct {
	ID                    string                   `json:"id,omitempty"`
	Name                  string                   `json:"name"`
	Description           string                   `json:"description,omitempty"`
	Command               string                   `json:"command"`
	Args                  []string                 `json:"args"`
	Env                   []MCPEnvironmentVariable `json:"env"`
	Enabled               bool                     `json:"enabled"`
	IdleTimeoutSeconds    int                      `json:"idleTimeoutSeconds"`
	RequestTimeoutSeconds int                      `json:"requestTimeoutSeconds"`
}

type MCPTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema,omitempty"`
	RiskClass   string         `json:"riskClass"`
}

type AuthorizationGrant struct {
	ID             string     `json:"id"`
	SourceID       string     `json:"sourceId"`
	SourceType     string     `json:"sourceType"`
	CapabilityName string     `json:"capabilityName"`
	ParameterScope string     `json:"parameterScope"`
	Decision       string     `json:"decision"`
	Mode           string     `json:"mode"`
	Fingerprint    string     `json:"fingerprint"`
	CreatedAt      time.Time  `json:"createdAt"`
	ExpiresAt      *time.Time `json:"expiresAt,omitempty"`
}

type ToolInvocationAudit struct {
	ID                    string    `json:"id"`
	ConversationID        string    `json:"conversationId,omitempty"`
	SourceID              string    `json:"sourceId"`
	CapabilityName        string    `json:"capabilityName"`
	ParameterSummary      string    `json:"parameterSummary"`
	AuthorizationDecision string    `json:"authorizationDecision"`
	RiskClass             string    `json:"riskClass"`
	StartedAt             time.Time `json:"startedAt"`
	DurationMS            int64     `json:"durationMs"`
	ResultStatus          string    `json:"resultStatus"`
	ErrorCode             string    `json:"errorCode,omitempty"`
}

type MCPToolCallInput struct {
	ServerID       string         `json:"serverId"`
	ToolName       string         `json:"toolName"`
	Arguments      map[string]any `json:"arguments"`
	ConversationID string         `json:"conversationId,omitempty"`
	Approved       bool           `json:"approved"`
	Remember       bool           `json:"remember"`
	ParameterScope string         `json:"parameterScope,omitempty"`
	InvocationID   string         `json:"invocationId,omitempty"`
}

type MCPToolCallResult struct {
	Content            any    `json:"content,omitempty"`
	IsError            bool   `json:"isError"`
	PermissionRequired bool   `json:"permissionRequired"`
	RiskClass          string `json:"riskClass"`
	ParameterSummary   string `json:"parameterSummary"`
}

type AgentExtensionSnapshot struct {
	Skills         []Skill               `json:"skills"`
	MCPServers     []MCPServer           `json:"mcpServers"`
	Authorizations []AuthorizationGrant  `json:"authorizations"`
	Audits         []ToolInvocationAudit `json:"audits"`
}
