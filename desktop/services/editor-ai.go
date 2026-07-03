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
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Provider     string   `json:"provider"`
	Model        string   `json:"model"`
	Capabilities []string `json:"capabilities,omitempty"`
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
	cfg      *config.Config
	httpPort int // 本地流式 HTTP 服务端口
}

func NewEditorAiService(cfg *config.Config) *EditorAiService {
	return &EditorAiService{cfg: cfg}
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
	aiCfg := s.cfg.AI
	aiCfg.Normalize()
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
		providerModels := append([]string(nil), provider.Models...)
		sort.Strings(providerModels)
		for _, model := range providerModels {
			if model == "" {
				continue
			}
			models = append(models, StoryAiModelOption{
				ID:           providerID + ":" + model,
				Label:        providerID + " / " + model,
				Provider:     providerID,
				Model:        model,
				Capabilities: []string{"chat"},
			})
		}
		imageModels := append([]string(nil), provider.ImageModels...)
		sort.Strings(imageModels)
		for _, model := range imageModels {
			if model == "" {
				continue
			}
			models = append(models, StoryAiModelOption{
				ID:           providerID + ":" + model,
				Label:        providerID + " / " + model,
				Provider:     providerID,
				Model:        model,
				Capabilities: []string{"image"},
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
	aiCfg := s.cfg.AI
	aiCfg.Normalize()
	provider, ok := aiCfg.Providers[providerID]
	if !ok || provider.BaseURL == "" || provider.APIKey == "" {
		return nil, errors.New("AI 服务未配置")
	}

	url := strings.TrimRight(provider.BaseURL, "/") + "/models"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("获取模型列表失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("获取模型列表失败 (%d): %s", resp.StatusCode, string(body))
	}

	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("解析模型列表失败: %w", err)
	}

	models := []StoryAiModelOption{}
	for _, item := range payload.Data {
		if item.ID != "" {
			models = append(models, StoryAiModelOption{
				ID:       providerID + ":" + item.ID,
				Label:    providerID + " / " + item.ID,
				Provider: providerID,
				Model:    item.ID,
			})
		}
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

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(line[5:])
		if data == "" || data == "[DONE]" {
			continue
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 || chunk.Choices[0].Delta.Content == "" {
			continue
		}

		content := chunk.Choices[0].Delta.Content
		fullContent += content

		// SSE 格式输出
		sseData, _ := json.Marshal(content)
		fmt.Fprintf(w, "event: chunk\ndata: %s\n\n", sseData)
		if canFlush {
			flusher.Flush()
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
	db.DB.Model(&db.AiConversation{}).Where("id = ?", input.ConversationID).Updates(map[string]interface{}{
		"lastModel": activeModel,
		"updatedAt": time.Now(),
	})

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
	imageData, mimeType, revisedPrompt, err := s.generateImage(provider, prompt, activeModel, size)
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

	db.DB.Model(&db.AiConversation{}).Where("id = ?", input.ConversationID).Updates(map[string]interface{}{
		"lastModel": selectedImageModel,
		"updatedAt": time.Now(),
	})

	sendEvent("done", map[string]string{"messageId": assistantMsg.ID, "content": content})
	return nil
}

func (s *EditorAiService) generateImage(provider config.AIProviderConfig, prompt string, model string, size string) ([]byte, string, string, error) {
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

	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
	if err != nil {
		return nil, "", "", fmt.Errorf("图像生成请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
		return nil, "", "", fmt.Errorf("图像生成 API 错误 (%d): %s", resp.StatusCode, string(errBody))
	}

	var payload struct {
		Data []struct {
			URL           string `json:"url"`
			B64JSON       string `json:"b64_json"`
			RevisedPrompt string `json:"revised_prompt"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, "", "", fmt.Errorf("解析图像生成响应失败: %w", err)
	}
	if len(payload.Data) == 0 {
		return nil, "", "", errors.New("图像生成响应为空")
	}
	item := payload.Data[0]
	if item.B64JSON != "" {
		data, err := base64.StdEncoding.DecodeString(item.B64JSON)
		if err != nil {
			return nil, "", "", fmt.Errorf("解码图像失败: %w", err)
		}
		mimeType := http.DetectContentType(data)
		if !isAllowedImageMime(mimeType) {
			return nil, "", "", fmt.Errorf("不支持的图片类型: %s", mimeType)
		}
		return data, mimeType, item.RevisedPrompt, nil
	}
	if item.URL == "" {
		return nil, "", "", errors.New("图像生成响应缺少图片数据")
	}
	data, mimeType, err := downloadImage(item.URL)
	if err != nil {
		return nil, "", "", err
	}
	return data, mimeType, item.RevisedPrompt, nil
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
		return nil, errors.New("图片已保存到相册")
	}
	if uploadService == nil {
		return nil, errors.New("上传服务未就绪")
	}
	if err := validateAiImagePath(metadata.LocalPath); err != nil {
		return nil, err
	}
	if _, err := os.Stat(metadata.LocalPath); err != nil {
		return nil, fmt.Errorf("本地图片文件不存在: %w", err)
	}

	result, err := uploadService.UploadFile(metadata.LocalPath, UploadSettings{
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

	metadata.UploadedURL = &result.Photo.URL
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
