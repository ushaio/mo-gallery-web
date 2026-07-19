package services

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"mo-gallery-desktop/config"
	"mo-gallery-desktop/db"
)

// ─── DTOs（与 web 端一致）─────────────────────────────

type EditorAiConversationDTO struct {
	ID           string  `json:"id"`
	ScopeID      string  `json:"scopeId"`
	Title        *string `json:"title,omitempty"`
	Summary      *string `json:"summary,omitempty"`
	LastModel    *string `json:"lastModel,omitempty"`
	SystemPrompt *string `json:"systemPrompt,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type EditorAiMessageDTO struct {
	ID             string      `json:"id"`
	ConversationID string      `json:"conversationId"`
	Role           string      `json:"role"`
	Content        string      `json:"content"`
	Status         string      `json:"status"`
	Model          *string     `json:"model,omitempty"`
	Action         *string     `json:"action,omitempty"`
	Metadata       interface{} `json:"metadata,omitempty"`
	Error          *string     `json:"error,omitempty"`
	CreatedAt      string      `json:"createdAt"`
}

type EditorAiConversationWithMessagesDTO struct {
	EditorAiConversationDTO
	Messages []EditorAiMessageDTO `json:"messages"`
}

type StoryAiModelOption struct {
	ID               string   `json:"id"`
	Label            string   `json:"label"`
	Provider         string   `json:"provider"`
	Model            string   `json:"model"`
	Capabilities     []string `json:"capabilities,omitempty"`
	Vision           bool     `json:"vision"`
	Tools            bool     `json:"tools"`
	StructuredOutput bool     `json:"structuredOutput"`
	ContextWindow    int      `json:"contextWindow"`
}

type desktopModelCapabilities struct {
	Vision           bool
	Tools            bool
	StructuredOutput bool
	ContextWindow    int
}

const defaultDesktopModelContextWindow = 8192
const maxProviderModelsResponseBytes = 1024 * 1024
const maxProviderModelsLogBodyBytes = 64 * 1024

var desktopModelContextWindows = map[string]int{
	"gpt-5.5": 272000,
}

func inferDesktopModelContextWindow(modelID string) int {
	if contextWindow, ok := desktopModelContextWindows[strings.ToLower(strings.TrimSpace(modelID))]; ok {
		return contextWindow
	}
	return defaultDesktopModelContextWindow
}

func resolveDesktopModelCapabilities(provider config.AIProviderConfig, modelID string) desktopModelCapabilities {
	contextWindow := inferDesktopModelContextWindow(modelID)
	if configured, ok := provider.ContextWindows[modelID]; ok && configured > 0 {
		contextWindow = configured
	}
	return desktopModelCapabilities{
		Vision:           containsModelID(provider.VisionModels, modelID),
		Tools:            containsModelID(provider.ToolModels, modelID),
		StructuredOutput: containsModelID(provider.StructuredOutputModels, modelID),
		ContextWindow:    contextWindow,
	}
}

func containsModelID(values []string, modelID string) bool {
	for _, value := range values {
		if value == modelID {
			return true
		}
	}
	return false
}

func truncateProviderModelsLogBody(body []byte, secret string) (string, bool) {
	value := string(body)
	if secret != "" {
		value = strings.ReplaceAll(value, secret, "[REDACTED]")
	}
	if len(value) <= maxProviderModelsLogBodyBytes {
		return value, false
	}
	return value[:maxProviderModelsLogBodyBytes], true
}

type StoryAiModelsResponseDTO struct {
	DefaultModel      string               `json:"defaultModel"`
	DefaultImageModel string               `json:"defaultImageModel,omitempty"`
	Models            []StoryAiModelOption `json:"models"`
}

type EditorAiConversationCreateInput struct {
	ScopeID      string  `json:"scopeId"`
	Title        *string `json:"title,omitempty"`
	SystemPrompt *string `json:"systemPrompt,omitempty"`
}

type EditorAiConversationUpdateInput struct {
	Title        *string `json:"title,omitempty"`
	SystemPrompt *string `json:"systemPrompt,omitempty"`
}

type EditorAiGenerateInput struct {
	ConversationID string   `json:"conversationId"`
	Action         string   `json:"action,omitempty"`
	Model          string   `json:"model,omitempty"`
	ImageModel     string   `json:"imageModel,omitempty"`
	ImageSize      string   `json:"imageSize,omitempty"`
	GenerateImage  bool     `json:"generateImage,omitempty"`
	Prompt         string   `json:"prompt,omitempty"`
	Title          string   `json:"title,omitempty"`
	SelectedText   string   `json:"selectedText,omitempty"`
	Images         []string `json:"images,omitempty"`
}

type AiImageMetadata struct {
	Type          string  `json:"type"`
	LocalPath     string  `json:"localPath,omitempty"`
	UploadedURL   *string `json:"uploadedUrl,omitempty"`
	StorageKey    *string `json:"storageKey,omitempty"`
	PhotoID       *string `json:"photoId,omitempty"`
	Prompt        string  `json:"prompt"`
	Provider      string  `json:"provider"`
	Model         string  `json:"model"`
	Size          string  `json:"size"`
	MimeType      string  `json:"mimeType"`
	RevisedPrompt string  `json:"revisedPrompt,omitempty"`
	GeneratedAt   string  `json:"generatedAt"`
	Source        string  `json:"source"`
}

// ─── 常量（与 web 端一致）────────────────────────────

var actionInstructions = map[string]string{
	"rewrite":   "润色并优化表达，保留原意和叙事节奏。",
	"expand":    "在不偏离原意的前提下扩写内容，增强画面感和细节。",
	"shorten":   "压缩内容，让表达更凝练，但保留关键信息和情绪。",
	"continue":  "基于已有内容自然续写下一段，不重复前文。",
	"summarize": "总结成一段适合作为故事摘要的文字。",
	"custom":    "严格按用户指令完成改写或生成。",
}

const systemPrompt = "你是一名中文叙事编辑助手，帮助用户编辑摄影故事。只输出最终可直接放进正文的内容，不要解释，不要加引号，不要用\"修改如下\"之类的前缀。"
const chatSystemPrompt = "你是一名友善的AI写作助手，与用户协作进行摄影叙事创作。请用自然对话的方式回复，可以给建议、讨论想法、回答问题。不要假装成编辑工具——你是聊天伙伴，不是文本处理器。用中文回复。"

// ─── Service ──────────────────────────────────────────

type EditorAiService struct {
	cfg                *config.Config
	uploadService      *UploadService
	logger             *Logger
	httpPort           int // 本地流式 HTTP 服务端口
	database           *gorm.DB
	persistenceFailure func(phase string) error
}

func NewEditorAiService(cfg *config.Config, uploadService *UploadService) *EditorAiService {
	return &EditorAiService{cfg: cfg, uploadService: uploadService}
}

func (s *EditorAiService) SetLogger(logger *Logger) {
	s.logger = logger
}

// SetHTTPPort 设置本地流式 HTTP 服务端口（由 main 调用）
func (s *EditorAiService) SetHTTPPort(port int) {
	s.httpPort = port
}

// GetHTTPPort 获取本地流式 HTTP 服务端口
func (s *EditorAiService) GetHTTPPort() int {
	return s.httpPort
}

// ─── 对话 CRUD（直接操作数据库）────────────────────────

func (s *EditorAiService) ListConversations(scopeId string) ([]EditorAiConversationDTO, error) {
	var conversations []db.AiConversation
	q := db.DB.Order(`"updatedAt" DESC, "createdAt" DESC`)
	if scopeId != "" {
		q = q.Where(db.AiConversation{ScopeID: scopeId})
	}
	if err := q.Find(&conversations).Error; err != nil {
		return nil, fmt.Errorf("查询对话列表失败: %w", err)
	}
	result := make([]EditorAiConversationDTO, len(conversations))
	for i, c := range conversations {
		result[i] = toConversationDTO(c)
	}
	return result, nil
}

func (s *EditorAiService) CreateConversation(input EditorAiConversationCreateInput) (*EditorAiConversationDTO, error) {
	if input.ScopeID == "" {
		return nil, errors.New("scopeId 不能为空")
	}
	conversation := db.AiConversation{
		ID:           cuid(),
		ScopeID:      input.ScopeID,
		Title:        input.Title,
		SystemPrompt: input.SystemPrompt,
	}
	if err := db.DB.Create(&conversation).Error; err != nil {
		return nil, fmt.Errorf("创建对话失败: %w", err)
	}
	dto := toConversationDTO(conversation)
	return &dto, nil
}

func (s *EditorAiService) GetConversation(conversationId string) (*EditorAiConversationWithMessagesDTO, error) {
	var conversation db.AiConversation
	if err := db.DB.Preload("Messages", func(db2 *gorm.DB) *gorm.DB {
		return db2.Order(`"createdAt" ASC`)
	}).Where("id = ?", conversationId).First(&conversation).Error; err != nil {
		return nil, fmt.Errorf("查询对话失败: %w", err)
	}
	dto := EditorAiConversationWithMessagesDTO{
		EditorAiConversationDTO: toConversationDTO(conversation),
		Messages:                make([]EditorAiMessageDTO, len(conversation.Messages)),
	}
	for i, m := range conversation.Messages {
		dto.Messages[i] = toMessageDTO(m)
	}
	return &dto, nil
}

// RecoverInterruptedMessages 应用启动时把遗留的 streaming 状态消息标记为
// failed（应用崩溃/关闭导致的脏状态），避免残缺内容混入后续对话历史
func (s *EditorAiService) RecoverInterruptedMessages() {
	db.DB.Model(&db.AiMessage{}).Where("status = 'streaming'").Updates(map[string]interface{}{
		"status": "failed",
		"error":  "生成中断（应用重启）",
	})
}

// ─── 消息持久化（供前端共享 ai-agent 编排层调用）──────

type EditorAiMessageAppendInput struct {
	ConversationID string              `json:"conversationId"`
	Role           string              `json:"role"`
	Content        string              `json:"content"`
	Status         string              `json:"status,omitempty"` // 默认 completed
	Model          string              `json:"model,omitempty"`
	Action         string              `json:"action,omitempty"`
	Metadata       EditorAiRawMetadata `json:"metadata,omitempty"`
	Error          string              `json:"error,omitempty"`
}

// AppendMessage 追加一条消息（编辑器 AI 的编排在前端共享包里进行，
// 用户消息与 assistant 流式占位由前端经此写入本地库）
func (s *EditorAiService) AppendMessage(input EditorAiMessageAppendInput) (*EditorAiMessageDTO, error) {
	if input.ConversationID == "" || input.Role == "" {
		return nil, errors.New("conversationId 和 role 必填")
	}
	if input.Role != "system" && input.Role != "user" && input.Role != "assistant" {
		return nil, errors.New("role 必须是 system、user 或 assistant")
	}
	status := input.Status
	if status == "" {
		status = "completed"
	}
	if status != "pending" && status != "streaming" && status != "completed" && status != "failed" && status != "stopped" {
		return nil, errors.New("status 必须是 pending、streaming、completed、failed 或 stopped")
	}
	metadata, err := validateEditorAiMetadata(input.Metadata)
	if err != nil {
		return nil, err
	}
	msg := db.AiMessage{
		ID:             cuid(),
		ConversationID: input.ConversationID,
		Role:           input.Role,
		Content:        input.Content,
		Status:         status,
	}
	if input.Model != "" {
		msg.Model = &input.Model
	}
	if input.Action != "" {
		msg.Action = &input.Action
	}
	if input.Error != "" {
		msg.Error = &input.Error
	}
	if metadata != nil {
		msg.Metadata = datatypes.JSON(metadata)
	}
	if err := s.persistenceDB().Create(&msg).Error; err != nil {
		return nil, fmt.Errorf("写入消息失败: %w", err)
	}
	dto := toMessageDTO(msg)
	return &dto, nil
}

// EditorAiRawMetadata is raw JSON transported by Wails as a byte array. A
// top-level numeric array is reserved for that transport; direct Go callers
// construct this type from raw bytes so legitimate numeric metadata arrays are
// not silently confused with transport bytes.
type EditorAiRawMetadata []byte

func (metadata *EditorAiRawMetadata) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return errors.New("消息元数据传输为空")
	}

	if trimmed[0] != '[' {
		if !json.Valid(trimmed) {
			return errors.New("消息元数据传输不是合法 JSON")
		}
		*metadata = append((*metadata)[:0], trimmed...)
		return nil
	}

	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	decoder.UseNumber()
	var values []interface{}
	if err := decoder.Decode(&values); err != nil {
		return fmt.Errorf("解析消息元数据传输失败: %w", err)
	}

	transport := make([]byte, len(values))
	for index, value := range values {
		number, ok := value.(json.Number)
		if !ok {
			// Non-numeric arrays are unambiguous direct raw JSON.
			*metadata = append((*metadata)[:0], trimmed...)
			return nil
		}
		integer, err := number.Int64()
		if err != nil || integer < 0 || integer > 255 {
			return fmt.Errorf("消息元数据传输字节 %d 必须是 0..255 的整数", index)
		}
		transport[index] = byte(integer)
	}
	if !json.Valid(transport) {
		return errors.New("消息元数据字节传输未包含合法 JSON；Go 调用方应直接构造 EditorAiRawMetadata")
	}
	*metadata = transport
	return nil
}

type EditorAiMessageFinishInput struct {
	MessageID string              `json:"messageId"`
	Status    string              `json:"status"`
	Content   string              `json:"content,omitempty"`
	Model     string              `json:"model,omitempty"`
	Metadata  EditorAiRawMetadata `json:"metadata,omitempty"`
	Error     string              `json:"error,omitempty"`
}

type EditorAiTaskStateUpdateInput struct {
	MessageID string `json:"messageId"`
	State     string `json:"state"`
}

const (
	maxEditorAiMetadataBytes = 256 * 1024
	maxEditorAiMetadataDepth = 128
)

func (s *EditorAiService) persistenceDB() *gorm.DB {
	if s.database != nil {
		return s.database
	}
	return db.DB
}

func validateEditorAiMetadata(raw []byte) ([]byte, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if len(raw) > maxEditorAiMetadataBytes {
		return nil, errors.New("消息元数据超过 256 KiB 限制")
	}

	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value interface{}
	if err := decoder.Decode(&value); err != nil {
		return nil, fmt.Errorf("消息元数据不是合法 JSON: %w", err)
	}
	if err := rejectEditorAiVisualMetadata(value, 1); err != nil {
		return nil, err
	}
	var trailing interface{}
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("消息元数据只能包含一个 JSON 值")
		}
		return nil, fmt.Errorf("消息元数据包含无效尾部数据: %w", err)
	}

	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("序列化消息元数据失败: %w", err)
	}
	if len(encoded) > maxEditorAiMetadataBytes {
		return nil, errors.New("消息元数据超过 256 KiB 限制")
	}
	return encoded, nil
}

func rejectEditorAiVisualMetadata(value interface{}, depth int) error {
	switch typed := value.(type) {
	case map[string]interface{}:
		if depth > maxEditorAiMetadataDepth {
			return fmt.Errorf("消息元数据超过 %d 层深度限制", maxEditorAiMetadataDepth)
		}
		for _, child := range typed {
			if err := rejectEditorAiVisualMetadata(child, depth+1); err != nil {
				return err
			}
		}
	case []interface{}:
		if depth > maxEditorAiMetadataDepth {
			return fmt.Errorf("消息元数据超过 %d 层深度限制", maxEditorAiMetadataDepth)
		}
		for _, child := range typed {
			if err := rejectEditorAiVisualMetadata(child, depth+1); err != nil {
				return err
			}
		}
	case string:
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(typed)), "data:image/") {
			return errors.New("消息元数据不能包含 data:image 图片数据")
		}
	}
	return nil
}

// FinishMessage atomically finalizes a streaming message and its conversation.
func (s *EditorAiService) FinishMessage(input EditorAiMessageFinishInput) (*EditorAiMessageDTO, error) {
	if input.MessageID == "" {
		return nil, errors.New("messageId 必填")
	}
	if input.Status != "completed" && input.Status != "failed" && input.Status != "stopped" {
		return nil, errors.New("status 必须是 completed、failed 或 stopped")
	}
	if input.Status != "completed" && strings.TrimSpace(input.Error) == "" {
		return nil, errors.New("failed 或 stopped 状态必须提供 error")
	}
	metadata, err := validateEditorAiMetadata(input.Metadata)
	if err != nil {
		return nil, err
	}

	var result db.AiMessage
	err = s.persistenceDB().Transaction(func(tx *gorm.DB) error {
		var message db.AiMessage
		if err := tx.Where("id = ?", input.MessageID).First(&message).Error; err != nil {
			return err
		}

		updates := map[string]interface{}{"status": input.Status}
		if input.Status == "completed" || input.Content != "" {
			updates["content"] = input.Content
		}
		if input.Model != "" {
			updates["model"] = input.Model
		}
		if metadata != nil {
			updates["metadata"] = datatypes.JSON(metadata)
		}
		if input.Status == "completed" {
			updates["error"] = nil
		} else {
			updates["error"] = input.Error
		}
		if err := tx.Model(&db.AiMessage{}).Where("id = ?", message.ID).Updates(updates).Error; err != nil {
			return err
		}

		conversationUpdates := map[string]interface{}{"updatedAt": time.Now()}
		if input.Status == "completed" && input.Model != "" {
			conversationUpdates["lastModel"] = input.Model
		}
		if s.persistenceFailure != nil {
			if err := s.persistenceFailure("conversation-update"); err != nil {
				return err
			}
		}
		conversationUpdate := tx.Model(&db.AiConversation{}).Where("id = ?", message.ConversationID).Updates(conversationUpdates)
		if conversationUpdate.Error != nil {
			return conversationUpdate.Error
		}
		if conversationUpdate.RowsAffected != 1 {
			return errors.New("消息所属对话不存在")
		}
		if s.persistenceFailure != nil {
			if err := s.persistenceFailure("final-reload"); err != nil {
				return err
			}
		}
		return tx.Where("id = ?", message.ID).First(&result).Error
	})
	if err != nil {
		return nil, fmt.Errorf("结束消息失败: %w", err)
	}
	dto := toMessageDTO(result)
	return &dto, nil
}

// UpdateTaskState mutates only the persisted task change-set state.
func (s *EditorAiService) UpdateTaskState(input EditorAiTaskStateUpdateInput) (*EditorAiMessageDTO, error) {
	if input.MessageID == "" {
		return nil, errors.New("messageId 必填")
	}
	if input.State != "applied" && input.State != "undone" && input.State != "redone" {
		return nil, errors.New("state 必须是 applied、undone 或 redone")
	}

	var result db.AiMessage
	err := s.persistenceDB().Transaction(func(tx *gorm.DB) error {
		var message db.AiMessage
		if err := tx.Where("id = ?", input.MessageID).First(&message).Error; err != nil {
			return err
		}

		metadata, err := decodeEditorAiMetadataObject(message.Metadata)
		if err != nil {
			return err
		}
		task := metadata
		if metadataType, exists := metadata["type"]; exists {
			if metadataType == "editor_ai_task" {
				var ok bool
				task, ok = metadata["task"].(map[string]interface{})
				if !ok {
					return errors.New("editor_ai_task 元数据缺少有效 task 对象")
				}
			} else {
				return errors.New("消息元数据不是编辑器 AI 任务")
			}
		}
		if task["status"] != "completed" {
			return errors.New("只有 completed 任务可更新状态")
		}
		changeSet, ok := task["changeSet"].(map[string]interface{})
		if !ok {
			return errors.New("编辑器 AI 任务缺少有效 changeSet 对象")
		}
		changeSet["state"] = input.State
		normalized := map[string]interface{}{"type": "editor_ai_task", "task": task}
		if metadata["type"] == "editor_ai_task" {
			normalized = metadata
			normalized["task"] = task
		}

		encoded, err := json.Marshal(normalized)
		if err != nil {
			return fmt.Errorf("序列化任务元数据失败: %w", err)
		}
		validated, err := validateEditorAiMetadata(encoded)
		if err != nil {
			return err
		}
		if err := tx.Model(&db.AiMessage{}).Where("id = ?", message.ID).Update("metadata", datatypes.JSON(validated)).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", message.ID).First(&result).Error
	})
	if err != nil {
		return nil, fmt.Errorf("更新任务状态失败: %w", err)
	}
	dto := toMessageDTO(result)
	return &dto, nil
}

func decodeEditorAiMetadataObject(raw []byte) (map[string]interface{}, error) {
	validated, err := validateEditorAiMetadata(raw)
	if err != nil {
		return nil, err
	}
	if validated == nil {
		return nil, errors.New("消息缺少任务元数据")
	}
	decoder := json.NewDecoder(bytes.NewReader(validated))
	decoder.UseNumber()
	var metadata map[string]interface{}
	if err := decoder.Decode(&metadata); err != nil || metadata == nil {
		return nil, errors.New("消息元数据必须是 JSON 对象")
	}
	return metadata, nil
}

// ─── OpenAI 兼容透明代理（供前端共享 ai-agent 包调用）──

// ProxyChatCompletions 把 /v1/chat/completions 请求透明转发到所选
// provider：按 body.model（provider:model）解析上游、改写为真实模型名并
// 注入密钥——前端不接触任何 API key。响应按字节块转发，不做行解析，
// 天然没有 bufio.Scanner 的 64KB 行长限制。
func (s *EditorAiService) ProxyChatCompletions(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
	if err != nil {
		http.Error(w, "读取请求体失败", http.StatusBadRequest)
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "请求体不是合法 JSON", http.StatusBadRequest)
		return
	}
	selected, _ := payload["model"].(string)

	aiCfg := s.cfg.AI.NormalizedCopy()
	_, provider, activeModel, err := aiCfg.ResolveModel(selected)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	payload["model"] = activeModel

	upstreamBody, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "序列化请求失败", http.StatusInternalServerError)
		return
	}

	upstreamURL := strings.TrimRight(provider.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, upstreamURL, bytes.NewReader(upstreamBody))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("AI 请求失败: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(resp.StatusCode)

	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 8192)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			return
		}
	}
}

func (s *EditorAiService) UpdateConversation(conversationId string, input EditorAiConversationUpdateInput) (*EditorAiConversationDTO, error) {
	updates := map[string]interface{}{}
	if input.Title != nil {
		updates["title"] = *input.Title
	}
	if input.SystemPrompt != nil {
		updates["systemPrompt"] = *input.SystemPrompt
	}
	if len(updates) == 0 {
		return nil, errors.New("没有要更新的字段")
	}
	if err := db.DB.Model(&db.AiConversation{}).Where("id = ?", conversationId).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("更新对话失败: %w", err)
	}
	var conversation db.AiConversation
	if err := db.DB.Where("id = ?", conversationId).First(&conversation).Error; err != nil {
		return nil, err
	}
	dto := toConversationDTO(conversation)
	return &dto, nil
}

func (s *EditorAiService) DeleteConversation(conversationId string) error {
	// 先删除消息
	if err := db.DB.Where(`"conversationId" = ?`, conversationId).Delete(&db.AiMessage{}).Error; err != nil {
		return fmt.Errorf("删除消息失败: %w", err)
	}
	if err := db.DB.Where("id = ?", conversationId).Delete(&db.AiConversation{}).Error; err != nil {
		return fmt.Errorf("删除对话失败: %w", err)
	}
	return nil
}

func (s *EditorAiService) ClearConversation(conversationId string) (*EditorAiConversationDTO, error) {
	if err := db.DB.Where(`"conversationId" = ?`, conversationId).Delete(&db.AiMessage{}).Error; err != nil {
		return nil, fmt.Errorf("清空消息失败: %w", err)
	}
	updates := map[string]interface{}{"summary": nil, "lastModel": nil}
	if err := db.DB.Model(&db.AiConversation{}).Where("id = ?", conversationId).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("重置对话失败: %w", err)
	}
	var conversation db.AiConversation
	if err := db.DB.Where("id = ?", conversationId).First(&conversation).Error; err != nil {
		return nil, err
	}
	dto := toConversationDTO(conversation)
	return &dto, nil
}

// ─── 模型列表（调用 AI API）───────────────────────────

func (s *EditorAiService) GetModels() (*StoryAiModelsResponseDTO, error) {
	aiCfg := s.cfg.AI.NormalizedCopy()
	if len(aiCfg.Providers) == 0 || aiCfg.DefaultModel == "" {
		return nil, errors.New("AI 服务未配置")
	}

	models := []StoryAiModelOption{}
	providerIDs := make([]string, 0, len(aiCfg.Providers))
	for providerID := range aiCfg.Providers {
		providerIDs = append(providerIDs, providerID)
	}
	sort.Strings(providerIDs)
	for _, providerID := range providerIDs {
		provider := aiCfg.Providers[providerID]
		chatModels := make(map[string]bool, len(provider.Models))
		imageModels := make(map[string]bool, len(provider.ImageModels))
		modelNames := make(map[string]bool, len(provider.Models)+len(provider.ImageModels))
		for _, model := range provider.Models {
			if model != "" {
				chatModels[model] = true
				modelNames[model] = true
			}
		}
		for _, model := range provider.ImageModels {
			if model != "" {
				imageModels[model] = true
				modelNames[model] = true
			}
		}
		sortedModels := make([]string, 0, len(modelNames))
		for model := range modelNames {
			sortedModels = append(sortedModels, model)
		}
		sort.Strings(sortedModels)
		for _, model := range sortedModels {
			capabilities := make([]string, 0, 2)
			if chatModels[model] {
				capabilities = append(capabilities, "chat")
			}
			if imageModels[model] {
				capabilities = append(capabilities, "image")
			}
			directEdit := resolveDesktopModelCapabilities(provider, model)
			models = append(models, StoryAiModelOption{
				ID:               providerID + ":" + model,
				Label:            providerID + " / " + model,
				Provider:         providerID,
				Model:            model,
				Capabilities:     capabilities,
				Vision:           directEdit.Vision,
				Tools:            directEdit.Tools,
				StructuredOutput: directEdit.StructuredOutput,
				ContextWindow:    directEdit.ContextWindow,
			})
		}
	}
	if len(models) == 0 {
		return nil, errors.New("AI 服务未配置")
	}

	return &StoryAiModelsResponseDTO{
		DefaultModel:      aiCfg.DefaultModel,
		DefaultImageModel: aiCfg.DefaultImageModel,
		Models:            models,
	}, nil
}

func (s *EditorAiService) GetProviderModels(providerID string) (*StoryAiModelsResponseDTO, error) {
	aiCfg := s.cfg.AI.NormalizedCopy()
	provider, ok := aiCfg.Providers[providerID]
	if !ok || provider.BaseURL == "" || provider.APIKey == "" {
		if s.logger != nil {
			s.logger.Warn(LogCategoryAI, "fetch_models_invalid_config", "获取模型失败：模型源配置不完整", "provider: "+providerID)
		}
		return nil, errors.New("AI 服务未配置")
	}

	url := strings.TrimRight(provider.BaseURL, "/") + "/models"
	if s.logger != nil {
		s.logger.Info(LogCategoryAI, "fetch_models_start", "开始获取模型列表", fmt.Sprintf("provider: %s\nurl: %s", providerID, url))
	}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		if s.logger != nil {
			s.logger.Error(LogCategoryAI, "fetch_models_request_failed", "创建模型列表请求失败", fmt.Sprintf("provider: %s\nurl: %s\nerror: %v", providerID, url, err))
		}
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		if s.logger != nil {
			s.logger.Error(LogCategoryAI, "fetch_models_network_failed", "获取模型列表网络请求失败", fmt.Sprintf("provider: %s\nurl: %s\nerror: %v", providerID, url, err))
		}
		return nil, fmt.Errorf("获取模型列表失败: %w", err)
	}
	defer resp.Body.Close()

	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxProviderModelsResponseBytes+1))
	if readErr != nil {
		if s.logger != nil {
			s.logger.Error(LogCategoryAI, "fetch_models_read_failed", "读取模型列表响应失败", fmt.Sprintf("provider: %s\nurl: %s\nstatus: %d\nerror: %v", providerID, url, resp.StatusCode, readErr))
		}
		return nil, fmt.Errorf("读取模型列表失败: %w", readErr)
	}
	if len(body) > maxProviderModelsResponseBytes {
		if s.logger != nil {
			s.logger.Error(LogCategoryAI, "fetch_models_response_too_large", "模型列表响应过大", fmt.Sprintf("provider: %s\nurl: %s\nstatus: %d\nlimitBytes: %d", providerID, url, resp.StatusCode, maxProviderModelsResponseBytes))
		}
		return nil, fmt.Errorf("获取模型列表失败: 响应超过 %d 字节", maxProviderModelsResponseBytes)
	}

	logBody, logBodyTruncated := truncateProviderModelsLogBody(body, provider.APIKey)
	responseDetails := fmt.Sprintf("provider: %s\nurl: %s\nstatus: %d\ncontentType: %s\nresponseBytes: %d\nresponseBodyTruncated: %t\nresponseBody:\n%s", providerID, url, resp.StatusCode, resp.Header.Get("Content-Type"), len(body), logBodyTruncated, logBody)

	if resp.StatusCode != http.StatusOK {
		if s.logger != nil {
			s.logger.Error(LogCategoryAI, "fetch_models_http_failed", "获取模型列表返回错误状态", responseDetails)
		}
		return nil, fmt.Errorf("获取模型列表失败 (%d): %s", resp.StatusCode, string(body))
	}

	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		if s.logger != nil {
			s.logger.Error(LogCategoryAI, "fetch_models_decode_failed", "解析模型列表响应失败", responseDetails+fmt.Sprintf("\nerror: %v", err))
		}
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}

	models := []StoryAiModelOption{}
	for _, item := range payload.Data {
		if item.ID != "" {
			directEdit := resolveDesktopModelCapabilities(provider, item.ID)
			models = append(models, StoryAiModelOption{
				ID:               providerID + ":" + item.ID,
				Label:            providerID + " / " + item.ID,
				Provider:         providerID,
				Model:            item.ID,
				Vision:           directEdit.Vision,
				Tools:            directEdit.Tools,
				StructuredOutput: directEdit.StructuredOutput,
				ContextWindow:    directEdit.ContextWindow,
			})
		}
	}
	if s.logger != nil {
		s.logger.Info(LogCategoryAI, "fetch_models_success", "模型列表获取成功", responseDetails+fmt.Sprintf("\nmodelCount: %d", len(models)))
	}

	return &StoryAiModelsResponseDTO{
		DefaultModel:      aiCfg.DefaultModel,
		DefaultImageModel: aiCfg.DefaultImageModel,
		Models:            models,
	}, nil
}

// ─── 生成（流式，供本地 HTTP 服务调用）───────────────

func (s *EditorAiService) GenerateStream(input EditorAiGenerateInput, w http.ResponseWriter) error {
	if input.GenerateImage {
		return s.handleImageGeneration(input, w)
	}

	aiCfg := s.cfg.AI
	aiCfg.Normalize()
	_, provider, activeModel, err := aiCfg.ResolveModel(input.Model)
	if err != nil {
		return err
	}

	// 加载历史消息
	history, err := s.buildHistoryMessages(input.ConversationID, 8)
	if err != nil {
		return err
	}

	// 构建系统提示词
	var conversation db.AiConversation
	db.DB.Where("id = ?", input.ConversationID).First(&conversation)
	sysPrompt := conversation.SystemPrompt
	if sysPrompt == nil || *sysPrompt == "" {
		if input.SelectedText == "" {
			sysPrompt = strPtr(chatSystemPrompt)
		} else {
			sysPrompt = strPtr(systemPrompt)
		}
	}

	// 构建消息
	messages := []map[string]interface{}{
		{"role": "system", "content": *sysPrompt},
	}
	for _, h := range history {
		content := h.Content
		if h.Role == "assistant" && len(h.Metadata) > 0 {
			var imageMeta AiImageMetadata
			if json.Unmarshal(h.Metadata, &imageMeta) == nil && imageMeta.Type == "image" {
				content = "[已生成图片：" + imageMeta.Prompt + "]"
			}
		}
		messages = append(messages, map[string]interface{}{"role": h.Role, "content": content})
	}

	// 构建用户消息
	userPrompt := s.buildUserPrompt(input)
	if len(input.Images) > 0 {
		parts := []interface{}{
			map[string]interface{}{"type": "text", "text": userPrompt},
		}
		for _, img := range input.Images {
			parts = append(parts, map[string]interface{}{
				"type":      "image_url",
				"image_url": map[string]interface{}{"url": img, "detail": "auto"},
			})
		}
		messages = append(messages, map[string]interface{}{"role": "user", "content": parts})
	} else {
		messages = append(messages, map[string]interface{}{"role": "user", "content": userPrompt})
	}

	// 创建用户消息记录
	userMsg := db.AiMessage{
		ID:             cuid(),
		ConversationID: input.ConversationID,
		Role:           "user",
		Content:        userPrompt,
		Status:         "completed",
	}
	if input.Action != "" {
		userMsg.Action = &input.Action
	}
	if len(input.Images) > 0 {
		metadata, _ := json.Marshal(map[string]interface{}{"images": input.Images})
		userMsg.Metadata = datatypes.JSON(metadata)
	}
	db.DB.Create(&userMsg)

	// 创建 assistant 消息占位
	assistantMsg := db.AiMessage{
		ID:             cuid(),
		ConversationID: input.ConversationID,
		Role:           "assistant",
		Content:        "",
		Status:         "streaming",
		Model:          &activeModel,
	}
	if input.Action != "" {
		assistantMsg.Action = &input.Action
	}
	db.DB.Create(&assistantMsg)

	// 调用上游 AI API
	upstreamURL := strings.TrimRight(provider.BaseURL, "/") + "/chat/completions"
	body, _ := json.Marshal(map[string]interface{}{
		"model":       activeModel,
		"stream":      true,
		"temperature": 0.7,
		"messages":    messages,
	})

	req, err := http.NewRequest("POST", upstreamURL, bytes.NewReader(body))
	if err != nil {
		s.markMessageFailed(assistantMsg.ID, err.Error())
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		s.markMessageFailed(assistantMsg.ID, err.Error())
		return fmt.Errorf("AI 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		errBody, _ := io.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("AI API 错误 (%d): %s", resp.StatusCode, string(errBody))
		s.markMessageFailed(assistantMsg.ID, errMsg)
		return errors.New(errMsg)
	}

	// 流式读取并转发
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, canFlush := w.(http.Flusher)
	fullContent := ""

	// 流式读取并转发（ReadString 无行长上限；bufio.Scanner 默认 64KB
	// 会静默截断超长 SSE 行，见共享包迁移审计 P1-1）
	reader := bufio.NewReader(resp.Body)
	for {
		line, readErr := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, "data:") {
			data := strings.TrimSpace(line[5:])
			if data != "" && data != "[DONE]" {
				var chunk struct {
					Choices []struct {
						Delta struct {
							Content string `json:"content"`
						} `json:"delta"`
					} `json:"choices"`
				}
				if err := json.Unmarshal([]byte(data), &chunk); err == nil &&
					len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
					content := chunk.Choices[0].Delta.Content
					fullContent += content

					// SSE 格式输出
					sseData, _ := json.Marshal(content)
					fmt.Fprintf(w, "event: chunk\ndata: %s\n\n", sseData)
					if canFlush {
						flusher.Flush()
					}
				}
			}
		}
		if readErr != nil {
			break
		}
	}

	// 完成
	sseDone, _ := json.Marshal(fullContent)
	fmt.Fprintf(w, "event: done\ndata: %s\n\n", sseDone)
	if canFlush {
		flusher.Flush()
	}

	// 更新 assistant 消息
	db.DB.Model(&db.AiMessage{}).Where("id = ?", assistantMsg.ID).Updates(map[string]interface{}{
		"content": fullContent,
		"status":  "completed",
	})

	// 更新对话
	conversationUpdates := map[string]interface{}{
		"lastModel": activeModel,
		"updatedAt": time.Now(),
	}
	if title := strings.TrimSpace(input.Title); title != "" {
		conversationUpdates["title"] = truncateString(title, 200)
	}
	db.DB.Model(&db.AiConversation{}).Where("id = ?", input.ConversationID).Updates(conversationUpdates)

	return nil
}

func (s *EditorAiService) handleImageGeneration(input EditorAiGenerateInput, w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, canFlush := w.(http.Flusher)
	sendEvent := func(event string, payload interface{}) {
		data, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
		if canFlush {
			flusher.Flush()
		}
	}

	if input.ConversationID == "" {
		return errors.New("conversationId 不能为空")
	}
	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		return errors.New("提示词不能为空")
	}
	size := normalizeImageSize(input.ImageSize)

	aiCfg := s.cfg.AI
	aiCfg.Normalize()
	providerID, provider, activeModel, err := aiCfg.ResolveImageModel(input.ImageModel)
	if err != nil {
		return err
	}
	selectedImageModel := providerID + ":" + activeModel

	userMsg := db.AiMessage{
		ID:             cuid(),
		ConversationID: input.ConversationID,
		Role:           "user",
		Content:        prompt,
		Status:         "completed",
	}
	if input.Action != "" {
		userMsg.Action = &input.Action
	}
	if len(input.Images) > 0 {
		metadata, _ := json.Marshal(map[string]interface{}{"images": input.Images})
		userMsg.Metadata = datatypes.JSON(metadata)
	}
	if err := db.DB.Create(&userMsg).Error; err != nil {
		return fmt.Errorf("保存用户消息失败: %w", err)
	}

	assistantMsg := db.AiMessage{
		ID:             cuid(),
		ConversationID: input.ConversationID,
		Role:           "assistant",
		Content:        "",
		Status:         "streaming",
		Model:          &selectedImageModel,
	}
	if input.Action != "" {
		assistantMsg.Action = &input.Action
	}
	if err := db.DB.Create(&assistantMsg).Error; err != nil {
		return fmt.Errorf("创建助手消息失败: %w", err)
	}

	sendEvent("status", "正在生成图片...")
	imageData, mimeType, revisedPrompt, err := s.generateImage(provider, prompt, activeModel, size, input.Images)
	if err != nil {
		s.markMessageFailed(assistantMsg.ID, err.Error())
		sendEvent("error", err.Error())
		return nil
	}

	sendEvent("status", "正在保存本地文件...")
	localPath, err := s.saveImageToTemp(assistantMsg.ID, imageData, mimeType)
	if err != nil {
		s.markMessageFailed(assistantMsg.ID, err.Error())
		sendEvent("error", err.Error())
		return nil
	}

	metadata := AiImageMetadata{
		Type:          "image",
		LocalPath:     localPath,
		Prompt:        prompt,
		Provider:      providerID,
		Model:         activeModel,
		Size:          size,
		MimeType:      mimeType,
		RevisedPrompt: revisedPrompt,
		GeneratedAt:   time.Now().Format(time.RFC3339),
		Source:        "desktop-ai",
	}

	if s.uploadService != nil {
		sendEvent("status", "正在同步图片到共享存储...")
		if uploadResult, uploadErr := s.uploadService.UploadAiImage(localPath); uploadErr == nil {
			metadata.UploadedURL = &uploadResult.URL
			metadata.StorageKey = &uploadResult.Key
		} else {
			// Keep the local file as a fallback. Image generation itself succeeded,
			// so a temporary storage outage must not fail the completed message.
			sendEvent("status", "共享存储上传失败，图片已保存在本机")
		}
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		s.markMessageFailed(assistantMsg.ID, err.Error())
		sendEvent("error", err.Error())
		return nil
	}

	content := "已生成图片"
	if err := db.DB.Model(&db.AiMessage{}).Where("id = ?", assistantMsg.ID).Updates(map[string]interface{}{
		"content":  content,
		"status":   "completed",
		"metadata": datatypes.JSON(metadataJSON),
	}).Error; err != nil {
		s.markMessageFailed(assistantMsg.ID, err.Error())
		sendEvent("error", err.Error())
		return nil
	}

	conversationUpdates := map[string]interface{}{
		"lastModel": selectedImageModel,
		"updatedAt": time.Now(),
	}
	if title := strings.TrimSpace(input.Title); title != "" {
		conversationUpdates["title"] = truncateString(title, 200)
	}
	db.DB.Model(&db.AiConversation{}).Where("id = ?", input.ConversationID).Updates(conversationUpdates)

	sendEvent("done", map[string]string{"messageId": assistantMsg.ID, "content": content})
	return nil
}

func (s *EditorAiService) generateImage(provider config.AIProviderConfig, prompt string, model string, size string, sourceImages []string) ([]byte, string, string, error) {
	if len(sourceImages) > 0 {
		return s.editImage(provider, prompt, model, size, sourceImages)
	}

	upstreamURL := strings.TrimRight(provider.BaseURL, "/") + "/images/generations"
	body, _ := json.Marshal(map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"n":      1,
		"size":   size,
	})
	req, err := http.NewRequest("POST", upstreamURL, bytes.NewReader(body))
	if err != nil {
		return nil, "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	return executeImageRequest(req)
}

func (s *EditorAiService) editImage(provider config.AIProviderConfig, prompt string, model string, size string, sourceImages []string) ([]byte, string, string, error) {
	if len(sourceImages) > 16 {
		return nil, "", "", errors.New("image edit supports at most 16 reference images")
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("model", model); err != nil {
		return nil, "", "", err
	}
	if err := writer.WriteField("prompt", prompt); err != nil {
		return nil, "", "", err
	}
	if err := writer.WriteField("n", "1"); err != nil {
		return nil, "", "", err
	}
	if err := writer.WriteField("size", size); err != nil {
		return nil, "", "", err
	}

	fieldName := "image"
	if len(sourceImages) > 1 {
		fieldName = "image[]"
	}
	for index, source := range sourceImages {
		imageData, mimeType, err := readImageInput(source)
		if err != nil {
			return nil, "", "", fmt.Errorf("read reference image %d: %w", index+1, err)
		}
		if !isSupportedImageEditMime(mimeType) {
			return nil, "", "", fmt.Errorf("unsupported image edit type: %s", mimeType)
		}
		part, err := writer.CreateFormFile(fieldName, fmt.Sprintf("reference-%d%s", index+1, extensionForMime(mimeType)))
		if err != nil {
			return nil, "", "", err
		}
		if _, err := part.Write(imageData); err != nil {
			return nil, "", "", err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", "", err
	}

	upstreamURL := strings.TrimRight(provider.BaseURL, "/") + "/images/edits"
	req, err := http.NewRequest("POST", upstreamURL, &body)
	if err != nil {
		return nil, "", "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	return executeImageRequest(req)
}

func executeImageRequest(req *http.Request) ([]byte, string, string, error) {
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("image generation request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
		return nil, "", "", fmt.Errorf("image generation API error (%d): %s", resp.StatusCode, string(errBody))
	}

	var payload struct {
		Data []struct {
			URL           string `json:"url"`
			B64JSON       string `json:"b64_json"`
			RevisedPrompt string `json:"revised_prompt"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, "", "", fmt.Errorf("parse image generation response: %w", err)
	}
	if len(payload.Data) == 0 {
		return nil, "", "", errors.New("image generation response is empty")
	}
	item := payload.Data[0]
	if item.B64JSON != "" {
		data, err := base64.StdEncoding.DecodeString(item.B64JSON)
		if err != nil {
			return nil, "", "", fmt.Errorf("decode generated image: %w", err)
		}
		if len(data) == 0 || len(data) > 30*1024*1024 {
			return nil, "", "", errors.New("generated image is empty or exceeds 30MB")
		}
		mimeType := http.DetectContentType(data)
		if !isAllowedImageMime(mimeType) {
			return nil, "", "", fmt.Errorf("unsupported generated image type: %s", mimeType)
		}
		return data, mimeType, item.RevisedPrompt, nil
	}
	if item.URL == "" {
		return nil, "", "", errors.New("image generation response is missing image data")
	}
	data, mimeType, err := downloadImage(item.URL)
	if err != nil {
		return nil, "", "", err
	}
	return data, mimeType, item.RevisedPrompt, nil
}

