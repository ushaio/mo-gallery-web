import { getStoryImageMatchCandidates, getStoryMarkdownImageUrls } from '../src/lib/story-rich-content'

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const content = [
  '<p>intro</p>',
  '<img src="https://cdn.example.com/uploads/story/photo-main.jpg" alt="main" width="480">',
  '![thumb](/uploads/story/photo-thumb.jpg)',
].join('\n')

const photoCandidates = getStoryImageMatchCandidates({
  url: '/uploads/story/photo-main.jpg',
  thumbnailUrl: '/uploads/story/photo-thumb.jpg',
  cdnDomain: 'https://cdn.example.com',
})

const parsedUrls = getStoryMarkdownImageUrls(content)

assert(parsedUrls.has('https://cdn.example.com/uploads/story/photo-main.jpg'), 'should keep absolute image URLs from editor content')
assert(parsedUrls.has('/uploads/story/photo-thumb.jpg'), 'should parse relative markdown image URLs from editor content')
assert(
  Array.from(photoCandidates).some((candidate) => parsedUrls.has(candidate)),
  'photo candidates should match inserted editor image URLs even when editor content uses CDN or thumbnail URLs'
)

console.log('story-photo-panel regression: ok')
