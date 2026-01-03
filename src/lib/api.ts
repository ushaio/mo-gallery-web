function getApiBase(): string {
  // In integrated mode, API is served from the same origin
  // NEXT_PUBLIC_API_URL is optional for external backend
  const base = process.env.NEXT_PUBLIC_API_URL
  if (base) {
    return base.replace(/\/+$/, '')
  }
  // Default to same origin (integrated backend)
  return ''
}

function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = getApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export class ApiUnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'ApiUnauthorizedError'
  }
}

type ApiEnvelope<T> =
  | { success: true; data: T; meta?: unknown }
  | { success: true; token: string }
  | { success: true }
  | { success: false; message?: string; error?: string }

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const anyPayload = payload as Record<string, unknown>
  const message = anyPayload.message
  if (typeof message === 'string' && message.trim()) return message
  const error = anyPayload.error
  if (typeof error === 'string' && error.trim()) return error
  return null
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function apiRequest(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<ApiEnvelope<unknown>> {
  const headers = new Headers(init.headers)
  const hasBody = init.body !== undefined && init.body !== null
  if (hasBody && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(buildApiUrl(path), { ...init, headers })
  const payload = await readJsonSafe(res)

  if (res.status === 401) {
    throw new ApiUnauthorizedError(extractErrorMessage(payload) ?? 'Token invalid or expired')
  }
  if (!res.ok) {
    throw new Error(extractErrorMessage(payload) ?? `Request failed (${res.status})`)
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as ApiEnvelope<unknown>
    if ('success' in envelope && envelope.success === false) {
      throw new Error(extractErrorMessage(payload) ?? 'Request failed')
    }
    return envelope
  }

  return { success: true, data: payload }
}

async function apiRequestData<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const envelope = await apiRequest(path, init, token)
  if (!('data' in envelope)) {
    throw new Error('Unexpected API response (missing data)')
  }
  return envelope.data as T
}

async function apiRequestWithMeta<T, M>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<{ data: T; meta: M }> {
  const envelope = await apiRequest(path, init, token)
  if (!('data' in envelope)) {
    throw new Error('Unexpected API response (missing data)')
  }
  const meta = 'meta' in envelope ? envelope.meta as M : {} as M
  return { data: envelope.data as T, meta }
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    searchParams.set(key, String(value))
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export interface PhotoDto {
  id: string
  title: string
  category: string
  url: string
  thumbnailUrl?: string
  width: number
  height: number
  size?: number
  isFeatured: boolean
  createdAt: string
  storageProvider?: string
  storageKey?: string
  dominantColors?: string[] // Array of hex color strings
  // EXIF data
  cameraMake?: string
  cameraModel?: string
  lens?: string
  focalLength?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  takenAt?: string
  latitude?: number
  longitude?: number
  orientation?: number
  software?: string
  exifRaw?: string
}

export interface AdminSettingsDto {
  site_title: string
  storage_provider: string
  cdn_domain: string
  r2_access_key_id?: string
  r2_secret_access_key?: string
  r2_bucket?: string
  r2_endpoint?: string
  r2_public_url?: string
  r2_path?: string
  github_token?: string
  github_repo?: string
  github_path?: string
  github_branch?: string
  github_access_method?: string
  github_pages_url?: string
  // Comment Settings
  comment_moderation?: boolean
  blocked_keywords?: string
  comment_provider?: string // 'local', 'openai', 'gemini', 'anthropic'
  comment_api_key?: string
  comment_api_endpoint?: string
  comment_model?: string
}

export interface CommentDto {
  id: string
  photoId: string
  author: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  ip?: string
  email?: string
  avatarUrl?: string  // User avatar URL (from OAuth provider)
}

export interface PublicCommentDto {
  id: string
  author: string
  avatarUrl?: string  // User avatar URL (from OAuth provider)
  content: string
  createdAt: string
  photoId?: string
}

export interface StoryDto {
  id: string
  title: string
  content: string
  coverPhotoId?: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
  photos: PhotoDto[]
}

export interface BlogDto {
  id: string
  title: string
  content: string
  category: string
  tags: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface FriendLinkDto {
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

export interface PublicSettingsDto {
  site_title: string
  cdn_domain: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id?: string
    username: string
    avatarUrl?: string
    isAdmin?: boolean
    oauthProvider?: string
    trustLevel?: number
  }
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const envelope = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!('token' in envelope) || typeof envelope.token !== 'string') {
    throw new Error('Unexpected login response (missing token)')
  }
  const user = 'user' in envelope && envelope.user ? envelope.user as LoginResponse['user'] : { username: data.username }
  return { token: envelope.token, user }
}

// Linux DO OAuth APIs
export async function getLinuxDoAuthUrl(): Promise<{ url: string; state: string }> {
  return apiRequestData<{ url: string; state: string }>('/api/auth/linuxdo')
}

export async function loginWithLinuxDo(code: string): Promise<LoginResponse> {
  const envelope = await apiRequest('/api/auth/linuxdo/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  if (!('token' in envelope) || typeof envelope.token !== 'string') {
    throw new Error('Unexpected OAuth response (missing token)')
  }
  const user = 'user' in envelope && envelope.user ? envelope.user as LoginResponse['user'] : { username: 'user' }
  return { token: envelope.token, user }
}

export async function isLinuxDoEnabled(): Promise<boolean> {
  try {
    const result = await apiRequestData<{ enabled: boolean }>('/api/auth/linuxdo/enabled')
    return result.enabled
  } catch {
    return false
  }
}

// Linux DO Admin Binding APIs
export interface LinuxDoBinding {
  username: string | null
  avatarUrl: string | null
  trustLevel: number | null
}

export async function getLinuxDoBinding(token: string): Promise<LinuxDoBinding | null> {
  const result = await apiRequestData<{ binding: LinuxDoBinding | null }>('/api/auth/linuxdo/binding', {}, token)
  return result.binding
}

export async function bindLinuxDoAccount(token: string, code: string): Promise<LinuxDoBinding> {
  const envelope = await apiRequest('/api/auth/linuxdo/bind', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, token)
  if (!('binding' in envelope)) {
    throw new Error('Unexpected response (missing binding)')
  }
  return (envelope as { binding: LinuxDoBinding }).binding
}

export async function unbindLinuxDoAccount(token: string): Promise<void> {
  await apiRequest('/api/auth/linuxdo/bind', {
    method: 'DELETE',
  }, token)
}

export async function getCategories(): Promise<string[]> {
  return apiRequestData<string[]>('/api/categories')
}

// Photo pagination meta
export interface PhotoPaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

// Get photos with pagination support
export async function getPhotos(params?: {
  category?: string
  limit?: number
  page?: number
  pageSize?: number
  all?: boolean // If true, return all photos without pagination (for admin use)
}): Promise<PhotoDto[]> {
  const category = params?.category && params.category !== '全部' ? params.category : undefined
  const query = buildQuery({
    category,
    limit: params?.limit,
    page: params?.page,
    pageSize: params?.pageSize,
    all: params?.all ? 'true' : undefined
  })
  return apiRequestData<PhotoDto[]>(`/api/photos${query}`)
}

// Get photos with pagination metadata (for infinite scroll)
export async function getPhotosWithMeta(params?: { 
  category?: string
  page?: number
  pageSize?: number 
}): Promise<{ data: PhotoDto[]; meta: PhotoPaginationMeta }> {
  const category = params?.category && params.category !== '全部' ? params.category : undefined
  const query = buildQuery({ 
    category, 
    page: params?.page,
    pageSize: params?.pageSize
  })
  return apiRequestWithMeta<PhotoDto[], PhotoPaginationMeta>(`/api/photos${query}`)
}

export async function getFeaturedPhotos(): Promise<PhotoDto[]> {
  return apiRequestData<PhotoDto[]>('/api/photos/featured')
}

export async function uploadPhoto(input: {
  token: string
  file: File
  title: string
  category: string | string[]
  storage_provider?: string
  storage_path?: string
}): Promise<PhotoDto> {
  const form = new FormData()
  form.set('file', input.file)
  form.set('title', input.title)
  const categoryValue = Array.isArray(input.category) ? input.category.join(',') : input.category
  form.set('category', categoryValue)
  if (input.storage_provider) form.set('storage_provider', input.storage_provider)
  if (input.storage_path) form.set('storage_path', input.storage_path)

  return apiRequestData<PhotoDto>(
    '/api/admin/photos',
    { method: 'POST', body: form },
    input.token,
  )
}

// Upload photo with progress callback using XMLHttpRequest
export function uploadPhotoWithProgress(input: {
  token: string
  file: File
  title: string
  category: string | string[]
  storage_provider?: string
  storage_path?: string
  onProgress?: (progress: number) => void
}): Promise<PhotoDto> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.set('file', input.file)
    form.set('title', input.title)
    const categoryValue = Array.isArray(input.category) ? input.category.join(',') : input.category
    form.set('category', categoryValue)
    if (input.storage_provider) form.set('storage_provider', input.storage_provider)
    if (input.storage_path) form.set('storage_path', input.storage_path)

    const xhr = new XMLHttpRequest()
    const url = buildApiUrl('/api/admin/photos')

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && input.onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100)
        input.onProgress(progress)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        reject(new ApiUnauthorizedError('Token invalid or expired'))
        return
      }

      try {
        const response = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          if (response.success === false) {
            reject(new Error(extractErrorMessage(response) ?? 'Upload failed'))
          } else if (response.data) {
            resolve(response.data as PhotoDto)
          } else {
            resolve(response as PhotoDto)
          }
        } else {
          reject(new Error(extractErrorMessage(response) ?? `Upload failed (${xhr.status})`))
        }
      } catch {
        reject(new Error('Invalid response from server'))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${input.token}`)
    xhr.send(form)
  })
}

export interface PhotoDeleteError {
  error: 'PHOTO_HAS_STORIES'
  message: string
  stories: { id: string; title: string }[]
}

export async function deletePhoto(input: {
  token: string
  id: string
  deleteFromStorage?: boolean
  force?: boolean
}): Promise<void> {
  const params = new URLSearchParams()
  if (input.deleteFromStorage) params.set('deleteFromStorage', 'true')
  if (input.force) params.set('force', 'true')
  const queryParam = params.toString() ? `?${params.toString()}` : ''
  await apiRequest(
    `/api/admin/photos/${encodeURIComponent(input.id)}${queryParam}`,
    { method: 'DELETE' },
    input.token
  )
}

export async function checkPhotoStories(
  token: string,
  photoId: string
): Promise<{ id: string; title: string }[] | null> {
  try {
    const result = await apiRequestData<{ stories: { id: string; title: string }[] }>(
      `/api/admin/photos/${encodeURIComponent(photoId)}/stories`,
      {},
      token
    )
    return result.stories.length > 0 ? result.stories : null
  } catch {
    return null
  }
}

export interface PhotoWithStories {
  photoId: string
  photoTitle: string
  stories: { id: string; title: string }[]
}

export async function checkPhotosStories(
  token: string,
  photoIds: string[]
): Promise<{ photosWithStories: PhotoWithStories[]; hasBlockingStories: boolean }> {
  const result = await apiRequestData<{
    photosWithStories: PhotoWithStories[]
    hasBlockingStories: boolean
  }>(
    '/api/admin/photos/check-stories',
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token
  )
  return result
}

export async function updatePhoto(input: {
  token: string
  id: string
  patch: {
    title?: string
    isFeatured?: boolean
    category?: string
    takenAt?: string | null
  }
}): Promise<PhotoDto> {
  return apiRequestData<PhotoDto>(
    `/api/admin/photos/${encodeURIComponent(input.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input.patch),
    },
    input.token,
  )
}

