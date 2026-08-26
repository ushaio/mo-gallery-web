import type { Photo } from "@/types";
import type { RecentLibrary } from "@/features/library/local/types";

export interface PhotoCardActions {
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

export interface PhotoCardProps extends PhotoCardActions {
  photo: Photo;
  isSelected: boolean;
  isFocused: boolean;
  isDeleting: boolean;
  language: "zh" | "en";
  viewMode: "crop" | "fit" | "masonry";
}
