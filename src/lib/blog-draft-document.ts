export function createBlogDraftDocumentId() {
  return crypto.randomUUID()
}

export function rotateBlogDraftDocumentId(currentDraftDocumentId: string) {
  let nextDraftDocumentId = createBlogDraftDocumentId()
  while (nextDraftDocumentId === currentDraftDocumentId) {
    nextDraftDocumentId = createBlogDraftDocumentId()
  }
  return nextDraftDocumentId
}

export function resolveBlogDocumentId(blogId: string | undefined, draftDocumentId: string) {
  return blogId ?? draftDocumentId
}
