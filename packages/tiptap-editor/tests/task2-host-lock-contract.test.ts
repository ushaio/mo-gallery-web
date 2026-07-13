import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createBlogDraftDocumentId as createDesktopBlogDraftDocumentId,
  resolveBlogDocumentId as resolveDesktopBlogDocumentId,
  rotateBlogDraftDocumentId as rotateDesktopBlogDraftDocumentId,
} from '../../../desktop/frontend/src/lib/blog-draft-document'

function readWorkspaceSource(relativePath: string) {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8')
}

function readOpeningTag(source: string, componentName: string) {
  const start = source.indexOf(`<${componentName}`)
  assert.notEqual(start, -1, `${componentName} is rendered by its host`)
  const end = source.indexOf('/>', start)
  assert.notEqual(end, -1, `${componentName} opening tag is complete`)
  return source.slice(start, end + 2)
}

const desktopBlogSource = readWorkspaceSource('desktop/frontend/src/pages/admin-logs/BlogTab.tsx')
assert.doesNotMatch(desktopBlogSource, /currentBlog\.id\s*\|\|\s*['"]new['"]/, 'desktop blog never scopes drafts with literal new')
assert.match(desktopBlogSource, /documentId=\{blogDocumentId\}/, 'desktop blog passes stable document identity')
assert.match(desktopBlogSource, /setDraftDocumentId\(rotateBlogDraftDocumentId\)/, 'desktop blog rotates identity in its new-blog handler')
assert.match(desktopBlogSource, /documentKind="blog"/, 'desktop blog passes document kind')
assert.match(desktopBlogSource, /onAiTaskLockChange=\{setIsAiTaskLocked\}/, 'desktop blog observes lock state')
assert.match(desktopBlogSource, /aiOptions=\{\{[\s\S]*?enabled:[\s\S]*?token/, 'desktop blog enables AI when runtime credentials permit')
assert.match(desktopBlogSource, /disabled=\{isAiTaskLocked/, 'desktop blog disables host controls while locked')

const desktopStorySource = readWorkspaceSource('desktop/frontend/src/pages/admin-logs/stories/StoryEditorView.tsx')
assert.match(desktopStorySource, /onAiTaskLockChange=\{setIsAiTaskLocked\}/, 'desktop story observes lock state')
assert.ok(readOpeningTag(desktopStorySource, 'StoryPhotoPanel').includes('disabled={isAiTaskLocked}'), 'desktop story passes lock state to photo panel')
assert.doesNotMatch(desktopStorySource, /guardedPhotoPanelActions/, 'desktop host does not maintain a parallel photo action inventory')

const webStorySource = readWorkspaceSource('src/app/admin/logs/stories/StoryEditorView.tsx')
assert.ok(readOpeningTag(webStorySource, 'StoryPhotoPanel').includes('disabled={isAiTaskLocked}'), 'web story passes lock state to photo panel')

const photoPanelSource = readWorkspaceSource('src/components/admin/StoryPhotoPanel.tsx')
assert.match(photoPanelSource, /disabled:\s*boolean/, 'photo panel exposes an explicit disabled contract')
assert.match(photoPanelSource, /if \(disabled\)/, 'photo panel mutation handlers guard disabled state')
assert.match(photoPanelSource, /aria-disabled=\{disabled\}/, 'photo panel exposes disabled state to assistive technology')

const desktopPhotoPanelSource = readWorkspaceSource('desktop/frontend/src/components/admin/StoryPhotoPanel.tsx')
assert.match(desktopPhotoPanelSource, /disabled:\s*boolean/, 'desktop photo panel exposes the same disabled contract')
assert.match(desktopPhotoPanelSource, /if \(disabled\)/, 'desktop photo panel guards mutations internally')
assert.match(desktopPhotoPanelSource, /aria-disabled=\{disabled\}/, 'desktop photo panel exposes disabled state to assistive technology')

const webBlogSource = readWorkspaceSource('src/app/admin/logs/BlogTab.tsx')
assert.match(webBlogSource, /setDraftDocumentId\(rotateBlogDraftDocumentId\)/, 'web blog rotates identity for every new draft lifecycle')

const desktopDraftId = createDesktopBlogDraftDocumentId()
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

console.log('✓ Task 2 host identity and disabled wiring contracts')
