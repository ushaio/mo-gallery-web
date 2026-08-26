import { useCallback, useState } from "react";
import { Download, FolderOpen, Loader2 } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/ContextMenu";
import { localLibraryApi } from "@/features/library/local/api";
import type { RecentLibrary } from "@/features/library/local/types";
import { t } from "@/lib/i18n";
import { SelectFolder } from "../../../../../wailsjs/go/main/App";

export function DownloadToLocalSub({
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
