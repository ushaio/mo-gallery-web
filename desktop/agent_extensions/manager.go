package agent_extensions

import (
	"archive/zip"
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	runtimeStopped  = "stopped"
	runtimeDegraded = "degraded"
	defaultIdleSecs = 300
	defaultReqSecs  = 60
)

type Manager struct {
	mu          sync.Mutex
	path        string
	installRoot string
	credentials CredentialStore
	snapshot    AgentExtensionSnapshot
	runtimes    map[string]*mcpRuntime
	callLocks   map[string]chan struct{}
	invocations map[string]context.CancelFunc
}

func NewManager(configDir string) (*Manager, error) {
	root := filepath.Join(configDir, "agent-extensions")
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, fmt.Errorf("创建 Agent 扩展目录失败: %w", err)
	}
	manager := &Manager{
		path:        filepath.Join(configDir, "agent-extensions.json"),
		installRoot: root,
		credentials: NewCredentialStore(),
		runtimes:    map[string]*mcpRuntime{},
		callLocks:   map[string]chan struct{}{},
		invocations: map[string]context.CancelFunc{},
	}
	if err := manager.load(); err != nil {
		return nil, err
	}
	return manager, nil
}

func (m *Manager) mcpCallLock(serverID string) chan struct{} {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.callLocks == nil {
		m.callLocks = map[string]chan struct{}{}
	}
	if m.callLocks[serverID] == nil {
		m.callLocks[serverID] = make(chan struct{}, 1)
		m.callLocks[serverID] <- struct{}{}
	}
	return m.callLocks[serverID]
}

func (m *Manager) registerInvocation(id string, cancel context.CancelFunc) {
	if id == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.invocations == nil {
		m.invocations = map[string]context.CancelFunc{}
	}
	m.invocations[id] = cancel
}

func (m *Manager) unregisterInvocation(id string) {
	if id == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.invocations, id)
}

