import { selectZineProjectAssets } from './PhotoTrayLocalImport'
import type { ZineAsset } from '@/lib/zine/types'

const emptyAssets = selectZineProjectAssets(null)

if (emptyAssets !== selectZineProjectAssets(null)) {
  throw new Error('Expected missing project assets selector to return a stable empty array')
}

const project: { assets: ZineAsset[] } = {
  assets: [
    {
      id: 'asset-1',
      source: 'local',
      fileName: 'local.jpg',
      width: 10,
      height: 10,
      previewUrl: 'blob:preview',
      fullUrl: 'blob:full',
      createdAt: 0,
    },
  ],
}

if (selectZineProjectAssets(project) !== project.assets) {
  throw new Error('Expected project assets selector to return the original assets array reference')
}
