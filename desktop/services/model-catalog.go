package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"mo-gallery-desktop/config"
)

// models.dev 目录服务：为设置页提供模型能力与上下文窗口的自动填入数据源。
// 该目录是公开数据，请求不携带任何密钥，也不会把用户配置发往外部。
const (
	modelCatalogSourceURL        = "https://models.dev/api.json"
	modelCatalogCacheFileName    = "model-catalog.json"
	modelCatalogCacheSchema      = 1
	modelCatalogCacheTTL         = 24 * time.Hour
	modelCatalogRequestTimeout   = 20 * time.Second
	maxModelCatalogResponseBytes = 32 * 1024 * 1024
	modelCatalogUserAgent        = "mo-gallery-desktop-model-catalog"
)

// ─── DTO ──────────────────────────────────────────────

// ModelCatalogLimit 模型上下文与输出上限（0 表示目录未提供）。
type ModelCatalogLimit struct {
	Context int `json:"context"`
	Output  int `json:"output"`
	Input   int `json:"input"`
}

// ModelCatalogCost 模型价格（单位与 models.dev 一致：美元/百万 token）。
type ModelCatalogCost struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	CacheRead  float64 `json:"cacheRead"`
	CacheWrite float64 `json:"cacheWrite"`
	Reasoning  float64 `json:"reasoning"`
}

// ModelCatalogModalities 模型输入/输出模态。
type ModelCatalogModalities struct {
	Input  []string `json:"input"`
	Output []string `json:"output"`
}

// ModelCatalogReasoningOptions 推理档位配置。
type ModelCatalogReasoningOptions struct {
	Type   string   `json:"type,omitempty"`
	Values []string `json:"values"`
	Min    int      `json:"min"`
	Max    int      `json:"max"`
}

// ModelCatalogSpec 单个模型的规格。所有字段都可能缺失，缺失时保持零值。
type ModelCatalogSpec struct {
	// CatalogModelID 是目录内的原始键（可能带 vendor/ 前缀，如 deepseek/deepseek-v4-flash）。
	CatalogModelID   string                        `json:"catalogModelId"`
	ProviderID       string                        `json:"providerId"`
	ProviderName     string                        `json:"providerName,omitempty"`
	ID               string                        `json:"id,omitempty"`
	Name             string                        `json:"name,omitempty"`
	Description      string                        `json:"description,omitempty"`
	Family           string                        `json:"family,omitempty"`
	Attachment       bool                          `json:"attachment"`
	Vision           bool                          `json:"vision"`
	Reasoning        bool                          `json:"reasoning"`
	ReasoningOptions *ModelCatalogReasoningOptions `json:"reasoningOptions,omitempty"`
	ToolCall         bool                          `json:"toolCall"`
	StructuredOutput bool                          `json:"structuredOutput"`
	Temperature      bool                          `json:"temperature"`
	OpenWeights      bool                          `json:"openWeights"`
	Knowledge        string                        `json:"knowledge,omitempty"`
	ReleaseDate      string                        `json:"releaseDate,omitempty"`
	LastUpdated      string                        `json:"lastUpdated,omitempty"`
	Status           string                        `json:"status,omitempty"`
	Modalities       ModelCatalogModalities        `json:"modalities"`
	Limit            ModelCatalogLimit             `json:"limit"`
	Cost             ModelCatalogCost              `json:"cost"`
}

// ModelCatalogProvider 目录中的一个模型源。
type ModelCatalogProvider struct {
	ID         string   `json:"id"`
	Name       string   `json:"name,omitempty"`
	API        string   `json:"api,omitempty"`
	Doc        string   `json:"doc,omitempty"`
	NPM        string   `json:"npm,omitempty"`
	Env        []string `json:"env"`
	ModelCount int      `json:"modelCount"`
}

// ModelCatalogStatus 目录状态。设置页据此提示数据来源，任何情况下都不应因此报错崩溃。
type ModelCatalogStatus struct {
	Available     bool   `json:"available"`
	SourceURL     string `json:"sourceUrl"`
	FetchedAt     string `json:"fetchedAt,omitempty"`
	ProviderCount int    `json:"providerCount"`
	ModelCount    int    `json:"modelCount"`
	// FromCache 为 true 表示数据来自磁盘缓存而非本次网络抓取。
	FromCache bool `json:"fromCache"`
	// Stale 为 true 表示缓存已过期或网络失败后降级使用缓存。
	Stale bool `json:"stale"`
	// Warning 面向用户的降级说明；Error 仅在完全无数据时非空。
	Warning string `json:"warning,omitempty"`
	Error   string `json:"error,omitempty"`
}

// ModelCatalogLookupResult 模型规格查询结果。
type ModelCatalogLookupResult struct {
	Found bool              `json:"found"`
	Spec  *ModelCatalogSpec `json:"spec,omitempty"`
	// MatchedBy 说明命中方式：provider-hint / base-url / global / global-ambiguous。
	MatchedBy string `json:"matchedBy,omitempty"`
	// Ambiguous 表示全目录内存在多个同名模型，Spec 为其中最佳候选。
	Ambiguous      bool               `json:"ambiguous"`
	CandidateCount int                `json:"candidateCount"`
	Status         ModelCatalogStatus `json:"status"`
}

// ─── 线上结构 ──────────────────────────────────────────

// 顶层为扁平对象 providerId -> provider。逐个 provider / model 解码，
// 单条损坏只跳过该条，不影响整体目录可用。
type modelCatalogWireProvider struct {
	ID     string                     `json:"id"`
	Name   string                     `json:"name"`
	API    string                     `json:"api"`
	Doc    string                     `json:"doc"`
	NPM    string                     `json:"npm"`
	Env    []string                   `json:"env"`
	Models map[string]json.RawMessage `json:"models"`
}