func (m *Manager) CancelMCPToolInvocation(id string) bool {
	m.mu.Lock()
	cancel := m.invocations[id]
	m.mu.Unlock()
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

func (m *Manager) load() error {
	if err := recoverSnapshotFile(m.path); err != nil {
		return fmt.Errorf("恢复 Agent 扩展配置失败: %w", err)
	}
	data, err := os.ReadFile(m.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取 Agent 扩展配置失败: %w", err)
	}
	if err := json.Unmarshal(data, &m.snapshot); err != nil {
		return fmt.Errorf("解析 Agent 扩展配置失败: %w", err)
	}
	for index := range m.snapshot.MCPServers {
		server := &m.snapshot.MCPServers[index]
		if server.IdleTimeoutSeconds <= 0 {
			server.IdleTimeoutSeconds = defaultIdleSecs
		}
		if server.RequestTimeoutSeconds <= 0 {
			server.RequestTimeoutSeconds = defaultReqSecs
		}
		if server.RuntimeStatus == "" {
			server.RuntimeStatus = runtimeStopped
		}
	}
	return nil
}

func (m *Manager) saveLocked() error {
	data, err := json.MarshalIndent(m.snapshot, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp := m.path + ".tmp"
	file, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := replaceSnapshotFile(m.path, tmp); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func recoverSnapshotFile(path string) error {
	backup := path + ".bak"
	if _, err := os.Stat(path); err == nil {
		_ = os.Remove(backup)
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if _, err := os.Stat(backup); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	return os.Rename(backup, path)
}

func replaceSnapshotFile(path, temporary string) error {
	if err := os.Rename(temporary, path); err == nil {
		return nil
	} else if _, statErr := os.Stat(path); statErr != nil {
		return err
	}

	backup := path + ".bak"
	if err := os.Remove(backup); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("清理 Agent 扩展配置备份失败: %w", err)
	}
	if err := os.Rename(path, backup); err != nil {
		return fmt.Errorf("备份 Agent 扩展配置失败: %w", err)
	}
	if err := os.Rename(temporary, path); err != nil {
		if restoreErr := os.Rename(backup, path); restoreErr != nil {
			return fmt.Errorf("替换 Agent 扩展配置失败: %v; 恢复旧配置失败: %w", err, restoreErr)
		}
		return fmt.Errorf("替换 Agent 扩展配置失败: %w", err)
	}
	if err := os.Remove(backup); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("清理 Agent 扩展配置备份失败: %w", err)
	}
	return nil
}

func (m *Manager) Snapshot() AgentExtensionSnapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return cloneSnapshot(m.snapshot)
}

func cloneSnapshot(input AgentExtensionSnapshot) AgentExtensionSnapshot {
	data, _ := json.Marshal(input)
	var output AgentExtensionSnapshot
	_ = json.Unmarshal(data, &output)
	normalizeSnapshotSlices(&output)
	return output
}

func normalizeSnapshotSlices(snapshot *AgentExtensionSnapshot) {
	if snapshot.Skills == nil {
		snapshot.Skills = []Skill{}
	}
	if snapshot.MCPServers == nil {
		snapshot.MCPServers = []MCPServer{}
	}
	if snapshot.Authorizations == nil {
		snapshot.Authorizations = []AuthorizationGrant{}
	}
	if snapshot.Audits == nil {
		snapshot.Audits = []ToolInvocationAudit{}
	}
	for index := range snapshot.MCPServers {
		server := &snapshot.MCPServers[index]
		if server.Args == nil {
			server.Args = []string{}
		}
		if server.Env == nil {
			server.Env = []MCPEnvironmentVariable{}
		}
		if server.Tools == nil {
			server.Tools = []MCPTool{}
		}
	}
}

func (m *Manager) ListSkills() []Skill                      { return m.Snapshot().Skills }
func (m *Manager) ListMCPServers() []MCPServer              { return m.Snapshot().MCPServers }
func (m *Manager) ListAuthorizations() []AuthorizationGrant { return m.Snapshot().Authorizations }
func (m *Manager) ListAudits() []ToolInvocationAudit        { return m.Snapshot().Audits }

func (m *Manager) ImportSkill(sourcePath string) (Skill, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	contentRoot, cleanup, err := prepareSkillSource(sourcePath, m.installRoot)
	if err != nil {
		return Skill{}, err
	}
	defer cleanup()

	instructions, metadata, err := readSkillMarkdown(filepath.Join(contentRoot, "SKILL.md"))
	if err != nil {
		return Skill{}, err
	}
	name := metadata["name"]
	if name == "" {
		name = filepath.Base(contentRoot)
	}
	description := metadata["description"]
	if description == "" {
		return Skill{}, errors.New("SKILL.md 缺少 description")
	}
	id := slugID(name)
	hash, err := hashDirectory(contentRoot)
	if err != nil {
		return Skill{}, err
	}
	installPath := filepath.Join(m.installRoot, "skills", id, hash[:12])
	if err := os.MkdirAll(filepath.Dir(installPath), 0755); err != nil {
		return Skill{}, err
	}
	if err := copyDirectory(contentRoot, installPath); err != nil {
		return Skill{}, err
	}
	now := time.Now()
	skill := Skill{
		ID: id, Name: name, Description: description, Version: metadata["version"],
		SourceType: SourceTypeSkill, SourcePath: sourcePath, InstallPath: installPath,
		ContentHash: hash, Enabled: true, ValidationStatus: "valid", InstalledAt: now, UpdatedAt: now,
	}
	_ = instructions
	for index := range m.snapshot.Skills {
		if m.snapshot.Skills[index].ID == id {
			m.snapshot.Skills[index] = skill
			if err := m.saveLocked(); err != nil {
				return Skill{}, err
			}
			return skill, nil
		}
	}
	m.snapshot.Skills = append(m.snapshot.Skills, skill)
	if err := m.saveLocked(); err != nil {
		return Skill{}, err
	}
	return skill, nil
}

func (m *Manager) ReadSkill(id string) (SkillContent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var skill *Skill
	for index := range m.snapshot.Skills {
		if m.snapshot.Skills[index].ID == id {
			skill = &m.snapshot.Skills[index]
			break
		}
	}
	if skill == nil {
		return SkillContent{}, errors.New("Skill 不存在")
	}
	instructions, _, err := readSkillMarkdown(filepath.Join(skill.InstallPath, "SKILL.md"))
	if err != nil {
		return SkillContent{}, err
	}
	refs := []SkillReference{}
	_ = filepath.Walk(filepath.Join(skill.InstallPath, "references"), func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info == nil || info.IsDir() {
			return nil
		}
		data, readErr := os.ReadFile(path)
		if readErr == nil {
			relative, _ := filepath.Rel(skill.InstallPath, path)
			refs = append(refs, SkillReference{Path: filepath.ToSlash(relative), Content: string(data)})
		}
		return nil
	})
	return SkillContent{Skill: *skill, Instructions: instructions, References: refs}, nil
}