func readImageInput(source string) ([]byte, string, error) {
	if strings.HasPrefix(source, "data:") {
		comma := strings.IndexByte(source, ',')
		if comma < 0 {
			return nil, "", errors.New("invalid image data URL")
		}
		header := source[len("data:"):comma]
		if !strings.HasSuffix(header, ";base64") {
			return nil, "", errors.New("image data URL must be base64 encoded")
		}
		mimeType := strings.TrimSuffix(header, ";base64")
		data, err := base64.StdEncoding.DecodeString(source[comma+1:])
		if err != nil {
			return nil, "", fmt.Errorf("decode image data URL: %w", err)
		}
		if len(data) == 0 || len(data) > 50*1024*1024 {
			return nil, "", errors.New("reference image is empty or exceeds 50MB")
		}
		return data, strings.ToLower(mimeType), nil
	}
	return downloadImage(source)
}

func isSupportedImageEditMime(mimeType string) bool {
	switch strings.ToLower(mimeType) {
	case "image/png", "image/jpeg", "image/jpg", "image/webp":
		return true
	default:
		return false
	}
}

func downloadImage(url string) ([]byte, string, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := (&http.Client{Timeout: 3 * time.Minute}).Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("下载图片失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("下载图片失败 (%d)", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 30*1024*1024+1))
	if err != nil {
		return nil, "", fmt.Errorf("读取图片失败: %w", err)
	}
	if len(data) > 30*1024*1024 {
		return nil, "", errors.New("图片超过 30MB 限制")
	}
	mimeType := strings.Split(resp.Header.Get("Content-Type"), ";")[0]
	if !isAllowedImageMime(mimeType) {
		mimeType = http.DetectContentType(data)
	}
	if !isAllowedImageMime(mimeType) {
		return nil, "", fmt.Errorf("不支持的图片类型: %s", mimeType)
	}
	return data, mimeType, nil
}

func (s *EditorAiService) DownloadMessageImageToFile(imageURL string, filePath string) error {
	if strings.TrimSpace(filePath) == "" {
		return errors.New("download path is required")
	}
	data, _, err := readImageInput(imageURL)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("save downloaded image: %w", err)
	}
	return nil
}

