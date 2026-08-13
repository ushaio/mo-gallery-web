package agent_extensions

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type jsonRPCRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpRuntime struct {
	mu          sync.Mutex
	serverID    string
	command     *exec.Cmd
	stdin       io.WriteCloser
	responses   map[int64]chan jsonRPCResponse
	nextID      atomic.Int64
	closed      chan struct{}
	idleTimer   *time.Timer
	initialized bool
}

func newMCPRuntime(serverID string) *mcpRuntime {
	return &mcpRuntime{serverID: serverID, responses: map[int64]chan jsonRPCResponse{}, closed: make(chan struct{})}
}

func (r *mcpRuntime) start(server MCPServer, environment []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.command != nil && r.command.Process != nil {
		return nil
	}
	command := exec.Command(server.Command, server.Args...)
	command.Env = append(os.Environ(), environment...)
	stdin, err := command.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		return err
	}
	if err := command.Start(); err != nil {
		return err
	}
	r.command = command
	r.stdin = stdin
	r.closed = make(chan struct{})
	r.responses = map[int64]chan jsonRPCResponse{}
	r.initialized = false
	go r.readResponses(stdout)
	go io.Copy(io.Discard, stderr)
	go func() {
		_ = command.Wait()
		r.failPending(errors.New("MCP Server 已退出"))
		r.mu.Lock()
		if r.command == command {
			r.command = nil
			r.stdin = nil
		}
		r.mu.Unlock()
	}()
	return nil
}

func (r *mcpRuntime) readResponses(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var response jsonRPCResponse
		if err := json.Unmarshal([]byte(line), &response); err != nil || response.ID == 0 {
			continue
		}
		r.mu.Lock()
		channel := r.responses[response.ID]
		delete(r.responses, response.ID)
		r.mu.Unlock()
		if channel != nil {
			channel <- response
			close(channel)
		}
	}
	if err := scanner.Err(); err != nil {
		r.failPending(err)
	}
}

func (r *mcpRuntime) failPending(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, channel := range r.responses {
		channel <- jsonRPCResponse{ID: id, Error: &jsonRPCError{Code: -32000, Message: err.Error()}}
		close(channel)
		delete(r.responses, id)
	}
}

func (r *mcpRuntime) request(ctx context.Context, method string, params any) (json.RawMessage, error) {
	id := r.nextID.Add(1)
	channel := make(chan jsonRPCResponse, 1)
	r.mu.Lock()
	if r.stdin == nil {
		r.mu.Unlock()
		return nil, errors.New("MCP Server 未启动")
	}
	r.responses[id] = channel
	payload, err := json.Marshal(jsonRPCRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params})
	if err == nil {
		_, err = r.stdin.Write(append(payload, '\n'))
	}
	if err != nil {
		delete(r.responses, id)
		r.mu.Unlock()
		return nil, err
	}
	r.mu.Unlock()
	select {
	case response := <-channel:
		if response.Error != nil {
			return nil, fmt.Errorf("MCP %s failed (%d): %s", method, response.Error.Code, response.Error.Message)
		}
		return response.Result, nil
	case <-ctx.Done():
		r.mu.Lock()
		delete(r.responses, id)
		r.mu.Unlock()
		return nil, ctx.Err()
	}
}

func (r *mcpRuntime) notify(method string, params any) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stdin == nil {
		return errors.New("MCP Server 未启动")
	}
	payload, err := json.Marshal(jsonRPCRequest{JSONRPC: "2.0", Method: method, Params: params})
	if err != nil {
		return err
	}
	_, err = r.stdin.Write(append(payload, '\n'))
	return err
}

func (r *mcpRuntime) scheduleIdle(timeout time.Duration, onStop func()) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.idleTimer != nil {
		r.idleTimer.Stop()
	}
	if timeout <= 0 {
		return
	}
	r.idleTimer = time.AfterFunc(timeout, func() {
		_ = r.stop()
		if onStop != nil {
			onStop()
		}
	})
}

func (r *mcpRuntime) stop() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.idleTimer != nil {
		r.idleTimer.Stop()
		r.idleTimer = nil
	}
	if r.stdin != nil {
		_ = r.stdin.Close()
	}
	if r.command != nil && r.command.Process != nil {
		_ = r.command.Process.Kill()
	}
	r.command = nil
	r.stdin = nil
	return nil
}