type modelCatalogWireModel struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	Family           string `json:"family"`
	Attachment       bool   `json:"attachment"`
	Reasoning        bool   `json:"reasoning"`
	ToolCall         bool   `json:"tool_call"`
	StructuredOutput bool   `json:"structured_output"`
	Temperature      bool   `json:"temperature"`
	OpenWeights      bool   `json:"open_weights"`
	Knowledge        string `json:"knowledge"`
	ReleaseDate      string `json:"release_date"`
	LastUpdated      string `json:"last_updated"`
	Status           string `json:"status"`
	// 以下嵌套字段在 models.dev 上存在多种形态（例如 reasoning_options 既有对象
	// 也有 [{"type":"toggle"}] 数组），因此延后到各自的容错解析函数处理，
	// 避免单个字段形态异常导致整条模型被丢弃。
	ReasoningOptions json.RawMessage `json:"reasoning_options"`
	Modalities       json.RawMessage `json:"modalities"`
	Limit            json.RawMessage `json:"limit"`
	Cost             json.RawMessage `json:"cost"`
}

type modelCatalogWireReasoningOptions struct {
	Type   string          `json:"type"`
	Values json.RawMessage `json:"values"`
	Min    int             `json:"min"`
	Max    int             `json:"max"`
}

type modelCatalogWireModalities struct {
	Input  json.RawMessage `json:"input"`
	Output json.RawMessage `json:"output"`
}

type modelCatalogWireLimit struct {
	Context int `json:"context"`
	Output  int `json:"output"`
	Input   int `json:"input"`
}

type modelCatalogWireCost struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	CacheRead  float64 `json:"cache_read"`
	CacheWrite float64 `json:"cache_write"`
	Reasoning  float64 `json:"reasoning"`
}

// modelCatalogCacheFile 落盘缓存结构：原始载荷 + 抓取元数据。
type modelCatalogCacheFile struct {
	SchemaVersion int             `json:"schemaVersion"`
	SourceURL     string          `json:"sourceUrl"`
	FetchedAt     time.Time       `json:"fetchedAt"`
	ETag          string          `json:"etag,omitempty"`
	Payload       json.RawMessage `json:"payload"`
}

// ─── 内存快照 ──────────────────────────────────────────

type modelCatalogProviderData struct {
	meta   ModelCatalogProvider
	models map[string]ModelCatalogSpec
}

type modelCatalogIndexEntry struct {
	providerID     string
	catalogModelID string
}

type modelCatalogSnapshot struct {
	providers   map[string]*modelCatalogProviderData
	providerIDs []string
	// byModelName 归一化模型名 -> 候选条目（含 vendor/ 全名与去前缀基名两种键）。
	byModelName map[string][]modelCatalogIndexEntry
	// byHost 归一化 host -> provider id，来自 provider.api 与内置映射。
	byHost     map[string]string
	modelCount int
	fetchedAt  time.Time
	etag       string
	fromCache  bool
	stale      bool
	warning    string
}

// modelCatalogWellKnownHosts 覆盖 models.dev 未提供 api 字段的一线模型源。
// 这些恰好是用户最常手填 base_url 的服务，缺了它们 base_url 推断会大面积失效。
var modelCatalogWellKnownHosts = map[string]string{
	"api.openai.com":                    "openai",
	"api.anthropic.com":                 "anthropic",
	"generativelanguage.googleapis.com": "google",
	"api.x.ai":                          "xai",
	"api.groq.com":                      "groq",
	"api.mistral.ai":                    "mistral",
	"api.cohere.com":                    "cohere",
	"api.cohere.ai":                     "cohere",
	"api.perplexity.ai":                 "perplexity",
	"api.deepinfra.com":                 "deepinfra",
	"api.together.xyz":                  "togetherai",
	"api.cerebras.ai":                   "cerebras",
	"api.venice.ai":                     "venice",
	"aihubmix.com":                      "aihubmix",
	"api.aihubmix.com":                  "aihubmix",
}

// modelCatalogWellKnownHostSuffixes 处理带区域/账号前缀的托管服务域名。
var modelCatalogWellKnownHostSuffixes = map[string]string{
	".openai.azure.com":            "azure",
	".cognitiveservices.azure.com": "azure-cognitive-services",
	".amazonaws.com":               "amazon-bedrock",
	".gateway.ai.cloudflare.com":   "cloudflare-ai-gateway",
}

// ─── 解析与归一化 ──────────────────────────────────────

// normalizeModelCatalogName 归一化模型名：去首尾空白 + 小写。
func normalizeModelCatalogName(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// stripModelCatalogVendorPrefix 去掉 vendor/ 前缀，返回最后一段基名。
func stripModelCatalogVendorPrefix(value string) string {
	trimmed := strings.TrimSpace(value)
	if index := strings.LastIndex(trimmed, "/"); index >= 0 && index+1 < len(trimmed) {
		return trimmed[index+1:]
	}
	return trimmed
}

// normalizeModelCatalogHost 从 base_url 或 host 提取归一化主机名。
func normalizeModelCatalogHost(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if !strings.Contains(trimmed, "//") {
		trimmed = "https://" + trimmed
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return ""
	}
	return strings.ToLower(parsed.Hostname())
}

// isLoopbackCatalogHost 本地地址不参与 provider 推断（多个本地推理服务共用它）。
func isLoopbackCatalogHost(host string) bool {
	return host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "0.0.0.0"
}

func parseModelCatalogPayload(payload []byte) (*modelCatalogSnapshot, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, fmt.Errorf("解析模型目录失败: %w", err)
	}
	if len(raw) == 0 {
		return nil, errors.New("模型目录为空")
	}

	snapshot := &modelCatalogSnapshot{
		providers:   make(map[string]*modelCatalogProviderData, len(raw)),
		providerIDs: make([]string, 0, len(raw)),
		byModelName: make(map[string][]modelCatalogIndexEntry),
		byHost:      make(map[string]string),
	}

	for providerKey, rawProvider := range raw {
		var wire modelCatalogWireProvider
		if err := json.Unmarshal(rawProvider, &wire); err != nil {
			// 单个模型源结构异常时跳过，保证其余目录仍可用。
			continue
		}
		providerID := strings.TrimSpace(wire.ID)
		if providerID == "" {
			providerID = strings.TrimSpace(providerKey)
		}
		if providerID == "" {
			continue
		}
		data := &modelCatalogProviderData{
			meta: ModelCatalogProvider{
				ID:   providerID,
				Name: strings.TrimSpace(wire.Name),
				API:  strings.TrimSpace(wire.API),
				Doc:  strings.TrimSpace(wire.Doc),
				NPM:  strings.TrimSpace(wire.NPM),
				Env:  append([]string{}, wire.Env...),
			},
			models: make(map[string]ModelCatalogSpec, len(wire.Models)),
		}
		for modelKey, rawModel := range wire.Models {
			spec, ok := parseModelCatalogModel(rawModel, modelKey, data.meta)
			if !ok {
				continue
			}
			data.models[spec.CatalogModelID] = spec
			snapshot.indexModel(providerID, spec.CatalogModelID)
		}
		data.meta.ModelCount = len(data.models)
		snapshot.providers[providerID] = data
		snapshot.providerIDs = append(snapshot.providerIDs, providerID)
		snapshot.modelCount += len(data.models)
		snapshot.indexProviderHost(providerID, data.meta.API)
	}

	if len(snapshot.providers) == 0 {
		return nil, errors.New("模型目录不含任何有效模型源")
	}
	sort.Strings(snapshot.providerIDs)
	// 内置映射兜底，且不覆盖目录自带的 api 匹配结果。
	for host, providerID := range modelCatalogWellKnownHosts {
		if _, exists := snapshot.byHost[host]; exists {
			continue
		}
		if _, known := snapshot.providers[providerID]; known {
			snapshot.byHost[host] = providerID
		}
	}
	for _, entries := range snapshot.byModelName {
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].providerID != entries[j].providerID {
				return entries[i].providerID < entries[j].providerID
			}
			return entries[i].catalogModelID < entries[j].catalogModelID
		})
	}
	return snapshot, nil
}