func (s *EditorAiService) saveImageToTemp(messageId string, imageData []byte, mimeType string) (string, error) {
	tempDir := aiImageTempDir()
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("创建临时目录失败: %w", err)
	}
	ext := extensionForMime(mimeType)
	filePath := filepath.Join(tempDir, messageId+ext)
	if err := os.WriteFile(filePath, imageData, 0644); err != nil {
		return "", fmt.Errorf("保存图片失败: %w", err)
	}
	return filePath, nil
}

func (s *EditorAiService) GetImageDataURL(messageId string) (string, error) {
	metadata, err := s.getImageMetadata(messageId)
	if err != nil {
		return "", err
	}
	if metadata.UploadedURL != nil && *metadata.UploadedURL != "" {
		return *metadata.UploadedURL, nil
	}
	if err := validateAiImagePath(metadata.LocalPath); err != nil {
		return "", err
	}
	data, err := os.ReadFile(metadata.LocalPath)
	if err != nil {
		return "", fmt.Errorf("读取本地图片失败: %w", err)
	}
	mimeType := metadata.MimeType
	if !isAllowedImageMime(mimeType) {
		mimeType = http.DetectContentType(data)
	}
	if !isAllowedImageMime(mimeType) {
		return "", fmt.Errorf("不支持的图片类型: %s", mimeType)
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func (s *EditorAiService) SaveImageToAlbum(messageId string, uploadService *UploadService) (*PhotoDTO, error) {
	metadata, err := s.getImageMetadata(messageId)
	if err != nil {
		return nil, err
	}
	if metadata.PhotoID != nil && *metadata.PhotoID != "" {
		return &PhotoDTO{ID: *metadata.PhotoID}, nil
	}
	if uploadService == nil {
		return nil, errors.New("上传服务未就绪")
	}
	localPath, err := s.ensureLocalImageFile(messageId, metadata)
	if err != nil {
		return nil, err
	}

	result, err := uploadService.UploadFile(localPath, UploadSettings{
		Title:      truncateString("AI 生成 - "+metadata.Prompt, 80),
		ShowFlag:   true,
		OriginFlag: "desktop-ai",
	}, "", nil)
	if err != nil {
		return nil, err
	}
	if result == nil || !result.Success || result.Photo == nil {
		if result != nil && result.Error != "" {
			return nil, errors.New(result.Error)
		}
		return nil, errors.New("保存到相册失败")
	}

	// Keep the shared ai-images URL stable after saving to the album. Legacy
	// local-only messages gain a remote URL from the newly created Photo record.
	if metadata.UploadedURL == nil || *metadata.UploadedURL == "" {
		photoURL := resolveUploadURL(uploadService.proxy.baseURL, result.Photo.URL)
		metadata.UploadedURL = &photoURL
	}
	metadata.PhotoID = &result.Photo.ID
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}
	if err := db.DB.Model(&db.AiMessage{}).Where("id = ?", messageId).Update("metadata", datatypes.JSON(metadataJSON)).Error; err != nil {
		return nil, fmt.Errorf("更新消息元数据失败: %w", err)
	}
	return result.Photo, nil
}

func (s *EditorAiService) SaveMessageImageToAlbum(messageId string, imageURL string, uploadService *UploadService) (*PhotoDTO, error) {
	var message db.AiMessage
	if err := db.DB.Where("id = ?", messageId).First(&message).Error; err != nil {
		return nil, fmt.Errorf("查询消息失败: %w", err)
	}
	if len(message.Metadata) == 0 {
		return nil, errors.New("消息中没有图片")
	}

	var metadata map[string]interface{}
	if err := json.Unmarshal(message.Metadata, &metadata); err != nil {
		return nil, errors.New("消息图片元数据无效")
	}
	if metadataType, _ := metadata["type"].(string); metadataType == "image" {
		return s.SaveImageToAlbum(messageId, uploadService)
	}

	images, ok := metadata["images"].([]interface{})
	if !ok {
		return nil, errors.New("消息中没有图片")
	}

	imageIndex := -1
	photoID := ""
	for index, item := range images {
		switch image := item.(type) {
		case string:
			if image == imageURL {
				imageIndex = index
			}
		case map[string]interface{}:
			urlValue, _ := image["url"].(string)
			if urlValue == imageURL {
				imageIndex = index
				photoID, _ = image["photoId"].(string)
			}
		}
		if imageIndex >= 0 {
			break
		}
	}
	if imageIndex < 0 {
		return nil, errors.New("图片不属于该消息")
	}
	if photoID != "" {
		return &PhotoDTO{ID: photoID}, nil
	}
	if uploadService == nil {
		return nil, errors.New("上传服务未就绪")
	}

	imageData, mimeType, err := readMessageImage(imageURL, uploadService)
	if err != nil {
		return nil, err
	}
	tempPath, err := s.saveImageToTemp(fmt.Sprintf("%s-%d", messageId, imageIndex), imageData, mimeType)
	if err != nil {
		return nil, err
	}
	defer os.Remove(tempPath)

	title := strings.TrimSpace(message.Content)
	if title == "" {
		title = "AI 对话图片"
	}
	result, err := uploadService.UploadFile(tempPath, UploadSettings{
		Title:      truncateString(title, 80),
		ShowFlag:   true,
		OriginFlag: "desktop-ai",
	}, "", nil)
	if err != nil {
		return nil, err
	}
	if result == nil || !result.Success || result.Photo == nil {
		if result != nil && result.Error != "" {
			return nil, errors.New(result.Error)
		}
		return nil, errors.New("保存到相册失败")
	}

	imageMetadata, isObject := images[imageIndex].(map[string]interface{})
	if !isObject {
		imageMetadata = map[string]interface{}{"url": imageURL}
	}
	imageMetadata["photoId"] = result.Photo.ID
	images[imageIndex] = imageMetadata
	metadata["images"] = images
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}
	if err := db.DB.Model(&db.AiMessage{}).Where("id = ?", messageId).Update("metadata", datatypes.JSON(metadataJSON)).Error; err != nil {
		return nil, fmt.Errorf("更新消息元数据失败: %w", err)
	}
	return result.Photo, nil
}

