// 通用分页响应
export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

// 用户
export interface UserInfo {
  id?: string
  username: string
  isAdmin: boolean
  avatarUrl?: string
}

// 照片
export interface Photo {
  id: string
  title: string
  url: string
  thumbnailUrl?: string
  originFlag: string
  storageProvider: string
  storageSourceId?: string
  storageKey?: string
  width: number
  height: number
  size?: number
  isFeatured: boolean
  showFlag: boolean
  dominantColors?: string[]
  fileHash?: string
  createdAt: string

  cameraId?: string
  lensId?: string
  camera?: Equipment
  lens?: Equipment

  cameraMake?: string
  cameraModel?: string
  lensModel?: string
  focalLength?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  takenAt?: string
  orientation?: number
  software?: string
  gps?: string

  category: string
  photoType: 'digital' | 'film'
  filmRollId?: string
  filmRollName?: string
}

export interface Equipment {
  id: string
  name: string
}

// 相册
export interface Album {
  id: string
  name: string
  description?: string
  coverUrl?: string
  isPublished: boolean
  sortOrder: number
  photoCount: number
  createdAt: string
  updatedAt: string
  photos?: Photo[]
}

// 故事
export interface Story {
  id: string
  title: string
  content: string
  contentJson?: string
  coverPhotoId?: string
  coverCrop?: string
  isPublished: boolean
  storyDate: string
  createdAt: string
  updatedAt: string
  photoCount: number
  photos?: Photo[]
}

// 博客
export interface Blog {
  id: string
  title: string
  content: string
  contentJson?: string
  category: string
  tags: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

// 胶卷
export interface FilmRoll {
  id: string
  name: string
  brand: string
  format: string
  iso: number
  frameCount: number
  notes?: string
  shootDate?: string
  endDate?: string
  photoCount: number
  createdAt: string
  updatedAt: string
  photos?: Photo[]
}

// 友链
export interface FriendLink {
  id: string
  name: string
  url: string
  description?: string
  avatar?: string
  featured: boolean
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// 评论
export interface Comment {
  id: string
  photoId: string
  author: string
  email?: string
  avatarUrl?: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  ip?: string
  createdAt: string
  updatedAt: string
}

// 批量操作结果
export interface BatchResult {
  success: number
  failed: number
  errors?: string[]
}
