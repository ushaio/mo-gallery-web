import type { EditorAiMessageMetadata } from '@mo-gallery/ai-agent'

export function encodeEditorAiMetadataTransport(metadata: EditorAiMessageMetadata): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(metadata)))
}

export function filterPersistableEditorAiImageReferences(images: readonly string[]): string[] {
  return images.flatMap((image) => {
    const normalized = image.trim()
    if (!normalized || normalized.toLowerCase().startsWith('data:image/')) return []
    return [normalized]
  })
}
