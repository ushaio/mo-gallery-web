import 'server-only'

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import {
  buildConversationTitleMessages,
  editorAiMessageMetadataSchema,
  editorAiTaskStateUpdateSchema,
  normalizeConversationTitle,
} from '@mo-gallery/ai-agent'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { createEditorAiStream, fetchStoryAiModels, generateStoryAiImage, generateStoryAiText, getStoryAiEnvConfig } from '~/server/lib/story-ai'
import { StorageProviderFactory, getStorageConfig } from '~/server/lib/storage'
import type { StorageProvider } from '~/server/lib/storage'
import {
  buildEditorAiHistoryMessages,
  clearEditorAiConversationMessages,
  createEditorAiMessage,
  deleteEditorAiConversation,
  ensureEditorAiConversation,
  finishEditorAiMessage,
  getEditorAiConversation,
  getEditorAiConversationWithMessages,
  hasEditorAiMessage,
  listEditorAiConversations,
  listEditorAiMessages,
  touchEditorAiConversation,
  updateEditorAiTaskState,
} from '~/server/lib/editor-ai'
import {
  EditorAiInvalidMetadataError,
  EditorAiNotFoundError,
  type EditorAiRepository,
} from '~/server/lib/editor-ai'
import { saveEditorAiMessageImage } from '~/server/lib/editor-ai-images'
import { loadSafeRemoteImage } from '~/server/lib/safe-remote-image'

type EditorAiImageSaveResult = Awaited<ReturnType<typeof saveEditorAiMessageImage>>

export interface EditorAiRouteDependencies {
  repository: EditorAiRepository
  createStream: typeof createEditorAiStream
  fetchModels: typeof fetchStoryAiModels
  generateText: typeof generateStoryAiText
  generateImage: typeof generateStoryAiImage
  loadRemoteImage: typeof loadSafeRemoteImage
  getStorage: () => Promise<StorageProvider>
  saveMessageImage: (
    userId: string,
    messageId: string,
    imageUrl: string,
  ) => Promise<EditorAiImageSaveResult>
}

function editorAiNotFound(c: Context, error: unknown) {
  if (!(error instanceof EditorAiNotFoundError)) return null
  const label = error.resource === 'message' ? 'Message' : 'Conversation'
  return c.json({ error: `${label} not found` }, 404)
}

const defaultRepository: EditorAiRepository = {
  createConversation: ensureEditorAiConversation,
  listConversations: listEditorAiConversations,
  getConversation: getEditorAiConversation,
  getConversationWithMessages: getEditorAiConversationWithMessages,
  deleteConversation: deleteEditorAiConversation,
  clearConversation: clearEditorAiConversationMessages,
  listMessages: listEditorAiMessages,
  buildHistory: buildEditorAiHistoryMessages,
  hasMessage: hasEditorAiMessage,
  appendMessage: createEditorAiMessage,
  finishMessage: finishEditorAiMessage,
  updateTaskState: updateEditorAiTaskState,
  updateConversation: touchEditorAiConversation,
}

const defaultEditorAiRouteDependencies: EditorAiRouteDependencies = {
  repository: defaultRepository,
  createStream: createEditorAiStream,
  fetchModels: fetchStoryAiModels,
  generateText: generateStoryAiText,
  generateImage: generateStoryAiImage,
  loadRemoteImage: loadSafeRemoteImage,
  getStorage: async () => {
    const storageConfig = await getStorageConfig()
    return StorageProviderFactory.create(storageConfig)
  },
  saveMessageImage: async (userId, messageId, imageUrl) => (
    saveEditorAiMessageImage(userId, messageId, imageUrl)
  ),
}

const ConversationScopeSchema = z.object({
  scopeId: z.string().min(1).max(120),
  title: z.string().max(200).optional(),
  systemPrompt: z.string().max(2000).optional(),
})

const ConversationUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  systemPrompt: z.string().max(2000).optional().nullable(),
})

const GenerateConversationTitleSchema = z.object({
  model: z.string().max(200).optional(),
})

const GenerateEditorAiSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(['rewrite', 'expand', 'shorten', 'continue', 'summarize', 'custom']).optional(),
  model: z.string().max(200).optional(),
  prompt: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
  selectedText: z.string().max(6000).optional(),
  currentParagraph: z.string().max(4000).optional(),
  contextBefore: z.string().max(4000).optional(),
  contextAfter: z.string().max(4000).optional(),
  images: z.array(z.string()).max(10).optional(),
  imageKeys: z.array(z.string()).max(10).optional(),
})

