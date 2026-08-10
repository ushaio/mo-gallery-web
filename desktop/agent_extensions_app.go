package main

import (
	"errors"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	agent_extensions "mo-gallery-desktop/agent_extensions"
)

func (a *App) agentExtensionManager() (*agent_extensions.Manager, error) {
	if a.AgentExtensions == nil {
		return nil, errors.New("Agent 扩展服务未初始化")
	}
	return a.AgentExtensions, nil
}

func (a *App) GetAgentExtensionSnapshot() (agent_extensions.AgentExtensionSnapshot, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.AgentExtensionSnapshot{}, err
	}
	return manager.Snapshot(), nil
}

func (a *App) SelectAndImportSkillDirectory() (agent_extensions.Skill, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.Skill{}, err
	}
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择 Skill 目录"})
	if err != nil || path == "" {
		return agent_extensions.Skill{}, err
	}
	return manager.ImportSkill(path)
}

func (a *App) SelectAndImportSkillArchive() (agent_extensions.Skill, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.Skill{}, err
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   "选择 Skill 压缩包",
		Filters: []runtime.FileFilter{{DisplayName: "Skill archive (*.zip;*.skill)", Pattern: "*.zip;*.skill"}},
	})
	if err != nil || path == "" {
		return agent_extensions.Skill{}, err
	}
	return manager.ImportSkill(path)
}

func (a *App) ReadAgentSkill(id string) (agent_extensions.SkillContent, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.SkillContent{}, err
	}
	return manager.ReadSkill(id)
}

func (a *App) ReadAgentSkillResource(id, path string) (agent_extensions.SkillResource, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.SkillResource{}, err
	}
	return manager.ReadSkillResource(id, path)
}

func (a *App) SetAgentSkillEnabled(id string, enabled bool) error {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return err
	}
	return manager.SetSkillEnabled(id, enabled)
}

func (a *App) SetAgentSkillScriptExecution(id string, enabled bool) error {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return err
	}
	return manager.SetSkillScriptExecution(id, enabled)
}

func (a *App) RemoveAgentSkill(id string) error {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return err
	}
	return manager.RemoveSkill(id)
}

func (a *App) SaveAgentMCPServer(input agent_extensions.MCPServerInput) (agent_extensions.MCPServer, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.MCPServer{}, err
	}
	return manager.SaveMCPServer(input)
}

func (a *App) ImportAgentMCPServers(data string) ([]agent_extensions.MCPServer, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return nil, err
	}
	return manager.ImportMCPServers(data)
}

func (a *App) SetAgentMCPServerEnabled(id string, enabled bool) error {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return err
	}
	return manager.SetMCPServerEnabled(id, enabled)
}

func (a *App) RemoveAgentMCPServer(id string) error {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return err
	}
	return manager.RemoveMCPServer(id)
}

func (a *App) TestAgentMCPServer(id string) (agent_extensions.MCPServer, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.MCPServer{}, err
	}
	return manager.TestMCPServer(id)
}

func (a *App) DiscoverAgentMCPServerTools(id string) (agent_extensions.MCPServer, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.MCPServer{}, err
	}
	return manager.DiscoverMCPServerTools(id)
}

func (a *App) CallAgentMCPTool(input agent_extensions.MCPToolCallInput) (agent_extensions.MCPToolCallResult, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return agent_extensions.MCPToolCallResult{}, err
	}
	return manager.CallMCPTool(input)
}

func (a *App) CancelAgentMCPTool(invocationID string) (bool, error) {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return false, err
	}
	return manager.CancelMCPToolInvocation(invocationID), nil
}

func (a *App) RevokeAgentAuthorization(id string) error {
	manager, err := a.agentExtensionManager()
	if err != nil {
		return err
	}
	return manager.RevokeAuthorization(id)
}
