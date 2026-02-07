import { pgTable, text, timestamp, boolean, integer, doublePrecision, uuid, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// User table
export const users = pgTable('User', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text('username').notNull().unique(),
  password: text('password'),
  
  // OAuth fields
  oauthProvider: text('oauthProvider'),
  oauthId: text('oauthId'),
  oauthUsername: text('oauthUsername'),
  avatarUrl: text('avatarUrl'),
  trustLevel: integer('trustLevel'),
  isAdmin: boolean('isAdmin').notNull().default(false),
  
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  oauthProviderIdIdx: unique().on(table.oauthProvider, table.oauthId),
  oauthProviderIdx: index().on(table.oauthProvider),
}))

// Camera table
export const cameras = pgTable('Camera', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
})

// Lens table
export const lenses = pgTable('Lens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
})

// Photo table
export const photos = pgTable('Photo', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnailUrl'),
  storageProvider: text('storageProvider').notNull().default('local'),
  storageKey: text('storageKey'),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  size: integer('size'),
  isFeatured: boolean('isFeatured').notNull().default(false),
  dominantColors: text('dominantColors'),
  fileHash: text('fileHash'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  
  // Equipment relations
  cameraId: text('cameraId').references(() => cameras.id),
  lensId: text('lensId').references(() => lenses.id),
  
  // EXIF Information
  cameraMake: text('cameraMake'),
  cameraModel: text('cameraModel'),
  lensModel: text('lensModel'),
  focalLength: text('focalLength'),
  aperture: text('aperture'),
  shutterSpeed: text('shutterSpeed'),
  iso: integer('iso'),
  takenAt: timestamp('takenAt', { mode: 'date' }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  orientation: integer('orientation'),
  software: text('software'),
  exifRaw: text('exifRaw'),
}, (table) => ({
  cameraIdIdx: index().on(table.cameraId),
  lensIdIdx: index().on(table.lensId),
  fileHashIdx: index().on(table.fileHash),
}))

// Album table
export const albums = pgTable('Album', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  coverUrl: text('coverUrl'),
  isPublished: boolean('isPublished').notNull().default(false),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  isPublishedIdx: index().on(table.isPublished),
  sortOrderIdx: index().on(table.sortOrder),
  createdAtIdx: index().on(table.createdAt),
}))

// Category table
export const categories = pgTable('Category', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
})

// Setting table
export const settings = pgTable('Setting', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
})

// Story table
export const stories = pgTable('Story', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  content: text('content').notNull(),
  coverPhotoId: text('coverPhotoId'),
  isPublished: boolean('isPublished').notNull().default(false),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  isPublishedIdx: index().on(table.isPublished),
  createdAtIdx: index().on(table.createdAt),
  coverPhotoIdIdx: index().on(table.coverPhotoId),
}))

// Comment table
export const comments = pgTable('Comment', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  photoId: text('photoId').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  author: text('author').notNull(),
  email: text('email'),
  avatarUrl: text('avatarUrl'),
  content: text('content').notNull(),
  status: text('status').notNull().default('pending'),
  ip: text('ip'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  photoIdIdx: index().on(table.photoId),
  statusIdx: index().on(table.status),
  createdAtIdx: index().on(table.createdAt),
}))

// Blog table
export const blogs = pgTable('Blog', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category').notNull().default('未分类'),
  tags: text('tags').notNull().default(''),
  isPublished: boolean('isPublished').notNull().default(false),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  isPublishedIdx: index().on(table.isPublished),
  createdAtIdx: index().on(table.createdAt),
  categoryIdx: index().on(table.category),
}))

// FriendLink table
export const friendLinks = pgTable('FriendLink', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  avatar: text('avatar'),
  featured: boolean('featured').notNull().default(false),
  sortOrder: integer('sortOrder').notNull().default(0),
  isActive: boolean('isActive').notNull().default(true),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  isActiveIdx: index().on(table.isActive),
  sortOrderIdx: index().on(table.sortOrder),
  featuredIdx: index().on(table.featured),
}))

// Junction table for Photo-Category many-to-many
export const photoCategories = pgTable('_CategoryToPhoto', {
  A: text('A').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  B: text('B').notNull().references(() => photos.id, { onDelete: 'cascade' }),
}, (table) => ({
  abUnique: unique().on(table.A, table.B),
  aIdx: index().on(table.A),
  bIdx: index().on(table.B),
}))

// Junction table for Photo-Story many-to-many
export const photoStories = pgTable('_PhotoStories', {
  A: text('A').notNull().references(() => photos.id, { onDelete: 'cascade' }),
  B: text('B').notNull().references(() => stories.id, { onDelete: 'cascade' }),
}, (table) => ({
  abUnique: unique().on(table.A, table.B),
  aIdx: index().on(table.A),
  bIdx: index().on(table.B),
}))

// Junction table for Album-Photo many-to-many
export const albumPhotos = pgTable('_AlbumPhotos', {
  A: text('A').notNull().references(() => albums.id, { onDelete: 'cascade' }),
  B: text('B').notNull().references(() => photos.id, { onDelete: 'cascade' }),
}, (table) => ({
  abUnique: unique().on(table.A, table.B),
  aIdx: index().on(table.A),
  bIdx: index().on(table.B),
}))

// Relations
export const photosRelations = relations(photos, ({ one, many }) => ({
  camera: one(cameras, {
    fields: [photos.cameraId],
    references: [cameras.id],
  }),
  lens: one(lenses, {
    fields: [photos.lensId],
    references: [lenses.id],
  }),
  categories: many(photoCategories),
  stories: many(photoStories),
  comments: many(comments),
  albums: many(albumPhotos),
}))

export const camerasRelations = relations(cameras, ({ many }) => ({
  photos: many(photos),
}))

export const lensesRelations = relations(lenses, ({ many }) => ({
  photos: many(photos),
}))

export const categoriesRelations = relations(categories, ({ many }) => ({
  photos: many(photoCategories),
}))

export const storiesRelations = relations(stories, ({ many }) => ({
  photos: many(photoStories),
}))

export const albumsRelations = relations(albums, ({ many }) => ({
  photos: many(albumPhotos),
}))

export const commentsRelations = relations(comments, ({ one }) => ({
  photo: one(photos, {
    fields: [comments.photoId],
    references: [photos.id],
  }),
}))

export const photoCategoriesRelations = relations(photoCategories, ({ one }) => ({
  category: one(categories, {
    fields: [photoCategories.A],
    references: [categories.id],
  }),
  photo: one(photos, {
    fields: [photoCategories.B],
    references: [photos.id],
  }),
}))

export const photoStoriesRelations = relations(photoStories, ({ one }) => ({
  photo: one(photos, {
    fields: [photoStories.A],
    references: [photos.id],
  }),
  story: one(stories, {
    fields: [photoStories.B],
    references: [stories.id],
  }),
}))

export const albumPhotosRelations = relations(albumPhotos, ({ one }) => ({
  album: one(albums, {
    fields: [albumPhotos.A],
    references: [albums.id],
  }),
  photo: one(photos, {
    fields: [albumPhotos.B],
    references: [photos.id],
  }),
}))
