import { useCallback, useMemo, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  MoveRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCachedPageEffect } from "@/hooks/useCachedPageEffect";
import { resolveAssetUrl } from "@/lib/api";
import { getErrorMessage } from "@/lib/auth-errors";
import { t } from "@/lib/i18n";
import { usePreferences } from "@/store/preferences";
import type { Photo } from "@/types";
import {
  ListDesktopStorageObjects,
  MoveDesktopPluginPhotos,
} from "../../../wailsjs/go/main/App";
import { main } from "../../../wailsjs/go/models";
import type { storage_plugins } from "../../../wailsjs/go/models";

interface StorageMoveDialogProps {
  photos: Photo[];
  sources: storage_plugins.SourceDTO[];
  onClose: () => void;
  onMoved: () => void;
}

function basename(key: string): string {
  return key.replace(/\/+$/, "").split("/").pop() || key;
}

function folderOf(key: string): string {
  const index = key.lastIndexOf("/");
  return index >= 0 ? key.slice(0, index) : "";
}

/** 由对象列表推导指定前缀下的直接子目录（无 delimiter 的近似） */
function deriveSubfolders(keys: string[], prefix: string): string[] {
  const result = new Set<string>();
  const base = prefix ? `${prefix}/` : "";
  for (const key of keys) {
    if (!key.startsWith(base)) continue;
    const rest = key.slice(base.length);
    if (!rest) continue;
    const first = rest.split("/")[0];
    const isFolder = rest.includes("/") || rest.endsWith("/");
    if (first && isFolder) result.add(first);
  }
  return [...result].sort((a, b) => a.localeCompare(b));
}

function normalizeFolder(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
}

