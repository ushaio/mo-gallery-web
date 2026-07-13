import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import type { EditorAiEndpoint } from '../../types'

export function createVercelAiLanguageModel(
  endpoint: EditorAiEndpoint,
  modelId: string,
): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'mo-gallery',
    baseURL: endpoint.baseURL.replace(/\/+$/, ''),
    ...(endpoint.apiKey ? { apiKey: endpoint.apiKey } : {}),
    ...(endpoint.headers ? { headers: endpoint.headers } : {}),
    includeUsage: false,
  })

  return provider.chatModel(modelId)
}
