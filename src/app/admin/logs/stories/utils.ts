'use client'

import type { PhotoDto, StoryDto } from '@/lib/api'
import { STORY_PHOTO_ORDER_KEY } from './constants'

export function createEmptyStory(): StoryDto {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
    photos: [],
  }
}

export function getSavedPhotoOrder(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}

  try {
    const stored = window.localStorage.getItem(STORY_PHOTO_ORDER_KEY)
    return stored ? (JSON.parse(stored) as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

export function savePhotoOrder(storyId: string, photoIds: string[]) {
  if (typeof window === 'undefined') return

  try {
    const all = getSavedPhotoOrder()
    all[storyId] = photoIds
    window.localStorage.setItem(STORY_PHOTO_ORDER_KEY, JSON.stringify(all))
  } catch (error) {
    console.error('Failed to save photo order:', error)
  }
}

export function applySavedOrder(stories: StoryDto[]): StoryDto[] {
  const photoOrders = getSavedPhotoOrder()

  return stories.map((story) => {
    const order = photoOrders[story.id]
    if (!order || !story.photos) {
      return story
    }

    const photoMap = new Map(story.photos.map((photo) => [photo.id, photo]))
    const sortedPhotos = order
      .map((id) => photoMap.get(id))
      .filter((photo): photo is PhotoDto => Boolean(photo))

    if (sortedPhotos.length !== story.photos.length) {
      return story
    }

    return {
      ...story,
      photos: sortedPhotos,
    }
  })
}