const SaveEditorAiImageSchema = z.object({
  imageUrl: z.string().min(1),
}).strict()

const AppendEditorAiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(200_000),
  status: z.enum(['pending', 'streaming', 'completed', 'failed', 'stopped']).optional(),
  model: z.string().max(200).optional(),
  action: z.string().max(80).optional(),
  metadata: editorAiMessageMetadataSchema.optional(),
  error: z.string().max(4000).optional(),
}).strict()

const FinishEditorAiMessageSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    content: z.string().max(200_000),
    model: z.string().max(200).optional(),
    metadata: editorAiMessageMetadataSchema.optional(),
  }).strict(),
  z.object({
    status: z.enum(['failed', 'stopped']),
    content: z.string().max(200_000).optional(),
    model: z.string().max(200).optional(),
    metadata: editorAiMessageMetadataSchema.optional(),
    error: z.string().trim().min(1).max(4000),
  }).strict(),
])

const GenerateEditorAiImageSchema = z.object({
  conversationId: z.string().min(1),
  prompt: z.string().trim().min(1).max(4000),
  title: z.string().max(200).optional(),
  imageModel: z.string().max(200).optional(),
  imageSize: z.string().max(40).optional(),
  images: z.array(z.string().min(1)).max(16).optional(),
  imageKeys: z.array(z.string().min(1)).max(16).optional(),
})

const MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024

function detectReferenceImageType(buffer: Buffer): string {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  throw new Error('Image editing supports PNG, JPEG, or WebP reference images')
}

function extensionForImageType(contentType: string): string {
  if (contentType === 'image/jpeg') return '.jpg'
  if (contentType === 'image/webp') return '.webp'
  return '.png'
}

function isImageDataUrl(value: string): boolean {
  return /^\s*data:image\//i.test(value)
}

