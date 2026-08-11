import { getUsedZineAssetIds } from './PhotoTrayCurrent'
import type { Spread } from '@/lib/zine/types'

const spreads: Spread[] = [
  {
    id: 'spread-1',
    templateId: 'test',
    slots: [
      {
        id: 'image-1',
        kind: 'image',
        page: 'left',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        rotation: 0,
        zIndex: 1,
        assetId: 'asset-used',
        imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
      },
      {
        id: 'image-empty',
        kind: 'image',
        page: 'right',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        rotation: 0,
        zIndex: 1,
        assetId: null,
        imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
      },
    ],
  },
  {
    id: 'spread-2',
    templateId: 'test',
    slots: [
      {
        id: 'image-2',
        kind: 'image',
        page: 'left',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        rotation: 0,
        zIndex: 1,
        assetId: 'asset-used',
        imageTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
      },
      {
        id: 'text-1',
        kind: 'text',
        page: 'right',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        rotation: 0,
        zIndex: 1,
        content: 'asset-unused',
        align: 'left',
        fontSize: 12,
        lineHeight: 1.4,
        color: '#000000',
        fontFamily: 'sans-serif',
      },
    ],
  },
]

const usedAssetIds = getUsedZineAssetIds(spreads)

if (usedAssetIds.size !== 1 || !usedAssetIds.has('asset-used')) {
  throw new Error(`Expected only referenced image assets to be marked used, got ${[...usedAssetIds].join(', ')}`)
}

if (getUsedZineAssetIds(undefined).size !== 0) {
  throw new Error('Expected missing spreads to produce an empty used asset set')
}
