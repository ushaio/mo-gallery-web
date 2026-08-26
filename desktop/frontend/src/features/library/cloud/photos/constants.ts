// 三栏资源库中间区域较窄，8 列视图下 50 张可能不足以撑满一屏，导致没有滚动事件。
// 与本地资源库保持一致，每页加载 100 张，并由视口填充逻辑按需继续请求。
export const PAGE_SIZE = 100;
export const MIN_PHOTO_GRID_SIZE = 120;
export const MAX_PHOTO_GRID_SIZE = 280;
export const MASONRY_COLUMN_GAP = 6;
export const MASONRY_CARD_MARGIN = 6;
export const CLOUD_PHOTO_FORMATS = [
  "jpg",
  "png",
  "webp",
  "avif",
  "gif",
  "tiff",
  "heic",
] as const;
