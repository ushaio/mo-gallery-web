import type { ZineProject } from '@/lib/zine/types'

import { createZinePdfFileName, ZinePdfDocument } from './ZinePdfExporter'

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

if (documentElement.type !== ZinePdfDocument) {
  throw new Error('ZinePdfDocument should render as a React component')
}

if (fileName !== 'Test Zine.pdf') {
  throw new Error(`Expected Test Zine.pdf, got ${fileName}`)
}
