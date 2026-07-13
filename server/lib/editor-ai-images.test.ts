import assert from 'node:assert/strict'

import {
  saveEditorAiMessageImageCore,
  type EditorAiImageSaverDependencies,
} from './editor-ai-images'
import { EditorAiNotFoundError } from './editor-ai-repository'

type FixtureOptions = {
  message?: { id: string; content: string; metadata: unknown } | null
  transactionError?: Error
  cleanupFailures?: Set<string>
  remoteImageError?: Error
}

function createFixture(options: FixtureOptions = {}) {
  const calls: string[] = []
  const uploads: Array<{ filename: string; size: number }> = []
  const metadataUpdates: Array<{ messageId: string; metadata: Record<string, unknown> }> = []
  const message = options.message === undefined
    ? {
        id: 'resolved-message-id',
        content: 'Generated image',
        metadata: { type: 'image', uploadedUrl: 'https://images.example/result.png' },
      }
    : options.message

  const dependencies: EditorAiImageSaverDependencies = {
    findOwnedMessage: async (userId, messageId) => {
      calls.push(`ownedLookup:${userId}:${messageId}`)
      return message
    },
    getStorage: async () => {
      calls.push('getStorage')
      return {
        provider: 's3',
        storage: {
          validateConfig: () => calls.push('validateStorage'),
          download: async (key) => {
            calls.push(`download:${key}`)
            return Buffer.from('stored-image')
          },
          upload: async (file, thumbnail) => {
            calls.push('upload')
            uploads.push(
              { filename: file.filename, size: file.buffer.length },
              { filename: thumbnail.filename, size: thumbnail.buffer.length },
            )
            return {
              url: '/photos/original.png',
              key: 'photos/original.png',
              thumbnailUrl: '/photos/thumb.avif',
              thumbnailKey: 'photos/thumb.avif',
            }
          },
          delete: async (key) => {
            calls.push(`cleanup:${key}`)
            if (options.cleanupFailures?.has(key)) throw new Error(`cleanup failed: ${key}`)
          },
        },
      }
    },
    loadRemoteImage: async (url, loadOptions) => {
      calls.push(`load:${url}:${loadOptions.maxBytes}`)
      if (options.remoteImageError) throw options.remoteImageError
      return {
        buffer: Buffer.from('remote-image'),
        contentType: 'image/png',
        finalUrl: url,
      }
    },
    inspectImage: async (buffer) => {
      calls.push(`inspect:${buffer.toString()}`)
      return {
        metadata: { width: 640, height: 480, format: 'png' },
        thumbnailBuffer: Buffer.from('thumbnail'),
      }
    },
    randomName: () => 'fixed-name',
    transaction: async (work) => {
      calls.push('transaction')
      if (options.transactionError) throw options.transactionError
      return work({
        createPhoto: async (data) => {
          calls.push(`createPhoto:${data.storageKey}`)
          return { id: 'photo-1', url: data.url, thumbnailUrl: data.thumbnailUrl }
        },
        updateMessageMetadata: async (messageId, metadata) => {
          calls.push(`updateMessage:${messageId}`)
          metadataUpdates.push({ messageId, metadata })
        },
      })
    },
  }

  return { calls, dependencies, metadataUpdates, uploads }
}

async function testInaccessibleMessagesStopAtOwnedLookup() {
  for (const label of ['missing', 'other-owner', 'legacy-null']) {
    const { calls, dependencies } = createFixture({ message: null })
    await assert.rejects(
      saveEditorAiMessageImageCore(dependencies, 'user-a', label, 'https://images.example/result.png'),
      (error) => error instanceof EditorAiNotFoundError && error.message.includes('message'),
    )
    assert.deepEqual(calls, [`ownedLookup:user-a:${label}`])
  }
}

async function testAlreadySavedReturnsWithoutStorageWork() {
  const { calls, dependencies } = createFixture({
    message: {
      id: 'saved-message',
      content: 'Saved',
      metadata: {
        type: 'image',
        uploadedUrl: 'https://images.example/result.png',
        photoId: 'existing-photo',
      },
    },
  })

  assert.deepEqual(
    await saveEditorAiMessageImageCore(
      dependencies,
      'user-a',
      'requested-message',
      'https://images.example/result.png',
    ),
    { photoId: 'existing-photo', alreadySaved: true },
  )
  assert.deepEqual(calls, ['ownedLookup:user-a:requested-message'])
}

async function testUnreferencedImageStopsBeforeStorageWork() {
  const { calls, dependencies } = createFixture()

  await assert.rejects(
    saveEditorAiMessageImageCore(
      dependencies,
      'user-a',
      'requested-message',
      'https://images.example/not-in-message.png',
    ),
    /图片不属于该消息/,
  )
  assert.deepEqual(calls, ['ownedLookup:user-a:requested-message'])
}

