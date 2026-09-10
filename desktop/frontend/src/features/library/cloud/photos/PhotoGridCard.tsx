import { memo } from "react";
import { EyeOff, Film, Loader2 } from "lucide-react";
import { photoAssetSrc } from "@/lib/photo-asset-src";
import { t } from "@/lib/i18n";
import {
  formatLibraryCardSize,
  libraryJustifiedTileStyle,
  LibraryCardBadge,
  LibraryCardCaption,
  LibraryCardCheckbox,
  LibraryCardFavorite,
  LibraryCardFilmFrame,
  LibraryCardFocusRing,
  libraryThumbnailClassName,
  libraryTileStyle,
} from "@/components/ui/library";
import { PhotoContextTarget } from "./PhotoContextTarget";
import { Thumb } from "./Thumb";
import type { PhotoCardProps } from "./types";

// memo 化的网格卡片：勾选/搜索输入/加载更多等页面状态变化时，
// 只有 props 变化的卡片重渲染，而不是全部已加载的几百张。
// 卡片外观为设计稿（desktop/.ui/desktop-library-ui.html）的方形瓦片：
// 全出血图片 + 悬停底部文件名浮层 + 右上角状态角标。
export const PhotoGridCard = memo(function PhotoGridCard({
  photo,
  isSelected,
  isFocused,
  isDeleting,
  language,
  viewMode,
  tileSize = 180,
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
  const fit = viewMode === "fit";
  const ratio =
    photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 4 / 3;
  // 完整比例（设计稿 .just）：高度固定为 tile，宽度随图片比例，行内两端对齐；
  // 瀑布流：列内块，高度随图片比例；裁切：方形瓦片。
  const shellClass = masonry
    ? "mb-1 inline-block w-full align-top"
    : fit
      ? "inline-block align-top"
      : "aspect-square w-full";
  const shellStyle = masonry
    ? { aspectRatio: `${photo.width} / ${photo.height}` }
    : fit
      ? libraryJustifiedTileStyle(ratio, tileSize)
      : undefined;

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
        className={`group relative overflow-hidden rounded-md text-left transition focus:outline-none ${shellClass} ${isDeleting ? "cursor-wait opacity-75" : "cursor-pointer"}`}
        style={{
          ...libraryTileStyle(),
          ...shellStyle,
          ...(masonry && !(photo.width > 0 && photo.height > 0)
            ? { aspectRatio: "4 / 3" }
            : null),
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
        <span className="block h-full w-full">
          <Thumb
            src={photoAssetSrc(photo)}
            alt={photo.title}
            width={masonry ? photo.width : undefined}
            height={masonry ? photo.height : undefined}
            className={`${libraryThumbnailClassName(viewMode)} ${isDeleting ? "!opacity-50" : ""}`}
          />
        </span>
        {photo.photoType === "film" && <LibraryCardFilmFrame />}
        <LibraryCardFocusRing active={isSelected || isFocused} />
        <LibraryCardCheckbox
          selected={isSelected}
          onToggle={() => onToggleSelect(photo.id)}
          label={
            isSelected
              ? language === "zh"
                ? "取消选择"
                : "Deselect"
              : t("admin.select_photos", language)
          }
          disabled={isDeleting}
        />
        {(photo.photoType === "film" || !photo.showFlag) && (
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
            {photo.photoType === "film" && (
              <LibraryCardBadge title={language === "zh" ? "胶片" : "Film"}>
                <Film size={11} />
              </LibraryCardBadge>
            )}
            {!photo.showFlag && (
              <LibraryCardBadge title={language === "zh" ? "已隐藏" : "Hidden"}>
                <EyeOff size={11} />
              </LibraryCardBadge>
            )}
          </div>
        )}
        {photo.isFeatured && <LibraryCardFavorite />}
        <LibraryCardCaption
          name={photo.title || "Untitled"}
          meta={formatLibraryCardSize(photo.size)}
        />
        {isDeleting && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-xs">{language === "zh" ? "删除中..." : "Deleting..."}</span>
          </div>
        )}
      </div>
    </PhotoContextTarget>
  );
});