export async function getAdminSettings(token: string): Promise<AdminSettingsDto> {
  return apiRequestData<AdminSettingsDto>('/api/admin/settings', {}, token)
}

export async function getPublicSettings(): Promise<PublicSettingsDto> {
  try {
    return await apiRequestData<PublicSettingsDto>('/api/settings/public')
  } catch {
    // If API fails, return defaults
    return {
      site_title: 'MO GALLERY',
      cdn_domain: '',
    }
  }
}

export async function updateAdminSettings(
  token: string,
  patch: Partial<AdminSettingsDto>,
): Promise<AdminSettingsDto> {
  return apiRequestData<AdminSettingsDto>(
    '/api/admin/settings',
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    token,
  )
}

export function resolveAssetUrl(assetPath: string, cdnDomain?: string): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath
  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`

  const cdn = cdnDomain?.trim()
  if (cdn) return `${cdn.replace(/\/+$/, '')}${normalizedPath}`

  const base = getApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

// Batch update photo URLs when storage configuration changes
export async function batchUpdatePhotoUrls(
  token: string,
  params: {
    storageProvider?: string
    oldPublicUrl?: string
    newPublicUrl?: string
  }
): Promise<{ updated: number; failed: number }> {
  return apiRequestData<{ updated: number; failed: number }>(
    '/api/admin/photos/batch-update-urls',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    token,
  )
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

// ... Comment APIs ...

export async function getComments(
  token: string,
  params?: { status?: string; photoId?: string; page?: number; limit?: number }
): Promise<{ data: CommentDto[]; meta: PaginationMeta }> {
  const query = buildQuery(params || {})
  const envelope = await apiRequest(`/api/admin/comments${query}`, {}, token)
  
  if (!('data' in envelope) || !('meta' in envelope)) {
     // Fallback for backward compatibility if meta is missing
     if ('data' in envelope) {
        return { 
          data: envelope.data as CommentDto[], 
          meta: { total: (envelope.data as CommentDto[]).length, page: 1, limit: 1000, totalPages: 1 } 
        }
     }
     throw new Error('Unexpected API response')
  }

  return {
    data: envelope.data as CommentDto[],
    meta: envelope.meta as PaginationMeta
  }
}

export async function updateCommentStatus(
  token: string,
  id: string,
  status: 'approved' | 'rejected'
): Promise<CommentDto> {
  return apiRequestData<CommentDto>(
    `/api/admin/comments/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token
  )
}