func parseModelCatalogModel(rawModel json.RawMessage, modelKey string, provider ModelCatalogProvider) (ModelCatalogSpec, bool) {
	var wire modelCatalogWireModel
	if err := json.Unmarshal(rawModel, &wire); err != nil {
		// 标量字段形态异常时退化为逐字段宽松解析，保证模型不被整条丢弃。
		wire = decodeModelCatalogWireLoosely(rawModel)
	}
	catalogModelID := strings.TrimSpace(modelKey)
	if catalogModelID == "" {
		catalogModelID = strings.TrimSpace(wire.ID)
	}
	if catalogModelID == "" {
		return ModelCatalogSpec{}, false
	}
	spec := ModelCatalogSpec{
		CatalogModelID:   catalogModelID,
		ProviderID:       provider.ID,
		ProviderName:     provider.Name,
		ID:               strings.TrimSpace(wire.ID),
		Name:             strings.TrimSpace(wire.Name),
		Description:      strings.TrimSpace(wire.Description),
		Family:           strings.TrimSpace(wire.Family),
		Attachment:       wire.Attachment,
		Reasoning:        wire.Reasoning,
		ToolCall:         wire.ToolCall,
		StructuredOutput: wire.StructuredOutput,
		Temperature:      wire.Temperature,
		OpenWeights:      wire.OpenWeights,
		Knowledge:        strings.TrimSpace(wire.Knowledge),
		ReleaseDate:      strings.TrimSpace(wire.ReleaseDate),
		LastUpdated:      strings.TrimSpace(wire.LastUpdated),
		Status:           strings.TrimSpace(wire.Status),
		Modalities:       parseModelCatalogModalities(wire.Modalities),
		Limit:            parseModelCatalogLimit(wire.Limit),
		Cost:             parseModelCatalogCost(wire.Cost),
	}
	spec.ReasoningOptions = parseModelCatalogReasoningOptions(wire.ReasoningOptions)
	// attachment 表示可接收附件输入；结合 modalities 判定视觉能力。
	spec.Vision = spec.Attachment
	for _, modality := range spec.Modalities.Input {
		switch normalizeModelCatalogName(modality) {
		case "image", "video":
			spec.Vision = true
		}
	}
	return spec, true
}

// isEmptyRawJSON 判断字段是否缺失或为 null。
func isEmptyRawJSON(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return trimmed == "" || trimmed == "null"
}

// parseModelCatalogReasoningOptions 兼容对象与数组两种形态。
// 数组形态取第一个可解析的元素（如 [{"type":"toggle"}]）；空数组视为无配置。
func parseModelCatalogReasoningOptions(raw json.RawMessage) *ModelCatalogReasoningOptions {
	if isEmptyRawJSON(raw) {
		return nil
	}
	if strings.HasPrefix(strings.TrimSpace(string(raw)), "[") {
		var items []json.RawMessage
		if err := json.Unmarshal(raw, &items); err != nil {
			return nil
		}
		for _, item := range items {
			if options := parseModelCatalogReasoningOptions(item); options != nil {
				return options
			}
		}
		return nil
	}
	var wire modelCatalogWireReasoningOptions
	if err := json.Unmarshal(raw, &wire); err != nil {
		return nil
	}
	return &ModelCatalogReasoningOptions{
		Type:   strings.TrimSpace(wire.Type),
		Values: parseModelCatalogStringSlice(wire.Values),
		Min:    wire.Min,
		Max:    wire.Max,
	}
}

// parseModelCatalogStringSlice 宽松解析字符串数组：非字符串元素按字面量保留，
// 单个字符串也接受，其他形态返回空切片。
func parseModelCatalogStringSlice(raw json.RawMessage) []string {
	values := []string{}
	if isEmptyRawJSON(raw) {
		return values
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		var single string
		if json.Unmarshal(raw, &single) == nil && strings.TrimSpace(single) != "" {
			return []string{strings.TrimSpace(single)}
		}
		return values
	}
	for _, item := range items {
		var text string
		if json.Unmarshal(item, &text) == nil {
			if trimmed := strings.TrimSpace(text); trimmed != "" {
				values = append(values, trimmed)
			}
			continue
		}
		if trimmed := strings.TrimSpace(string(item)); trimmed != "" && trimmed != "null" {
			values = append(values, trimmed)
		}
	}
	return values
}

func parseModelCatalogModalities(raw json.RawMessage) ModelCatalogModalities {
	modalities := ModelCatalogModalities{Input: []string{}, Output: []string{}}
	if isEmptyRawJSON(raw) {
		return modalities
	}
	var wire modelCatalogWireModalities
	if err := json.Unmarshal(raw, &wire); err != nil {
		return modalities
	}
	modalities.Input = parseModelCatalogStringSlice(wire.Input)
	modalities.Output = parseModelCatalogStringSlice(wire.Output)
	return modalities
}