func (m *Manager) ReadSkillResource(id, requestedPath string) (SkillResource, error) {
	m.mu.Lock()
	var skill *Skill
	for index := range m.snapshot.Skills {
		if m.snapshot.Skills[index].ID == id {
			copySkill := m.snapshot.Skills[index]
			skill = &copySkill
			break
		}
	}
	m.mu.Unlock()
	if skill == nil || !skill.Enabled || skill.ValidationStatus != "valid" {
		return SkillResource{}, errors.New("Skill 不存在或不可用")
	}

	references := []string{}
	referencesRoot := filepath.Join(skill.InstallPath, "references")
	_ = filepath.Walk(referencesRoot, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil || info == nil || info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		relative, relErr := filepath.Rel(skill.InstallPath, path)
		if relErr == nil {
			references = append(references, filepath.ToSlash(relative))
		}
		return nil
	})
	sort.Strings(references)

	resourcePath := strings.TrimSpace(requestedPath)
	if resourcePath == "" || strings.EqualFold(filepath.ToSlash(resourcePath), "SKILL.md") {
		instructions, _, err := readSkillMarkdown(filepath.Join(skill.InstallPath, "SKILL.md"))
		if err != nil {
			return SkillResource{}, err
		}
		return SkillResource{Skill: *skill, Path: "SKILL.md", Content: instructions, References: references}, nil
	}

	normalized := filepath.Clean(filepath.FromSlash(resourcePath))
	if filepath.IsAbs(normalized) || normalized == "." || normalized == ".." || strings.HasPrefix(normalized, ".."+string(os.PathSeparator)) {
		return SkillResource{}, errors.New("Skill resource 路径越界")
	}
	if normalized != "references" && !strings.HasPrefix(normalized, "references"+string(os.PathSeparator)) {
		return SkillResource{}, errors.New("仅允许读取 Skill references")
	}
	target := filepath.Join(skill.InstallPath, normalized)
	relative, err := filepath.Rel(skill.InstallPath, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return SkillResource{}, errors.New("Skill resource 路径越界")
	}
	info, err := os.Lstat(target)
	if err != nil {
		return SkillResource{}, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return SkillResource{}, errors.New("Skill resource 不是普通文件")
	}
	if info.Size() > 1024*1024 {
		return SkillResource{}, errors.New("Skill resource 超过 1 MiB 限制")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return SkillResource{}, err
	}
	return SkillResource{Skill: *skill, Path: filepath.ToSlash(relative), Content: string(data), References: references}, nil
}

func (m *Manager) SetSkillEnabled(id string, enabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.Skills {
		if m.snapshot.Skills[index].ID == id {
			m.snapshot.Skills[index].Enabled = enabled
			m.snapshot.Skills[index].UpdatedAt = time.Now()
			return m.saveLocked()
		}
	}
	return errors.New("Skill 不存在")
}

func (m *Manager) SetSkillScriptExecution(id string, enabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.Skills {
		if m.snapshot.Skills[index].ID == id {
			m.snapshot.Skills[index].ScriptExecutionEnabled = enabled
			m.snapshot.Skills[index].UpdatedAt = time.Now()
			return m.saveLocked()
		}
	}
	return errors.New("Skill 不存在")
}

func (m *Manager) RemoveSkill(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.Skills {
		if m.snapshot.Skills[index].ID != id {
			continue
		}
		_ = os.RemoveAll(filepath.Dir(m.snapshot.Skills[index].InstallPath))
		m.snapshot.Skills = append(m.snapshot.Skills[:index], m.snapshot.Skills[index+1:]...)
		m.snapshot.Authorizations = removeAuthorizations(m.snapshot.Authorizations, id)
		return m.saveLocked()
	}
	return errors.New("Skill 不存在")
}