func readMessageImage(imageURL string, uploadService *UploadService) ([]byte, string, error) {
	if strings.HasPrefix(imageURL, "data:") {
		separator := strings.IndexByte(imageURL, ',')
		if separator < 0 || !strings.HasSuffix(imageURL[:separator], ";base64") {
			return nil, "", errors.New("图片数据格式无效")
		}
		mimeType := strings.ToLower(strings.TrimPrefix(strings.TrimSuffix(imageURL[:separator], ";base64"), "data:"))
		if !isAllowedImageMime(mimeType) {
			return nil, "", fmt.Errorf("不支持的图片类型: %s", mimeType)
		}
		data, err := base64.StdEncoding.DecodeString(imageURL[separator+1:])
		if err != nil {
			return nil, "", fmt.Errorf("解码图片失败: %w", err)
		}
		if len(data) == 0 || len(data) > 30*1024*1024 {
			return nil, "", errors.New("图片为空或超过 30MB 限制")
		}
		return data, mimeType, nil
	}

	resolvedURL := imageURL
	if strings.HasPrefix(imageURL, "/") && uploadService != nil && uploadService.proxy != nil {
		resolvedURL = resolveUploadURL(uploadService.proxy.baseURL, imageURL)
	}
	if !strings.HasPrefix(resolvedURL, "http://") && !strings.HasPrefix(resolvedURL, "https://") {
		return nil, "", errors.New("不支持的图片地址")
	}
	return downloadImage(resolvedURL)
}

