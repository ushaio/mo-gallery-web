import {
  CheckSquare,
  Eye,
  EyeOff,
  Maximize2,
  Star,
  Trash2,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import { t } from "@/lib/i18n";
import { DownloadToLocalSub } from "./DownloadToLocalSub";
import type { PhotoCardProps } from "./types";

export function PhotoContextTarget({
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
