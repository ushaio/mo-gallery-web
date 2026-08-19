# Desktop AI 对话生图功能实施方案

## 目标与原则

在 desktop 端 AI 对话中加入图像生成功能，同时保持现有文本对话体验稳定。

核心原则：

1. **对话仍写入 `AiMessage`**：用户消息和助手消息继续走现有会话表。
2. **生成图片默认不入 `Photo`**：只有用户点击“保存到相册”后才上传并创建照片记录。
3. **显式生图优先**：用 UI 开关和请求字段决定是否生图，关键词识别只做辅助建议，不作为唯一判断。
4. **临时文件本地托管**：图片先保存到 desktop 配置目录下的受控临时目录。
5. **前端不直接读取任意路径**：前端通过后端按 `messageId` 读取图片 data URL，避免暴露任意文件读取能力。
6. **文本模型与图片模型分离**：配置、模型选择和请求解析都区分 chat model 与 image model。

---

## 当前代码接入点

### 后端

- `desktop/services/editor-ai.go`
  - `EditorAiGenerateInput`：新增生图相关字段。
  - `GetModels()` / `GetProviderModels()`：扩展模型返回结构，区分模型能力。
  - `GenerateStream()`：增加 `GenerateImage` 分支。
  - `buildHistoryMessages()`：过滤或摘要图片消息，避免污染文本上下文。
  - `toMessageDTO()`：已能反序列化 `Metadata`，可复用。
- `desktop/config/config.go`
  - `AIConfig`：新增 `DefaultImageModel`。
  - `AIProviderConfig`：建议新增图片模型列表或能力描述。
  - `configDir()` 当前未导出，服务层不能直接调用，应新增导出函数。
- `desktop/app.go`
  - 新增 Wails 暴露方法：`GetAiImageDataURL(messageId string)`、`SaveAiImageToAlbum(messageId string)`。
  - 本地 HTTP `/ai/generate` 继续负责 SSE 生成。
- `desktop/services/upload.go`
  - 复用 `UploadFile()` 保存到相册。
  - 必须同时检查 `err`、`result.Success`、`result.Error`、`result.Photo`。

### 前端

- `desktop/frontend/src/pages/AiAssistantPage.tsx`
  - 当前 SSE 处理 `chunk`、`done`、`error`。
  - 当前消息气泡内联渲染 Markdown，需要拆出 `MessageContent`。
  - 当前模型选择器只有统一模型列表，需要支持 chat/image 模型分组或生图模式下切换默认图片模型。
- `desktop/frontend/src/lib/api/types.ts`
  - `EditorAiGenerateInput` 需新增 `generateImage?: boolean`、`imageModel?: string`、`imageSize?: string`。
  - `EditorAiMessageDto.metadata` 建议增加类型守卫，不直接依赖 `unknown`。

---

## 推荐架构

```text
用户输入提示词
    ↓
前端生图开关决定 generateImage=true
    ↓
POST /ai/generate 仍走现有本地 SSE 服务
    ↓
GenerateStream 根据 generateImage 分支
    ├─ false: 保持现有 /chat/completions 文本流
    └─ true: 创建 user/assistant 消息 → 调 images/generations → 保存临时文件 → 更新 Metadata
    ↓
SSE 返回 status/done，前端刷新会话
    ↓
MessageContent 识别 metadata.type=image
    ↓
ImagePreview 调 GetAiImageDataURL(messageId) 显示本地图片
    ↓
用户点击“保存到相册”
    ↓
SaveAiImageToAlbum 复用 UploadFile → 更新 Metadata.uploadedUrl/photoId
```

---

## 配置设计

### `desktop/config/config.go`

建议最小改动：

```go
type AIConfig struct {
    BaseURL           string                      `json:"base_url,omitempty"`
    APIKey            string                      `json:"api_key,omitempty"`
    Model             string                      `json:"model,omitempty"`
    DefaultModel      string                      `json:"default_model"`
    DefaultImageModel string                      `json:"default_image_model,omitempty"`
    Providers         map[string]AIProviderConfig `json:"providers"`
}

type AIProviderConfig struct {
    BaseURL     string   `json:"base_url"`
    APIKey      string   `json:"api_key"`
    Models      []string `json:"models"`
    ImageModels []string `json:"image_models,omitempty"`
}
```

补充方法：

```go
func ConfigDir() string {
    return configDir()
}

func (c AIConfig) ResolveImageModel(selected string) (string, AIProviderConfig, string, error) {
    if selected == "" {
        selected = c.DefaultImageModel
    }
    return c.resolveModelWithList(selected, true)
}
```

实施要点：