export async function deleteComment(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/comments/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token
  )
}

// --- Story APIs ---

export async function getStories(): Promise<StoryDto[]> {
  return apiRequestData<StoryDto[]>('/api/stories')
}

export async function getStory(id: string): Promise<StoryDto> {
  return apiRequestData<StoryDto>(`/api/stories/${encodeURIComponent(id)}`)
}

export async function getPhotoStory(photoId: string): Promise<StoryDto | null> {
  try {
    return await apiRequestData<StoryDto>(`/api/photos/${encodeURIComponent(photoId)}/story`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }
    throw error
  }
}

export async function getAdminPhotoStory(token: string, photoId: string): Promise<StoryDto | null> {
  try {
    return await apiRequestData<StoryDto>(`/api/admin/photos/${encodeURIComponent(photoId)}/story`, {}, token)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }
    throw error
  }
}

export async function getAdminStories(token: string): Promise<StoryDto[]> {
  return apiRequestData<StoryDto[]>('/api/admin/stories', {}, token)
}

export async function createStory(
  token: string,
  data: { title: string; content: string; isPublished: boolean; photoIds?: string[]; coverPhotoId?: string }
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    '/api/admin/stories',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function updateStory(
  token: string,
  id: string,
  data: { title?: string; content?: string; isPublished?: boolean; coverPhotoId?: string | null }
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function deleteStory(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/stories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token
  )
}

export async function addPhotosToStory(
  token: string,
  storyId: string,
  photoIds: string[]
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(storyId)}/photos`,
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token
  )
}

export async function removePhotoFromStory(
  token: string,
  storyId: string,
  photoId: string
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(storyId)}/photos/${encodeURIComponent(photoId)}`,
    { method: 'DELETE' },
    token
  )
}