func (s *EditorAiService) ensureLocalImageFile(messageId string, metadata *AiImageMetadata) (string, error) {
	if metadata.LocalPath != "" {
		if err := validateAiImagePath(metadata.LocalPath); err == nil {
			if _, statErr := os.Stat(metadata.LocalPath); statErr == nil {
				return metadata.LocalPath, nil
			}
		}
	}
	if metadata.UploadedURL == nil || *metadata.UploadedURL == "" {
		return "", errors.New("图片在本机不存在，且没有可下载的共享存储地址")
	}

	data, mimeType, err := downloadImage(*metadata.UploadedURL)
	if err != nil {
		return "", fmt.Errorf("下载共享存储图片失败: %w", err)
	}
	localPath, err := s.saveImageToTemp(messageId, data, mimeType)
	if err != nil {
		return "", err
	}
	metadata.LocalPath = localPath
	metadata.MimeType = mimeType
	return localPath, nil
}

func (s *EditorAiService) getImageMetadata(messageId string) (*AiImageMetadata, error) {
	var message db.AiMessage
	if err := db.DB.Where("id = ?", messageId).First(&message).Error; err != nil {
		return nil, fmt.Errorf("查询消息失败: %w", err)
	}
	var metadata AiImageMetadata
	if len(message.Metadata) == 0 || json.Unmarshal(message.Metadata, &metadata) != nil || metadata.Type != "image" {
		return nil, errors.New("不是图片消息")
	}
	if metadata.LocalPath == "" && (metadata.UploadedURL == nil || *metadata.UploadedURL == "") {
		return nil, errors.New("图片路径不存在")
	}
	return &metadata, nil
}

