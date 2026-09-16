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
    const photoActivityYear = now.getUTCFullYear()
    const yearStart = new Date(Date.UTC(photoActivityYear, 0, 1))
    const yearEnd = new Date(Date.UTC(photoActivityYear + 1, 0, 1))

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
      tagCount,
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
      recentPhotos,
      recentStories,
      recentBlogs,
      dailyRows,
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
      db.tag.count(),
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
      // Prisma stores Photo.createdAt as a UTC timestamp without a time zone.
      db.$queryRaw<{ date: string; count: number }[]>`
        SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM "Photo"
        WHERE "createdAt" >= ${yearStart} AND "createdAt" < ${yearEnd}
        GROUP BY 1
        ORDER BY 1
      `,
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

    const dailyPhotos = dailyRows.map(row => ({ date: row.date, count: Number(row.count) }))
    const monthlyPhotos = Array.from({ length: 12 }, () => 0)
    let photosThisYear = 0
    for (const day of dailyPhotos) {
      const month = new Date(`${day.date}T00:00:00.000Z`).getUTCMonth()
      monthlyPhotos[month] += day.count
      photosThisYear += day.count
    }

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
        tagCount,
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
        monthlyPhotos,
        photoActivityYear,
        photoActivityTimeZone: 'UTC',
        dailyPhotos,
      },
    })
  } catch (error) {
    console.error('Get overview error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default overview