export async function reorderStoryPhotos(
  token: string,
  storyId: string,
  photoIds: string[]
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(storyId)}/photos/reorder`,
    {
      method: 'PATCH',
      body: JSON.stringify({ photoIds }),
    },
    token
  )
}

// --- Public Comment APIs ---

export interface CommentSettings {
  linuxdoOnly: boolean
}

export async function getCommentSettings(): Promise<CommentSettings> {
  return apiRequestData<CommentSettings>('/api/comments/settings')
}

export async function getPhotoComments(photoId: string): Promise<PublicCommentDto[]> {
  return apiRequestData<PublicCommentDto[]>(`/api/photos/${encodeURIComponent(photoId)}/comments`)
}

// Get all comments for a story (all photos in the story)
export async function getStoryComments(storyId: string): Promise<PublicCommentDto[]> {
  return apiRequestData<PublicCommentDto[]>(`/api/stories/${encodeURIComponent(storyId)}/comments`)
}

export async function submitPhotoComment(
  photoId: string,
  data: { author: string; email?: string; content: string },
  token?: string | null
): Promise<{ id: string; author: string; content: string; createdAt: string; status: string }> {
  const response = await apiRequest(
    `/api/photos/${encodeURIComponent(photoId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token
  )
  if (!('data' in response)) {
    throw new Error('Unexpected API response')
  }
  return response.data as { id: string; author: string; content: string; createdAt: string; status: string }
}