- `Normalize()` 不要把 chat model 自动当 image model。
- 旧配置没有 `default_image_model` 时，生图功能显示“未配置图片模型”。
- `GetModels()` 返回结构建议扩展为：

```ts
interface StoryAiModelsResponse {
  defaultModel: string
  defaultImageModel?: string
  models: StoryAiModelOption[]
}

interface StoryAiModelOption {
  id: string
  label: string
  provider?: string
  model?: string
  capabilities?: Array<'chat' | 'image'>
}
```

---

## 请求与 Metadata 设计

### `EditorAiGenerateInput`

```go
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
```

说明：

- `GenerateImage` 由前端生图开关设置。
- `ImageModel` 不复用 `Model`，避免 chat/image 混用。
- `ImageSize` 初期限制白名单：`1024x1024`、`1024x1792`、`1792x1024`。
- 关键词检测可保留为前端提示：“看起来你想生成图片，是否切换到生图模式？”

### 强类型 Metadata

```go
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
```

建议值：

```json
{
  "type": "image",
  "localPath": "C:\\Users\\...\\mo-gallery-desktop\\temp\\ai-images\\c123.png",
  "uploadedUrl": null,
  "photoId": null,
  "prompt": "生成一张日落海滩的照片",
  "provider": "openai",
  "model": "dall-e-3",
  "size": "1024x1024",
  "mimeType": "image/png",
  "revisedPrompt": "A serene beach at sunset...",
  "generatedAt": "2026-06-30T20:00:00+08:00",
  "source": "desktop-ai"
}
```

---

## 后端实现方案

### 1. `GenerateStream()` 分支

在解析配置前先判断：

```go
if input.GenerateImage {
    return s.handleImageGeneration(input, w)
}
```

文本路径保持现状，避免引入回归。

### 2. `handleImageGeneration()` 流程

实现顺序：

1. 校验 `ConversationID`、`Prompt`、`ImageSize`。
2. 使用 `ResolveImageModel(input.ImageModel)` 获取 provider/model。
3. 创建 user 消息，`Content` 使用原始 prompt。
4. 创建 assistant 占位消息，`Status=streaming`，`Model=imageModel`。
5. 发送 SSE `status`：`正在生成图片...`。
6. 调用 `generateImage()`。
7. 发送 SSE `status`：`正在保存本地文件...`。
8. 保存到受控临时目录。
9. 写入 `AiImageMetadata`，更新 assistant 为 `completed`。
10. 更新 `AiConversation.lastModel`、`updatedAt`。
11. 发送 SSE `done`，data 建议返回 JSON：`{"messageId":"...","content":"已生成图片"}`。

失败时：

- 调 `markMessageFailed(assistantMsg.ID, err.Error())`。
- 发送 SSE `error` 后返回，不要只依赖 HTTP 500；否则前端可能已经开始读流。

### 3. 图像生成 API

`POST {provider.BaseURL}/images/generations`

请求体：

```json
{
  "model": "dall-e-3",
  "prompt": "用户提示词",
  "n": 1,
  "size": "1024x1024"
}
```

响应兼容两种：

```json
{"data":[{"url":"https://...","revised_prompt":"..."}]}
```

```json
{"data":[{"b64_json":"...","revised_prompt":"..."}]}
```

实现要点：

- `http.Client` 设置超时，例如 `5 * time.Minute`。
- 下载 URL 时限制响应大小，例如 30MB，避免异常大文件占满内存。
- 根据响应 `Content-Type` 或解码结果记录 `mimeType`。
- 初期可原样保存，不强制转 PNG；文件扩展名根据 `mimeType` 选择 `.png`、`.jpg`、`.webp`。

### 4. 本地临时目录

路径：

```text
config.ConfigDir()/temp/ai-images/
```

文件命名：

```text
{assistantMessageId}.{ext}
```

实现要点：

- 通过 `config.ConfigDir()` 获取目录，不从 `services` 包调用未导出的 `configDir()`。
- 保存前 `os.MkdirAll(tempDir, 0755)`。
- 返回绝对路径只存后端 metadata，前端不直接访问。

### 5. 安全读取本地图片

新增后端方法：

```go
func (a *App) GetAiImageDataURL(messageId string) (string, error) {
    return a.EditorAi.GetImageDataURL(messageId)
}
```

`GetImageDataURL` 规则：

1. 查询 `AiMessage`。
2. 解析 `AiImageMetadata`。
3. 校验 `metadata.Type == "image"`。
4. 校验 `localPath` 必须位于 `config.ConfigDir()/temp/ai-images/` 下。
5. 校验文件扩展名和 mime type 是允许的图片类型。
6. 读取文件并返回 `data:{mime};base64,{content}`。
7. 如果已有 `uploadedUrl`，前端可优先使用远程 URL，不必读取本地。