func (m *Manager) StopAll() {
	m.mu.Lock()
	runtimes := make([]*mcpRuntime, 0, len(m.runtimes))
	for _, runtime := range m.runtimes {
		runtimes = append(runtimes, runtime)
	}
	cancels := make([]context.CancelFunc, 0, len(m.invocations))
	for _, cancel := range m.invocations {
		cancels = append(cancels, cancel)
	}
	m.runtimes = map[string]*mcpRuntime{}
	m.invocations = map[string]context.CancelFunc{}
	m.mu.Unlock()
	for _, cancel := range cancels {
		cancel()
	}
	for _, runtime := range runtimes {
		_ = runtime.stop()
	}
}

func (m *Manager) DiscoverMCPServerTools(id string) (MCPServer, error) {
	return m.TestMCPServer(id)
}

func (m *Manager) TestMCPServer(id string) (MCPServer, error) {
	callLock := m.mcpCallLock(id)
	<-callLock
	defer func() { callLock <- struct{}{} }()

	server, runtime, err := m.prepareMCPRuntime(id)
	if err != nil {
		return MCPServer{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(server.RequestTimeoutSeconds)*time.Second)
	defer cancel()
	tools, err := initializeAndListTools(ctx, runtime)
	if err != nil {
		_ = runtime.stop()
		m.markMCPFailure(id, err)
		return MCPServer{}, err
	}
	_ = runtime.stop()
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			previousFingerprint := m.snapshot.MCPServers[index].CapabilityFingerprint
			m.snapshot.MCPServers[index].Tools = tools
			m.snapshot.MCPServers[index].CapabilityFingerprint = fingerprintServer(m.snapshot.MCPServers[index])
			if previousFingerprint != m.snapshot.MCPServers[index].CapabilityFingerprint {
				m.snapshot.Authorizations = removeAuthorizations(m.snapshot.Authorizations, id)
			}
			m.snapshot.MCPServers[index].RuntimeStatus = runtimeStopped
			m.snapshot.MCPServers[index].LastError = ""
			m.snapshot.MCPServers[index].UpdatedAt = time.Now()
			_ = m.saveLocked()
			return m.snapshot.MCPServers[index], nil
		}
	}
	return MCPServer{}, errors.New("MCP Server 不存在")
}

func (m *Manager) prepareMCPRuntime(id string) (MCPServer, *mcpRuntime, error) {
	m.mu.Lock()
	var server *MCPServer
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			server = &m.snapshot.MCPServers[index]
			break
		}
	}
	if server == nil {
		m.mu.Unlock()
		return MCPServer{}, nil, errors.New("MCP Server 不存在")
	}
	if !server.Enabled {
		m.mu.Unlock()
		return MCPServer{}, nil, errors.New("MCP Server 已禁用")
	}
	copyServer := *server
	runtime := m.runtimes[id]
	if runtime == nil {
		runtime = newMCPRuntime(id)
		m.runtimes[id] = runtime
	}
	environment := make([]string, 0, len(server.Env))
	for _, variable := range server.Env {
		value := variable.Value
		if variable.Secret {
			secret, err := m.credentials.Get(variable.CredentialRef)
			if err != nil {
				m.mu.Unlock()
				return MCPServer{}, nil, fmt.Errorf("读取 %s 凭据失败: %w", variable.Name, err)
			}
			value = secret
		}
		environment = append(environment, variable.Name+"="+value)
	}
	m.mu.Unlock()
	if err := runtime.start(copyServer, environment); err != nil {
		m.markMCPFailure(id, err)
		return MCPServer{}, nil, err
	}
	now := time.Now()
	m.mu.Lock()
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			m.snapshot.MCPServers[index].RuntimeStatus = "ready"
			m.snapshot.MCPServers[index].LastStartedAt = &now
			m.snapshot.MCPServers[index].LastError = ""
		}
	}
	_ = m.saveLocked()
	m.mu.Unlock()
	return copyServer, runtime, nil
}

