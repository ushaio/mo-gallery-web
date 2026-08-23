import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
  memo,
} from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import { PhotoInfoSidebar } from "@/components/admin/PhotoInfoSidebar";
import { PhotoPreviewOverlay } from "@/components/admin/PhotoPreviewOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences, usePhotoFilters } from "@/store/preferences";
import { t } from "@/lib/i18n";
import { resolveAssetUrl, type PhotoDto } from "@/lib/api";
import { normalizePhotoCategories } from "@/lib/photoCategories";
import { loadPersistentResource } from "@/lib/persistent-cache";
import {
  getPhotosPageCache,
  getPhotosPageCacheGeneration,
  invalidateDesktopCache,
  setPhotosPageCache,
} from "@/lib/app-cache";
import { useCachedPageEffect } from "@/hooks/useCachedPageEffect";
import type { Album, Photo, PaginatedResponse } from "@/types";
import { toast } from "sonner";
import {
  BatchDeletePhotos,
  BatchUpdateShowFlag,
  CheckCloudDownloadConflictByFileName,
  DeletePhoto,
  GetAlbum,
  GetCategories,
  GetDesktopStorageSources,
  GetPhotos,
  SelectFolder,
  ToggleFeatured,
  ToggleShowFlag,
} from "../../wailsjs/go/main/App";
import type { services, storage_plugins } from "../../wailsjs/go/models";
import { getErrorMessage } from "@/lib/auth-errors";
import { ThumbGridSkeleton } from "@/components/admin/Skeleton";
import { SimpleDeleteDialog } from "@/components/admin/SimpleDeleteDialog";
import { StorageMoveDialog } from "@/components/admin/StorageMoveDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import {
  localLibraryApi,
  parseLocalLibraryError,
} from "@/features/local-library/api";
import type { RecentLibrary } from "@/features/local-library/types";
import { LocalLibrarySaveDialog } from "@/components/ai/image/LibrarySaveDialog";
import {
  DownloadConflictDialog,
  type DownloadConflictPolicy,
} from "@/components/admin/DownloadConflictDialog";
import { BatchDownloadToDropdown } from "@/components/admin/BatchDownloadToDropdown";
import { useDownloadQueue } from "@/contexts/DownloadQueueContext";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  LayoutGrid,
  Star,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  Check,
  Download,
  FolderInput,
  FolderOpen,
  Maximize2,
  RefreshCw,
  X,
  CheckSquare,
  Film,
  ImageOff,
  Filter,
} from "lucide-react";
import {
  LibraryCountBar,
  LibraryEmptyState,
  LibrarySearchInput,
  LibrarySelectionBar,
  LibrarySelectionButton,
  LibraryStatusBar,
  LibraryToolbar,
  LibraryViewToggle,
  LibraryZoomSlider,
} from "@/components/ui/library";

// 三栏资源库中间区域较窄，8 列视图下 50 张可能不足以撑满一屏，导致没有滚动事件。
// 与本地资源库保持一致，每页加载 100 张，并由视口填充逻辑按需继续请求。
const PAGE_SIZE = 100;
const MIN_PHOTO_GRID_SIZE = 120;
const MAX_PHOTO_GRID_SIZE = 280;
const MASONRY_COLUMN_GAP = 6;
const MASONRY_CARD_MARGIN = 6;
const CLOUD_PHOTO_FORMATS = [
  "jpg",
  "png",
  "webp",
  "avif",
  "gif",
  "tiff",
  "heic",
] as const;