func parseModelCatalogLimit(raw json.RawMessage) ModelCatalogLimit {
	if isEmptyRawJSON(raw) {
		return ModelCatalogLimit{}
	}
	var wire modelCatalogWireLimit
	if err := json.Unmarshal(raw, &wire); err != nil {
		// 个别源可能给出浮点数，退一步按浮点解析后取整。
		var loose struct {
			Context float64 `json:"context"`
			Output  float64 `json:"output"`
			Input   float64 `json:"input"`
		}
		if json.Unmarshal(raw, &loose) != nil {
			return ModelCatalogLimit{}
		}
		return ModelCatalogLimit{Context: int(loose.Context), Output: int(loose.Output), Input: int(loose.Input)}
	}
	return ModelCatalogLimit{Context: wire.Context, Output: wire.Output, Input: wire.Input}
}

func parseModelCatalogCost(raw json.RawMessage) ModelCatalogCost {
	if isEmptyRawJSON(raw) {
		return ModelCatalogCost{}
	}
	var wire modelCatalogWireCost
	if err := json.Unmarshal(raw, &wire); err != nil {
		return ModelCatalogCost{}
	}
	return ModelCatalogCost{
		Input:      wire.Input,
		Output:     wire.Output,
		CacheRead:  wire.CacheRead,
		CacheWrite: wire.CacheWrite,
		Reasoning:  wire.Reasoning,
	}
}

// decodeModelCatalogWireLoosely 逐字段宽松解析，任一字段形态异常只丢该字段。
func decodeModelCatalogWireLoosely(rawModel json.RawMessage) modelCatalogWireModel {
	var fields map[string]json.RawMessage
	var wire modelCatalogWireModel
	if err := json.Unmarshal(rawModel, &fields); err != nil {
		return wire
	}
	wire.ID = rawJSONString(fields["id"])
	wire.Name = rawJSONString(fields["name"])
	wire.Description = rawJSONString(fields["description"])
	wire.Family = rawJSONString(fields["family"])
	wire.Knowledge = rawJSONString(fields["knowledge"])
	wire.ReleaseDate = rawJSONString(fields["release_date"])
	wire.LastUpdated = rawJSONString(fields["last_updated"])
	wire.Status = rawJSONString(fields["status"])
	wire.Attachment = rawJSONBool(fields["attachment"])
	wire.Reasoning = rawJSONBool(fields["reasoning"])
	wire.ToolCall = rawJSONBool(fields["tool_call"])
	wire.StructuredOutput = rawJSONBool(fields["structured_output"])
	wire.Temperature = rawJSONBool(fields["temperature"])
	wire.OpenWeights = rawJSONBool(fields["open_weights"])
	wire.ReasoningOptions = fields["reasoning_options"]
	wire.Modalities = fields["modalities"]
	wire.Limit = fields["limit"]
	wire.Cost = fields["cost"]
	return wire
}

func rawJSONString(raw json.RawMessage) string {
	if isEmptyRawJSON(raw) {
		return ""
	}
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return strings.TrimSpace(text)
	}
	return strings.Trim(strings.TrimSpace(string(raw)), `"`)
}

func rawJSONBool(raw json.RawMessage) bool {
	if isEmptyRawJSON(raw) {
		return false
	}
	var flag bool
	if json.Unmarshal(raw, &flag) == nil {
		return flag
	}
	// 兼容 "true" / 1 之类的写法。
	switch normalizeModelCatalogName(strings.Trim(string(raw), `"`)) {
	case "true", "1", "yes":
		return true
	}
	return false
}

func (s *modelCatalogSnapshot) indexModel(providerID, catalogModelID string) {
	entry := modelCatalogIndexEntry{providerID: providerID, catalogModelID: catalogModelID}
	full := normalizeModelCatalogName(catalogModelID)
	if full != "" {
		s.byModelName[full] = append(s.byModelName[full], entry)
	}
	base := normalizeModelCatalogName(stripModelCatalogVendorPrefix(catalogModelID))
	if base != "" && base != full {
		s.byModelName[base] = append(s.byModelName[base], entry)
	}
}

func (s *modelCatalogSnapshot) indexProviderHost(providerID, api string) {
	host := normalizeModelCatalogHost(api)
	if host == "" || isLoopbackCatalogHost(host) {
		return
	}
	// 多个 provider 共用同一 host 时按 id 字典序取定，保证结果稳定可预期。
	if existing, ok := s.byHost[host]; ok && existing <= providerID {
		return
	}
	s.byHost[host] = providerID
}

// ─── Service ──────────────────────────────────────────

// ModelCatalogService 提供 models.dev 模型规格目录，供设置页自动填入模型能力与上下文窗口。
type ModelCatalogService struct {
	cachePath string
	client    *http.Client
	now       func() time.Time
	logger    *Logger

	mu       sync.RWMutex
	snapshot *modelCatalogSnapshot

	// fetchMu 串行化网络抓取，避免设置页并发触发时重复下载 4MB+ 目录。
	fetchMu sync.Mutex
}

// NewModelCatalogService 创建目录服务。configDir 为空时回退到应用配置目录。
func NewModelCatalogService(configDir string) *ModelCatalogService {
	if strings.TrimSpace(configDir) == "" {
		configDir = config.ConfigDir()
	}
	return &ModelCatalogService{
		cachePath: filepath.Join(configDir, modelCatalogCacheFileName),
		client:    &http.Client{Timeout: modelCatalogRequestTimeout},
		now:       time.Now,
	}
}

// SetLogger 注入日志服务。
func (s *ModelCatalogService) SetLogger(logger *Logger) {
	s.logger = logger
}

func (s *ModelCatalogService) logInfo(action, message, details string) {
	if s.logger != nil {
		s.logger.Info(LogCategoryAI, action, message, details)
	}
}

func (s *ModelCatalogService) logWarn(action, message, details string) {
	if s.logger != nil {
		s.logger.Warn(LogCategoryAI, action, message, details)
	}
}

func (s *ModelCatalogService) logError(action, message, details string) {
	if s.logger != nil {
		s.logger.Error(LogCategoryAI, action, message, details)
	}
}

// GetStatus 返回当前目录状态（必要时按 TTL 拉取）。
func (s *ModelCatalogService) GetStatus(ctx context.Context) ModelCatalogStatus {
	snapshot, _ := s.ensure(ctx, false)
	return buildModelCatalogStatus(snapshot)
}