export function StorageMoveDialog({ photos, sources, onClose, onMoved }: StorageMoveDialogProps) {
  const { language } = usePreferences();
  const sourceIds = useMemo(
    () => [...new Set(photos.map((p) => p.storageSourceId).filter((id): id is string => Boolean(id)))],
    [photos],
  );
  const [browseSourceId, setBrowseSourceId] = useState(sourceIds[0] ?? "");
  const [target, setTarget] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [folderCursor, setFolderCursor] = useState("");
  const [folderHasMore, setFolderHasMore] = useState(false);
  const [moving, setMoving] = useState(false);

  const browsePrefix = stack.join("/");

  const loadFolders = useCallback(
    async (sid: string, prefix: string, append: boolean, cursor: string) => {
      if (!sid) return;
      try {
        const result = await ListDesktopStorageObjects(sid, prefix, append ? cursor : "", append ? 500 : 300);
        const keys = (result?.objects || []).map((item: { key?: string }) => item.key || "");
        const dirs = deriveSubfolders(keys, prefix);
        setFolders((prev) => (append ? [...prev, ...dirs] : dirs));
        setFolderCursor(result?.nextCursor || "");
        setFolderHasMore(Boolean(result?.hasMore));
      } catch (err: unknown) {
        toast.error(getErrorMessage(err) || "无法读取文件夹");
      } finally {
        setLoadingFolders(false);
      }
    },
    [],
  );

  // 首次打开时加载根目录（setState 均在异步 await 之后）。用 useCachedPageEffect
  // 跳过开发环境 StrictMode 的重复挂载，避免 object.list 失败时弹出两条相同报错。
  useCachedPageEffect(() => {
    if (!browseSourceId) return;
    void loadFolders(browseSourceId, "", false, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 目录导航（在事件处理器内同步重置状态并加载，避免在 effect 内 setState）
  const navigateFolder = (targetStack: string[]) => {
    setStack(targetStack);
    setFolders([]);
    setFolderCursor("");
    setFolderHasMore(false);
    setLoadingFolders(true);
    void loadFolders(browseSourceId, targetStack.join("/"), false, "");
  };
  const switchSource = (sid: string) => {
    setBrowseSourceId(sid);
    setStack([]);
    setFolders([]);
    setFolderCursor("");
    setFolderHasMore(false);
    setLoadingFolders(true);
    void loadFolders(sid, "", false, "");
  };
  const enterFolder = (name: string) => navigateFolder([...stack, name]);
  const goToBreadcrumb = (index: number) => navigateFolder(stack.slice(0, index + 1));
  const goToRoot = () => navigateFolder([]);
  const loadMoreFolders = () => {
    setLoadingFolders(true);
    void loadFolders(browseSourceId, browsePrefix, true, folderCursor);
  };
  const applyFolder = (name: string) => {
    const full = browsePrefix ? `${browsePrefix}/${name}` : name;
    setTarget(full);
  };

  const normalTarget = normalizeFolder(target);

  const invalidTarget = useMemo(() => {
    if (!normalTarget) return t("admin.storage_move_folder_required", language);
    if (normalTarget.split("/").some((part) => part === ".." || part === ".")) {
      return t("admin.storage_move_folder_invalid", language);
    }
    const sameForAll = photos.every((p) => p.path && folderOf(p.path) === normalTarget);
    return sameForAll ? t("admin.storage_move_same_folder", language) : null;
  }, [normalTarget, photos, language]);

  const handleConfirm = async () => {
    if (invalidTarget || moving || !normalTarget) return;
    setMoving(true);
    const moves = photos
      .filter((p) => Boolean(p.path) && Boolean(p.storageSourceId))
      .map((p) => ({
        id: p.id,
        sourceId: p.storageSourceId as string,
        fromPath: p.path as string,
        fromThumbPath: p.thumbPath || "",
        toFolder: normalTarget,
      }));
    if (moves.length === 0) {
      toast.error(t("admin.storage_move_no_eligible", language));
      setMoving(false);
      return;
    }
    try {
      const result = await MoveDesktopPluginPhotos(new main.MoveDesktopPhotosInput({ moves }));
      const failed = result?.failed || 0;
      const success = result?.success || 0;
      if (failed === 0) {
        toast.success(t("admin.storage_move_success", language) + ` (${success})`);
      } else if (success > 0) {
        toast.warning(t("admin.storage_move_partial", language) + ` (${success}/${success + failed})`);
        result?.errors?.forEach((message) => toast.error(message));
      } else {
        toast.error(t("admin.storage_move_failed", language));
        result?.errors?.forEach((message) => toast.error(message));
      }
      onMoved();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || t("admin.storage_move_failed", language));
    } finally {
      setMoving(false);
    }
  };

  const sourceOptions = sources.filter((s) => sourceIds.includes(s.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold">{t("admin.storage_move_title", language)}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close", language)}
            className="flex size-7 items-center justify-center rounded-md hover:bg-secondary"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {/* 待移动照片 */}
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
              {t("admin.storage_move_photos", language)} ({photos.length})
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2" style={{ borderColor: "var(--border)" }}>
              {photos.map((photo) => (
                <div key={photo.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-secondary">
                  {photo.thumbnailUrl || photo.url ? (
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
                      alt=""
                      loading="lazy"
                      className="size-7 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded" style={{ backgroundColor: "var(--muted)" }}>
                      <Folder size={12} style={{ color: "var(--muted-foreground)" }} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{photo.title}</p>
                    <p className="truncate font-mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                      {photo.path ? folderOf(photo.path) || "/" : "-"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 目标目录 */}
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
              {t("admin.storage_move_target", language)}
            </label>
            <input
              type="text"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !invalidTarget) void handleConfirm();
              }}
              placeholder={t("admin.storage_move_target_placeholder", language)}
              className="h-9 w-full rounded-md border bg-input px-3 font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
              style={{ borderColor: invalidTarget ? "var(--destructive)" : "var(--border)" }}
            />
            {invalidTarget && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--destructive)" }}>{invalidTarget}</p>
            )}
            {normalTarget && !invalidTarget && (
              <p className="mt-1 truncate font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {photos.slice(0, 3).map((p) => `${normalTarget}/${basename(p.path || p.id)}`).join(" · ")}
                {photos.length > 3 ? ` · ${t("admin.storage_move_more", language, { count: photos.length - 3 })}` : ""}
              </p>
            )}
          </div>

          {/* 文件夹选择器 */}
          {sourceOptions.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
                  {t("admin.storage_move_pick_folder", language)}
                </p>
                {sourceOptions.length > 1 && (
                  <div className="flex items-center gap-1">
                    {sourceOptions.map((source) => (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => switchSource(source.id)}
                        className="rounded border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-secondary"
                        style={{
                          borderColor: browseSourceId === source.id ? "var(--primary)" : "var(--border)",
                          color: browseSourceId === source.id ? "var(--primary)" : "var(--muted-foreground)",
                        }}
                      >
                        {source.name || source.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 面包屑 */}
              <div className="mb-1.5 flex flex-wrap items-center gap-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={goToRoot}
                  className="rounded px-1 py-0.5 hover:bg-secondary"
                  style={{ color: stack.length === 0 ? "var(--primary)" : "var(--muted-foreground)" }}
                >
                  /
                </button>
                {stack.map((part, index) => (
                  <span key={`${part}-${index}`} className="flex items-center gap-0.5">
                    <ChevronRight size={11} style={{ color: "var(--muted-foreground)" }} />
                    <button
                      type="button"
                      onClick={() => goToBreadcrumb(index)}
                      className="rounded px-1 py-0.5 hover:bg-secondary"
                      style={{ color: index === stack.length - 1 ? "var(--primary)" : "var(--muted-foreground)" }}
                    >
                      {part}
                    </button>
                  </span>
                ))}
              </div>

              <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border p-1.5" style={{ borderColor: "var(--border)" }}>
                {loadingFolders && folders.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    <Loader2 size={13} className="animate-spin" />
                    {t("admin.storage_move_loading", language)}
                  </div>
                ) : folders.length === 0 ? (
                  <div className="py-6 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    {t("admin.storage_move_no_folders", language)}
                  </div>
                ) : (
                  folders.map((name) => {
                    const full = browsePrefix ? `${browsePrefix}/${name}` : name;
                    const active = normalTarget === full;
                    return (
                      <div
                        key={name}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors hover:bg-secondary"
                      >
                        <button
                          type="button"
                          onClick={() => enterFolder(name)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          title={t("admin.storage_move_enter_folder", language)}
                        >
                          {active ? (
                            <FolderOpen size={13} style={{ color: "var(--primary)" }} />
                          ) : (
                            <Folder size={13} style={{ color: "var(--muted-foreground)" }} />
                          )}
                          <span className="min-w-0 truncate" style={{ color: active ? "var(--primary)" : "var(--foreground)" }}>{name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFolder(name)}
                          className="flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-secondary"
                          style={{
                            borderColor: active ? "var(--primary)" : "var(--border)",
                            color: active ? "var(--primary)" : "var(--muted-foreground)",
                          }}
                        >
                          <MoveRight size={10} />
                          {t("admin.storage_move_use_folder", language)}
                        </button>
                      </div>
                    );
                  })
                )}
                {folderHasMore && (
                  <button
                    type="button"
                    onClick={loadMoreFolders}
                    disabled={loadingFolders}
                    className="flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] hover:bg-secondary disabled:opacity-50"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {loadingFolders ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                    {t("admin.storage_move_load_more", language)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center rounded-md border px-3 text-xs transition-colors hover:bg-secondary"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            {t("common.cancel", language)}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={Boolean(invalidTarget) || moving}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {moving ? <Loader2 size={13} className="animate-spin" /> : <MoveRight size={13} />}
            {moving ? t("admin.storage_move_moving", language) : t("admin.storage_move_confirm", language)}
          </button>
        </div>
      </div>
    </div>
  );
}