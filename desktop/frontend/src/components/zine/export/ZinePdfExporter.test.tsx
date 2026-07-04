import type { ZineProject } from '@/lib/zine/types'

import { createPdfPageSize, createPdfSlotStyle, createZinePdfFileName, ZinePdfDocument } from './ZinePdfExporter'

const project = {
  id: 'zine-test',
  title: 'Test Zine',
  pageSize: 'a5',
  pageOrientation: 'portrait',
  createdBy: 'test',
  createdAt: 0,
  updatedAt: 0,
  spreads: [
    {
      id: 'spread-1',
      templateId: 'test-template',
      slots: [
        {
          id: 'text-1',
          kind: 'text',
          page: 'left',
          x: 12,
          y: 18,
          w: 60,
          h: 30,
          rotation: 0,
          zIndex: 1,
          content: 'Visible text',
          align: 'center',
          fontSize: 14,
          lineHeight: 1.3,
          color: '#111111',
          fontFamily: 'Helvetica',
        },
      ],
    },
  ],
  assets: [],
} satisfies ZineProject

const documentElement = <ZinePdfDocument project={project} />
const fileName = createZinePdfFileName(project)
const a5SpreadSize = createPdfPageSize(296, 210)
const textSlotStyle = createPdfSlotStyle({ position: 'absolute', left: 160, top: 18, width: 60, height: 30, zIndex: 1, overflow: 'hidden' })

if (documentElement.type !== ZinePdfDocument) {
  throw new Error('ZinePdfDocument should render as a React component')
}

if (fileName !== 'Test Zine.pdf') {
  throw new Error(`Expected Test Zine.pdf, got ${fileName}`)
}

if (Math.round(a5SpreadSize[0]) !== 839 || Math.round(a5SpreadSize[1]) !== 595) {
  throw new Error(`Expected A5 spread PDF size to be 839pt x 595pt, got ${a5SpreadSize.join(' x ')}`)
}

if (Math.round(Number(textSlotStyle.left)) !== 454 || Math.round(Number(textSlotStyle.width)) !== 170) {
  throw new Error('Expected slot dimensions to be converted from millimeters to points')
}