function getPhotoFileFormat(photo: Pick<Photo, "path" | "url">) {
  const source = photo.path || photo.url;
  if (!source) return undefined;
  const path = source.split(/[?#]/, 1)[0];
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLocaleLowerCase();
  return extension === "jpeg" ? "jpg" : extension;
}

function CloudPhotoFilters({
  language,
  categories,
  category,
  photoType,
  fileFormats,
  onCategoryChange,
  onPhotoTypeChange,
  onFileFormatsChange,
}: {
  language: "zh" | "en";
  categories: string[];
  category: string;
  photoType: string | null;
  fileFormats: string[];
  onCategoryChange: (value: string) => void;
  onPhotoTypeChange: (value: string | null) => void;
  onFileFormatsChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeCount =
    (category === "全部" ? 0 : 1) +
    (photoType ? 1 : 0) +
    (fileFormats.length ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const toggleFileFormat = (format: string) => {
    onFileFormatsChange(
      fileFormats.includes(format)
        ? fileFormats.filter((item) => item !== format)
        : [...fileFormats, format],
    );
  };

  const optionClass = (active: boolean) =>
    `rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition hover:bg-secondary ${active ? "bg-primary text-primary-foreground" : "bg-background"}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={language === "zh" ? "筛选" : "Filters"}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-input px-2.5 text-xs hover:bg-secondary"
      >
        <Filter size={13} />
        <span>{language === "zh" ? "筛选" : "Filters"}</span>
        {activeCount > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={language === "zh" ? "照片筛选" : "Photo filters"}
          className="absolute left-3 right-3 top-[calc(100%+4px)] z-30 max-h-[min(60vh,32rem)] overflow-auto rounded-md border bg-background p-4 shadow-xl"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">
                {language === "zh" ? "筛选" : "Filters"}
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {language === "zh"
                  ? "不同筛选项之间为“并且”，照片类型可多选。"
                  : "Filters use AND; photo formats can be combined."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={language === "zh" ? "关闭筛选" : "Close filters"}
              className="rounded-md p-1.5 hover:bg-secondary"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-5">
            <section>
              <h3 className="mb-2 text-[11px] font-semibold">
                {language === "zh" ? "成像方式" : "Capture type"}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onPhotoTypeChange(null)}
                  className={optionClass(!photoType)}
                >
                  {language === "zh" ? "全部" : "All"}
                </button>
                <button
                  type="button"
                  onClick={() => onPhotoTypeChange("digital")}
                  className={optionClass(photoType === "digital")}
                >
                  {t("admin.photos_type_digital", language)}
                </button>
                <button
                  type="button"
                  onClick={() => onPhotoTypeChange("film")}
                  className={optionClass(photoType === "film")}
                >
                  {t("admin.photos_type_film", language)}
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold">
                {language === "zh" ? "照片类型" : "Photo format"}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {CLOUD_PHOTO_FORMATS.map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => toggleFileFormat(format)}
                    className={optionClass(fileFormats.includes(format))}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold">
                {language === "zh" ? "照片分类" : "Category"}
              </h3>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto pr-1">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onCategoryChange(item)}
                    className={optionClass(category === item)}
                  >
                    {item === "全部"
                      ? language === "zh"
                        ? "全部"
                        : "All"
                      : item}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-5 flex items-center justify-between border-t pt-3">
            <button
              type="button"
              disabled={activeCount === 0}
              onClick={() => {
                onCategoryChange("全部");
                onPhotoTypeChange(null);
                onFileFormatsChange([]);
              }}
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-[10px] hover:bg-secondary disabled:opacity-40"
            >
              <X size={11} />
              {language === "zh" ? "清除全部" : "Clear all"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-primary px-4 py-1.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
            >
              {language === "zh" ? "完成" : "Done"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface AlbumPhotoFilters {
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

function filterAndSortAlbumPhotos(photos: Photo[], filters: AlbumPhotoFilters) {
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

function estimateMasonryPhotoHeight(photo: Photo, columnWidth: number) {
  const aspectRatio =
    photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3;

  return Math.round(columnWidth / aspectRatio) + MASONRY_CARD_MARGIN;
}

function distributeMasonryPhotos(
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

// 缩略图：加载完成前保持透明，避免滚动时图片"闪现"；
// ref 回调兜底缓存命中场景（complete 已为 true 时 onLoad 不会再触发）
function Thumb({
  src,
  alt,
  className,
  width,
  height,
}: {
  src: string;
  alt: string;
  className: string;
  width?: number;
  height?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      width={width || undefined}
      height={height || undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
      className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}

interface PhotoCardActions {
  onCardClick: (event: React.MouseEvent, photo: Photo) => void;
  onCardDoubleClick: (photo: Photo) => void;
  onContextOpen: (photo: Photo) => void;
  onToggleSelect: (id: string) => void;
  onToggleFeatured: (id: string) => void;
  onToggleShow: (id: string) => void;
  onRequestDelete: (photo: Photo) => void;
  onDownloadToLocal: (photo: Photo, library: RecentLibrary) => void;
  onDownloadToFolder: (photo: Photo, folderPath: string) => void;
}

interface PhotoCardProps extends PhotoCardActions {
  photo: Photo;
  isSelected: boolean;
  isFocused: boolean;
  isDeleting: boolean;
  language: "zh" | "en";
  viewMode: "crop" | "fit" | "masonry";
}

function DownloadToLocalSub({
  language,
  onSelectLibrary,
  onDownloadToFolder,
}: {
  language: "zh" | "en";
  onSelectLibrary: (library: RecentLibrary) => void;
  onDownloadToFolder: (folderPath: string) => void;
}) {
  const [libraries, setLibraries] = useState<RecentLibrary[]>([]);
  const [librariesLoading, setLibrariesLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadLibraries = useCallback(async () => {
    if (librariesLoading || loaded) return;
    setLibrariesLoading(true);
    try {
      const state = await localLibraryApi.entryState();
      setLibraries(state.recent);
      setLoaded(true);
    } catch {
      // ignore — empty submenu shown
    } finally {
      setLibrariesLoading(false);
    }
  }, [librariesLoading, loaded]);

  const handleSelectFolder = useCallback(async () => {
    let path: string;
    try {
      path = await SelectFolder();
    } catch {
      return;
    }
    if (path) onDownloadToFolder(path);
  }, [onDownloadToFolder]);

  return (
    <ContextMenuSub onOpenChange={(open) => { if (open) void loadLibraries(); }}>
      <ContextMenuSubTrigger>
        <Download size={14} />
        {language === "zh" ? "下载至" : "Download to"}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuItem
          onSelect={() => void handleSelectFolder()}
          className="flex flex-col items-start"
        >
          <span className="flex items-center gap-1.5">
            <FolderOpen size={13} />
            {language === "zh" ? "下载至本地文件夹" : "Download to folder"}
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {language === "zh" ? "选择系统目录保存原图" : "Pick a system folder for the original"}
          </span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {librariesLoading ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            {t("admin.loading", language)}
          </div>
        ) : libraries.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">
            {t("admin.ai_no_local_libraries", language)}
          </div>
        ) : (
          libraries.map((library) => (
            <ContextMenuItem
              key={library.path}
              disabled={!library.available}
              onSelect={() => onSelectLibrary(library)}
              className="flex flex-col items-start"
            >
              <span className="truncate">{library.name}</span>
              <span className="truncate text-[10px] text-muted-foreground">
                {library.available
                  ? library.path
                  : t("admin.ai_library_unavailable", language)}
              </span>
            </ContextMenuItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function PhotoContextTarget({
  photo,
  isSelected,
  isDeleting,
  language,
  children,
  onCardDoubleClick,
  onContextOpen,
  onToggleSelect,
  onToggleFeatured,
  onToggleShow,
  onRequestDelete,
  onDownloadToLocal,
  onDownloadToFolder,
}: Omit<PhotoCardProps, "onCardClick" | "viewMode" | "isFocused"> & {
  children: React.ReactElement;
}) {
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open && !isDeleting) onContextOpen(photo);
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-64 truncate">
          {photo.title || (language === "zh" ? "未命名照片" : "Untitled photo")}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isDeleting}
          onSelect={() => onCardDoubleClick(photo)}
        >
          <Maximize2 size={14} />
          {language === "zh" ? "大图预览" : "Preview"}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isDeleting}
          onSelect={() => onToggleSelect(photo.id)}
        >
          <CheckSquare size={14} />
          {isSelected
            ? language === "zh"
              ? "取消选择"
              : "Deselect"
            : t("admin.select_photos", language)}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isDeleting}
          onSelect={() => onToggleFeatured(photo.id)}
        >
          <Star size={14} fill={photo.isFeatured ? "currentColor" : "none"} />
          {photo.isFeatured
            ? language === "zh"
              ? "取消精选"
              : "Remove featured"
            : t("admin.featured", language)}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isDeleting}
          onSelect={() => onToggleShow(photo.id)}
        >
          {photo.showFlag ? <EyeOff size={14} /> : <Eye size={14} />}
          {t(
            photo.showFlag ? "admin.hide_in_gallery" : "admin.show_in_gallery",
            language,
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <DownloadToLocalSub
          language={language}
          onSelectLibrary={(library) => onDownloadToLocal(photo, library)}
          onDownloadToFolder={(folderPath) => onDownloadToFolder(photo, folderPath)}
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isDeleting}
          variant="destructive"
          onSelect={() => onRequestDelete(photo)}
        >
          <Trash2 size={14} />
          {t("common.delete", language)}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// memo 化的网格卡片：勾选/搜索输入/加载更多等页面状态变化时，
// 只有 props 变化的卡片重渲染，而不是全部已加载的几百张
const PhotoGridCard = memo(function PhotoGridCard({
  photo,
  isSelected,
  isFocused,
  isDeleting,
  language,
  viewMode,
  onCardClick,
  onCardDoubleClick,
  onContextOpen,
  onToggleSelect,
  onToggleFeatured,
  onToggleShow,
  onRequestDelete,
  onDownloadToLocal,
  onDownloadToFolder,
}: PhotoCardProps) {
  const masonry = viewMode === "masonry";

  return (
    <PhotoContextTarget
      photo={photo}
      isSelected={isSelected}
      isDeleting={isDeleting}
      language={language}
      onCardDoubleClick={onCardDoubleClick}
      onContextOpen={onContextOpen}
      onToggleSelect={onToggleSelect}
      onToggleFeatured={onToggleFeatured}
      onToggleShow={onToggleShow}
      onRequestDelete={onRequestDelete}
      onDownloadToLocal={onDownloadToLocal}
      onDownloadToFolder={onDownloadToFolder}
    >
      <div
        tabIndex={0}
        className={`group overflow-hidden border text-left transition focus:outline-none ${masonry ? "mb-1.5 inline-block w-full rounded-sm align-top" : "flex h-full min-w-0 flex-col rounded-lg"} ${isDeleting ? "cursor-wait opacity-75" : "cursor-pointer"}`}
        style={{
          borderColor: isSelected || isFocused
            ? "var(--primary)"
            : masonry
              ? "transparent"
              : "var(--border)",
          backgroundColor: isSelected || isFocused
            ? "var(--accent)"
            : "transparent",
          boxShadow: isSelected || isFocused ? "0 0 0 1px var(--primary)" : undefined,
          breakInside: masonry ? "avoid" : undefined,
          contentVisibility: masonry ? undefined : "auto",
        }}
        onClick={(event) => {
          if (!isDeleting) onCardClick(event, photo);
        }}
        onKeyDown={(event) => {
          if (event.key !== " " || event.target !== event.currentTarget || isDeleting) return;
          event.preventDefault();
          onToggleSelect(photo.id);
        }}
        onDoubleClick={() => {
          if (!isDeleting) onCardDoubleClick(photo);
        }}
      >
        <div
          className={`relative min-h-0 w-full overflow-hidden bg-background ${masonry ? "" : "aspect-[5/4]"}`}
          style={
            masonry
              ? {
                  aspectRatio:
                    photo.width > 0 && photo.height > 0
                      ? `${photo.width} / ${photo.height}`
                      : "4 / 3",
                }
              : undefined
          }
        >
          <Thumb
            src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
            alt={photo.title}
            width={masonry ? photo.width : undefined}
            height={masonry ? photo.height : undefined}
            className={`w-full transition-[transform,opacity] duration-300 ${masonry ? "block h-full object-cover group-hover:scale-[1.015]" : viewMode === "fit" ? "h-full object-contain p-1" : "h-full object-cover group-hover:scale-[1.025]"} ${isDeleting ? "!opacity-50" : ""}`}
          />
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (!isDeleting) onToggleSelect(photo.id);
            }}
            className={`absolute left-2 top-2 z-30 flex h-5 w-5 items-center justify-center rounded border transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            style={{
              backgroundColor: isSelected
                ? "var(--primary)"
                : "rgba(0,0,0,0.4)",
              borderColor: isSelected
                ? "var(--primary)"
                : "rgba(255,255,255,0.7)",
            }}
          >
            {isSelected && <Check size={12} className="text-white" />}
          </button>
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onToggleFeatured(photo.id);
              }}
              disabled={isDeleting}
              title={photo.isFeatured ? "取消精选" : "设为精选"}
              className="rounded bg-black/60 p-1.5 text-white hover:bg-black/75 disabled:opacity-50"
            >
              <Star
                size={12}
                fill={photo.isFeatured ? "currentColor" : "none"}
              />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onToggleShow(photo.id);
              }}
              disabled={isDeleting}
              title={photo.showFlag ? "设为隐藏" : "设为展示"}
              className="rounded bg-black/60 p-1.5 text-white hover:bg-black/75 disabled:opacity-50"
            >
              {photo.showFlag ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete(photo);
              }}
              disabled={isDeleting}
              title="删除照片"
              className="rounded bg-black/60 p-1.5 text-white hover:bg-red-600/85 disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </button>
          </div>
          {(photo.isFeatured ||
            !photo.showFlag ||
            photo.photoType === "film") && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-1 text-white">
              {photo.isFeatured && <Star size={11} fill="currentColor" />}
              {!photo.showFlag && <EyeOff size={11} />}
              {photo.photoType === "film" && <Film size={11} />}
            </div>
          )}
          {isDeleting && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-xs">删除中...</span>
            </div>
          )}
        </div>
        {!masonry && (
          <div className="block w-full px-2.5 py-2">
            <span className="block truncate text-xs font-medium">
              {photo.title || "Untitled"}
            </span>
          </div>
        )}
      </div>
    </PhotoContextTarget>
  );
});

