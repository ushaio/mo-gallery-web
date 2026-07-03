import 'server-only'

import { Hono } from 'hono'
import { z } from 'zod'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { fetchStoryAiModels } from '~/server/lib/story-ai'
import { StorageProviderFactory, getStorageConfig } from '~/server/lib/storage'
import {
  buildEditorAiHistoryMessages,
  clearEditorAiConversationMessages,
  createEditorAiMessage,
  deleteEditorAiConversation,
  ensureEditorAiConversation,
  getEditorAiConversation,
  getEditorAiConversationWithMessages,
  listEditorAiConversations,
  listEditorAiMessages,
  touchEditorAiConversation,
  updateEditorAiMessage,
} from '~/server/lib/editor-ai'
import { createEditorAiStream } from '~/server/lib/story-ai'

const editorAi = new Hono<{ Variables: AuthVariables }>()

const ConversationScopeSchema = z.object({
  scopeId: z.string().min(1).max(120),
  title: z.string().max(200).optional(),
  systemPrompt: z.string().max(2000).optional(),
})

const ConversationUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  systemPrompt: z.string().max(2000).optional().nullable(),
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
})

editorAi.use('/admin/editor-ai/*', authMiddleware)

editorAi.post('/admin/editor-ai/conversations', async (c) => {
  try {
    const body = await c.req.json()
    const validated = ConversationScopeSchema.parse(body)

    const conversation = await ensureEditorAiConversation({
      scopeId: validated.scopeId,
      title: validated.title,
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
    const scopeId = c.req.query('scopeId')

    const conversations = await listEditorAiConversations(scopeId || undefined)

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
    const conversationId = c.req.param('id')
    const conversation = await getEditorAiConversationWithMessages(conversationId)

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
    const conversationId = c.req.param('id')
    const messages = await listEditorAiMessages(conversationId)

    return c.json({
      success: true,
      data: messages,
    })
  } catch (error) {
    console.error('List editor AI messages error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.patch('/admin/editor-ai/conversations/:id', async (c) => {
  try {
    const conversationId = c.req.param('id')
    const body = await c.req.json()
    const validated = ConversationUpdateSchema.parse(body)

    const conversation = await touchEditorAiConversation(conversationId, validated)

    return c.json({
      success: true,
      data: conversation,
    })
  } catch (error) {
    console.error('Update editor AI conversation error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.delete('/admin/editor-ai/conversations/:id', async (c) => {
  try {
    const conversationId = c.req.param('id')
    await deleteEditorAiConversation(conversationId)

    return c.json({
      success: true,
    })
  } catch (error) {
    console.error('Delete editor AI conversation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

editorAi.post('/admin/editor-ai/conversations/:id/clear', async (c) => {
  try {
    const conversationId = c.req.param('id')
    const conversation = await clearEditorAiConversationMessages(conversationId)

    return c.json({
      success: true,
      data: conversation,
    })
  } catch (error) {
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

    const storageConfig = await getStorageConfig()
    const storage = StorageProviderFactory.create(storageConfig)

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

editorAi.post('/admin/editor-ai/generate', async (c) => {
  try {
    const body = await c.req.json()
    const validated = GenerateEditorAiSchema.parse(body)
    const resolvedAction = validated.action ?? 'custom'

    const [historyMessages, conversation] = await Promise.all([
      buildEditorAiHistoryMessages(validated.conversationId),
      getEditorAiConversation(validated.conversationId),
    ])
    const userMessage = await createEditorAiMessage({
      conversationId: validated.conversationId,
      role: 'user',
      content: validated.prompt?.trim() || validated.selectedText?.trim() || validated.currentParagraph?.trim() || resolvedAction,
      status: 'completed',
      model: validated.model,
      action: resolvedAction,
      metadata: {
        title: validated.title,
        prompt: validated.prompt,
        selectedText: validated.selectedText,
        currentParagraph: validated.currentParagraph,
        contextBefore: validated.contextBefore,
        contextAfter: validated.contextAfter,
        images: validated.images,
      },
    })

    const assistantMessage = await createEditorAiMessage({
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

    const stream = await createEditorAiStream({
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
        await updateEditorAiMessage(assistantMessage.id, {
          content,
          status: 'completed',
          model: activeModel,
          metadata: {
            userMessageId: userMessage.id,
          },
        })
        await touchEditorAiConversation(validated.conversationId, {
          title: validated.title,
          lastModel: activeModel,
        })
      },
      onError: async (message) => {
        await updateEditorAiMessage(assistantMessage.id, {
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
    console.error('Editor AI generate error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

editorAi.get('/admin/editor-ai/models', async (c) => {
  try {
    const data = await fetchStoryAiModels()
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

export default editorAi
