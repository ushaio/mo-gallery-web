import assert from 'node:assert/strict'

import { generateStoryAiImage } from './story-ai'

const originalFetch = globalThis.fetch
const originalEnv = {
  baseUrl: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
  imageModel: process.env.AI_IMAGE_MODEL,
}

async function main() {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  process.env.AI_BASE_URL = 'https://provider.example/v1'
  process.env.AI_API_KEY = 'test-key'
  process.env.AI_MODEL = 'chat-model'
  process.env.AI_IMAGE_MODEL = 'gpt-image-2'
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://provider.example/v1/images/generations')
    assert.equal(init?.method, 'POST')
    return new Response(JSON.stringify({
      created: 1710000000,
      data: [{ b64_json: `data:image/png;base64,${png.toString('base64')}` }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const result = await generateStoryAiImage({ prompt: 'test image' })
  assert.deepEqual(result.buffer, png)
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.model, 'gpt-image-2')
  console.log('story AI image compatibility tests passed')
}

main().finally(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    const envKey = key === 'baseUrl' ? 'AI_BASE_URL' : key === 'apiKey' ? 'AI_API_KEY' : key === 'model' ? 'AI_MODEL' : 'AI_IMAGE_MODEL'
    if (value === undefined) delete process.env[envKey]
    else process.env[envKey] = value
  }
})