func initializeAndListTools(ctx context.Context, runtime *mcpRuntime) ([]MCPTool, error) {
	runtime.mu.Lock()
	initialized := runtime.initialized
	runtime.mu.Unlock()
	if !initialized {
		if _, err := runtime.request(ctx, "initialize", map[string]any{"protocolVersion": "2024-11-05", "capabilities": map[string]any{}, "clientInfo": map[string]any{"name": "mo-gallery-desktop", "version": "0.8.2"}}); err != nil {
			return nil, err
		}
		if err := runtime.notify("notifications/initialized", map[string]any{}); err != nil {
			return nil, err
		}
		runtime.mu.Lock()
		runtime.initialized = true
		runtime.mu.Unlock()
	}
	result, err := runtime.request(ctx, "tools/list", map[string]any{})
	if err != nil {
		return nil, err
	}
	var payload struct {
		Tools []struct {
			Name        string         `json:"name"`
			Description string         `json:"description"`
			InputSchema map[string]any `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		return nil, err
	}
	tools := make([]MCPTool, 0, len(payload.Tools))
	for _, tool := range payload.Tools {
		tools = append(tools, MCPTool{Name: tool.Name, Description: tool.Description, InputSchema: tool.InputSchema, RiskClass: classifyToolRisk(tool.Name, tool.Description)})
	}
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })
	return tools, nil
}

func (m *Manager) CallMCPTool(input MCPToolCallInput) (MCPToolCallResult, error) {
	invocationCtx, cancelInvocation := context.WithCancel(context.Background())
	m.registerInvocation(input.InvocationID, cancelInvocation)
	defer func() {
		cancelInvocation()
		m.unregisterInvocation(input.InvocationID)
	}()
	callLock := m.mcpCallLock(input.ServerID)
	select {
	case <-callLock:
		defer func() { callLock <- struct{}{} }()
	case <-invocationCtx.Done():
		return MCPToolCallResult{}, invocationCtx.Err()
	}

	server, runtime, err := m.prepareMCPRuntime(input.ServerID)
	if err != nil {
		return MCPToolCallResult{}, err
	}
	listCtx, listCancel := context.WithTimeout(invocationCtx, time.Duration(server.RequestTimeoutSeconds)*time.Second)
	tools, listErr := initializeAndListTools(listCtx, runtime)
	listCancel()
	if listErr != nil {
		return MCPToolCallResult{}, listErr
	}
	var tool MCPTool
	found := false
	for _, value := range tools {
		if value.Name == input.ToolName {
			tool = value
			found = true
			break
		}
	}
	if !found {
		return MCPToolCallResult{}, errors.New("MCP 工具不存在")
	}
	summary := summarizeArguments(input.Arguments)
	if tool.RiskClass != RiskRead && !input.Approved {
		runtime.scheduleIdle(time.Duration(server.IdleTimeoutSeconds)*time.Second, func() {
			m.markMCPStopped(input.ServerID)
		})
		return MCPToolCallResult{PermissionRequired: true, RiskClass: tool.RiskClass, ParameterSummary: summary}, nil
	}
	if tool.RiskClass == RiskRead && !input.Approved && !m.hasGrant(server, tool, input.ParameterScope) {
		runtime.scheduleIdle(time.Duration(server.IdleTimeoutSeconds)*time.Second, func() {
			m.markMCPStopped(input.ServerID)
		})
		return MCPToolCallResult{PermissionRequired: true, RiskClass: tool.RiskClass, ParameterSummary: summary}, nil
	}
	if input.Remember {
		_ = m.AddAuthorization(AuthorizationGrant{SourceID: server.ID, SourceType: SourceTypeMCP, CapabilityName: tool.Name, ParameterScope: input.ParameterScope, Decision: "allow", Mode: "remembered", Fingerprint: server.CapabilityFingerprint})
	}
	started := time.Now()
	ctx, cancel := context.WithTimeout(invocationCtx, time.Duration(server.RequestTimeoutSeconds)*time.Second)
	result, callErr := runtime.request(ctx, "tools/call", map[string]any{"name": tool.Name, "arguments": input.Arguments})
	cancel()
	if callErr != nil {
		_ = runtime.stop()
		// Do not replay business tool calls: the server may have completed a
		// non-idempotent side effect before the transport failed. The next call
		// starts a fresh runtime and reinitializes it.
	}
	audit := ToolInvocationAudit{ID: fmt.Sprintf("audit-%d", time.Now().UnixNano()), ConversationID: input.ConversationID, SourceID: server.ID, CapabilityName: tool.Name, ParameterSummary: summary, AuthorizationDecision: "allow", RiskClass: tool.RiskClass, StartedAt: started, DurationMS: time.Since(started).Milliseconds(), ResultStatus: "success"}
	if callErr != nil {
		audit.ResultStatus = "failed"
		audit.ErrorCode = "MCP_CALL_FAILED"
		m.markMCPFailure(input.ServerID, callErr)
		_ = m.appendAudit(audit)
		return MCPToolCallResult{}, callErr
	}
	var payload struct {
		Content any  `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		payload.Content = string(result)
	}
	if payload.IsError {
		audit.ResultStatus = "failed"
		audit.ErrorCode = "MCP_TOOL_ERROR"
	}
	_ = m.appendAudit(audit)
	m.markMCPUsed(input.ServerID)
	runtime.scheduleIdle(time.Duration(server.IdleTimeoutSeconds)*time.Second, func() {
		m.markMCPStopped(input.ServerID)
	})
	return MCPToolCallResult{Content: payload.Content, IsError: payload.IsError, RiskClass: tool.RiskClass, ParameterSummary: summary}, nil
}

func (m *Manager) hasGrant(server MCPServer, tool MCPTool, scope string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, grant := range m.snapshot.Authorizations {
		if grant.SourceID != server.ID || grant.CapabilityName != tool.Name || grant.Decision != "allow" || grant.Fingerprint != server.CapabilityFingerprint {
			continue
		}
		if grant.ExpiresAt != nil && !grant.ExpiresAt.After(time.Now()) {
			continue
		}
		if grant.ParameterScope == "" || grant.ParameterScope == scope {
			return true
		}
	}
	return false
}
func (m *Manager) markMCPFailure(id string, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			m.snapshot.MCPServers[index].RuntimeStatus = runtimeDegraded
			m.snapshot.MCPServers[index].LastError = err.Error()
			m.snapshot.MCPServers[index].UpdatedAt = time.Now()
		}
	}
	_ = m.saveLocked()
}