这是比 `GetFileThumbnail(localPath)` 更安全的方案。

### 6. 保存到相册

新增：

```go
func (a *App) SaveAiImageToAlbum(messageId string) (*services.PhotoDTO, error) {
    return a.EditorAi.SaveImageToAlbum(messageId, a.Upload)
}
```

`SaveImageToAlbum` 实施要点：

- 只接受 `metadata.Type == "image"` 的 assistant 消息。
- 已有 `photoId` 时直接返回“已保存到相册”，不要重复上传。
- `localPath` 必须通过同样的临时目录校验。
- 调用 `uploadService.UploadFile(localPath, settings, "", nil)` 后必须检查：

```go
if err != nil {
    return nil, err
}
if result == nil || !result.Success || result.Photo == nil {
    if result != nil && result.Error != "" {
        return nil, errors.New(result.Error)
    }
    return nil, errors.New("保存到相册失败")
}
```

- 更新 `metadata.UploadedURL` 和 `metadata.PhotoID`。
- 建议 `UploadSettings`：

```go
settings := UploadSettings{
    Title:      truncateTitle("AI 生成 - " + metadata.Prompt, 80),
    ShowFlag:   true,
    OriginFlag: "desktop-ai",
}
```

注意：当前 `UploadFile()` 写死 `origin_flag=desktop`，如果要标注 AI 来源，需要同步改 `UploadFile()` 支持 `settings.OriginFlag` 覆盖。

### 7. 历史消息处理

当前 `buildHistoryMessages()` 会把最近 assistant 内容直接放回上下文。图片消息的 content 通常只是“已生成图片”，价值低。

建议：

- 文本生成路径构建 history 时：
  - 普通文本消息照旧。
  - `metadata.type == image` 的助手消息替换为：`[已生成图片：{prompt}]`。
  - 或直接跳过图片 assistant 消息。
- 生图路径不需要带历史上下文，初期只使用当前 prompt，避免图片 API 不支持 chat history。

---

## SSE 协议调整

保持现有 `chunk/done/error`，新增可选 `status`。

文本生成：

```text
event: chunk
data: "文本片段"

event: done
data: "完整文本"
```

图片生成：

```text
event: status
data: "正在生成图片..."

event: status
data: "正在保存本地文件..."

event: done
data: {"messageId":"cxxx","content":"已生成图片"}
```

前端兼容策略：

- `chunk`：沿用现有 streaming markdown。
- `status`：更新 `streamingContent` 或单独 `streamingStatus`。
- `done`：不依赖 data 渲染图片，统一刷新会话。
- `error`：toast 后刷新会话，展示 failed 消息。

---

## 前端实现方案

### 1. 输入区增加生图模式

在 `AiAssistantPage.tsx` 输入区增加：

- 生图开关按钮，例如 `Image` 图标或“生图”。
- 生图模式下显示图片模型选择器和尺寸选择器。
- 文本模式下继续显示 chat 模型选择器。

请求体：

```ts
body: JSON.stringify({
  conversationId,
  action: 'custom',
  prompt,
  model: selectedModel || undefined,
  generateImage: imageMode,
  imageModel: imageMode ? selectedImageModel || undefined : undefined,
  imageSize: imageMode ? selectedImageSize : undefined,
  images: !imageMode && images.length > 0 ? images : undefined,
})
```

初期建议：生图模式禁用图片附件，避免混入“图生图”需求。

### 2. 拆出消息渲染组件

新增：

- `desktop/frontend/src/components/ai/MessageContent.tsx`
- `desktop/frontend/src/components/ai/ImagePreview.tsx`

`MessageBubble` 负责气泡、复制、引用；`MessageContent` 负责内容类型判断。

类型守卫：

```ts
interface AiImageMetadata {
  type: 'image'
  localPath?: string
  uploadedUrl?: string | null
  photoId?: string | null
  prompt: string
  provider?: string
  model?: string
  size?: string
  mimeType?: string
  revisedPrompt?: string
  generatedAt?: string
  source?: string
}

function isAiImageMetadata(value: unknown): value is AiImageMetadata {
  return Boolean(value && typeof value === 'object' && (value as AiImageMetadata).type === 'image')
}
```

### 3. 图片预览组件

加载策略：

1. `metadata.uploadedUrl` 存在：直接显示线上 URL。
2. 否则调用 `go().GetAiImageDataURL(message.id)`。
3. 失败时显示“本地图片文件不存在或已清理”。

