import { memo } from "react";
import { Check, Eye, EyeOff, Film, Loader2, Star, Trash2 } from "lucide-react";
import { resolveAssetUrl } from "@/lib/api";
import { PhotoContextTarget } from "./PhotoContextTarget";
import { Thumb } from "./Thumb";
import type { PhotoCardProps } from "./types";

// memo 化的网格卡片：勾选/搜索输入/加载更多等页面状态变化时，
// 只有 props 变化的卡片重渲染，而不是全部已加载的几百张
export const PhotoGridCard = memo(function PhotoGridCard({
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
