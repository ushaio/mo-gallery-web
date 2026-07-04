import type { CSSProperties } from 'react'

export type ZinePageSize = 'a4' | 'a5' | 'letter' | 'square'
export type ZinePageOrientation = 'portrait' | 'landscape'
export type ZinePageSide = 'left' | 'right'
export type SlotKind = 'image' | 'text'
export type ZineAssetSource = 'library' | 'local'

export interface ZineImageTransform { scale: number; offsetX: number; offsetY: number; rotation: number }
export interface ZineProject { id: string; title: string; pageSize: ZinePageSize; pageOrientation: ZinePageOrientation; createdBy: string; createdAt: number; updatedAt: number; spreads: Spread[]; assets: ZineAsset[] }
export interface Spread { id: string; templateId: string; slots: Slot[] }
export interface SlotBase { id: string; kind: SlotKind; page: ZinePageSide; x: number; y: number; w: number; h: number; rotation: number; zIndex: number }
export interface ImageSlot extends SlotBase { kind: 'image'; assetId: string | null; imageTransform: ZineImageTransform }
export interface TextSlot extends SlotBase { kind: 'text'; content: string; align: 'left' | 'center' | 'right'; fontSize: number; lineHeight: number; color: string; fontFamily: string }
export type Slot = ImageSlot | TextSlot
export interface ZineAsset { id: string; source: ZineAssetSource; libraryPhotoId?: string; blobId?: string; fileName: string; width: number; height: number; dpi?: number; previewUrl: string; fullUrl: string; createdAt: number }
export interface ZinePageSizeDef { id: ZinePageSize; label: string; widthMm: number; heightMm: number }
export interface TemplateDef { id: string; nameKey: string; pageLayout: 'single' | 'two-up' | 'text-photo'; buildSlots: (pageW: number, pageH: number) => Slot[] }
export interface RenderedSlot { htmlStyle: CSSProperties; pdfStyle: Record<string, string | number>; imageInner?: { src: string; htmlStyle: CSSProperties; pdfStyle: Record<string, string | number> }; text?: { content: string; htmlStyle: CSSProperties; pdfStyle: Record<string, string | number> } }
