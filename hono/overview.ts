import 'server-only'

import { Hono } from 'hono'

import { db } from '~/server/lib/db'
import { resolvePhotoUrls } from '~/server/lib/photo-urls'

import { authMiddleware, type AuthVariables } from './middleware/auth'

const overview = new Hono<{ Variables: AuthVariables }>()

overview.get('/admin/overview', authMiddleware, async (c) => {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    const [
      digitalCount,
      filmCount,
      albumCount,
      storyCount,
      blogCount,
      filmRollCount,
      friendCount,
      commentCount,
      cameraCount,
      lensCount,
      categoryCount,
      featuredCount,
      hiddenCount,
      pendingComments,
      approvedComments,
      rejectedComments,
      publishedAlbums,
      publishedStories,
      publishedBlogs,
      sizeAggregate,
      photosThisMonth,
      photosThisYear,
      recentPhotos,
      recentStories,
      recentBlogs,
    ] = await Promise.all([
      db.photo.count({ where: { filmPhoto: { is: null } } }),
      db.photo.count({ where: { filmPhoto: { isNot: null } } }),
      db.album.count(),
      db.story.count(),
      db.blog.count(),
      db.filmRoll.count(),
      db.friendLink.count(),
      db.comment.count(),
      db.camera.count(),
      db.lens.count(),
      db.category.count(),
      db.photo.count({ where: { isFeatured: true } }),
      db.photo.count({ where: { showFlag: false } }),
      db.comment.count({ where: { status: 'pending' } }),
      db.comment.count({ where: { status: 'approved' } }),
      db.comment.count({ where: { status: 'rejected' } }),
      db.album.count({ where: { isPublished: true } }),
      db.story.count({ where: { isPublished: true } }),
      db.blog.count({ where: { isPublished: true } }),
      db.photo.aggregate({ _sum: { size: true } }),
      db.photo.count({ where: { createdAt: { gte: monthStart } } }),
      db.photo.count({ where: { createdAt: { gte: yearStart } } }),
      db.photo.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          path: true,
          thumbPath: true,
          storageProvider: true,
          storageSourceId: true,
          storageUrlType: true,
          createdAt: true,
        },
      }),
      db.story.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true, isPublished: true },
      }),
      db.blog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, createdAt: true, isPublished: true },
      }),
    ])

    const recentPhotoDtos = await Promise.all(recentPhotos.map(async (photo) => {
      const { url, thumbnailUrl } = await resolvePhotoUrls(photo)
      return {
        id: photo.id,
        title: photo.title,
        url: url ?? '',
        thumbnailUrl,
        createdAt: photo.createdAt.toISOString(),
      }
    }))

    return c.json({
      success: true,
      data: {
        photoCount: digitalCount + filmCount,
        digitalCount,
        filmCount,
        albumCount,
        storyCount,
        blogCount,
        filmRollCount,
        friendCount,
        commentCount,
        cameraCount,
        lensCount,
        categoryCount,
        featuredCount,
        hiddenCount,
        pendingComments,
        approvedComments,
        rejectedComments,
        totalSize: sizeAggregate._sum.size ?? 0,
        publishedAlbums,
        draftAlbums: albumCount - publishedAlbums,
        publishedStories,
        draftStories: storyCount - publishedStories,
        publishedBlogs,
        draftBlogs: blogCount - publishedBlogs,
        recentPhotos: recentPhotoDtos,
        recentStories: recentStories.map((story) => ({
          ...story,
          createdAt: story.createdAt.toISOString(),
        })),
        recentBlogs: recentBlogs.map((blog) => ({
          ...blog,
          createdAt: blog.createdAt.toISOString(),
        })),
        photosThisMonth,
        photosThisYear,
      },
    })
  } catch (error) {
    console.error('Get overview error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default overview