interface PhotosPageProps {
  selectionMode?: boolean;
  existingPhotoIds?: string[];
  onSelectionChange?: (photos: Photo[]) => void;
}

export function PhotosPage({
  selectionMode = false,
  existingPhotoIds = [],
  onSelectionChange,
}: PhotosPageProps = {}) {
  const {
    language,
    photoViewMode: viewMode,
    setPhotoViewMode: setViewMode,
  } = usePreferences();
  // 与本地资源库一致：滑杆先本地 state 即时响应，停止 200ms 后再写回持久化偏好，
  // 避免每次拖动同步写 localStorage 卡顿。
  const persistedGridSize = usePreferences((state) => state.photoGridSize);
  const setPhotoGridSize = usePreferences((state) => state.setPhotoGridSize);
  const [gridSize, setGridSize] = useState(() =>
    Math.min(
      MAX_PHOTO_GRID_SIZE,
      Math.max(MIN_PHOTO_GRID_SIZE, persistedGridSize),
    ),
  );
  useEffect(() => {
    const id = window.setTimeout(() => setPhotoGridSize(gridSize), 200);
    return () => window.clearTimeout(id);
  }, [gridSize, setPhotoGridSize]);
  // 本地等其他入口改动偏好时同步回云端（写回与本地值一致时是 no-op）
  useEffect(() => {
    setGridSize(
      Math.min(
        MAX_PHOTO_GRID_SIZE,
        Math.max(MIN_PHOTO_GRID_SIZE, persistedGridSize),
      ),
    );
  }, [persistedGridSize]);
  const filters = usePhotoFilters();
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const filterKey = JSON.stringify([
    filters.category,
    filters.search,
    filters.photoType,
    filters.fileFormats,
    filters.channel,
    filters.albumId,
    filters.cameraId,
    filters.lensId,
    filters.featured,
    filters.sortBy,
    filters.sortOrder,
  ]);
  const photosPageCache = getPhotosPageCache();
  const cacheGenerationRef = useRef(getPhotosPageCacheGeneration());
  const invalidateAfterLocalMutation = useCallback(
    (domains: Parameters<typeof invalidateDesktopCache>[0]) => {
      invalidateDesktopCache(domains);
      cacheGenerationRef.current = getPhotosPageCacheGeneration();
    },
    [],
  );
  const cacheHitRef = useRef(
    photosPageCache !== null &&
      photosPageCache.loaded &&
      photosPageCache.filterKey === filterKey,
  );

  const [photos, setPhotos] = useState<Photo[]>(() =>
    cacheHitRef.current ? photosPageCache!.photos : [],
  );
  const [total, setTotal] = useState(() =>
    cacheHitRef.current ? photosPageCache!.total : 0,
  );
  const [hasMore, setHasMore] = useState(() =>
    cacheHitRef.current ? photosPageCache!.hasMore : true,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const existingPhotoIdSet = useMemo(
    () => new Set(existingPhotoIds),
    [existingPhotoIds],
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [detailPhoto, setDetailPhoto] = useState<Photo | null>(null);
  // R2 存储源（桌面插件）照片的「移动到」功能
  const [storageSources, setStorageSources] = useState<storage_plugins.SourceDTO[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  // 大图预览（双击卡片/点击侧栏缩略图打开）
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  // 搜索输入本地回显，300ms 防抖后才写入筛选（避免每键一次全量请求）
  const [searchInput, setSearchInput] = useState(filters.search);
  const [photoGridWidth, setPhotoGridWidth] = useState(900);
  // 下载至本地资源库：选择目标库后打开保存位置对话框，选择后关闭弹窗并在下载队列中显示进度
  const [downloadTargetPhoto, setDownloadTargetPhoto] = useState<Photo | null>(null);
  const [batchDownloadPhotos, setBatchDownloadPhotos] = useState<Photo[] | null>(null);
  const [downloadLibrary, setDownloadLibrary] = useState<RecentLibrary | null>(null);
  const [batchDownloadConflict, setBatchDownloadConflict] = useState<{
    photos: Photo[];
    conflictingNames: string[];
    library: RecentLibrary;
    destination: string;
  } | null>(null);
  const [downloadConflict, setDownloadConflict] = useState<{
    photo: Photo;
    library: RecentLibrary;
    destination: string;
    fileName: string;
  } | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const { startDownload, startFolderDownload } = useDownloadQueue();

  const pageRef = useRef(cacheHitRef.current ? photosPageCache!.page : 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const autoFillAttemptPageRef = useRef<number | null>(null);
  const fetchingRef = useRef(false);
  const fetchRequestIdRef = useRef(0);
  const hasLoadedInitialPageRef = useRef(cacheHitRef.current);
  const appliedFilterKeyRef = useRef(cacheHitRef.current ? filterKey : null);
  const lastScrollTopRef = useRef(0);
  const scrollRafPendingRef = useRef(false);
  // Shift 范围选择的锚点（最近一次勾选的照片）
  const anchorIdRef = useRef<string | null>(null);

  // 渲染期同步最新状态，供卸载写缓存和稳定回调（滚动/键盘）读取
  const latestRef = useRef({ photos, total, hasMore, filterKey });
  latestRef.current = { photos, total, hasMore, filterKey };

  // 加载存储源，识别 R2 源（桌面插件照片的「移动到」仅对 R2 可用）
  useEffect(() => {
    let active = true;
    void GetDesktopStorageSources()
      .then((result) => {
        if (active) setStorageSources(result || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const r2SourceIds = useMemo(
    () =>
      new Set(
        storageSources
          .filter((source) => {
            const endpoint = (source.config?.endpoint || "").toLowerCase();
            return (
              endpoint.includes("r2.cloudflarestorage.com") ||
              endpoint.includes(".r2.cloudflare")
            );
          })
          .map((source) => source.id),
      ),
    [storageSources],
  );

  const moveablePhotos = useMemo(
    () =>
      photos.filter(
        (p) =>
          selected.has(p.id) &&
          p.storageRuntime === "desktop-plugin" &&
          Boolean(p.storageSourceId) &&
          r2SourceIds.has(p.storageSourceId as string),
      ),
    [photos, selected, r2SourceIds],
  );

  const masonryColumnCount = Math.max(
    1,
    Math.floor(
      (photoGridWidth + MASONRY_COLUMN_GAP) / (gridSize + MASONRY_COLUMN_GAP),
    ),
  );
  const masonryColumnWidth = Math.max(
    1,
    (photoGridWidth -
      Math.max(0, masonryColumnCount - 1) * MASONRY_COLUMN_GAP) /
      masonryColumnCount,
  );
  const masonryColumns = useMemo(
    () =>
      distributeMasonryPhotos(photos, masonryColumnCount, masonryColumnWidth),
    [masonryColumnCount, masonryColumnWidth, photos],
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const updateGridWidth = () => {
      const style = window.getComputedStyle(element);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight);
      const width = Math.max(1, element.clientWidth - horizontalPadding);
      setPhotoGridWidth((current) =>
        Math.abs(current - width) < 0.5 ? current : width,
      );
    };

    updateGridWidth();
    const observer = new ResizeObserver(updateGridWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (cacheHitRef.current && photosPageCache && scrollRef.current) {
      scrollRef.current.scrollTop = photosPageCache.scrollTop;
      lastScrollTopRef.current = photosPageCache.scrollTop;
    }
  }, []);

  useEffect(
    () => () => {
      // Activity 隐藏页面时也会执行 cleanup，不能在这里作废在途请求；否则切回时
      // cached effect 不会重跑，而首屏请求也永远无法完成。只缓存已经完成的结果。
      if (!hasLoadedInitialPageRef.current) return;
      setPhotosPageCache(
        {
          filterKey: latestRef.current.filterKey,
          photos: latestRef.current.photos,
          total: latestRef.current.total,
          hasMore: latestRef.current.hasMore,
          page: pageRef.current,
          scrollTop: lastScrollTopRef.current,
          loaded: true,
        },
        cacheGenerationRef.current,
      );
    },
    [],
  );

  // 全部照片使用分页接口；选中相册后直接读取相册管理详情接口中的 photos。
  const fetchPhotos = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append && (fetchingRef.current || filters.albumId)) return;

      const requestId = ++fetchRequestIdRef.current;
      fetchingRef.current = true;
      if (!append) hasLoadedInitialPageRef.current = false;

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        if (filters.albumId) {
          const album = (await GetAlbum(filters.albumId)) as unknown as Album;
          if (requestId !== fetchRequestIdRef.current) return;

          const albumPhotos = filterAndSortAlbumPhotos(
            album?.photos || [],
            filters,
          );
          setPhotos(albumPhotos);
          setTotal(albumPhotos.length);
          setHasMore(false);
          pageRef.current = 1;
          hasLoadedInitialPageRef.current = true;
          setLoadError(null);
          return;
        }

        const result = (await GetPhotos({
          category: filters.category === "全部" ? "" : filters.category,
          search: filters.search,
          photoType: filters.photoType ?? undefined,
          formats: filters.fileFormats,
          channel: filters.channel ?? undefined,
          albumId: "",
          cameraId: filters.cameraId ?? "",
          lensId: filters.lensId ?? "",
          featured: filters.featured ?? undefined,
          showFlag: undefined,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
          page: pageNum,
          pageSize: PAGE_SIZE,
          all: false,
        } as unknown as services.ListPhotosParams)) as unknown as PaginatedResponse<Photo>;
        if (requestId !== fetchRequestIdRef.current) return;

        const newData = result.data || [];
        setPhotos((prev) => (append ? [...prev, ...newData] : newData));
        if (result.meta?.total === undefined) {
          setTotal((prev) => (append ? prev + newData.length : newData.length));
        } else {
          setTotal(result.meta.total);
        }
        // 某些旧服务响应可能不含 meta；满页时继续尝试下一页，空页后自然停止。
        setHasMore(result.meta?.hasMore ?? newData.length >= PAGE_SIZE);
        pageRef.current = pageNum;
        if (!append) hasLoadedInitialPageRef.current = true;
        setLoadError(null);
      } catch (err: unknown) {
        if (requestId !== fetchRequestIdRef.current) return;
        console.error("获取照片失败:", err);
        setLoadError(getErrorMessage(err) || "加载照片失败，请检查网络连接");
        if (append) {
          if (autoFillAttemptPageRef.current === pageNum)
            autoFillAttemptPageRef.current = null;
          toast.error(getErrorMessage(err) || "加载更多失败");
        }
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          fetchingRef.current = false;
        }
      }
    },
    [filters],
  );

  // 滚动/键盘等稳定回调通过 ref 调用最新的 fetchPhotos
  const fetchPhotosRef = useRef(fetchPhotos);
  fetchPhotosRef.current = fetchPhotos;

  // 搜索防抖：停止输入 300ms 后才更新筛选条件
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== filters.search) filters.setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // 筛选变化时重置列表；命中模块缓存的首次挂载跳过（沿用缓存数据）
  useEffect(() => {
    if (appliedFilterKeyRef.current === filterKey) {
      cacheHitRef.current = false;
      return;
    }
    appliedFilterKeyRef.current = filterKey;
    pageRef.current = 1;
    autoFillAttemptPageRef.current = null;
    setHasMore(true);
    setPhotos([]);
    setSelected(new Set());
    anchorIdRef.current = null;
    scrollRef.current?.scrollTo({ top: 0 });
    fetchPhotos(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // 加载分类
  useCachedPageEffect(() => {
    (async () => {
      try {
        const result = await loadPersistentResource("categories", async () =>
          normalizePhotoCategories(await GetCategories()),
        );
        setCategories(result);
      } catch (error) {
        console.warn("加载照片分类失败:", error);
      }
    })();
  }, []);

  // 滚动到底部附近时加载更多；rAF 节流，滚动事件本身只记录位置
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    lastScrollTopRef.current = el.scrollTop;

    if (scrollRafPendingRef.current) return;
    scrollRafPendingRef.current = true;
    requestAnimationFrame(() => {
      scrollRafPendingRef.current = false;
      const node = scrollRef.current;
      if (!node || fetchingRef.current || !latestRef.current.hasMore) return;
      // 距离底部 300px 时触发（IntersectionObserver 的备用机制）
      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 300) {
        fetchPhotosRef.current(pageRef.current + 1, true);
      }
    });
  }, []);

  // 嵌套到资源库三栏布局后，滚动事件在部分 WebView 中不会稳定抵达底部。
  // 使用滚动容器内的底部哨兵作为主分页触发；每次追加后重新观察，
  // 即使首屏高度不足以产生滚动条，也会继续加载直到填满视口。
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel || loading || photos.length === 0 || !hasMore)
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries[0]?.isIntersecting ||
          fetchingRef.current ||
          !latestRef.current.hasMore
        )
          return;
        fetchPhotosRef.current(pageRef.current + 1, true);
      },
      {
        root,
        rootMargin: "360px 0px",
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, photos.length, viewMode]);

  // 页面没有产生滚动条时，单靠 onScroll 永远无法触发下一页。
  // 渲染完成后直接比较 scrollHeight/clientHeight，未填满视口则自动请求下一页。
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || loading || loadingMore || photos.length === 0 || !hasMore)
      return;

    let frame = 0;
    const checkViewportFill = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (fetchingRef.current || !latestRef.current.hasMore) return;
        if (node.scrollHeight > node.clientHeight + 8) return;

        const nextPage = pageRef.current + 1;
        if (autoFillAttemptPageRef.current === nextPage) return;
        autoFillAttemptPageRef.current = nextPage;
        fetchPhotosRef.current(nextPage, true);
      });
    };

    checkViewportFill();
    const resizeObserver = new ResizeObserver(checkViewportFill);
    resizeObserver.observe(node);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [gridSize, hasMore, loading, loadingMore, photos.length, viewMode]);

  const toggleSelect = useCallback(
    (id: string) => {
      if (existingPhotoIdSet.has(id)) return;
      anchorIdRef.current = id;
      setSelected((prev) => {
        const next = new Set(prev);
        const removing = next.has(id);
        if (removing) next.delete(id);
        else next.add(id);
        const nextFocusedId = removing ? Array.from(next).at(-1) : id;
        setDetailPhoto(photos.find((photo) => photo.id === nextFocusedId) ?? null);
        return next;
      });
    },
    [existingPhotoIdSet, photos],
  );

  useEffect(() => {
    if (selectionMode && onSelectionChange)
      onSelectionChange(photos.filter((photo) => selected.has(photo.id)));
  }, [onSelectionChange, photos, selected, selectionMode]);

  // 与 web 端后台一致：普通点击打开详情，Shift+点击 / 复选框负责多选；
  // 已有锚点时 Shift+点击 选中锚点到当前的整段范围
  const handlePhotoClick = useCallback(
    (event: React.MouseEvent, photo: Photo) => {
      if (event.shiftKey) {
        event.preventDefault();
        const list = latestRef.current.photos;
        const anchorId = anchorIdRef.current;
        if (anchorId) {
          const anchorIdx = list.findIndex((p) => p.id === anchorId);
          const currentIdx = list.findIndex((p) => p.id === photo.id);
          if (anchorIdx !== -1 && currentIdx !== -1) {
            const [start, end] =
              anchorIdx < currentIdx
                ? [anchorIdx, currentIdx]
                : [currentIdx, anchorIdx];
            const rangeIds = list.slice(start, end + 1).map((p) => p.id);
            setSelected(new Set(rangeIds));
            setDetailPhoto(photo);
            return;
          }
        }
        setDetailPhoto(photo);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        toggleSelect(photo.id);
        return;
      }
      anchorIdRef.current = photo.id;
      setDetailPhoto(photo);
    },
    [toggleSelect],
  );

  // 双击卡片：打开全屏大图预览
  const handlePhotoDoubleClick = useCallback((photo: Photo) => {
    setPreviewPhoto(photo);
  }, []);

  // 详情面板保存后把更新合并回列表（接口 JSON 不含 undefined 键，直接展开安全）
  const handleDetailSave = useCallback(
    (updated: PhotoDto) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === updated.id ? ({ ...p, ...updated } as Photo) : p,
        ),
      );
      setDetailPhoto((prev) =>
        prev && prev.id === updated.id
          ? ({ ...prev, ...updated } as Photo)
          : prev,
      );
      invalidateAfterLocalMutation([
        "overview",
        "equipment",
        "photos",
        "albums",
        "film-rolls",
      ]);
    },
    [invalidateAfterLocalMutation],
  );

  // 右侧信息栏始终以列表数据为准（乐观更新/删除后自动同步）
  const sidebarPhoto = useMemo(() => {
    if (!detailPhoto) return null;
    return photos.find((p) => p.id === detailPhoto.id) ?? detailPhoto;
  }, [detailPhoto, photos]);

  // 筛选变化/批量删除后若选中照片已不在列表，清空选中
  useEffect(() => {
    if (detailPhoto && !photos.some((p) => p.id === detailPhoto.id))
      setDetailPhoto(null);
  }, [photos, detailPhoto]);

  // 大图预览：←/→ 切换当前已加载照片，接近末尾预取下一页
  const previewIndex = previewPhoto
    ? photos.findIndex((p) => p.id === previewPhoto.id)
    : -1;
  const goPreview = useCallback(
    (direction: 1 | -1) => {
      if (previewIndex === -1) return;
      const nextIndex = previewIndex + direction;
      if (nextIndex < 0 || nextIndex >= photos.length) return;
      setPreviewPhoto(photos[nextIndex]);
      if (
        direction === 1 &&
        nextIndex >= photos.length - 5 &&
        latestRef.current.hasMore &&
        !fetchingRef.current
      ) {
        fetchPhotosRef.current(pageRef.current + 1, true);
      }
    },
    [photos, previewIndex],
  );

  const tForPanel = useCallback((key: string) => t(key, language), [language]);

  const notifyForPanel = useCallback(
    (message: string, type?: "success" | "error" | "info") => {
      if (type === "error") toast.error(message);
      else if (type === "info") toast.info(message);
      else toast.success(message);
    },
    [],
  );

  // 乐观更新：先切换本地状态给即时反馈，失败再回滚
  const toggleFeatured = useCallback(
    async (id: string) => {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, isFeatured: !p.isFeatured } : p,
        ),
      );
      try {
        await ToggleFeatured(id);
        invalidateAfterLocalMutation(["overview", "photos"]);
      } catch (err: unknown) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, isFeatured: !p.isFeatured } : p,
          ),
        );
        toast.error(getErrorMessage(err) || "更新精选状态失败");
      }
    },
    [invalidateAfterLocalMutation],
  );

  const toggleShowFlag = useCallback(
    async (id: string) => {
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, showFlag: !p.showFlag } : p)),
      );
      try {
        await ToggleShowFlag(id);
        invalidateAfterLocalMutation(["overview", "photos"]);
      } catch (err: unknown) {
        setPhotos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, showFlag: !p.showFlag } : p)),
        );
        toast.error(getErrorMessage(err) || "更新展示状态失败");
      }
    },
    [invalidateAfterLocalMutation],
  );

  // 单张删除：用非阻塞对话框代替原生 confirm（不再冻结整个窗口）
  const requestDeletePhoto = useCallback((photo: Photo) => {
    setDeleteTarget(photo);
  }, []);

  const handleDeleteConfirm = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    const id = target.id;
    const toastId = toast.loading("正在删除照片...");
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await DeletePhoto(id, {
        deleteOriginal: false,
        deleteThumbnail: true,
        force: false,
      });
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDetailPhoto((prev) => (prev && prev.id === id ? null : prev));
      setPreviewPhoto((prev) => (prev && prev.id === id ? null : prev));
      setTotal((prev) => prev - 1);
      invalidateAfterLocalMutation([
        "overview",
        "equipment",
        "photos",
        "albums",
        "film-rolls",
        "stories",
      ]);
      toast.success("照片已删除", { id: toastId });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "删除失败", { id: toastId });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ── 批量操作（底部选中操作条） ─────────────────────

  const handleBatchDelete = async () => {
    if (selected.size === 0 || batchDeleting) return;
    const ids = Array.from(selected);
    setBatchDeleteDialogOpen(false);
    const toastId = toast.loading(`正在删除 ${ids.length} 张照片...`);
    setBatchDeleting(true);
    setDeletingIds((prev) => new Set([...prev, ...ids]));
    try {
      await BatchDeletePhotos({
        photoIds: ids,
        deleteOriginal: false,
        deleteThumbnail: true,
        force: false,
      });
      setSelected(new Set());
      pageRef.current = 1;
      await fetchPhotos(1, false);
      invalidateAfterLocalMutation([
        "overview",
        "equipment",
        "photos",
        "albums",
        "film-rolls",
        "stories",
      ]);
      toast.success("照片已删除", { id: toastId });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "批量删除失败", { id: toastId });
    } finally {
      setBatchDeleting(false);
      setDeletingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleBatchShowFlag = async (show: boolean) => {
    if (selected.size === 0 || batchUpdating) return;
    const ids = Array.from(selected);
    setBatchUpdating(true);
    try {
      await BatchUpdateShowFlag(ids, show);
      setPhotos((prev) =>
        prev.map((p) => (selected.has(p.id) ? { ...p, showFlag: show } : p)),
      );
      invalidateAfterLocalMutation(["overview", "photos"]);
      toast.success(
        show
          ? `已将 ${ids.length} 张照片设为展示`
          : `已将 ${ids.length} 张照片设为隐藏`,
      );
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "批量更新失败");
    } finally {
      setBatchUpdating(false);
    }
  };

  // 全选/取消全选当前已加载的照片
  const toggleSelectAllLoaded = () => {
    setSelected((prev) =>
      prev.size === photos.length && photos.length > 0
        ? new Set()
        : new Set(photos.map((p) => p.id)),
    );
  };

  // Esc 清除多选（编辑弹层/大图预览/对话框打开时让位）
  useEffect(() => {
    if (selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !detailPhoto &&
        !previewPhoto &&
        !batchDeleteDialogOpen &&
        !deleteTarget
      ) {
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selected.size,
    detailPhoto,
    previewPhoto,
    batchDeleteDialogOpen,
    deleteTarget,
  ]);

  // 右侧信息栏键盘导航：←/→ 切换上一张/下一张选中照片，Esc 取消选中；
  // 输入控件聚焦时不拦截，接近已加载末尾时预取下一页
  useEffect(() => {
    if (!detailPhoto || previewPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (batchDeleteDialogOpen || deleteTarget) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "Escape") {
        setDetailPhoto(null);
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const list = latestRef.current.photos;
      const idx = list.findIndex((p) => p.id === detailPhoto.id);
      if (idx === -1) return;
      const nextIdx = e.key === "ArrowRight" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= list.length) return;
      e.preventDefault();
      setDetailPhoto(list[nextIdx]);
      if (
        e.key === "ArrowRight" &&
        nextIdx >= list.length - 5 &&
        latestRef.current.hasMore &&
        !fetchingRef.current
      ) {
        fetchPhotosRef.current(pageRef.current + 1, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    detailPhoto,
    previewPhoto,
    batchDeleteDialogOpen,
    deleteTarget,
  ]);

  const handleDownloadToLocal = useCallback(
    async (photo: Photo, library: RecentLibrary) => {
      if (!library.available) {
        toast.error(t("admin.ai_library_unavailable", language));
        return;
      }
      try {
        await localLibraryApi.open(library.path);
      } catch (cause) {
        toast.error(parseLocalLibraryError(cause).message);
        return;
      }
      setDownloadTargetPhoto(photo);
      setDownloadLibrary(library);
    },
    [language],
  );

  const cloudPhotoFileNameOf = useCallback((photo: Photo): string => {
    const source = photo.path || photo.url || "";
    const base = source.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop() || "";
    return base || photo.title || photo.id;
  }, []);

  const handleDownloadToFolder = useCallback(
    async (photo: Photo, folderPath: string) => {
      if (!folderPath) return;
      startFolderDownload(
        photo.id,
        folderPath,
        cloudPhotoFileNameOf(photo),
        photo.size || 0,
      );
    },
    [cloudPhotoFileNameOf, startFolderDownload],
  );

  const selectedPhotos = useMemo(
    () => photos.filter((photo) => selected.has(photo.id)),
    [photos, selected],
  );

  const handleBatchDownloadToFolder = useCallback(
    (photosToDownload: Photo[], folderPath: string) => {
      if (!folderPath || photosToDownload.length === 0) return;
      for (const photo of photosToDownload) {
        startFolderDownload(
          photo.id,
          folderPath,
          cloudPhotoFileNameOf(photo),
          photo.size || 0,
        );
      }
    },
    [cloudPhotoFileNameOf, startFolderDownload],
  );

  const handleBatchDownloadToLibrary = useCallback(
    async (photosToDownload: Photo[], library: RecentLibrary) => {
      if (photosToDownload.length === 0) return;
      if (!library.available) {
        toast.error(t("admin.ai_library_unavailable", language));
        return;
      }
      try {
        await localLibraryApi.open(library.path);
      } catch (cause) {
        toast.error(parseLocalLibraryError(cause).message);
        return;
      }
      setBatchDownloadPhotos(photosToDownload);
      setDownloadLibrary(library);
    },
    [language],
  );

  const startBatchDownloads = useCallback(
    (photosToDownload: Photo[], destination: string, libraryPath: string, policy: DownloadConflictPolicy) => {
      for (const photo of photosToDownload) {
        startDownload(
          photo.id,
          destination,
          libraryPath,
          photo.title || photo.id,
          photo.size || 0,
          policy,
        );
      }
    },
    [startDownload],
  );

  const handleBatchSaveToLocal = useCallback(
    async (destination: string) => {
      const photosToDownload = batchDownloadPhotos;
      const library = downloadLibrary;
      if (!photosToDownload || photosToDownload.length === 0 || !library) return;
      // 批量同名冲突检查：命中任一同名文件则交给冲突弹窗让用户选择处理策略
      const conflictingNames: string[] = [];
      for (const photo of photosToDownload) {
        try {
          const conflict = await CheckCloudDownloadConflictByFileName(
            cloudPhotoFileNameOf(photo),
            destination,
            library.path,
          );
          if (conflict) conflictingNames.push(cloudPhotoFileNameOf(photo));
        } catch (cause) {
          toast.error(parseLocalLibraryError(cause).message);
          return;
        }
      }
      if (conflictingNames.length > 0) {
        setBatchDownloadConflict({
          photos: photosToDownload,
          conflictingNames,
          library,
          destination,
        });
        setBatchDownloadPhotos(null);
        setDownloadLibrary(null);
        return false;
      }
      startBatchDownloads(photosToDownload, destination, library.path, "rename");
      setBatchDownloadPhotos(null);
      setDownloadLibrary(null);
    },
    [
      batchDownloadPhotos,
      cloudPhotoFileNameOf,
      downloadLibrary,
      startBatchDownloads,
    ],
  );

  const handleBatchConflictResolve = useCallback(
    (policy: DownloadConflictPolicy) => {
      const conflict = batchDownloadConflict;
      if (!conflict) return;
      setBatchDownloadConflict(null);
      if (policy === "skip") {
        // 跳过冲突文件：仅下载无同名冲突的照片
        const conflictNames = new Set(conflict.conflictingNames);
        const toDownload = conflict.photos.filter(
          (photo) => !conflictNames.has(cloudPhotoFileNameOf(photo)),
        );
        if (toDownload.length > 0) {
          startBatchDownloads(
            toDownload,
            conflict.destination,
            conflict.library.path,
            "rename",
          );
        }
        return;
      }
      startBatchDownloads(
        conflict.photos,
        conflict.destination,
        conflict.library.path,
        policy,
      );
    },
    [batchDownloadConflict, cloudPhotoFileNameOf, startBatchDownloads],
  );

  const confirmDownloadToLocal = useCallback(
    (destination: string, conflictPolicy: DownloadConflictPolicy = "rename") => {
      const photo = downloadTargetPhoto;
      const library = downloadLibrary;
      if (!photo || !library) return;
      // Close the save dialog immediately — the download runs in the background
      // and progress is shown in the download queue popup.
      setDownloadTargetPhoto(null);
      setDownloadLibrary(null);
      startDownload(
        photo.id,
        destination,
        library.path,
        photo.title || photo.id,
        photo.size || 0,
        conflictPolicy,
      );
    },
    [downloadLibrary, downloadTargetPhoto, startDownload],
  );

  const handleSaveToLocal = useCallback(
    async (destination: string) => {
      const photo = downloadTargetPhoto;
      const library = downloadLibrary;
      if (!photo || !library) return;
      try {
        const fileName = cloudPhotoFileNameOf(photo);
        const conflict = await CheckCloudDownloadConflictByFileName(fileName, destination, library.path);
        if (conflict) {
          setDownloadConflict({
            photo,
            library,
            destination,
            fileName: cloudPhotoFileNameOf(photo),
          });
          setDownloadTargetPhoto(null);
          setDownloadLibrary(null);
          // 告知保存弹窗由冲突弹窗接管，不再提示“已保存至资源库”
          return false;
        }
      } catch (cause) {
        // 冲突检查失败不阻断下载，回退为自动重命名策略
        toast.error(parseLocalLibraryError(cause).message);
      }
      confirmDownloadToLocal(destination, "rename");
    },
    [cloudPhotoFileNameOf, confirmDownloadToLocal, downloadLibrary, downloadTargetPhoto],
  );

  const handleConflictResolve = useCallback(
    (policy: DownloadConflictPolicy) => {
      const conflict = downloadConflict;
      if (!conflict) return;
      if (policy === "skip") {
        setDownloadConflict(null);
        toast.success(t("admin.download_skipped_existing", language));
        return;
      }
      setConflictBusy(true);
      setDownloadConflict(null);
      startDownload(
        conflict.photo.id,
        conflict.destination,
        conflict.library.path,
        conflict.photo.title || conflict.photo.id,
        conflict.photo.size || 0,
        policy,
      );
      setConflictBusy(false);
    },
    [downloadConflict, language, startDownload],
  );

  const renderPhotoCard = (photo: Photo) => (
    <PhotoGridCard
      key={photo.id}
      photo={photo}
      isSelected={selected.has(photo.id) || existingPhotoIdSet.has(photo.id)}
      isFocused={detailPhoto?.id === photo.id}
      isDeleting={deletingIds.has(photo.id)}
      language={language}
      viewMode={viewMode}
      onCardClick={handlePhotoClick}
      onCardDoubleClick={
        selectionMode ? () => undefined : handlePhotoDoubleClick
      }
      onContextOpen={setDetailPhoto}
      onToggleSelect={toggleSelect}
      onToggleFeatured={toggleFeatured}
      onToggleShow={toggleShowFlag}
      onRequestDelete={requestDeletePhoto}
      onDownloadToLocal={handleDownloadToLocal}
      onDownloadToFolder={handleDownloadToFolder}
    />
  );

  const collectionTitle = filters.featured
    ? t("admin.featured", language)
    : filters.albumId
      ? language === "zh"
        ? "相册照片"
        : "Album photos"
      : filters.category === "全部"
        ? filters.photoType === "digital"
          ? t("admin.photos_type_digital", language)
          : filters.photoType === "film"
            ? t("admin.photos_type_film", language)
            : t("admin.resource_library_all_photos", language)
        : filters.category;

  return (
    <>
      <PageHeader title={collectionTitle} />

      {/* 中间浏览工作区 + 底部状态栏 + 右侧详情栏。 */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {/* 与本地资源库一致：搜索、筛选、视图和排序集中在内容工具栏。 */}
          <LibraryToolbar>
            <LibrarySearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder={t("common.search", language)}
              clearLabel={language === "zh" ? "清空搜索" : "Clear search"}
            />
            <CloudPhotoFilters
              language={language}
              categories={categories}
              category={filters.category}
              photoType={filters.photoType}
              fileFormats={filters.fileFormats}
              onCategoryChange={filters.setCategory}
              onPhotoTypeChange={filters.setPhotoType}
              onFileFormatsChange={filters.setFileFormats}
            />
            <LibraryViewToggle
              value={viewMode}
              onChange={(value) => setViewMode(value as typeof viewMode)}
              options={[
                {
                  value: "crop",
                  icon: LayoutGrid,
                  title: language === "zh" ? "裁切填充" : "Cropped view",
                },
                {
                  value: "fit",
                  icon: Maximize2,
                  title: language === "zh" ? "适应显示" : "Fitted view",
                },
                {
                  value: "masonry",
                  icon: Columns3,
                  title: language === "zh" ? "瀑布流" : "Masonry view",
                },
              ]}
            />
            <SelectDropdown
              value={filters.sortBy}
              options={[
                {
                  value: "createdAt",
                  label: language === "zh" ? "上传时间" : "Uploaded",
                },
                {
                  value: "takenAt",
                  label: language === "zh" ? "拍摄时间" : "Captured",
                },
              ]}
              onChange={(value) =>
                filters.setSortBy(value as "createdAt" | "takenAt")
              }
              ariaLabel={language === "zh" ? "排序" : "Sort"}
              className="w-28 shrink-0"
            />
            <button
              type="button"
              onClick={() =>
                filters.setSortOrder(
                  filters.sortOrder === "asc" ? "desc" : "asc",
                )
              }
              title={
                filters.sortOrder === "asc"
                  ? language === "zh"
                    ? "升序"
                    : "Ascending"
                  : language === "zh"
                    ? "降序"
                    : "Descending"
              }
              aria-label={
                filters.sortOrder === "asc"
                  ? language === "zh"
                    ? "升序"
                    : "Ascending"
                  : language === "zh"
                    ? "降序"
                    : "Descending"
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-input hover:bg-secondary"
            >
              {filters.sortOrder === "asc" ? (
                <ArrowUp size={13} />
              ) : (
                <ArrowDown size={13} />
              )}
            </button>
          </LibraryToolbar>

          <div
            ref={scrollRef}
            className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 pb-4"
            onScroll={handleScroll}
          >
            <LibraryCountBar
              icon={LayoutGrid}
              title={
                <span
                  className="font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {collectionTitle}
                </span>
              }
              count={`${total.toLocaleString()} ${t("admin.photos", language)}`}
            />
            {loading ? (
              <ThumbGridSkeleton
                count={15}
                cols={Math.max(2, Math.floor(900 / gridSize))}
                aspectClassName="aspect-[5/4]"
                gapClassName="gap-2.5"
              />
            ) : photos.length === 0 && loadError ? (
              <div
                className="flex h-full flex-col items-center justify-center gap-3"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span className="text-sm">{loadError}</span>
                <button
                  onClick={() => fetchPhotos(1, false)}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <RefreshCw size={14} /> {t("common.retry", language)}
                </button>
              </div>
            ) : photos.length === 0 ? (
              <LibraryEmptyState
                className="h-full"
                icon={ImageOff}
                title={t("admin.no_photos", language)}
                actionLabel={t("admin.upload", language)}
                onAction={() => navigate("/upload")}
              />
            ) : (
              <>
                {viewMode === "masonry" ? (
                  <div
                    className="flex w-full items-start"
                    style={{ gap: MASONRY_COLUMN_GAP }}
                  >
                    {masonryColumns.map((columnPhotos, columnIndex) => (
                      <div key={columnIndex} className="min-w-0 flex-1">
                        {columnPhotos.map(renderPhotoCard)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="grid gap-2.5"
                    style={{
                      gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`,
                    }}
                  >
                    {photos.map(renderPhotoCard)}
                  </div>
                )}
                {loadingMore && (
                  <div
                    className="flex items-center justify-center gap-2 py-5 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <Loader2 size={14} className="animate-spin" />
                    {language === "zh" ? "加载中..." : "Loading..."}
                  </div>
                )}
                {!hasMore && photos.length > 0 && (
                  <div
                    className="py-4 text-center text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {language === "zh"
                      ? `已加载全部 ${total} 张照片`
                      : `All ${total} photos loaded`}
                  </div>
                )}
              </>
            )}

            {/* 保留原有多选交互：照片区域底部悬浮操作栏。 */}
            {selected.size > 0 && !selectionMode && (
              <div className="sticky bottom-4 z-20 mt-4 flex justify-center pointer-events-none">
                <LibrarySelectionBar
                  countLabel={`${t("admin.selected", language)} ${selected.size}`}
                >
                  <LibrarySelectionButton
                    icon={CheckSquare}
                    label={
                      selected.size === photos.length
                        ? language === "zh"
                          ? "取消全选"
                          : "Deselect all"
                        : language === "zh"
                          ? "全选已加载"
                          : "Select loaded"
                    }
                    title={
                      selected.size === photos.length
                        ? language === "zh"
                          ? "取消全选"
                          : "Deselect all"
                        : language === "zh"
                          ? "全选已加载"
                          : "Select loaded"
                    }
                    active={selected.size === photos.length}
                    onClick={toggleSelectAllLoaded}
                  />
                  <LibrarySelectionButton
                    icon={Eye}
                    label={language === "zh" ? "设为展示" : "Show in gallery"}
                    title={language === "zh" ? "设为展示" : "Show in gallery"}
                    busy={batchUpdating}
                    onClick={() => handleBatchShowFlag(true)}
                  />
                  <LibrarySelectionButton
                    icon={EyeOff}
                    label={language === "zh" ? "设为隐藏" : "Hide from gallery"}
                    title={language === "zh" ? "设为隐藏" : "Hide from gallery"}
                    busy={batchUpdating}
                    onClick={() => handleBatchShowFlag(false)}
                  />
                  {moveablePhotos.length > 0 && (
                    <LibrarySelectionButton
                      icon={FolderInput}
                      label={language === "zh" ? "移动到" : "Move to"}
                      title={language === "zh" ? "移动到 (R2 存储源)" : "Move to (R2 source)"}
                      onClick={() => setMoveOpen(true)}
                    />
                  )}
                  <BatchDownloadToDropdown
                    language={language}
                    onDownloadToFolder={(folderPath) =>
                      handleBatchDownloadToFolder(selectedPhotos, folderPath)
                    }
                    onDownloadToLibrary={(library) =>
                      handleBatchDownloadToLibrary(selectedPhotos, library)
                    }
                  />
                  <LibrarySelectionButton
                    icon={Trash2}
                    label={t("admin.delete_selected", language)}
                    title={t("admin.delete_selected", language)}
                    intent="destructive"
                    busy={batchDeleting}
                    onClick={() => setBatchDeleteDialogOpen(true)}
                  />
                  <div
                    className="mx-0.5 h-4 w-px"
                    style={{ backgroundColor: "var(--border)" }}
                  />
                  <LibrarySelectionButton
                    icon={X}
                    label={`${t("common.cancel", language)} (Esc)`}
                    title={`${t("common.cancel", language)} (Esc)`}
                    onClick={() => setSelected(new Set())}
                  />
                </LibrarySelectionBar>
              </div>
            )}

            <div
              ref={loadMoreSentinelRef}
              className="h-px w-full"
              aria-hidden="true"
            />
          </div>

          <LibraryStatusBar>
            <div
              className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              <span>
                {photos.length.toLocaleString()} / {total.toLocaleString()}{" "}
                {t("admin.photos", language)}
              </span>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => fetchPhotos(1, false)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              {t("common.refresh", language)}
            </button>
            <LibraryZoomSlider
              value={gridSize}
              min={MIN_PHOTO_GRID_SIZE}
              max={MAX_PHOTO_GRID_SIZE}
              onChange={setGridSize}
              ariaLabel={language === "zh" ? "网格缩放" : "Grid zoom"}
              title={language === "zh" ? "网格缩放" : "Grid zoom"}
            />
          </LibraryStatusBar>
        </main>

        <PhotoInfoSidebar
          photo={sidebarPhoto}
          token={token}
          t={tForPanel}
          notify={notifyForPanel}
          onOpenPreview={handlePhotoDoubleClick}
          onToggleFeatured={toggleFeatured}
          onToggleShow={toggleShowFlag}
          onDelete={requestDeletePhoto}
          onSave={handleDetailSave}
          onUnauthorized={logout}
        />
      </div>

      <SimpleDeleteDialog
        isOpen={batchDeleteDialogOpen}
        title={t("common.batchDelete", language)}
        message={t("admin.photos_batch_delete_confirm", language, {
          count: selected.size,
        })}
        onConfirm={handleBatchDelete}
        onCancel={() => setBatchDeleteDialogOpen(false)}
        t={(key) => t(key, language)}
      />

      {/* 移动到 R2 目录（桌面存储插件照片） */}
      {moveOpen && (
        <StorageMoveDialog
          photos={moveablePhotos}
          sources={storageSources}
          onClose={() => setMoveOpen(false)}
          onMoved={() => {
            setMoveOpen(false);
            setSelected(new Set());
            pageRef.current = 1;
            void fetchPhotos(1, false);
            invalidateAfterLocalMutation([
              "overview",
              "equipment",
              "photos",
              "albums",
              "film-rolls",
              "stories",
            ]);
          }}
        />
      )}

      <SimpleDeleteDialog
        isOpen={!!deleteTarget}
        message={t("admin.photos_delete_confirm", language)}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        t={(key) => t(key, language)}
      />

      {/* 下载至本地资源库：选择保存位置（单张/批量共用） */}
      {(downloadTargetPhoto || (batchDownloadPhotos && batchDownloadPhotos.length > 0)) && downloadLibrary && (
        <LocalLibrarySaveDialog
          imageUrl={resolveAssetUrl((downloadTargetPhoto || batchDownloadPhotos![0]).url)}
          t={(key) => t(key, language)}
          onClose={() => {
            setDownloadTargetPhoto(null);
            setBatchDownloadPhotos(null);
            setDownloadLibrary(null);
          }}
          onSaved={() => {
            setDownloadTargetPhoto(null);
            setBatchDownloadPhotos(null);
            setDownloadLibrary(null);
          }}
          onSave={downloadTargetPhoto ? handleSaveToLocal : handleBatchSaveToLocal}
        />
      )}

      {/* 下载至本地资源库：同名文件冲突处理 */}
      {downloadConflict && (
        <DownloadConflictDialog
          fileName={downloadConflict.fileName}
          destination={downloadConflict.destination}
          busy={conflictBusy}
          onClose={() => setDownloadConflict(null)}
          onConfirm={handleConflictResolve}
        />
      )}

      {/* 批量下载：同名文件冲突处理 */}
      {batchDownloadConflict && (
        <DownloadConflictDialog
          fileName={batchDownloadConflict.conflictingNames[0]}
          destination={batchDownloadConflict.destination}
          fileNames={batchDownloadConflict.conflictingNames}
          onClose={() => setBatchDownloadConflict(null)}
          onConfirm={handleBatchConflictResolve}
        />
      )}

      {/* 大图预览（双击卡片/点击侧栏缩略图打开） */}
      {previewPhoto && (
        <PhotoPreviewOverlay
          photo={previewPhoto}
          t={tForPanel}
          onClose={() => setPreviewPhoto(null)}
          onPrevious={() => goPreview(-1)}
          onNext={() => goPreview(1)}
          hasPrevious={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < photos.length - 1}
        />
      )}
    </>
  );
}
