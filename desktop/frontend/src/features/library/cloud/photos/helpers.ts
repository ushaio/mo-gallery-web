import type { Photo } from "@/types";
import { MASONRY_CARD_MARGIN } from "./constants";

export function getPhotoFileFormat(photo: Pick<Photo, "path" | "url">) {
  const source = photo.path || photo.url;
  if (!source) return undefined;
  const path = source.split(/[?#]/, 1)[0];
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLocaleLowerCase();
  return extension === "jpeg" ? "jpg" : extension;
}

export interface AlbumPhotoFilters {
  search: string;
  category: string;
  photoType: string | null;
  fileFormats: string[];
  featured: boolean | null;
  cameraId: string | null;
  lensId: string | null;
  sortBy: "createdAt" | "takenAt";
  sortOrder: "asc" | "desc";
}

export function filterAndSortAlbumPhotos(
  photos: Photo[],
  filters: AlbumPhotoFilters,
) {
  const search = filters.search.trim().toLocaleLowerCase();
  const category = filters.category === "全部" ? "" : filters.category;

  return photos
    .filter(
      (photo) => !category || photo.category?.split(",").includes(category),
    )
    .filter(
      (photo) => !search || photo.title?.toLocaleLowerCase().includes(search),
    )
    .filter(
      (photo) => !filters.photoType || photo.photoType === filters.photoType,
    )
    .filter(
      (photo) =>
        filters.fileFormats.length === 0 ||
        filters.fileFormats.includes(getPhotoFileFormat(photo) || ""),
    )
    .filter(
      (photo) =>
        filters.featured === null || photo.isFeatured === filters.featured,
    )
    .filter((photo) => !filters.cameraId || photo.cameraId === filters.cameraId)
    .filter((photo) => !filters.lensId || photo.lensId === filters.lensId)
    .sort((left, right) => {
      const field = filters.sortBy === "takenAt" ? "takenAt" : "createdAt";
      const leftTime = new Date(left[field] || 0).getTime();
      const rightTime = new Date(right[field] || 0).getTime();
      const comparison = leftTime - rightTime;
      return filters.sortOrder === "asc" ? comparison : -comparison;
    });
}

export function estimateMasonryPhotoHeight(photo: Photo, columnWidth: number) {
  const aspectRatio =
    photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3;

  return Math.round(columnWidth / aspectRatio) + MASONRY_CARD_MARGIN;
}

export function distributeMasonryPhotos(
  photos: Photo[],
  columnCount: number,
  columnWidth: number,
) {
  const columns = Array.from({ length: columnCount }, () => [] as Photo[]);
  const heights = Array.from({ length: columnCount }, () => 0);

  for (const photo of photos) {
    let targetColumn = 0;
    for (let index = 1; index < heights.length; index += 1) {
      if (heights[index] < heights[targetColumn]) targetColumn = index;
    }

    columns[targetColumn].push(photo);
    heights[targetColumn] += estimateMasonryPhotoHeight(photo, columnWidth);
  }

  return columns;
}