func aiImageTempDir() string {
	return filepath.Join(config.ConfigDir(), "temp", "ai-images")
}

func validateAiImagePath(path string) error {
	if path == "" {
		return errors.New("本地图片路径为空")
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	absBase, err := filepath.Abs(aiImageTempDir())
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(absBase, absPath)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return errors.New("图片路径不在 AI 临时目录内")
	}
	if !isAllowedImageExt(filepath.Ext(absPath)) {
		return fmt.Errorf("不支持的图片扩展名: %s", filepath.Ext(absPath))
	}
	return nil
}

func normalizeImageSize(size string) string {
	switch size {
	case "1024x1024", "1024x1792", "1792x1024":
		return size
	default:
		return "1024x1024"
	}
}

func extensionForMime(mimeType string) string {
	switch mimeType {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/avif":
		return ".avif"
	}
	if exts, err := mime.ExtensionsByType(mimeType); err == nil && len(exts) > 0 {
		return exts[0]
	}
	return ".png"
}

func isAllowedImageMime(mimeType string) bool {
	switch strings.ToLower(mimeType) {
	case "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif":
		return true
	default:
		return false
	}
}

func isAllowedImageExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif":
		return true
	default:
		return false
	}
}

func truncateString(value string, maxLen int) string {
	runes := []rune(value)
	if len(runes) <= maxLen {
		return value
	}
	return string(runes[:maxLen])
}