func (m *Manager) markMCPUsed(id string) {
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			m.snapshot.MCPServers[index].RuntimeStatus = "ready"
			m.snapshot.MCPServers[index].LastUsedAt = &now
			m.snapshot.MCPServers[index].UpdatedAt = now
			break
		}
	}
	_ = m.saveLocked()
}

func (m *Manager) markMCPStopped(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for index := range m.snapshot.MCPServers {
		if m.snapshot.MCPServers[index].ID == id {
			m.snapshot.MCPServers[index].RuntimeStatus = runtimeStopped
			m.snapshot.MCPServers[index].UpdatedAt = time.Now()
			break
		}
	}
	_ = m.saveLocked()
}

func classifyToolRisk(name, description string) string {
	text := strings.ToLower(name + " " + description)
	if strings.Contains(text, "delete") || strings.Contains(text, "remove") {
		return RiskDelete
	}
	if strings.Contains(text, "write") || strings.Contains(text, "create") || strings.Contains(text, "update") || strings.Contains(text, "edit") || strings.Contains(text, "save") {
		return RiskWrite
	}
	if strings.Contains(text, "exec") || strings.Contains(text, "shell") || strings.Contains(text, "command") || strings.Contains(text, "run") {
		return RiskExecute
	}
	if strings.Contains(text, "http") || strings.Contains(text, "fetch") || strings.Contains(text, "request") || strings.Contains(text, "send") {
		return RiskNetwork
	}
	return RiskRead
}
func summarizeArguments(arguments map[string]any) string {
	data, _ := json.Marshal(redactSensitiveArguments(arguments, ""))
	value := string(data)
	if len(value) > 500 {
		value = value[:500] + "…"
	}
	return value
}

func redactSensitiveArguments(value any, key string) any {
	if key != "" && looksSecret(key) {
		return "***"
	}
	switch typed := value.(type) {
	case map[string]any:
		redacted := make(map[string]any, len(typed))
		for childKey, childValue := range typed {
			redacted[childKey] = redactSensitiveArguments(childValue, childKey)
		}
		return redacted
	case []any:
		redacted := make([]any, len(typed))
		for index, childValue := range typed {
			redacted[index] = redactSensitiveArguments(childValue, "")
		}
		return redacted
	default:
		return value
	}
}
