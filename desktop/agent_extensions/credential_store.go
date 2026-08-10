package agent_extensions

import "strings"

// CredentialStore keeps secret MCP environment values outside the JSON config.
type CredentialStore interface {
	Set(reference, value string) error
	Get(reference string) (string, error)
	Delete(reference string) error
}

func NewCredentialReference(serverID, variableName string) string {
	return "mo-gallery-desktop/mcp/" + strings.TrimSpace(serverID) + "/" + strings.TrimSpace(variableName)
}