// Refresh 强制刷新目录（忽略 TTL，仍走 ETag 条件请求）。
func (s *ModelCatalogService) Refresh(ctx context.Context) ModelCatalogStatus {
	snapshot, _ := s.ensure(ctx, true)
	return buildModelCatalogStatus(snapshot)
}

func buildModelCatalogStatus(snapshot *modelCatalogSnapshot) ModelCatalogStatus {
	status := ModelCatalogStatus{SourceURL: modelCatalogSourceURL}
	if snapshot == nil {
		// 首次无缓存且离线：返回空目录 + 面向用户的说明，调用方据此提示手动填写。
		// 具体网络错误只进日志，不塞进界面文案。
		status.Error = "暂时无法获取 models.dev 模型目录，请检查网络后重试，或手动填写模型能力"
		return status
	}
	status.Available = true
	status.ProviderCount = len(snapshot.providers)
	status.ModelCount = snapshot.modelCount
	status.FromCache = snapshot.fromCache
	status.Stale = snapshot.stale
	status.Warning = snapshot.warning
	if !snapshot.fetchedAt.IsZero() {
		status.FetchedAt = snapshot.fetchedAt.UTC().Format(time.RFC3339)
	}
	return status
}

// ensure 返回可用目录：内存 → 磁盘缓存 → 网络，网络失败时降级到缓存。
// 仅在既无缓存又抓取失败时返回错误。
func (s *ModelCatalogService) ensure(ctx context.Context, force bool) (*modelCatalogSnapshot, error) {
	now := s.now()
	if !force {
		s.mu.RLock()
		cached := s.snapshot
		s.mu.RUnlock()
		if cached != nil && now.Sub(cached.fetchedAt) < modelCatalogCacheTTL {
			return cached, nil
		}
	}

	s.fetchMu.Lock()
	defer s.fetchMu.Unlock()

	// 等锁期间可能已有其他调用完成抓取。
	s.mu.RLock()
	current := s.snapshot
	s.mu.RUnlock()
	if !force && current != nil && s.now().Sub(current.fetchedAt) < modelCatalogCacheTTL {
		return current, nil
	}

	if current == nil {
		if fromDisk, err := s.readCache(); err == nil {
			current = fromDisk
			s.store(fromDisk)
			if !force && s.now().Sub(fromDisk.fetchedAt) < modelCatalogCacheTTL {
				return fromDisk, nil
			}
		}
	}

	etag := ""
	if current != nil {
		etag = current.etag
	}
	fetched, notModified, err := s.fetchRemote(ctx, etag)
	if err == nil {
		if notModified && current != nil {
			// 304：内容未变，仅顺延抓取时间，避免每次调用都打网络。
			refreshed := *current
			refreshed.fetchedAt = s.now()
			refreshed.stale = false
			refreshed.warning = ""
			s.store(&refreshed)
			s.touchCache(refreshed.fetchedAt)
			s.logInfo("model_catalog_not_modified", "模型目录未变更，复用本地缓存",
				fmt.Sprintf("source: %s\nproviders: %d\nmodels: %d", modelCatalogSourceURL, len(refreshed.providers), refreshed.modelCount))
			return &refreshed, nil
		}
		if fetched != nil {
			s.store(fetched)
			return fetched, nil
		}
	}

	if current != nil {
		stale := *current
		stale.fromCache = true
		stale.stale = true
		stale.warning = "无法连接 models.dev，当前使用本地缓存的模型目录"
		s.store(&stale)
		s.logWarn("model_catalog_cache_fallback", "模型目录抓取失败，降级使用本地缓存",
			fmt.Sprintf("source: %s\nfetchedAt: %s\nerror: %v", modelCatalogSourceURL, stale.fetchedAt.UTC().Format(time.RFC3339), err))
		return &stale, nil
	}
	if err == nil {
		err = errors.New("模型目录不可用")
	}
	return nil, fmt.Errorf("获取模型目录失败: %w", err)
}

func (s *ModelCatalogService) store(snapshot *modelCatalogSnapshot) {
	s.mu.Lock()
	s.snapshot = snapshot
	s.mu.Unlock()
}

// fetchRemote 抓取目录。返回 notModified 时表示服务端回了 304。
func (s *ModelCatalogService) fetchRemote(ctx context.Context, etag string) (*modelCatalogSnapshot, bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	s.logInfo("model_catalog_fetch_start", "开始抓取模型目录",
		fmt.Sprintf("source: %s\nconditional: %t", modelCatalogSourceURL, etag != ""))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, modelCatalogSourceURL, nil)
	if err != nil {
		s.logError("model_catalog_request_failed", "创建模型目录请求失败",
			fmt.Sprintf("source: %s\nerror: %v", modelCatalogSourceURL, err))
		return nil, false, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", modelCatalogUserAgent)
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		s.logWarn("model_catalog_network_failed", "模型目录网络请求失败",
			fmt.Sprintf("source: %s\nerror: %v", modelCatalogSourceURL, err))
		return nil, false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotModified {
		return nil, true, nil
	}
	if resp.StatusCode != http.StatusOK {
		s.logWarn("model_catalog_http_failed", "模型目录返回错误状态",
			fmt.Sprintf("source: %s\nstatus: %d", modelCatalogSourceURL, resp.StatusCode))
		return nil, false, fmt.Errorf("models.dev 返回 HTTP %d", resp.StatusCode)
	}

	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxModelCatalogResponseBytes+1))
	if err != nil {
		s.logWarn("model_catalog_read_failed", "读取模型目录响应失败",
			fmt.Sprintf("source: %s\nstatus: %d\nerror: %v", modelCatalogSourceURL, resp.StatusCode, err))
		return nil, false, err
	}
	if len(payload) > maxModelCatalogResponseBytes {
		s.logWarn("model_catalog_response_too_large", "模型目录响应过大",
			fmt.Sprintf("source: %s\nlimitBytes: %d", modelCatalogSourceURL, maxModelCatalogResponseBytes))
		return nil, false, fmt.Errorf("模型目录响应超过 %d 字节", maxModelCatalogResponseBytes)
	}

	snapshot, err := parseModelCatalogPayload(payload)
	if err != nil {
		s.logWarn("model_catalog_parse_failed", "解析模型目录失败",
			fmt.Sprintf("source: %s\nresponseBytes: %d\nerror: %v", modelCatalogSourceURL, len(payload), err))
		return nil, false, err
	}
	snapshot.fetchedAt = s.now()
	snapshot.etag = strings.TrimSpace(resp.Header.Get("ETag"))

	if err := s.writeCache(snapshot, payload); err != nil {
		snapshot.warning = "模型目录已更新，但无法写入本地缓存"
		s.logWarn("model_catalog_cache_write_failed", "写入模型目录缓存失败",
			fmt.Sprintf("path: %s\nerror: %v", s.cachePath, err))
	}
	s.logInfo("model_catalog_fetch_success", "模型目录抓取成功",
		fmt.Sprintf("source: %s\nresponseBytes: %d\nproviders: %d\nmodels: %d", modelCatalogSourceURL, len(payload), len(snapshot.providers), snapshot.modelCount))
	return snapshot, false, nil
}