export function createEditorAiRouter(dependencies: EditorAiRouteDependencies) {
  const editorAi = new Hono<{ Variables: AuthVariables }>()

editorAi.use('/admin/editor-ai/*', authMiddleware)

editorAi.post('/admin/editor-ai/conversations', async (c) => {
  try {
    const userId = c.get('user').sub
    const body = await c.req.json()
    const validated = ConversationScopeSchema.parse(body)

    const conversation = await dependencies.repository.createConversation(userId, {
      scopeId: validated.scopeId,
      title: validated.title,
      systemPrompt: validated.systemPrompt,
    })

    return c.json({
      success: true,
      data: conversation,
    })
  } catch (error) {
    console.error('Ensure editor AI conversation error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.get('/admin/editor-ai/conversations', async (c) => {
  try {
    const userId = c.get('user').sub
    const scopeId = c.req.query('scopeId')

    const conversations = await dependencies.repository.listConversations(userId, scopeId || undefined)

    return c.json({
      success: true,
      data: conversations,
    })
  } catch (error) {
    console.error('List editor AI conversations error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.get('/admin/editor-ai/conversations/:id', async (c) => {
  try {
    const userId = c.get('user').sub
    const conversationId = c.req.param('id')
    const conversation = await dependencies.repository.getConversationWithMessages(userId, conversationId)

    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404)
    }

    return c.json({
      success: true,
      data: conversation,
    })
  } catch (error) {
    console.error('Get editor AI conversation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.get('/admin/editor-ai/conversations/:id/messages', async (c) => {
  try {
    const userId = c.get('user').sub
    const conversationId = c.req.param('id')
    const conversation = await dependencies.repository.getConversation(userId, conversationId)
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404)
    }
    const messages = await dependencies.repository.listMessages(userId, conversationId)

    return c.json({
      success: true,
      data: messages,
    })
  } catch (error) {
    console.error('List editor AI messages error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.post('/admin/editor-ai/conversations/:id/messages', async (c) => {
  try {
    const userId = c.get('user').sub
    const input = AppendEditorAiMessageSchema.parse(await c.req.json())
    const message = await dependencies.repository.appendMessage(userId, {
      conversationId: c.req.param('id'),
      ...input,
    })
    return c.json({ success: true, data: message }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    if (error instanceof EditorAiInvalidMetadataError) {
      return c.json({ error: error.message }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Append editor AI message error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.post('/admin/editor-ai/messages/:id/finish', async (c) => {
  try {
    const userId = c.get('user').sub
    const input = FinishEditorAiMessageSchema.parse(await c.req.json())
    const message = await dependencies.repository.finishMessage(userId, c.req.param('id'), input)
    return c.json({ success: true, data: message })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    if (error instanceof EditorAiInvalidMetadataError) {
      return c.json({ error: error.message }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Finish editor AI message error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.patch('/admin/editor-ai/messages/:id/task-state', async (c) => {
  try {
    const userId = c.get('user').sub
    const { state } = editorAiTaskStateUpdateSchema.parse(await c.req.json())
    const message = await dependencies.repository.updateTaskState(userId, c.req.param('id'), state)
    return c.json({ success: true, data: message })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    if (error instanceof EditorAiInvalidMetadataError) {
      return c.json({ error: error.message }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Update editor AI task state error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.post('/admin/editor-ai/conversations/:id/generate-title', async (c) => {
  try {
    const userId = c.get('user').sub
    const conversationId = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const validated = GenerateConversationTitleSchema.parse(body)
    const conversation = await dependencies.repository.getConversation(userId, conversationId)
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404)
    }
    const historyMessages = await dependencies.repository.buildHistory(userId, conversationId, 20)

    const usableMessages = historyMessages.filter((message) => message.content.trim())
    if (usableMessages.length === 0) {
      return c.json({ error: 'AI_CONVERSATION_EMPTY' }, 400)
    }

    const generated = await dependencies.generateText({
      model: validated.model,
      temperature: 0.2,
      messages: buildConversationTitleMessages(usableMessages),
    })
    const title = normalizeConversationTitle(generated)
    if (!title) throw new Error('AI_TITLE_EMPTY')

    const updated = await dependencies.repository.updateConversation(userId, conversationId, { title })
    return c.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Generate editor AI conversation title error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

editorAi.patch('/admin/editor-ai/conversations/:id', async (c) => {
  try {
    const userId = c.get('user').sub
    const conversationId = c.req.param('id')
    const body = await c.req.json()
    const validated = ConversationUpdateSchema.parse(body)

    const conversation = await dependencies.repository.updateConversation(userId, conversationId, validated)

    return c.json({
      success: true,
      data: conversation,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Update editor AI conversation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.delete('/admin/editor-ai/conversations/:id', async (c) => {
  try {
    const userId = c.get('user').sub
    const conversationId = c.req.param('id')
    await dependencies.repository.deleteConversation(userId, conversationId)

    return c.json({
      success: true,
    })
  } catch (error) {
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Delete editor AI conversation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.post('/admin/editor-ai/conversations/:id/clear', async (c) => {
  try {
    const userId = c.get('user').sub
    const conversationId = c.req.param('id')
    const conversation = await dependencies.repository.clearConversation(userId, conversationId)

    return c.json({
      success: true,
      data: conversation,
    })
  } catch (error) {
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Clear editor AI conversation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.post('/admin/editor-ai/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return c.json({ error: 'File is required' }, 400)
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: `Unsupported image type: ${file.type}` }, 400)
    }

    const MAX_SIZE = 20 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return c.json({ error: 'Image too large (max 20MB)' }, 400)
    }

    const storage = await dependencies.getStorage()

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('')
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.png'
    const filename = `${randomName}${ext}`

    const result = await storage.upload({
      buffer,
      filename,
      path: 'ai-images',
      contentType: file.type,
    })

    return c.json({
      success: true,
      data: {
        url: result.url,
        key: result.key,
      },
    })
  } catch (error) {
    console.error('AI image upload error:', error)
    return c.json({ error: 'Upload failed' }, 500)
  }
})

editorAi.post('/admin/editor-ai/messages/:id/images/save', async (c) => {
  try {
    const userId = c.get('user').sub
    const messageId = c.req.param('id')
    const { imageUrl } = SaveEditorAiImageSchema.parse(await c.req.json())
    if (!await dependencies.repository.hasMessage(userId, messageId)) {
      return c.json({ error: 'Message not found' }, 404)
    }
    const result = await dependencies.saveMessageImage(userId, messageId, imageUrl)
    return c.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.issues[0]?.message || 'Invalid request' }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    const message = error instanceof Error ? error.message : '保存图片失败'
    return c.json({ error: message }, 400)
  }
})

editorAi.post('/admin/editor-ai/generate-image', async (c) => {
  let assistantMessageId: string | null = null
  let userId: string | null = null
  try {
    userId = c.get('user').sub
    const validated = GenerateEditorAiImageSchema.parse(await c.req.json())
    const conversation = await dependencies.repository.getConversation(userId, validated.conversationId)
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404)

    let storagePromise: Promise<StorageProvider> | undefined
    const getStorage = () => {
      storagePromise ??= dependencies.getStorage()
      return storagePromise
    }
    const imageUrls = validated.images || []
    const persistedImages = imageUrls.flatMap((url, index) => (
      isImageDataUrl(url)
        ? []
        : [{ url, ...(validated.imageKeys?.[index] ? { key: validated.imageKeys[index] } : {}) }]
    ))
    const imageInputs = await Promise.all(imageUrls.map(async (imageUrl, index) => {
      let buffer: Buffer
      const storageKey = validated.imageKeys?.[index]
      if (storageKey) {
        const storage = await getStorage()
        buffer = await storage.download(storageKey)
      } else if (imageUrl.startsWith('/uploads/')) {
        const storage = await getStorage()
        buffer = await storage.download(imageUrl.slice('/uploads/'.length))
      } else if (/^https?:\/\//i.test(imageUrl)) {
        const remoteImage = await dependencies.loadRemoteImage(imageUrl, {
          maxBytes: MAX_REFERENCE_IMAGE_BYTES,
          signal: AbortSignal.timeout(30_000),
        })
        buffer = remoteImage.buffer
      } else {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i.exec(imageUrl)
        if (!match) throw new Error('Unsupported reference image URL')
        buffer = Buffer.from(match[2], 'base64')
      }
      if (buffer.length === 0 || buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
        throw new Error('Reference image is empty or exceeds 50MB')
      }
      const contentType = detectReferenceImageType(buffer)
      return {
        buffer,
        contentType,
        filename: `reference-${index + 1}${extensionForImageType(contentType)}`,
      }
    }))
    const storage = await getStorage()

    const userMessage = await dependencies.repository.appendMessage(userId, {
      conversationId: validated.conversationId,
      role: 'user',
      content: validated.prompt,
      status: 'completed',
      action: 'custom',
      metadata: persistedImages.length > 0 ? {
        images: persistedImages,
      } : undefined,
    })
    const assistantMessage = await dependencies.repository.appendMessage(userId, {
      conversationId: validated.conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: validated.imageModel,
      action: 'custom',
      metadata: { userMessageId: userMessage.id },
    })
    assistantMessageId = assistantMessage.id

    const generated = await dependencies.generateImage({
      prompt: validated.prompt,
      model: validated.imageModel,
      size: validated.imageSize,
      images: imageInputs,
    })
    const upload = await storage.upload({
      buffer: generated.buffer,
      filename: `${assistantMessage.id}${extensionForImageType(generated.contentType)}`,
      path: 'ai-images',
      contentType: generated.contentType,
    })
    const content = '\u5df2\u751f\u6210\u56fe\u7247'
    await dependencies.repository.finishMessage(userId, assistantMessage.id, {
      status: 'completed',
      content,
      model: generated.model,
      metadata: {
        type: 'image',
        uploadedUrl: upload.url,
        storageKey: upload.key,
        prompt: validated.prompt,
        model: generated.model,
        size: validated.imageSize || '1024x1024',
        mimeType: generated.contentType,
        ...(generated.revisedPrompt ? { revisedPrompt: generated.revisedPrompt } : {}),
        generatedAt: new Date().toISOString(),
        source: 'web-ai',
        userMessageId: userMessage.id,
      },
    })
    await dependencies.repository.updateConversation(userId, validated.conversationId, {
      title: validated.title,
      lastModel: generated.model,
    })
    const updatedConversation = await dependencies.repository.getConversationWithMessages(
      userId,
      validated.conversationId,
    )
    return c.json({ success: true, data: updatedConversation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image generation failed'
    if (assistantMessageId && userId) {
      await dependencies.repository.finishMessage(userId, assistantMessageId, {
        status: 'failed',
        error: message,
      }).catch(() => {})
    }
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Editor AI image generation error:', error)
    const status = message.includes('not configured') ? 503 : 500
    return c.json({ error: message }, status)
  }
})

editorAi.post('/admin/editor-ai/generate', async (c) => {
  try {
    const userId = c.get('user').sub
    const body = await c.req.json()
    const validated = GenerateEditorAiSchema.parse(body)
    const resolvedAction = validated.action ?? 'custom'

    const conversation = await dependencies.repository.getConversation(userId, validated.conversationId)
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404)
    const historyMessages = await dependencies.repository.buildHistory(userId, validated.conversationId)
    const persistedImages = validated.images?.flatMap((url, index) => (
      isImageDataUrl(url)
        ? []
        : [{ url, ...(validated.imageKeys?.[index] ? { key: validated.imageKeys[index] } : {}) }]
    ))
    const userMessage = await dependencies.repository.appendMessage(userId, {
      conversationId: validated.conversationId,
      role: 'user',
      content: validated.prompt?.trim() || validated.selectedText?.trim() || validated.currentParagraph?.trim() || resolvedAction,
      status: 'completed',
      model: validated.model,
      action: resolvedAction,
      metadata: {
        ...(validated.title !== undefined ? { title: validated.title } : {}),
        ...(validated.prompt !== undefined ? { prompt: validated.prompt } : {}),
        ...(validated.selectedText !== undefined ? { selectedText: validated.selectedText } : {}),
        ...(validated.currentParagraph !== undefined ? { currentParagraph: validated.currentParagraph } : {}),
        ...(validated.contextBefore !== undefined ? { contextBefore: validated.contextBefore } : {}),
        ...(validated.contextAfter !== undefined ? { contextAfter: validated.contextAfter } : {}),
        ...(persistedImages !== undefined && persistedImages.length > 0 ? {
          images: persistedImages,
        } : {}),
      },
    })

    const assistantMessage = await dependencies.repository.appendMessage(userId, {
      conversationId: validated.conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: validated.model,
      action: resolvedAction,
      metadata: {
        userMessageId: userMessage.id,
      },
    })

    const stream = await dependencies.createStream({
      action: resolvedAction,
      model: validated.model,
      prompt: validated.prompt,
      title: validated.title,
      selectedText: validated.selectedText,
      currentParagraph: validated.currentParagraph,
      contextBefore: validated.contextBefore,
      contextAfter: validated.contextAfter,
      systemPrompt: conversation?.systemPrompt || undefined,
      images: validated.images,
      historyMessages,
      onComplete: async (content, activeModel) => {
        await dependencies.repository.finishMessage(userId, assistantMessage.id, {
          status: 'completed',
          content,
          model: activeModel,
          metadata: {
            userMessageId: userMessage.id,
          },
        })
        await dependencies.repository.updateConversation(userId, validated.conversationId, {
          title: validated.title,
          lastModel: activeModel,
        })
      },
      onError: async (message) => {
        await dependencies.repository.finishMessage(userId, assistantMessage.id, {
          status: 'failed',
          error: message,
          metadata: {
            userMessageId: userMessage.id,
          },
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    const notFound = editorAiNotFound(c, error)
    if (notFound) return notFound
    console.error('Editor AI generate error:', error)

    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

editorAi.get('/admin/editor-ai/models', async (c) => {
  try {
    const data = await dependencies.fetchModels()
    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Editor AI models error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

// OpenAI 兼容透明代理：编辑器 Agent 模式（浏览器端 @mo-gallery/ai-agent
// 编排）经此访问上游模型，密钥保留在服务端，模型缺省时回填 AI_MODEL
editorAi.post('/admin/editor-ai/proxy/chat/completions', async (c) => {
  try {
    const config = getStoryAiEnvConfig()
    const body = await c.req.json() as Record<string, unknown>
    if (typeof body.model !== 'string' || !body.model.trim()) {
      body.model = config.model
    }

    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: c.req.raw.signal,
    })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  } catch (error) {
    console.error('Editor AI proxy error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

  return editorAi
}

const editorAi = createEditorAiRouter(defaultEditorAiRouteDependencies)
export default editorAi
