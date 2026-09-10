export type CanvasProjectKind = 'collage' | 'poster' | 'contact-sheet'

export interface CanvasAsset {
  id: string
  blobId: string
  name: string
  mimeType: string
  width: number
  height: number
  createdAt: number
}

interface CanvasElementBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

export interface CanvasImageElement extends CanvasElementBase {
  type: 'image'
  assetId: string | null
  fit: 'cover' | 'contain'
  radius: number
}

export interface CanvasTextElement extends CanvasElementBase {
  type: 'text'
  text: string
  color: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  align: CanvasTextAlign
}

export interface CanvasShapeElement extends CanvasElementBase {
  type: 'shape'
  shape: 'rectangle' | 'ellipse'
  fill: string
  radius: number
}

export type CanvasTextAlign = 'left' | 'center' | 'right'
export type CanvasElement = CanvasImageElement | CanvasTextElement | CanvasShapeElement

export interface CanvasProject {
  version: 1
  id: string
  kind: CanvasProjectKind
  templateId: string
  title: string
  width: number
  height: number
  background: string
  elements: CanvasElement[]
  assets: CanvasAsset[]
  createdAt: number
  updatedAt: number
}

export type CanvasSaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed'
