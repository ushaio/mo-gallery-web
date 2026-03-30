export interface CameraDto {
  id: string
  name: string
  displayName: string
  photoCount: number
}

export interface LensDto {
  id: string
  name: string
  displayName: string
  photoCount: number
}

export interface PhotoDto {
  id: string
  title: string
  category: string
  url: string
  thumbnailUrl?: string
  originFlag?: 'web' | 'mobile'
  width: number
  height: number
  size?: number
  isFeatured: boolean
  createdAt: string
  storageProvider?: string
  storageKey?: string
  dominantColors?: string[]
  // Equipment relations
  cameraId?: string
  lensId?: string
  camera?: CameraDto | null
  lens?: LensDto | null
  // EXIF raw data
  cameraMake?: string
  cameraModel?: string
  lensModel?: string
  focalLength?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  takenAt?: string
  gps?: string
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
  comment_moderation?: boolean
  blocked_keywords?: string
  comment_provider?: string
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
  avatarUrl?: string
}

export interface PublicCommentDto {
  id: string
  author: string
  avatarUrl?: string
  content: string
  createdAt: string
  photoId?: string
}

export interface StoryCoverCropValue {
  x: number
  y: number
  width: number
  height: number
}

export interface StoryDto {
  id: string
  title: string
  content: string
  coverPhotoId?: string
  coverCrop?: StoryCoverCropValue | null
  isPublished: boolean
  storyDate: string
  createdAt: string
  updatedAt: string
  photos: PhotoDto[]
}

export type StoryAiAction =
  | 'rewrite'
  | 'expand'
  | 'shorten'
  | 'continue'
  | 'summarize'
  | 'custom'

export interface StoryAiGenerateInput {
  action?: StoryAiAction
  model?: string
  prompt?: string
  title?: string
  selectedText?: string
  currentParagraph?: string
  contextBefore?: string
  contextAfter?: string
}

export interface StoryAiModelOption {
  id: string
  label: string
}

export interface StoryAiModelsResponse {
  defaultModel: string
  models: StoryAiModelOption[]
}

export interface EditorAiConversationDto {
  id: string
  scopeId: string
  title?: string
  summary?: string
  lastModel?: string
  createdAt: string
  updatedAt: string
}

export interface EditorAiConversationWithMessagesDto extends EditorAiConversationDto {
  messages: EditorAiMessageDto[]
}

export interface EditorAiMessageDto {
  id: string
  conversationId: string
  role: string
  content: string
  status: string
  model?: string
  action?: string
  metadata?: unknown
  error?: string
  createdAt: string
}

export interface EditorAiConversationInput {
  scopeId: string
  title?: string
}

export interface EditorAiConversationCreateInput {
  scopeId: string
  title?: string
}

export interface EditorAiConversationsQuery {
  scopeId: string
}

export type EditorAiGenerateInput = StoryAiGenerateInput & {
  conversationId: string
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

export interface AlbumDto {
  id: string
  name: string
  description?: string
  coverUrl?: string
  isPublished: boolean
  sortOrder: number
  photoCount: number
  photos: PhotoDto[]
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
  linuxdo_only: boolean
  comments_storage?: string
  waline_server_url?: string
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

export interface LinuxDoBinding {
  username: string | null
  avatarUrl: string | null
  trustLevel: number | null
}

export interface PhotoPaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasMore: boolean
}

export interface PhotoDeleteError {
  error: 'PHOTO_HAS_STORIES'
  message: string
  stories: { id: string; title: string }[]
}

export interface PhotoWithStories {
  photoId: string
  photoTitle: string
  stories: { id: string; title: string }[]
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  totalPages: number
}

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

export type FileStatus =
  | 'linked'
  | 'orphan'
  | 'missing'
  | 'missing_original'
  | 'missing_thumbnail'

export interface StorageFile {
  key: string
  url: string
  size: number
  lastModified: string
  status: FileStatus
  photoId?: string
  photoTitle?: string
  missingType?: 'original' | 'thumbnail' | 'both'
  hasThumb?: boolean
}

export interface StorageScanStats {
  total: number
  linked: number
  orphan: number
  missing: number
  missingOriginal: number
  missingThumbnail: number
}

export interface StorageScanResult {
  files: StorageFile[]
  stats: StorageScanStats
}