// ─── 磁盘缓存 ──────────────────────────────────────────

func (s *ModelCatalogService) writeCache(snapshot *modelCatalogSnapshot, payload []byte) error {
	file := modelCatalogCacheFile{
		SchemaVersion: modelCatalogCacheSchema,
		SourceURL:     modelCatalogSourceURL,
		FetchedAt:     snapshot.fetchedAt,
		ETag:          snapshot.etag,
		Payload:       payload,
	}
	data, err := json.Marshal(file)
	if err != nil {
		return err
	}
	dir := filepath.Dir(s.cachePath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(dir, ".model-catalog-*.json")
	if err != nil {
		return err
	}
	name := temporary.Name()
	defer os.Remove(name)
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	_ = os.Remove(s.cachePath)
	return os.Rename(name, s.cachePath)
}

func (s *ModelCatalogService) readCache() (*modelCatalogSnapshot, error) {
	data, err := os.ReadFile(s.cachePath)
	if err != nil {
		return nil, err
	}
	var file modelCatalogCacheFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("解析模型目录缓存失败: %w", err)
	}
	if file.SchemaVersion != modelCatalogCacheSchema {
		return nil, fmt.Errorf("不支持的模型目录缓存版本: %d", file.SchemaVersion)
	}
	snapshot, err := parseModelCatalogPayload(file.Payload)
	if err != nil {
		return nil, err
	}
	snapshot.fetchedAt = file.FetchedAt
	snapshot.etag = file.ETag
	snapshot.fromCache = true
	snapshot.stale = s.now().Sub(file.FetchedAt) >= modelCatalogCacheTTL
	return snapshot, nil
}

// touchCache 在 304 后顺延缓存的抓取时间，避免每次调用都发条件请求。
func (s *ModelCatalogService) touchCache(fetchedAt time.Time) {
	data, err := os.ReadFile(s.cachePath)
	if err != nil {
		return
	}
	var file modelCatalogCacheFile
	if err := json.Unmarshal(data, &file); err != nil {
		return
	}
	file.FetchedAt = fetchedAt
	updated, err := json.Marshal(file)
	if err != nil {
		return
	}
	if err := os.WriteFile(s.cachePath, updated, 0o600); err != nil {
		s.logWarn("model_catalog_cache_touch_failed", "更新模型目录缓存时间失败",
			fmt.Sprintf("path: %s\nerror: %v", s.cachePath, err))
	}
}

// ─── 查询 helper ───────────────────────────────────────

// ListProviders 返回目录内的模型源列表（按 id 排序，不含模型明细）。
func (s *ModelCatalogService) ListProviders(ctx context.Context) ([]ModelCatalogProvider, ModelCatalogStatus) {
	snapshot, _ := s.ensure(ctx, false)
	status := buildModelCatalogStatus(snapshot)
	if snapshot == nil {
		return []ModelCatalogProvider{}, status
	}
	providers := make([]ModelCatalogProvider, 0, len(snapshot.providerIDs))
	for _, providerID := range snapshot.providerIDs {
		if data := snapshot.providers[providerID]; data != nil {
			providers = append(providers, data.meta.clone())
		}
	}
	return providers, status
}

// ListProviderModels 返回指定模型源下的全部模型规格（按目录 id 排序）。
func (s *ModelCatalogService) ListProviderModels(ctx context.Context, catalogProviderID string) ([]ModelCatalogSpec, ModelCatalogStatus) {
	snapshot, _ := s.ensure(ctx, false)
	status := buildModelCatalogStatus(snapshot)
	if snapshot == nil {
		return []ModelCatalogSpec{}, status
	}
	data := snapshot.providers[strings.TrimSpace(catalogProviderID)]
	if data == nil {
		return []ModelCatalogSpec{}, status
	}
	specs := make([]ModelCatalogSpec, 0, len(data.models))
	for _, spec := range data.models {
		specs = append(specs, spec.clone())
	}
	sort.Slice(specs, func(i, j int) bool { return specs[i].CatalogModelID < specs[j].CatalogModelID })
	return specs, status
}

// ResolveProviderIDByBaseURL 依据 base_url 猜测目录内的 provider id。
// 优先精确 host 匹配，其次内置一线厂商映射与托管域名后缀。
func (s *ModelCatalogService) ResolveProviderIDByBaseURL(ctx context.Context, baseURL string) (string, ModelCatalogStatus) {
	snapshot, _ := s.ensure(ctx, false)
	status := buildModelCatalogStatus(snapshot)
	if snapshot == nil {
		return "", status
	}
	return snapshot.resolveProviderIDByHost(normalizeModelCatalogHost(baseURL)), status
}

func (s *modelCatalogSnapshot) resolveProviderIDByHost(host string) string {
	if host == "" || isLoopbackCatalogHost(host) {
		return ""
	}
	if providerID, ok := s.byHost[host]; ok {
		return providerID
	}
	for suffix, providerID := range modelCatalogWellKnownHostSuffixes {
		if strings.HasSuffix(host, suffix) {
			if _, known := s.providers[providerID]; known {
				return providerID
			}
		}
	}
	// 退一步：用 api 的注册域名做后缀匹配，兼容 base_url 带区域子域的情况。
	best := ""
	for candidateHost, providerID := range s.byHost {
		if !strings.HasSuffix(host, "."+candidateHost) {
			continue
		}
		if best == "" || providerID < best {
			best = providerID
		}
	}
	return best
}

