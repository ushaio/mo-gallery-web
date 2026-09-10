import { getCanvasAssetBlob } from './project'
import type { CanvasElement, CanvasImageElement, CanvasProject } from './types'

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load canvas image')) }
    image.src = url
  })
}

function roundedRect(context: CanvasRenderingContext2D, width: number, height: number, radius: number) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.roundRect(-width / 2, -height / 2, width, height, safeRadius)
  context.closePath()
}

function drawImageElement(context: CanvasRenderingContext2D, element: CanvasImageElement, image: HTMLImageElement) {
  const sourceRatio = image.naturalWidth / image.naturalHeight
  const targetRatio = element.width / element.height
  let sx = 0
  let sy = 0
  let sw = image.naturalWidth
  let sh = image.naturalHeight
  let dx = -element.width / 2
  let dy = -element.height / 2
  let dw = element.width
  let dh = element.height

  if (element.fit === 'cover') {
    if (sourceRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio
      sx = (image.naturalWidth - sw) / 2
    } else {
      sh = image.naturalWidth / targetRatio
      sy = (image.naturalHeight - sh) / 2
    }
  } else if (sourceRatio > targetRatio) {
    dh = element.width / sourceRatio
    dy = -dh / 2
  } else {
    dw = element.height * sourceRatio
    dx = -dw / 2
  }

  roundedRect(context, element.width, element.height, element.radius)
  context.clip()
  context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
}

async function renderElement(context: CanvasRenderingContext2D, element: CanvasElement, project: CanvasProject) {
  context.save()
  context.translate(element.x + element.width / 2, element.y + element.height / 2)
  context.rotate(element.rotation * Math.PI / 180)
  context.globalAlpha = element.opacity

  if (element.type === 'image' && element.assetId) {
    const asset = project.assets.find((item) => item.id === element.assetId)
    const blob = asset ? await getCanvasAssetBlob(asset.blobId) : null
    if (blob) drawImageElement(context, element, await loadImage(blob))
  } else if (element.type === 'shape') {
    context.fillStyle = element.fill
    roundedRect(context, element.width, element.height, element.shape === 'ellipse' ? Math.max(element.width, element.height) : element.radius)
    context.fill()
  } else if (element.type === 'text') {
    context.fillStyle = element.color
    context.font = `${element.fontWeight} ${element.fontSize}px ${element.fontFamily}`
    context.textAlign = element.align
    context.textBaseline = 'top'
    const offset = element.align === 'left' ? -element.width / 2 : element.align === 'right' ? element.width / 2 : 0
    context.fillText(element.text, offset, -element.height / 2, element.width)
  }
  context.restore()
}

export async function exportCanvasProject(project: CanvasProject): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = project.width
  canvas.height = project.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is unavailable')
  context.fillStyle = project.background
  context.fillRect(0, 0, project.width, project.height)
  for (const element of project.elements) await renderElement(context, element, project)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Failed to export canvas')), 'image/png')
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${project.title.trim() || 'design'}.png`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
