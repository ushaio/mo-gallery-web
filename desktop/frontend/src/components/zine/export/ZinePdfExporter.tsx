import { Document, Image, Page, pdf, Text, View } from '@react-pdf/renderer'

import { getSpreadSize } from '@/lib/zine/page-sizes'
import { renderSlot } from '@/lib/zine/slot-render'
import type { ZineProject } from '@/lib/zine/types'

interface ZinePdfDocumentProps {
  project: ZineProject
}

function createSafeFileName(title: string) {
  const fileName = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim()
  return fileName || 'zine'
}

export function createZinePdfFileName(project: ZineProject) {
  return `${createSafeFileName(project.title)}.pdf`
}

export function ZinePdfDocument({ project }: ZinePdfDocumentProps) {
  const { pageW, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation)

  return (
    <Document title={project.title || 'zine'}>
      {project.spreads.map((spread) => (
        <Page key={spread.id} size={[spreadW, spreadH]}>
          <View style={{ position: 'absolute', left: 0, top: 0, width: pageW, height: spreadH, backgroundColor: '#ffffff' }} />
          <View style={{ position: 'absolute', left: pageW, top: 0, width: pageW, height: spreadH, backgroundColor: '#ffffff' }} />
          {spread.slots.map((slot) => {
            const rendered = renderSlot(slot, pageW, project.assets)

            if (slot.kind === 'image') {
              const src = rendered.imageInner?.src
              return (
                <View key={slot.id} style={rendered.pdfStyle}>
                  {src ? (
                    <Image src={src} style={rendered.imageInner?.pdfStyle} />
                  ) : (
                    <View style={{ width: '100%', height: '100%', backgroundColor: '#e5e7eb' }} />
                  )}
                </View>
              )
            }

            return (
              <View key={slot.id} style={rendered.pdfStyle}>
                <Text style={rendered.text?.pdfStyle}>{rendered.text?.content ?? ''}</Text>
              </View>
            )
          })}
        </Page>
      ))}
    </Document>
  )
}

export async function exportZinePdf(project: ZineProject) {
  const blob = await pdf(<ZinePdfDocument project={project} />).toBlob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = createZinePdfFileName(project)
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
