import { normalizeLibraryPhotos } from './PhotoTrayLibrary'

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => (key === 'mo-gallery-server' ? 'https://gallery.example.com' : null),
  },
  configurable: true,
})

const [asset] = normalizeLibraryPhotos({
  data: [
    {
      id: 'photo-1',
      title: 'Photo 1',
      thumbnailUrl: '/uploads/thumb.jpg',
      url: '/uploads/full.jpg',
    },
  ],
})

if (asset?.previewUrl !== 'https://gallery.example.com/uploads/thumb.jpg') {
  throw new Error(`Expected resolved preview URL, got ${asset?.previewUrl}`)
}

if (asset.fullUrl !== 'https://gallery.example.com/uploads/full.jpg') {
  throw new Error(`Expected resolved full URL, got ${asset.fullUrl}`)
}