async function testOwnedRemoteImageSavesUsingResolvedMessageId() {
  const { calls, dependencies, metadataUpdates, uploads } = createFixture()
  const result = await saveEditorAiMessageImageCore(
    dependencies,
    'user-a',
    'requested-message',
    'https://images.example/result.png',
  )

  assert.deepEqual(result, {
    photoId: 'photo-1',
    url: '/photos/original.png',
    thumbnailUrl: '/photos/thumb.avif',
    alreadySaved: false,
  })
  assert.deepEqual(calls, [
    'ownedLookup:user-a:requested-message',
    `load:https://images.example/result.png:${20 * 1024 * 1024}`,
    'getStorage',
    'validateStorage',
    'inspect:remote-image',
    'upload',
    'transaction',
    'createPhoto:photos/original.png',
    'updateMessage:resolved-message-id',
  ])
  assert.deepEqual(uploads, [
    { filename: 'fixed-name.png', size: Buffer.byteLength('remote-image') },
    { filename: 'thumb-fixed-name.avif', size: Buffer.byteLength('thumbnail') },
  ])
  assert.deepEqual(metadataUpdates, [{
    messageId: 'resolved-message-id',
    metadata: {
      type: 'image',
      uploadedUrl: 'https://images.example/result.png',
      photoId: 'photo-1',
    },
  }])
}

async function testDataUrlDoesNotFetchRemoteSource() {
  const imageUrl = `data:image/png;base64,${Buffer.from('data-image').toString('base64')}`
  const { calls, dependencies, metadataUpdates } = createFixture({
    message: {
      id: 'data-message',
      content: 'Data image',
      metadata: { type: 'image', uploadedUrl: imageUrl },
    },
  })

  await saveEditorAiMessageImageCore(dependencies, 'user-a', 'data-message', imageUrl)
  assert.equal(calls.some((call) => call.startsWith('load:')), false)
  assert.equal(calls.includes('inspect:data-image'), true)
  assert.equal(metadataUpdates[0]?.metadata.uploadedUrl, imageUrl)
  assert.equal('buffer' in (metadataUpdates[0]?.metadata ?? {}), false)
}

async function testStoredObjectDownloadsWithoutRemoteFetch() {
  const { calls, dependencies } = createFixture({
    message: {
      id: 'stored-message',
      content: 'Stored image',
      metadata: {
        type: 'image',
        uploadedUrl: '/uploads/generated/result.png',
        storageKey: 'generated/result.png',
      },
    },
  })

  await saveEditorAiMessageImageCore(
    dependencies,
    'user-a',
    'stored-message',
    '/uploads/generated/result.png',
  )
  assert.equal(calls.includes('download:generated/result.png'), true)
  assert.equal(calls.some((call) => call.startsWith('load:')), false)
  assert.equal(calls.includes('inspect:stored-image'), true)
}

async function testUnsafeOwnedRemoteImageStopsBeforeInspectionAndUpload() {
  const { calls, dependencies } = createFixture({
    remoteImageError: new Error('Remote image host must resolve only to public IP addresses'),
  })

  await assert.rejects(
    saveEditorAiMessageImageCore(
      dependencies,
      'user-a',
      'requested-message',
      'https://images.example/result.png',
    ),
    /public IP addresses/,
  )
  assert.deepEqual(calls, [
    'ownedLookup:user-a:requested-message',
    `load:https://images.example/result.png:${20 * 1024 * 1024}`,
  ])
}

async function testTransactionFailureCleansEveryUploadAndPreservesPrimaryError() {
  const primaryError = new Error('transaction failed')
  const { calls, dependencies } = createFixture({
    transactionError: primaryError,
    cleanupFailures: new Set(['photos/original.png']),
  })

  await assert.rejects(
    saveEditorAiMessageImageCore(
      dependencies,
      'user-a',
      'requested-message',
      'https://images.example/result.png',
    ),
    (error) => error === primaryError,
  )
  assert.deepEqual(calls.slice(-3), [
    'transaction',
    'cleanup:photos/original.png',
    'cleanup:photos/thumb.avif',
  ])
}

async function main() {
  await testInaccessibleMessagesStopAtOwnedLookup()
  await testAlreadySavedReturnsWithoutStorageWork()
  await testUnreferencedImageStopsBeforeStorageWork()
  await testOwnedRemoteImageSavesUsingResolvedMessageId()
  await testDataUrlDoesNotFetchRemoteSource()
  await testStoredObjectDownloadsWithoutRemoteFetch()
  await testUnsafeOwnedRemoteImageStopsBeforeInspectionAndUpload()
  await testTransactionFailureCleansEveryUploadAndPreservesPrimaryError()
  console.log('editor AI image saver runtime tests passed')
}

void main()