// ModelCatalogLookupInput 模型规格查询入参。三个提示字段都可为空。
type ModelCatalogLookupInput struct {
	// CatalogProviderID 目录内的 provider id（如 openai），优先使用。
	CatalogProviderID string `json:"catalogProviderId,omitempty"`
	// BaseURL 用户配置的接口地址，用于在缺少 provider id 时推断模型源。
	BaseURL string `json:"baseUrl,omitempty"`
	// ModelName 用户填写的模型名，允许带 vendor/ 前缀、大小写与首尾空白差异。
	ModelName string `json:"modelName"`
}

// ModelCatalogBatchLookupInput 批量查询入参：一次给定 provider 提示与多个模型名。
type ModelCatalogBatchLookupInput struct {
	// CatalogProviderID 目录内的 provider id（如 openai），优先使用。
	CatalogProviderID string `json:"catalogProviderId,omitempty"`
	// BaseURL 用户配置的接口地址，用于在缺少 provider id 时推断模型源。
	BaseURL string `json:"baseUrl,omitempty"`
	// ModelNames 待查询的模型名列表，保持调用方给定的顺序返回。
	ModelNames []string `json:"modelNames"`
}

// ModelCatalogBatchLookupItem 单个模型的批量查询结果。
type ModelCatalogBatchLookupItem struct {
	// ModelName 回显调用方给定的原始模型名，供前端按行对应。
	ModelName string            `json:"modelName"`
	Found     bool              `json:"found"`
	Spec      *ModelCatalogSpec `json:"spec,omitempty"`
	// MatchedBy 说明命中方式：provider-hint / base-url / global / global-ambiguous。
	MatchedBy string `json:"matchedBy,omitempty"`
	// Ambiguous 表示全目录内存在多个同名模型，Spec 为其中最佳候选。
	Ambiguous      bool `json:"ambiguous"`
	CandidateCount int  `json:"candidateCount"`
}

// ModelCatalogBatchLookupResult 批量查询结果。Status 对整批共用，
// 目录不可用时 Items 仍逐项返回 Found=false，调用方无需区分错误分支。
type ModelCatalogBatchLookupResult struct {
	Items  []ModelCatalogBatchLookupItem `json:"items"`
	Status ModelCatalogStatus            `json:"status"`
}

// ModelCatalogDTO 目录概览：模型源列表 + 状态，供设置页展示来源与新鲜度。
// 不含模型明细（完整目录数千条，按需用 LookupModelSpecs 查询）。
type ModelCatalogDTO struct {
	Providers []ModelCatalogProvider `json:"providers"`
	Status    ModelCatalogStatus     `json:"status"`
}

// GetCatalog 返回目录概览（必要时按 TTL 拉取，失败时降级到缓存）。
func (s *ModelCatalogService) GetCatalog(ctx context.Context) ModelCatalogDTO {
	providers, status := s.ListProviders(ctx)
	return ModelCatalogDTO{Providers: providers, Status: status}
}

// RefreshCatalog 强制刷新目录后返回概览。
func (s *ModelCatalogService) RefreshCatalog(ctx context.Context) ModelCatalogDTO {
	snapshot, _ := s.ensure(ctx, true)
	dto := ModelCatalogDTO{Providers: []ModelCatalogProvider{}, Status: buildModelCatalogStatus(snapshot)}
	if snapshot == nil {
		return dto
	}
	for _, providerID := range snapshot.providerIDs {
		if data := snapshot.providers[providerID]; data != nil {
			dto.Providers = append(dto.Providers, data.meta.clone())
		}
	}
	return dto
}

// LookupModelSpecs 批量查询模型规格：整批只解析目录一次，按入参顺序返回。
func (s *ModelCatalogService) LookupModelSpecs(ctx context.Context, input ModelCatalogBatchLookupInput) ModelCatalogBatchLookupResult {
	snapshot, _ := s.ensure(ctx, false)
	result := ModelCatalogBatchLookupResult{
		Items:  make([]ModelCatalogBatchLookupItem, 0, len(input.ModelNames)),
		Status: buildModelCatalogStatus(snapshot),
	}
	for _, modelName := range input.ModelNames {
		item := ModelCatalogBatchLookupItem{ModelName: modelName}
		if snapshot != nil {
			lookup := snapshot.lookup(ModelCatalogLookupInput{
				CatalogProviderID: input.CatalogProviderID,
				BaseURL:           input.BaseURL,
				ModelName:         modelName,
			})
			item.Found = lookup.Found
			item.Spec = lookup.Spec
			item.MatchedBy = lookup.MatchedBy
			item.Ambiguous = lookup.Ambiguous
			item.CandidateCount = lookup.CandidateCount
		}
		result.Items = append(result.Items, item)
	}
	return result
}

// LookupModelSpec 按『可选 provider 提示 + 模型名』返回模型规格。
// provider 命中优先；否则在全目录内匹配，命中多个时返回最佳候选并置 Ambiguous。
func (s *ModelCatalogService) LookupModelSpec(ctx context.Context, input ModelCatalogLookupInput) ModelCatalogLookupResult {
	snapshot, _ := s.ensure(ctx, false)
	result := ModelCatalogLookupResult{Status: buildModelCatalogStatus(snapshot)}
	if snapshot == nil {
		return result
	}
	matched := snapshot.lookup(input)
	matched.Status = result.Status
	return matched
}