// --- Blog APIs ---

export async function getBlogs(limit?: number): Promise<BlogDto[]> {
  const query = limit ? `?limit=${limit}` : ''
  return apiRequestData<BlogDto[]>(`/api/blogs${query}`)
}

export async function getBlog(id: string): Promise<BlogDto> {
  return apiRequestData<BlogDto>(`/api/blogs/${encodeURIComponent(id)}`)
}

export async function getBlogCategories(): Promise<string[]> {
  return apiRequestData<string[]>('/api/blogs/categories/list')
}

export async function getAdminBlogs(token: string): Promise<BlogDto[]> {
  return apiRequestData<BlogDto[]>('/api/admin/blogs', {}, token)
}

export async function createBlog(
  token: string,
  data: { title: string; content: string; category?: string; tags?: string; isPublished: boolean }
): Promise<BlogDto> {
  return apiRequestData<BlogDto>(
    '/api/admin/blogs',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function updateBlog(
  token: string,
  id: string,
  data: { title?: string; content?: string; category?: string; tags?: string; isPublished?: boolean }
): Promise<BlogDto> {
  return apiRequestData<BlogDto>(
    `/api/admin/blogs/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function deleteBlog(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/blogs/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token
  )
}

// --- Album APIs ---

export interface AlbumDto {
  id: string
  name: string
  description?: string
  coverUrl?: string
  isPublished: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  photos: PhotoDto[]
  photoCount: number
}

export async function getAlbums(): Promise<AlbumDto[]> {
  return apiRequestData<AlbumDto[]>('/api/albums')
}

export async function getAlbum(id: string): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(`/api/albums/${encodeURIComponent(id)}`)
}

export async function getAdminAlbums(token: string): Promise<AlbumDto[]> {
  return apiRequestData<AlbumDto[]>('/api/admin/albums', {}, token)
}

export async function createAlbum(
  token: string,
  data: { name: string; description?: string; coverUrl?: string; isPublished: boolean; sortOrder?: number; photoIds?: string[] }
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    '/api/admin/albums',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function updateAlbum(
  token: string,
  id: string,
  data: { name?: string; description?: string; coverUrl?: string; isPublished?: boolean; sortOrder?: number }
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function deleteAlbum(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/albums/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token
  )
}

export async function reorderAlbums(
  token: string,
  items: { id: string; sortOrder: number }[]
): Promise<void> {
  await apiRequest(
    '/api/admin/albums/reorder',
    {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    },
    token
  )
}

export async function addPhotosToAlbum(
  token: string,
  albumId: string,
  photoIds: string[]
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(albumId)}/photos`,
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token
  )
}

export async function removePhotoFromAlbum(
  token: string,
  albumId: string,
  photoId: string
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(albumId)}/photos/${encodeURIComponent(photoId)}`,
    { method: 'DELETE' },
    token
  )
}

export async function setAlbumCover(
  token: string,
  albumId: string,
  photoId: string
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(albumId)}/cover`,
    {
      method: 'PATCH',
      body: JSON.stringify({ photoId }),
    },
    token
  )
}

// --- Friend Link APIs ---

export async function getFriendLinks(): Promise<FriendLinkDto[]> {
  return apiRequestData<FriendLinkDto[]>('/api/friends')
}

export async function getAdminFriendLinks(token: string): Promise<FriendLinkDto[]> {
  return apiRequestData<FriendLinkDto[]>('/api/admin/friends', {}, token)
}

export async function createFriendLink(
  token: string,
  data: { 
    name: string
    url: string
    description?: string
    avatar?: string
    featured?: boolean
    sortOrder?: number
    isActive?: boolean
  }
): Promise<FriendLinkDto> {
  return apiRequestData<FriendLinkDto>(
    '/api/admin/friends',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function updateFriendLink(
  token: string,
  id: string,
  data: { 
    name?: string
    url?: string
    description?: string
    avatar?: string
    featured?: boolean
    sortOrder?: number
    isActive?: boolean
  }
): Promise<FriendLinkDto> {
  return apiRequestData<FriendLinkDto>(
    `/api/admin/friends/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token
  )
}

export async function deleteFriendLink(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/friends/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token
  )
}

export async function reorderFriendLinks(
  token: string,
  items: { id: string; sortOrder: number }[]
): Promise<void> {
  await apiRequest(
    '/api/admin/friends/reorder',
    {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    },
    token
  )
}