func (m *Manager) SaveMCPServer(input MCPServerInput) (MCPServer, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	input.Name = strings.TrimSpace(input.Name)
	input.Command = strings.TrimSpace(input.Command)
	if input.Name == "" || input.Command == "" {
		return MCPServer{}, errors.New("MCP Server 需要名称和 command")
	}
	if input.ID == "" {
		input.ID = m.uniqueMCPServerIDLocked(input.Name)
	}
	if input.IdleTimeoutSeconds <= 0 {
		input.IdleTimeoutSeconds = defaultIdleSecs
	}
	if input.RequestTimeoutSeconds <= 0 {
		input.RequestTimeoutSeconds = defaultReqSecs
	}

	existingIndex := -1
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == input.ID {
			existingIndex = index
			break
		}
	}
	existingSecrets := map[string]MCPEnvironmentVariable{}
	if existingIndex >= 0 {
		for _, variable := range m.snapshot.MCPServers[existingIndex].Env {
			if variable.Secret {
				existingSecrets[variable.Name] = variable
			}
		}
	}
	seenVariables := map[string]struct{}{}
	for index := range input.Env {
		variable := &input.Env[index]
		variable.Name = strings.TrimSpace(variable.Name)
		if variable.Name == "" {
			return MCPServer{}, errors.New("MCP 环境变量名称不能为空")
		}
		key := strings.ToLower(variable.Name)
		if _, exists := seenVariables[key]; exists {
			return MCPServer{}, fmt.Errorf("MCP 环境变量重复: %s", variable.Name)
		}
		seenVariables[key] = struct{}{}
		if !variable.Secret {
			variable.Configured = true
			variable.CredentialRef = ""
			continue
		}
		if variable.Value != "" {
			ref := NewCredentialReference(input.ID, variable.Name)
			if err := m.credentials.Set(ref, variable.Value); err != nil {
				return MCPServer{}, err
			}
			variable.Value = ""
			variable.Configured = true
			variable.CredentialRef = ref
			continue
		}
		if variable.CredentialRef == "" {
			if existing, ok := existingSecrets[variable.Name]; ok {
				variable.CredentialRef = existing.CredentialRef
			}
		}
		if variable.CredentialRef == "" {
			return MCPServer{}, fmt.Errorf("MCP Secret 环境变量 %s 尚未配置", variable.Name)
		}
		variable.Configured = true
	}

	now := time.Now()
	server := MCPServer{ID: input.ID, Name: input.Name, Description: input.Description, Command: input.Command, Args: input.Args, Env: input.Env, Enabled: input.Enabled, RuntimeStatus: runtimeStopped, IdleTimeoutSeconds: input.IdleTimeoutSeconds, RequestTimeoutSeconds: input.RequestTimeoutSeconds, CreatedAt: now, UpdatedAt: now}
	if existingIndex >= 0 {
		previous := m.snapshot.MCPServers[existingIndex]
		// Keep the last discovered tool contract while editing unrelated settings.
		// It is part of the capability fingerprint and will be replaced by the
		// next connection test if the server advertises a different contract.
		server.Tools = previous.Tools
	}
	server.CapabilityFingerprint = fingerprintServer(server)
	if existingIndex >= 0 {
		previous := m.snapshot.MCPServers[existingIndex]
		if previous.CapabilityFingerprint != server.CapabilityFingerprint {
			m.snapshot.Authorizations = removeAuthorizations(m.snapshot.Authorizations, server.ID)
		}
		server.CreatedAt = previous.CreatedAt
		m.snapshot.MCPServers[existingIndex] = server
		if err := m.saveLocked(); err != nil {
			m.snapshot.MCPServers[existingIndex] = previous
			return MCPServer{}, err
		}
		m.deleteUnusedCredentials(previous.Env, server.Env)
		return server, nil
	}
	m.snapshot.MCPServers = append(m.snapshot.MCPServers, server)
	if err := m.saveLocked(); err != nil {
		m.snapshot.MCPServers = m.snapshot.MCPServers[:len(m.snapshot.MCPServers)-1]
		return MCPServer{}, err
	}
	return server, nil
}