// lookup 在给定快照内完成匹配，Status 由调用方填充。
func (snapshot *modelCatalogSnapshot) lookup(input ModelCatalogLookupInput) ModelCatalogLookupResult {
	result := ModelCatalogLookupResult{}
	modelName := strings.TrimSpace(input.ModelName)
	if modelName == "" {
		return result
	}

	// 1) 显式 provider 提示
	if providerID := strings.TrimSpace(input.CatalogProviderID); providerID != "" {
		if spec, ok := snapshot.findInProvider(providerID, modelName); ok {
			result.Found = true
			result.Spec = &spec
			result.MatchedBy = "provider-hint"
			result.CandidateCount = 1
			return result
		}
	}

	// 2) base_url 推断出的 provider
	if providerID := snapshot.resolveProviderIDByHost(normalizeModelCatalogHost(input.BaseURL)); providerID != "" {
		if spec, ok := snapshot.findInProvider(providerID, modelName); ok {
			result.Found = true
			result.Spec = &spec
			result.MatchedBy = "base-url"
			result.CandidateCount = 1
			return result
		}
	}

	// 3) 全目录匹配
	entries := snapshot.lookupEntries(modelName)
	if len(entries) == 0 {
		return result
	}
	best := snapshot.pickBestEntry(entries, modelName)
	spec, ok := snapshot.specOf(best)
	if !ok {
		return result
	}
	result.Found = true
	result.Spec = &spec
	result.CandidateCount = len(entries)
	result.Ambiguous = len(entries) > 1
	result.MatchedBy = "global"
	if result.Ambiguous {
		result.MatchedBy = "global-ambiguous"
	}
	return result
}

// findInProvider 在指定模型源内做归一化匹配。
func (s *modelCatalogSnapshot) findInProvider(providerID, modelName string) (ModelCatalogSpec, bool) {
	data := s.providers[strings.TrimSpace(providerID)]
	if data == nil {
		// provider id 大小写不一致时退化为忽略大小写查找。
		normalizedProvider := normalizeModelCatalogName(providerID)
		for candidateID, candidate := range s.providers {
			if normalizeModelCatalogName(candidateID) == normalizedProvider {
				data = candidate
				break
			}
		}
	}
	if data == nil {
		return ModelCatalogSpec{}, false
	}
	// 原始键直接命中最快。
	if spec, ok := data.models[strings.TrimSpace(modelName)]; ok {
		return spec.clone(), true
	}
	wanted := normalizeModelCatalogName(modelName)
	wantedBase := normalizeModelCatalogName(stripModelCatalogVendorPrefix(modelName))
	var fallback *ModelCatalogSpec
	for catalogModelID, spec := range data.models {
		normalized := normalizeModelCatalogName(catalogModelID)
		if normalized == wanted {
			cloned := spec.clone()
			return cloned, true
		}
		if normalizeModelCatalogName(stripModelCatalogVendorPrefix(catalogModelID)) == wantedBase {
			// 去前缀命中作为候补，优先保留字典序最小的结果以保证稳定。
			if fallback == nil || catalogModelID < fallback.CatalogModelID {
				cloned := spec.clone()
				fallback = &cloned
			}
		}
	}
	if fallback != nil {
		return *fallback, true
	}
	return ModelCatalogSpec{}, false
}

// lookupEntries 全目录候选：合并『全名』与『去前缀基名』两个索引桶并去重。
// 必须合并而不能命中即返回——厂商自己往往用不带前缀的键（deepseek 源下是
// deepseek-v4-flash），而中转站会用带前缀的键，只查前者会错过真正的厂商源。
func (s *modelCatalogSnapshot) lookupEntries(modelName string) []modelCatalogIndexEntry {
	keys := []string{normalizeModelCatalogName(modelName)}
	if base := normalizeModelCatalogName(stripModelCatalogVendorPrefix(modelName)); base != keys[0] {
		keys = append(keys, base)
	}
	seen := make(map[modelCatalogIndexEntry]bool)
	merged := []modelCatalogIndexEntry{}
	for _, key := range keys {
		if key == "" {
			continue
		}
		for _, entry := range s.byModelName[key] {
			if seen[entry] {
				continue
			}
			seen[entry] = true
			merged = append(merged, entry)
		}
	}
	return merged
}

// pickBestEntry 在多个候选中选出最佳。聚合类中转站会重复收录同名模型，
// 因此优先落到真正的厂商源上，再按字典序取定，保证结果稳定且更符合预期。
func (s *modelCatalogSnapshot) pickBestEntry(entries []modelCatalogIndexEntry, modelName string) modelCatalogIndexEntry {
	firstParty := make(map[string]bool, len(modelCatalogWellKnownHosts))
	for _, providerID := range modelCatalogWellKnownHosts {
		firstParty[providerID] = true
	}
	wanted := normalizeModelCatalogName(modelName)
	base := normalizeModelCatalogName(stripModelCatalogVendorPrefix(modelName))
	// 输入形如 deepseek/deepseek-v4-flash 时，vendor 段就是最可信的模型源提示。
	vendor := ""
	if index := strings.Index(strings.TrimSpace(modelName), "/"); index > 0 {
		vendor = normalizeModelCatalogName(strings.TrimSpace(modelName)[:index])
	}

	best := entries[0]
	bestScore := -1
	for _, entry := range entries {
		providerID := normalizeModelCatalogName(entry.providerID)
		score := 0
		if vendor != "" && providerID == vendor {
			score += 16
		}
		// 模型名常以厂商名打头（deepseek-v4-flash → deepseek）。
		if providerID != "" && strings.HasPrefix(base, providerID) {
			score += 8
		}
		if normalizeModelCatalogName(entry.catalogModelID) == wanted {
			score += 4
		}
		if firstParty[entry.providerID] {
			score += 2
		}
		if score > bestScore || (score == bestScore && entry.providerID < best.providerID) {
			best, bestScore = entry, score
		}
	}
	return best
}

func (s *modelCatalogSnapshot) specOf(entry modelCatalogIndexEntry) (ModelCatalogSpec, bool) {
	data := s.providers[entry.providerID]
	if data == nil {
		return ModelCatalogSpec{}, false
	}
	spec, ok := data.models[entry.catalogModelID]
	if !ok {
		return ModelCatalogSpec{}, false
	}
	return spec.clone(), true
}

// clone 返回深拷贝，避免调用方修改缓存中的共享切片。
func (p ModelCatalogProvider) clone() ModelCatalogProvider {
	cloned := p
	cloned.Env = append([]string{}, p.Env...)
	return cloned
}

func (m ModelCatalogSpec) clone() ModelCatalogSpec {
	cloned := m
	cloned.Modalities.Input = append([]string{}, m.Modalities.Input...)
	cloned.Modalities.Output = append([]string{}, m.Modalities.Output...)
	if m.ReasoningOptions != nil {
		options := *m.ReasoningOptions
		options.Values = append([]string{}, m.ReasoningOptions.Values...)
		cloned.ReasoningOptions = &options
	}
	return cloned
}