按钮：

- 未保存：显示“保存到相册”。
- 保存中：显示 loading。
- 已保存：显示“已保存到相册”。
- 保存成功后刷新当前会话。

### 4. 引用和复制策略

- 复制图片消息：复制 prompt 和保存状态，不复制 data URL。
- 引用图片消息：引用文本建议为 `[图片：{prompt}]`，避免把“已生成图片”作为上下文。

---

## 清理策略

初期只实现安全底座，不急着做设置页 UI。

后端方法：

```go
func (s *EditorAiService) CleanupTempImages(daysOld int) error
```

建议规则：

- 默认保留 30 天。
- 启动时可调用一次，失败只写日志不阻断启动。
- 已保存到相册的图片可以继续保留到过期清理，不要保存后立即删除，避免历史消息短时间内无法预览。

后续再在设置页增加“清理 AI 临时图片”。

---

## 分阶段实施

### 阶段 1：后端最小闭环

1. 扩展 `AIConfig` / `AIProviderConfig`，增加图片模型配置。
2. 增加 `config.ConfigDir()`。
3. 扩展 `EditorAiGenerateInput`。
4. 实现 `AiImageMetadata`、临时目录、图片 API 调用和本地保存。
5. 在 `GenerateStream()` 增加 `GenerateImage` 分支。
6. 实现 `GetAiImageDataURL()`。
7. 实现 `SaveAiImageToAlbum()`，正确处理 `UploadResult`。
8. 调整 `buildHistoryMessages()` 对图片消息的处理。

### 阶段 2：前端最小体验

1. 输入区增加生图模式开关。
2. 增加图片模型和尺寸选择。
3. 拆出 `MessageContent`。
4. 实现 `ImagePreview`。
5. 实现“保存到相册”按钮。
6. SSE 增加 `status` 事件处理。
7. 刷新会话后清理 streaming 状态，避免闪烁。

### 阶段 3：类型与绑定

1. 运行 Wails 绑定生成。
2. 同步 `desktop/frontend/src/lib/api/types.ts`。
3. 检查前端 `window.go.main.App.*` 方法名。
4. 运行 desktop frontend 类型检查和构建。

### 阶段 4：验证

1. 无图片模型配置时，前端生图入口给出明确提示。
2. 文本对话不受影响。
3. 生图成功后，消息可刷新恢复显示。
4. 关闭应用重开后，本地图片仍可显示。
5. 删除/清理本地文件后，消息展示友好错误。
6. 保存到相册成功后 `uploadedUrl/photoId` 更新。
7. 上传失败、重复照片、未登录服务器时都能正确提示。
8. 多次连续生图不会覆盖文件。

---

## 不建议首版实现的内容

以下能力建议放到后续版本，避免首版范围失控：

- 图生图 / 图片变体。
- 批量生成多张图。
- 图片裁剪、滤镜、编辑器。
- 成本限额和内容审核。
- 保存后立即删除本地文件。
- 设置页临时文件管理 UI。

---

## 发布检查清单

- [ ] `config.json` 示例补充 `default_image_model` 和 `image_models`。
- [ ] 未配置图片模型时不会误用文本模型。
- [ ] `GenerateImage=false` 时文本对话行为无变化。
- [ ] `GetAiImageDataURL` 只能读取受控临时目录内图片。
- [ ] `SaveAiImageToAlbum` 正确处理 `UploadResult.Error`。
- [ ] Wails 绑定已重新生成。
- [ ] `desktop/frontend` 构建通过。
- [ ] 至少手动验证一次：生成图片 → 重启应用 → 预览图片 → 保存到相册。

---

## 建议配置示例

```json
{
  "ai": {
    "providers": {
      "openai": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "sk-...",
        "models": ["gpt-4o-mini", "gpt-4o"],
        "image_models": ["dall-e-3"]
      },
      "custom": {
        "base_url": "https://your-ai-service.com/v1",
        "api_key": "...",
        "models": ["custom-chat-model"],
        "image_models": ["custom-image-model"]
      }
    },
    "default_model": "openai:gpt-4o-mini",
    "default_image_model": "openai:dall-e-3"
  }
}
```

---

## 预计工作量

| 阶段 | 内容 | 预计时间 |
| --- | --- | --- |
| 阶段 1 | 后端最小闭环 | 4-6 小时 |
| 阶段 2 | 前端最小体验 | 3-4 小时 |
| 阶段 3 | 类型与绑定 | 0.5-1 小时 |
| 阶段 4 | 验证与修正 | 2-3 小时 |
| 合计 | 可用首版 | 9.5-14 小时 |