func (m *Manager) ImportMCPServers(data string) ([]MCPServer, error) {
	var root struct {
		Servers map[string]struct {
			Command     string            `json:"command"`
			Args        []string          `json:"args"`
			Env         map[string]string `json:"env"`
			Description string            `json:"description"`
			URL         string            `json:"url"`
			Transport   string            `json:"transport"`
			Type        string            `json:"type"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal([]byte(data), &root); err != nil {
		return nil, fmt.Errorf("解析 mcpServers JSON 失败: %w", err)
	}
	if len(root.Servers) == 0 {
		return nil, errors.New("JSON 中没有 mcpServers")
	}
	result := make([]MCPServer, 0, len(root.Servers))
	for name, value := range root.Servers {
		transport := strings.ToLower(strings.TrimSpace(value.Transport))
		serverType := strings.ToLower(strings.TrimSpace(value.Type))
		if strings.TrimSpace(value.URL) != "" || transport == "http" || transport == "sse" || serverType == "http" || serverType == "sse" {
			return nil, fmt.Errorf("MCP Server %s 使用 HTTP/SSE transport，Desktop 首期仅支持 stdio", name)
		}
		env := make([]MCPEnvironmentVariable, 0, len(value.Env))
		for key, envValue := range value.Env {
			secret := looksSecret(key)
			env = append(env, MCPEnvironmentVariable{Name: key, Value: envValue, Secret: secret})
		}
		server, err := m.SaveMCPServer(MCPServerInput{Name: name, Description: value.Description, Command: value.Command, Args: value.Args, Env: env, Enabled: true})
		if err != nil {
			return nil, err
		}
		result = append(result, server)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}

func (m *Manager) SetMCPServerEnabled(id string, enabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			m.snapshot.MCPServers[index].Enabled = enabled
			m.snapshot.MCPServers[index].UpdatedAt = time.Now()
			return m.saveLocked()
		}
	}
	return errors.New("MCP Server 不存在")
}

func (m *Manager) RemoveMCPServer(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if runtime := m.runtimes[id]; runtime != nil {
		_ = runtime.stop()
		delete(m.runtimes, id)
	}
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID != id {
			continue
		}
		for _, env := range m.snapshot.MCPServers[index].Env {
			if env.Secret && env.CredentialRef != "" {
				_ = m.credentials.Delete(env.CredentialRef)
			}
		}
		m.snapshot.MCPServers = append(m.snapshot.MCPServers[:index], m.snapshot.MCPServers[index+1:]...)
		m.snapshot.Authorizations = removeAuthorizations(m.snapshot.Authorizations, id)
		return m.saveLocked()
	}
	return errors.New("MCP Server 不存在")
}

func (m *Manager) AddAuthorization(grant AuthorizationGrant) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	grant.ID = slugID(grant.SourceID + ":" + grant.CapabilityName + ":" + grant.ParameterScope)
	grant.CreatedAt = time.Now()
	for index := range m.snapshot.Authorizations {
		if m.snapshot.Authorizations[index].ID == grant.ID {
			m.snapshot.Authorizations[index] = grant
			return m.saveLocked()
		}
	}
	m.snapshot.Authorizations = append(m.snapshot.Authorizations, grant)
	return m.saveLocked()
}

func (m *Manager) RevokeAuthorization(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.Authorizations {
		if m.snapshot.Authorizations[index].ID == id {
			m.snapshot.Authorizations = append(m.snapshot.Authorizations[:index], m.snapshot.Authorizations[index+1:]...)
			return m.saveLocked()
		}
	}
	return errors.New("授权不存在")
}

func (m *Manager) appendAudit(audit ToolInvocationAudit) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.snapshot.Audits = append(m.snapshot.Audits, audit)
	if len(m.snapshot.Audits) > 500 {
		m.snapshot.Audits = m.snapshot.Audits[len(m.snapshot.Audits)-500:]
	}
	return m.saveLocked()
}

func fingerprintServer(server MCPServer) string {
	clone := server
	clone.CapabilityFingerprint = ""
	clone.RuntimeStatus = ""
	clone.LastError = ""
	clone.LastStartedAt = nil
	clone.LastUsedAt = nil
	clone.CreatedAt = time.Time{}
	clone.UpdatedAt = time.Time{}
	data, _ := json.Marshal(clone)
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func slugID(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
		} else if b.Len() > 0 {
			b.WriteRune('-')
		}
	}
	result := strings.Trim(b.String(), "-")
	if result == "" {
		result = "extension"
	}
	return result
}

func (m *Manager) uniqueMCPServerIDLocked(name string) string {
	base := slugID(name)
	candidate := base
	for suffix := 2; ; suffix++ {
		used := false
		for _, server := range m.snapshot.MCPServers {
			if server.ID == candidate {
				used = true
				break
			}
		}
		if !used {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, suffix)
	}
}

func (m *Manager) deleteUnusedCredentials(previous, current []MCPEnvironmentVariable) {
	active := map[string]struct{}{}
	for _, variable := range current {
		if variable.Secret && variable.CredentialRef != "" {
			active[variable.CredentialRef] = struct{}{}
		}
	}
	for _, variable := range previous {
		if !variable.Secret || variable.CredentialRef == "" {
			continue
		}
		if _, ok := active[variable.CredentialRef]; !ok {
			_ = m.credentials.Delete(variable.CredentialRef)
		}
	}
}

func removeAuthorizations(values []AuthorizationGrant, sourceID string) []AuthorizationGrant {
	result := values[:0]
	for _, value := range values {
		if value.SourceID != sourceID {
			result = append(result, value)
		}
	}
	return result
}
func looksSecret(name string) bool {
	name = strings.ToLower(name)
	return strings.Contains(name, "key") || strings.Contains(name, "token") || strings.Contains(name, "secret") || strings.Contains(name, "password")
}

func readSkillMarkdown(path string) (string, map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", nil, fmt.Errorf("读取 SKILL.md 失败: %w", err)
	}
	text := string(data)
	metadata := map[string]string{}
	instructions := text
	if strings.HasPrefix(text, "---") {
		lines := strings.Split(text, "\n")
		end := -1
		for index := 1; index < len(lines); index++ {
			if strings.TrimSpace(lines[index]) == "---" {
				end = index
				break
			}
		}
		if end < 0 {
			return "", nil, errors.New("SKILL.md frontmatter 未闭合")
		}
		for _, line := range lines[1:end] {
			key, value, ok := strings.Cut(line, ":")
			if ok {
				metadata[strings.TrimSpace(key)] = strings.Trim(strings.TrimSpace(value), "\"'")
			}
		}
		instructions = strings.TrimSpace(strings.Join(lines[end+1:], "\n"))
	}
	return instructions, metadata, nil
}

func hashDirectory(root string) (string, error) {
	digest := sha256.New()
	var paths []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("Skill 包含不支持的符号链接: %s", path)
		}
		if info.IsDir() {
			return nil
		}
		relative, _ := filepath.Rel(root, path)
		paths = append(paths, relative)
		return nil
	})
	if err != nil {
		return "", err
	}
	sort.Strings(paths)
	for _, relative := range paths {
		data, err := os.ReadFile(filepath.Join(root, relative))
		if err != nil {
			return "", err
		}
		_, _ = digest.Write([]byte(filepath.ToSlash(relative)))
		_, _ = digest.Write(data)
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func copyDirectory(source, target string) error {
	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("Skill 包含不支持的符号链接: %s", path)
		}
		relative, _ := filepath.Rel(source, path)
		destination := filepath.Join(target, relative)
		if info.IsDir() {
			return os.MkdirAll(destination, 0755)
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
			return err
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		defer input.Close()
		output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
		if err != nil {
			return err
		}
		defer output.Close()
		_, err = io.Copy(output, input)
		return err
	})
}

func prepareSkillSource(sourcePath, installRoot string) (string, func(), error) {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return "", func() {}, err
	}
	if info.IsDir() {
		root, resolveErr := resolveSkillRoot(sourcePath)
		return root, func() {}, resolveErr
	}
	// A standalone SKILL.md is a valid Skill source as well. Stage it in a
	// temporary directory so the rest of the importer can use the same
	// validation, hashing, and installation path as directory/archive sources.
	if info.Mode().IsRegular() && strings.EqualFold(filepath.Base(sourcePath), "SKILL.md") {
		temporary, err := os.MkdirTemp(installRoot, "skill-import-")
		if err != nil {
			return "", func() {}, err
		}
		cleanup := func() { _ = os.RemoveAll(temporary) }
		data, err := os.ReadFile(sourcePath)
		if err != nil {
			cleanup()
			return "", func() {}, err
		}
		if err := os.WriteFile(filepath.Join(temporary, "SKILL.md"), data, 0644); err != nil {
			cleanup()
			return "", func() {}, err
		}
		return temporary, cleanup, nil
	}
	if filepath.Ext(sourcePath) != ".zip" && filepath.Ext(sourcePath) != ".skill" {
		return "", func() {}, errors.New("Skill 仅支持目录、.skill 或 .zip")
	}
	temporary, err := os.MkdirTemp(installRoot, "skill-import-")
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(temporary) }
	archive, err := zip.OpenReader(sourcePath)
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	defer archive.Close()
	seenEntries := map[string]struct{}{}
	for _, entry := range archive.File {
		if entry.Mode()&os.ModeSymlink != 0 {
			cleanup()
			return "", func() {}, errors.New("Skill 压缩包包含不支持的符号链接")
		}
		name := filepath.Clean(entry.Name)
		if filepath.IsAbs(name) || name == "." || strings.HasPrefix(name, ".."+string(os.PathSeparator)) || name == ".." {
			cleanup()
			return "", func() {}, errors.New("Skill 压缩包包含越界路径")
		}
		entryKey := strings.ToLower(filepath.ToSlash(name))
		if _, exists := seenEntries[entryKey]; exists {
			cleanup()
			return "", func() {}, fmt.Errorf("Skill 压缩包包含重复路径: %s", entry.Name)
		}
		seenEntries[entryKey] = struct{}{}
		target := filepath.Join(temporary, name)
		if !strings.HasPrefix(target, temporary+string(os.PathSeparator)) && target != temporary {
			cleanup()
			return "", func() {}, errors.New("Skill 压缩包包含越界路径")
		}
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				cleanup()
				return "", func() {}, err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			cleanup()
			return "", func() {}, err
		}
		input, err := entry.Open()
		if err != nil {
			cleanup()
			return "", func() {}, err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
		if err != nil {
			input.Close()
			cleanup()
			return "", func() {}, err
		}
		_, copyErr := io.Copy(output, input)
		input.Close()
		output.Close()
		if copyErr != nil {
			cleanup()
			return "", func() {}, copyErr
		}
	}
	root, err := resolveSkillRoot(temporary)
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	return root, cleanup, nil
}

func resolveSkillRoot(root string) (string, error) {
	manifestPath := filepath.Join(root, "SKILL.md")
	info, err := os.Lstat(manifestPath)
	if err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("Skill 包含不支持的符号链接: %s", manifestPath)
		}
		if info.IsDir() {
			return "", fmt.Errorf("SKILL.md 不能是目录: %s", manifestPath)
		}
		return root, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("检查 SKILL.md 失败: %w", err)
	}

	candidates := []string{}
	walkErr := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("Skill 包含不支持的符号链接: %s", path)
		}
		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		depth := len(strings.Split(filepath.ToSlash(relative), "/"))
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") || info.Name() == "node_modules" || depth > 3 {
				return filepath.SkipDir
			}
			return nil
		}
		if depth <= 4 && strings.EqualFold(info.Name(), "SKILL.md") {
			candidates = append(candidates, filepath.Dir(path))
		}
		return nil
	})
	if walkErr != nil {
		return "", fmt.Errorf("查找 SKILL.md 失败: %w", walkErr)
	}
	sort.Strings(candidates)
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	if len(candidates) == 0 {
		return "", fmt.Errorf("所选目录不是有效的 Skill：未在 %s 或其子目录中找到 SKILL.md", root)
	}

	relativeCandidates := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		relative, relErr := filepath.Rel(root, candidate)
		if relErr != nil {
			relative = candidate
		}
		relativeCandidates = append(relativeCandidates, filepath.ToSlash(relative))
	}
	return "", fmt.Errorf("所选目录包含多个 Skill，请分别选择其中一个目录：%s", strings.Join(relativeCandidates, "；"))
}

func readLines(path string) ([]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	lines := []string{}
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines, scanner.Err()
}
