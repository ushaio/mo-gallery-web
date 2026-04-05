import 'server-only'
import { cache } from 'react'
import { db } from './db'
import type { PhotoDto, BlogDto, BlogListItemDto, StoryDto, PhotoPaginationMeta } from '@/lib/api/types'

const PHOTO_INCLUDE = { categories: true, camera: true, lens: true } as const
const PHOTO_ORDER = [
  { takenAt: { sort: 'desc' as const, nulls: 'last' as const } },
  { createdAt: 'desc' as const },
]

// ---------------------------------------------------------------------------
// Shared DTO mappers
// ---------------------------------------------------------------------------

function serializeDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPhotoToDto(p: any): PhotoDto {
  return {
    ...p,
    category: p.categories?.map((c: { name: string }) => c.name).join(',') ?? '',
    dominantColors: p.dominantColors ? JSON.parse(p.dominantColors) : null,
    createdAt: serializeDate(p.createdAt),
    takenAt: p.takenAt ? serializeDate(p.takenAt) : undefined,
    updatedAt: undefined,
    categories: undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBlogToDto(b: any): BlogDto {
  return {
    ...b,
    createdAt: serializeDate(b.createdAt),
    updatedAt: serializeDate(b.updatedAt),
  }
}

const BLOG_PREVIEW_LENGTH = 160

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBlogToListItemDto(b: any): BlogListItemDto {
  const raw: string = b.content ?? ''
  const previewText = raw.replace(/[#*`\[\]]/g, '').substring(0, BLOG_PREVIEW_LENGTH)
  return {
    id: b.id,
    title: b.title,
    category: b.category,
    tags: b.tags,
    isPublished: b.isPublished,
    createdAt: serializeDate(b.createdAt),
    updatedAt: serializeDate(b.updatedAt),
    previewText,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStoryToDto(s: any): StoryDto {
  return {
    ...s,
    createdAt: serializeDate(s.createdAt),
    updatedAt: serializeDate(s.updatedAt),
    storyDate: serializeDate(s.storyDate ?? s.createdAt),
    photos: s.photos?.map(mapPhotoToDto) ?? [],
  }
}

// ---------------------------------------------------------------------------
// Photo queries
// ---------------------------------------------------------------------------

export async function queryFeaturedPhotos(): Promise<PhotoDto[]> {
  const photos = await db.photo.findMany({
    where: { isFeatured: true },
    include: PHOTO_INCLUDE,
    take: 6,
    orderBy: PHOTO_ORDER,
  })
  return photos.map(mapPhotoToDto)
}

export async function queryPhotosWithMeta(params?: {
  category?: string
  page?: number
  pageSize?: number
}): Promise<{ data: PhotoDto[]; meta: PhotoPaginationMeta }> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20
  const skip = (page - 1) * pageSize

  const where =
    params?.category && params.category !== '全部'
      ? { categories: { some: { name: params.category } } }
      : {}

  const [total, photos] = await Promise.all([
    db.photo.count({ where }),
    db.photo.findMany({
      where,
      include: PHOTO_INCLUDE,
      skip,
      take: pageSize,
      orderBy: PHOTO_ORDER,
    }),
  ])

  return {
    data: photos.map(mapPhotoToDto),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    },
  }
}

export async function queryCategories(): Promise<string[]> {
  const categories = await db.category.findMany({ select: { name: true } })
  return categories.map((c) => c.name)
}

// ---------------------------------------------------------------------------
// Blog queries
// ---------------------------------------------------------------------------

export async function queryBlogs(): Promise<BlogListItemDto[]> {
  const blogs = await db.blog.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: 'desc' },
  })
  return blogs.map(mapBlogToListItemDto)
}

export const queryBlog = cache(async (id: string): Promise<BlogDto | null> => {
  const blog = await db.blog.findFirst({
    where: { id, isPublished: true },
  })
  return blog ? mapBlogToDto(blog) : null
})

export async function queryBlogCategories(): Promise<string[]> {
  const blogs = await db.blog.findMany({
    where: { isPublished: true },
    distinct: ['category'],
    select: { category: true },
  })
  return blogs.map((b) => b.category).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Story queries
// ---------------------------------------------------------------------------

export async function queryStories(): Promise<StoryDto[]> {
  const stories = await db.story.findMany({
    where: { isPublished: true },
    include: { photos: { include: PHOTO_INCLUDE } },
    orderBy: { createdAt: 'desc' },
  })
  return stories.map(mapStoryToDto)
}

export const queryStory = cache(async (id: string): Promise<StoryDto | null> => {
  const story = await db.story.findFirst({
    where: { id, isPublished: true },
    include: { photos: { include: PHOTO_INCLUDE } },
  })
  return story ? mapStoryToDto(story) : null
})
