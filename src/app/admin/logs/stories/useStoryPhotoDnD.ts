'use client'

import { useCallback, useState } from 'react'
import type { Dispatch, DragEvent, SetStateAction } from 'react'
import type { PhotoDto, StoryDto } from '@/lib/api'
import type { PendingImage } from '@/components/admin/StoryPhotoPanel'

interface UseStoryPhotoDnDParams {
  currentStory: StoryDto | null
  pendingImages: PendingImage[]
  setCurrentStory: Dispatch<SetStateAction<StoryDto | null>>
  setPendingImages: Dispatch<SetStateAction<PendingImage[]>>
}

export function useStoryPhotoDnD({
  currentStory,
  pendingImages,
  setCurrentStory,
  setPendingImages,
}: UseStoryPhotoDnDParams) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [draggedItemType, setDraggedItemType] = useState<'photo' | 'pending' | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [openMenuPhotoId, setOpenMenuPhotoId] = useState<string | null>(null)
  const [openMenuPendingId, setOpenMenuPendingId] = useState<string | null>(null)

  const handlePhotoPanelDragOver = useCallback((event: DragEvent) => {
    event.preventDefault()
    setIsDraggingOver(true)
  }, [])

  const handlePhotoPanelDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault()
    setIsDraggingOver(false)
  }, [])

  const handleItemDragStart = useCallback((event: DragEvent, itemId: string, type: 'photo' | 'pending') => {
    setDraggedItemId(itemId)
    setDraggedItemType(type)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${type}:${itemId}`)
    setTimeout(() => {
      ;(event.target as HTMLElement).style.opacity = '0.5'
    }, 0)
  }, [])

  const handleItemDragEnd = useCallback((event: DragEvent) => {
    ;(event.target as HTMLElement).style.opacity = '1'
    setDraggedItemId(null)
    setDraggedItemType(null)
    setDragOverItemId(null)
  }, [])

  const handleItemDragOver = useCallback((event: DragEvent, itemId: string) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (itemId !== draggedItemId) {
      setDragOverItemId(itemId)
    }
  }, [draggedItemId])

  const handleItemDragLeave = useCallback(() => {
    setDragOverItemId(null)
  }, [])

  const getCombinedItems = useCallback(() => {
    const photoItems = (currentStory?.photos || []).map((photo) => ({ id: photo.id, type: 'photo' as const }))
    const pendingItems = pendingImages.map((image) => ({ id: image.id, type: 'pending' as const }))
    return [...photoItems, ...pendingItems]
  }, [currentStory?.photos, pendingImages])

  const handleItemDrop = useCallback((event: DragEvent, targetId: string, targetType: 'photo' | 'pending') => {
    event.preventDefault()
    event.stopPropagation()
    setDragOverItemId(null)

    if (!draggedItemId || !draggedItemType || (draggedItemId === targetId && draggedItemType === targetType)) {
      return
    }

    const combined = getCombinedItems()
    const draggedIndex = combined.findIndex((item) => item.id === draggedItemId && item.type === draggedItemType)
    const targetIndex = combined.findIndex((item) => item.id === targetId && item.type === targetType)
    if (draggedIndex === -1 || targetIndex === -1) {
      return
    }

    const [dragged] = combined.splice(draggedIndex, 1)
    combined.splice(targetIndex, 0, dragged)

    const newPhotoIds = combined.filter((item) => item.type === 'photo').map((item) => item.id)
    const newPendingIds = combined.filter((item) => item.type === 'pending').map((item) => item.id)

    const reorderedPhotos = newPhotoIds
      .map((id) => currentStory?.photos?.find((photo) => photo.id === id))
      .filter((photo): photo is PhotoDto => Boolean(photo))
    setCurrentStory((prev) => (prev ? { ...prev, photos: reorderedPhotos } : prev))

    const reorderedPending = newPendingIds
      .map((id) => pendingImages.find((image) => image.id === id))
      .filter((image): image is PendingImage => Boolean(image))
    setPendingImages(reorderedPending)
  }, [currentStory?.photos, draggedItemId, draggedItemType, getCombinedItems, pendingImages, setCurrentStory, setPendingImages])

  return {
    draggedItemId,
    draggedItemType,
    dragOverItemId,
    isDraggingOver,
    openMenuPhotoId,
    openMenuPendingId,
    setOpenMenuPhotoId,
    setOpenMenuPendingId,
    handlePhotoPanelDragOver,
    handlePhotoPanelDragLeave,
    handleItemDragStart,
    handleItemDragEnd,
    handleItemDragOver,
    handleItemDragLeave,
    handleItemDrop,
    setIsDraggingOver,
  }
}