// ─── 辅助方法 ─────────────────────────────────────────

func (s *EditorAiService) buildHistoryMessages(conversationId string, limit int) ([]db.AiMessage, error) {
	var messages []db.AiMessage
	err := db.DB.Where(`"conversationId" = ? AND role IN ('user','assistant') AND status IN ('completed','streaming')`, conversationId).
		Order(`"createdAt" DESC`).
		Limit(limit).
		Find(&messages).Error
	if err != nil {
		return nil, err
	}
	// 反转为时间正序
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

func (s *EditorAiService) buildUserPrompt(input EditorAiGenerateInput) string {
	if input.SelectedText == "" {
		// 对话模式
		return input.Prompt
	}
	// 编辑模式
	sections := []string{}
	if input.Title != "" {
		sections = append(sections, "标题："+input.Title)
	}
	if input.SelectedText != "" {
		sections = append(sections, "选中文本：\n"+input.SelectedText)
	}
	if instruction, ok := actionInstructions[input.Action]; ok {
		sections = append(sections, "任务："+instruction)
	}
	if input.Prompt != "" {
		sections = append(sections, "用户补充要求（必须尽量满足，作为生成约束和参考）：\n"+input.Prompt)
	}
	sections = append(sections, "输出要求：只输出最终正文内容，不解释你的修改过程，不添加标题或前缀。")
	return strings.Join(sections, "\n\n")
}

func (s *EditorAiService) markMessageFailed(messageId, errMsg string) {
	db.DB.Model(&db.AiMessage{}).Where("id = ?", messageId).Updates(map[string]interface{}{
		"status": "failed",
		"error":  errMsg,
	})
}

func toConversationDTO(c db.AiConversation) EditorAiConversationDTO {
	dto := EditorAiConversationDTO{
		ID:           c.ID,
		ScopeID:      c.ScopeID,
		Title:        c.Title,
		Summary:      c.Summary,
		LastModel:    c.LastModel,
		SystemPrompt: c.SystemPrompt,
		CreatedAt:    c.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    c.UpdatedAt.Format(time.RFC3339),
	}
	return dto
}

func toMessageDTO(m db.AiMessage) EditorAiMessageDTO {
	dto := EditorAiMessageDTO{
		ID:             m.ID,
		ConversationID: m.ConversationID,
		Role:           m.Role,
		Content:        m.Content,
		Status:         m.Status,
		Model:          m.Model,
		Action:         m.Action,
		Error:          m.Error,
		CreatedAt:      m.CreatedAt.Format(time.RFC3339),
	}
	if len(m.Metadata) > 0 {
		var meta interface{}
		json.Unmarshal(m.Metadata, &meta)
		dto.Metadata = meta
	}
	return dto
}

func strPtr(s string) *string {
	return &s
}

// cuid 生成类似 Prisma cuid() 的 ID
func cuid() string {
	b := make([]byte, 12)
	rand.Read(b)
	return fmt.Sprintf("c%x", b)
}
