import 'server-only'

import { Hono } from 'hono'
import { z } from 'zod'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { fetchStoryAiModels } from '~/server/lib/story-ai'
import {
  buildEditorAiHistoryMessages,
  createEditorAiMessage,
  deleteEditorAiConversation,
  ensureEditorAiConversation,
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
})

const ConversationListSchema = z.object({
  scopeId: z.string().min(1).max(120),
})

const GenerateEditorAiSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(['rewrite', 'expand', 'shorten', 'continue', 'summarize', 'custom']),
  model: z.string().max(200).optional(),
  prompt: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
  selectedText: z.string().max(6000).optional(),
  currentParagraph: z.string().max(4000).optional(),
  contextBefore: z.string().max(4000).optional(),
  contextAfter: z.string().max(4000).optional(),
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
    const query = ConversationListSchema.parse({
      scopeId: c.req.query('scopeId'),
    })

    const conversations = await listEditorAiConversations(query.scopeId)

    return c.json({
      success: true,
      data: conversations,
    })
  } catch (error) {
    console.error('List editor AI conversations error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
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

editorAi.post('/admin/editor-ai/generate', async (c) => {
  try {
    const body = await c.req.json()
    const validated = GenerateEditorAiSchema.parse(body)

    const historyMessages = await buildEditorAiHistoryMessages(validated.conversationId)
    const userMessage = await createEditorAiMessage({
      conversationId: validated.conversationId,
      role: 'user',
      content: validated.prompt?.trim() || validated.selectedText?.trim() || validated.currentParagraph?.trim() || validated.action,
      status: 'completed',
      model: validated.model,
      action: validated.action,
      metadata: {
        title: validated.title,
        selectedText: validated.selectedText,
        currentParagraph: validated.currentParagraph,
        contextBefore: validated.contextBefore,
        contextAfter: validated.contextAfter,
      },
    })

    const assistantMessage = await createEditorAiMessage({
      conversationId: validated.conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: validated.model,
      action: validated.action,
      metadata: {
        userMessageId: userMessage.id,
      },
    })

    const stream = await createEditorAiStream({
      action: validated.action,
      model: validated.model,
      prompt: validated.prompt,
      title: validated.title,
      selectedText: validated.selectedText,
      currentParagraph: validated.currentParagraph,
      contextBefore: validated.contextBefore,
      contextAfter: validated.contextAfter,
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
