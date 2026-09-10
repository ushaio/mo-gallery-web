import assert from 'node:assert/strict'
import {
  createBlogDraftDocumentId as createDesktopBlogDraftDocumentId,
  resolveBlogDocumentId as resolveDesktopBlogDocumentId,
  rotateBlogDraftDocumentId as rotateDesktopBlogDraftDocumentId,
} from '../../../desktop/frontend/src/lib/blog-draft-document'
import { persistDesktopBlog } from '../../../desktop/frontend/src/lib/desktop-blog-save'
import type { BlogDto } from '../../api-client/src/types'
import {
  blockNarrativeAiInteraction,
  guardNarrativeAiMutation,
} from '../src/tiptap-editor/ai-task-mutation-guard'

const desktopDraftId = createDesktopBlogDraftDocumentId()
const savedBlog: BlogDto = {
  id: 'persisted-blog', title: 'Draft', editorType: 'milkdown', contentEditorTypes: ['milkdown'],
  tiptapContent: '', milkContent: 'Draft body', category: '未分类', tags: '', isPublished: false,
  createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z',
}
const rotatedDesktopDraftId = rotateDesktopBlogDraftDocumentId(desktopDraftId)
assert.notEqual(rotatedDesktopDraftId, desktopDraftId, 'desktop starts each distinct new-blog lifecycle with a fresh identity')
assert.equal(
  resolveDesktopBlogDocumentId(undefined, rotatedDesktopDraftId),
  rotatedDesktopDraftId,
  'desktop rerenders within one unsaved draft keep the lifecycle identity stable',
)
assert.equal(
  resolveDesktopBlogDocumentId('persisted-blog', rotatedDesktopDraftId),
  'persisted-blog',
  'desktop persisted blogs use their real identity',
)

{
  const calls: string[] = []
  const persisted = await persistDesktopBlog({
    api: {
      UpdateBlog: async () => {
        calls.push('update')
        return savedBlog
      },
      CreateBlog: async () => {
        calls.push('create')
        return savedBlog
      },
    },
    data: { title: 'Draft' },
  })

  assert.equal(persisted.id, 'persisted-blog', 'create returns the persisted document identity')
  assert.equal(persisted.milkContent, 'Draft body', 'create returns saved content for in-place reconciliation')
  assert.deepEqual(
    calls,
    ['create'],
    'creating the document does not reload the list or issue an extra save',
  )
}

{
  const calls: string[] = []
  const persisted = await persistDesktopBlog({
    api: {
      UpdateBlog: async (blogId) => {
        calls.push(`update:${blogId}`)
        return { ...savedBlog, id: blogId }
      },
      CreateBlog: async () => {
        throw new Error('existing blogs must not be recreated')
      },
    },
    blogId: 'existing-blog',
    data: { title: 'Saved' },
  })

  assert.equal(persisted.id, 'existing-blog', 'updates preserve the persisted document identity')
  assert.deepEqual(calls, ['update:existing-blog'], 'updates do not run the new-draft handoff')
}

{
  const mutations: string[] = []
  const unlockedMutation = guardNarrativeAiMutation(false, (value: string) => mutations.push(value))
  const lockedMutation = guardNarrativeAiMutation(true, (value: string) => mutations.push(value))

  unlockedMutation('allowed')
  lockedMutation('blocked')

  assert.deepEqual(mutations, ['allowed'], 'photo-panel mutation callbacks are inert while the AI lock is active')
}

{
  const interactionEffects: string[] = []
  const event = {
    preventDefault: () => interactionEffects.push('prevented'),
    stopPropagation: () => interactionEffects.push('stopped'),
  }

  assert.equal(blockNarrativeAiInteraction(false, event), false, 'unlocked interactions continue normally')
  assert.deepEqual(interactionEffects, [], 'unlocked interactions are not intercepted')
  assert.equal(blockNarrativeAiInteraction(true, event), true, 'locked interactions are intercepted')
  assert.deepEqual(
    interactionEffects,
    ['prevented', 'stopped'],
    'locked desktop photo-panel interactions are cancelled before reaching mutation handlers',
  )
}

console.log('✓ Task 2 host lock and blog identity behavior')
