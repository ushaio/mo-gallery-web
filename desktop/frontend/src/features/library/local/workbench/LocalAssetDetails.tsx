import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  EyeOff,
  FileText,
  FolderInput,
  Heart,
  ImageOff,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Tag as TagIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  LibraryColorStrip,
  LibraryDetailsAction,
  LibraryDetailsEmpty,
  LibraryDetailsFooter,
  LibraryDetailsHeader,
  LibraryDetailsPanel,
  LibraryDetailsPreview,
  LibraryDetailsSection,
  LibraryDetailsSyncCard,
  LibraryFieldBlock,
  LibraryKvItem,
  LibraryKvList,
  LibraryMetaRow,
  LibraryQuickDots,
  LibraryQuickMark,
  LibraryQuickStars,
  LibrarySavingHint,
} from "@/components/ui/library";
import { CloudIcon, CloudOffIcon } from "@/components/icons/CloudIcons";
import { isPhotoAsset } from "../types";
import type { LocalAsset, LocalCollection, LocalTag } from "../types";
import type { LocalLibraryCopy } from "../copy";

interface Props {
  asset: LocalAsset | null;
  copy: LocalLibraryCopy;
  /** 资源库根目录（绝对路径），用于复制完整路径。 */
  rootPath: string;
  saving: boolean;
  maintenanceBusy: boolean;
  tags: LocalTag[];
  collections: LocalCollection[];
  organizationBusy: boolean;
  onSave: (
    assetId: string,
    patch: Pick<
      LocalAsset,
      "displayTitle" | "notes" | "rating" | "colorLabel" | "isFavorite"
    >,
  ) => Promise<void>;
  onPreview: (asset: LocalAsset) => void;
  onOpenSystem: (asset: LocalAsset) => void;
  onMove: (asset: LocalAsset) => void;
  onDelete: (asset: LocalAsset) => void;
  onRestore: (asset: LocalAsset) => void;
  onRetryPreview: (asset: LocalAsset) => void;
  onRecheckMissing: (asset: LocalAsset) => void;
  onRemoveMissing: (asset: LocalAsset) => void;
  onSetTags: (assetId: string, tagIds: string[]) => Promise<void>;
  onCreateTag: (name: string) => Promise<LocalTag | undefined>;
  onSetCollections: (assetId: string, collectionIds: string[]) => Promise<void>;
  /** 从信息栏发起上传（打开上传设置弹窗）。 */
  onUpload: (asset: LocalAsset) => void;
}

import {
  COLOR_SWATCHES,
  formatAperture,
  formatBytes,
  formatDate,
  formatExposure,
  formatFocalLength,
  TAG_PREVIEW_COUNT,
} from "./details/format";
import { CloudInfoDialog } from "./details/CloudInfoDialog";

/* ─── 主组件 ─── */

export function LocalAssetDetails(props: Props) {
  return (
    <LocalAssetDetailsContent key={props.asset?.id ?? "none"} {...props} />
  );
}

function LocalAssetDetailsContent({
  asset,
  copy,
  rootPath,
  saving,
  maintenanceBusy,
  tags,
  collections,
  organizationBusy,
  onSave,
  onPreview,
  onOpenSystem,
  onMove,
  onDelete,
  onRestore,
  onRetryPreview,
  onRecheckMissing,
  onRemoveMissing,
  onSetTags,
  onCreateTag,
  onSetCollections,
  onUpload,
}: Props) {
  const [title, setTitle] = useState(asset?.displayTitle || "");
  const [notes, setNotes] = useState(asset?.notes || "");
  const [rating, setRating] = useState(asset?.rating || 0);
  const [color, setColor] = useState(asset?.colorLabel || "");
  const [favorite, setFavorite] = useState(Boolean(asset?.isFavorite));
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(true);
  /* 标签录入与云端分类同构：默认收起，点加号才展开输入框 */
  const [addingTag, setAddingTag] = useState(false);
  const [organizationOpen, setOrganizationOpen] = useState(true);
  const [shootingOpen, setShootingOpen] = useState(true);
  const [fileInfoOpen, setFileInfoOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [cloudInfoOpen, setCloudInfoOpen] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [assignedTagIds, setAssignedTagIds] = useState<string[]>(
    () => asset?.tags.map((tag) => tag.id) || [],
  );
  const notesEditorRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const savePatch = useCallback(
    (
      overrides: Partial<
        Pick<
          LocalAsset,
          "displayTitle" | "notes" | "rating" | "colorLabel" | "isFavorite"
        >
      > = {},
    ) => {
      if (!asset) return Promise.resolve();
      return onSave(asset.id, {
        displayTitle: title,
        notes,
        rating,
        colorLabel: color,
        isFavorite: favorite,
        ...overrides,
      });
    },
    [asset, color, favorite, notes, onSave, rating, title],
  );

  /* 标题：原位编辑，Enter/失焦保存，Esc 取消 */
  const commitTitle = useCallback(() => {
    setEditingTitle(false);
    if (!asset) return;
    const unchanged = title === (asset.displayTitle || "")
      || (!asset.displayTitle && title === asset.fileName);
    if (unchanged) return;
    void savePatch({ displayTitle: title });
  }, [asset, savePatch, title]);

  /* 备注：原位编辑，按钮或外部点击保存 */
  const commitNotes = useCallback(() => {
    setEditingNotes(false);
    if (!asset || notes === (asset.notes || "")) return;
    void savePatch({ notes });
  }, [asset, notes, savePatch]);

  useEffect(() => {
    if (!editingNotes) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!notesEditorRef.current?.contains(event.target as Node))
        commitNotes();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [editingNotes, commitNotes]);

  const assignedTags = useMemo(() => {
    const source = new Map(
      [...tags, ...(asset?.tags || [])].map((tag) => [tag.id, tag]),
    );
    return assignedTagIds.flatMap((id) =>
      source.get(id) ? [source.get(id)!] : [],
    );
  }, [asset?.tags, assignedTagIds, tags]);

  const matchingTags = useMemo(() => {
    const query = tagQuery.trim().toLocaleLowerCase();
    return tags
      .filter(
        (tag) =>
          !assignedTagIds.includes(tag.id) &&
          (!query || tag.name.toLocaleLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [assignedTagIds, tagQuery, tags]);

  const updateTags = async (nextIds: string[]) => {
    if (!asset) return;
    setAssignedTagIds(nextIds);
    await onSetTags(asset.id, nextIds);
  };

  const addTag = async (tag?: LocalTag) => {
    const name = tagQuery.trim();
    const selected =
      tag ||
      tags.find(
        (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      ) ||
      (name ? await onCreateTag(name) : undefined);
    if (!selected || assignedTagIds.includes(selected.id)) return;
    await updateTags([...assignedTagIds, selected.id]);
    setTagQuery("");
    setTagMenuOpen(false);
    tagInputRef.current?.focus();
  };

  const toggleCollection = async (collectionId: string) => {
    if (!asset) return;
    const currentIds = asset.collections.map((c) => c.id);
    const nextIds = currentIds.includes(collectionId)
      ? currentIds.filter((id) => id !== collectionId)
      : [...currentIds, collectionId];
    await onSetCollections(asset.id, nextIds);
  };

  const copyPath = async () => {
    if (!asset) return;
    /* 复制完整路径：根目录 + 相对路径，分隔符跟随根目录风格 */
    const sep = rootPath.includes("\\") ? "\\" : "/";
    const base = rootPath.replace(/[\\/]+$/, "");
    const fullPath = `${base}${sep}${asset.relativePath.replace(/[\\/]+/g, sep)}`;
    try {
      await navigator.clipboard.writeText(fullPath);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  if (!asset) {
    return (
      <LibraryDetailsEmpty
        icon={ImageOff}
        message={copy.noSelection}
        data-local-library-guide="details"
      />
    );
  }

  const previewPending =
    asset.previewStatus === "pending" || asset.previewStatus === "generating";
  const unavailable = asset.previewStatus === "unavailable";
  const missing = asset.availability === "missing";
  const trashed = asset.availability === "trashed";
  const isPhoto = isPhotoAsset(asset);
  const exif = asset.exif;
  const cameraLabel = [exif?.cameraMake, exif?.cameraModel]
    .filter(Boolean)
    .join(" ");
  /* 三列参数卡（参考稿 .kv2：焦距/光圈/快门），其余进下方 kv 行 */
  const exposureCards = (
    [
      {
        label: copy.filterFocalLength,
        value: formatFocalLength(exif?.focalLengthMm),
      },
      { label: copy.filterAperture, value: formatAperture(exif?.aperture) },
      {
        label: copy.filterExposure,
        value: formatExposure(exif?.shutterSeconds),
      },
    ] as Array<{ label: string; value: string | null }>
  ).filter((parameter): parameter is { label: string; value: string } =>
    Boolean(parameter.value),
  );
  const hasExif =
    isPhoto &&
    Boolean(
      cameraLabel ||
        exif?.lensModel ||
        exif?.iso ||
        exposureCards.length > 0,
    );
  const dimensionLabel =
    asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
  const uploaded = asset.uploadStatus === "uploaded" || asset.isUploaded;
  const visibleTags = tagsExpanded
    ? assignedTags
    : assignedTags.slice(0, TAG_PREVIEW_COUNT);
  const hiddenTagCount = assignedTags.length - visibleTags.length;
  const hasCustomTitle = Boolean(title) && title !== asset.fileName;

  /* ── 合并卡片第一段：预览图 + 异常状态提示 ── */
  const previewSegment = (
    <>
      <LibraryDetailsPreview
        onOpen={() => onPreview(asset)}
        disabled={previewPending || missing || trashed}
        title={copy.preview}
      >
        {asset.previewStatus === "ready" && isPhoto ? (
          <img
            src={asset.previewUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : previewPending && isPhoto ? (
          <div
            className="flex flex-col items-center gap-2.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Loader2 size={22} className="animate-spin" />
            <span className="text-[10px]">{copy.generatingPreview}</span>
          </div>
        ) : isPhoto ? (
          <ImageOff
            size={26}
            strokeWidth={1.2}
            style={{ color: "var(--muted-foreground)" }}
          />
        ) : (
          <span
            className="flex flex-col items-center gap-2"
            style={{ color: "var(--muted-foreground)" }}
          >
            <FileText size={28} strokeWidth={1.2} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {asset.format}
            </span>
          </span>
        )}
      </LibraryDetailsPreview>

      {/* 异常状态提示（仅异常时出现） */}
      {missing && (
        <div
          className="mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[10px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, #F59E0B 30%, transparent)",
            backgroundColor: "color-mix(in srgb, #F59E0B 8%, transparent)",
            color: "#B45309",
          }}
        >
          <Info size={11} className="mt-0.5 shrink-0" />
          <span>{copy.missingHint}</span>
        </div>
      )}
      {trashed && asset.trashEntryKind === "folder" && (
        <div
          className="mt-2.5 rounded-lg border px-3 py-2.5 text-[10px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, #F59E0B 30%, transparent)",
            backgroundColor: "color-mix(in srgb, #F59E0B 8%, transparent)",
            color: "#B45309",
          }}
        >
          {copy.folderBatchHint}
        </div>
      )}
      {!missing && unavailable && isPhoto && (
        <div
          className="mt-2.5 space-y-1 rounded-lg px-3 py-2.5 text-[10px] leading-relaxed"
          style={{
            backgroundColor: "var(--secondary)",
            color: "var(--muted-foreground)",
          }}
        >
          <p
            className="flex items-center gap-1.5 font-medium"
            style={{ color: "var(--foreground)" }}
          >
            <EyeOff size={11} />
            {copy.unavailablePreview}
          </p>
          {asset.previewError && (
            <p className="line-clamp-3 break-words pl-5">
              {copy.previewFailureReason}: {asset.previewError}
            </p>
          )}
        </div>
      )}
    </>
  );

  /* ── 合并卡片第二段：标题原位编辑 ── */
  const titleSegment = (
    <div>
      {editingTitle ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={asset.fileName}
          className="w-full rounded-md border bg-input px-2.5 py-1.5 text-sm font-semibold outline-none focus:ring-1"
          style={{
            borderColor: "var(--primary)",
            color: "var(--foreground)",
          }}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setTitle(asset.displayTitle || "");
              setEditingTitle(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            // 无自定义标题时，把原文件名带进编辑框，而不是从空白开始
            setTitle((current) => current || asset.fileName);
            setEditingTitle(true);
          }}
          title={title ? `${copy.titleField}: ${title}` : copy.titleField}
          className="group flex w-full items-start gap-1.5 rounded text-left"
        >
          <h2
            className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug"
            style={{ color: "var(--foreground)" }}
          >
            {title || asset.fileName}
          </h2>
          <Pencil
            size={11}
            className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: "var(--muted-foreground)" }}
          />
        </button>
      )}
      {/* 文件名副标题：仅当自定义标题存在且不同于文件名时显示 */}
      {hasCustomTitle && !editingTitle && (
        <p
          className="mt-1 truncate text-[10px]"
          style={{ color: "var(--muted-foreground)" }}
          title={asset.fileName}
        >
          {asset.fileName}
        </p>
      )}

      {/* ── 标签：与云端分类同一套交互 ──
          有标签显示 chip，无标签显示虚线「添加」chip（参考稿 .tagrow .chip.add）；
          点击后原地变成 chip 大小的内联输入框，回车确认、Esc 取消。 */}
      <div className="relative mt-2">
        <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="group/chip inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--secondary)",
                }}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: tag.color || "var(--muted-foreground)",
                  }}
                />
                <span className="truncate">{tag.name}</span>
                <button
                  type="button"
                  disabled={organizationBusy}
                  aria-label={`${copy.remove} ${tag.name}`}
                  onClick={() =>
                    void updateTags(
                      assignedTagIds.filter((id) => id !== tag.id),
                    )
                  }
                  className="flex size-3.5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-destructive/15 group-hover/chip:opacity-100 disabled:opacity-50"
                  style={{ color: "var(--destructive)" }}
                >
                  <X size={8} />
                </button>
              </span>
            ))}
            {hiddenTagCount > 0 && (
              <button
                type="button"
                onClick={() => setTagsExpanded(!tagsExpanded)}
                className="rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:bg-secondary"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                {tagsExpanded ? copy.collapse : `+${hiddenTagCount}`}
              </button>
            )}
            {/* 添加入口：默认是虚线 chip（参考稿 .chip.add），点击原地变输入框 */}
            {addingTag ? (
              <input
                ref={tagInputRef}
                autoFocus
                value={tagQuery}
                disabled={organizationBusy}
                onFocus={() => setTagMenuOpen(true)}
                onChange={(e) => {
                  setTagQuery(e.target.value);
                  setTagMenuOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTag();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTagQuery("");
                    setTagMenuOpen(false);
                    setAddingTag(false);
                  }
                }}
                onBlur={() => {
                  /* 失焦时已输入则提交，否则直接收回 chip */
                  if (tagQuery.trim()) void addTag();
                  else {
                    setTagMenuOpen(false);
                    setAddingTag(false);
                  }
                }}
                placeholder={copy.tagInputPlaceholder}
                className="h-[22px] w-36 rounded-full border bg-transparent px-2.5 text-[10px] outline-none transition-colors focus:border-primary disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              />
            ) : (
              <button
                type="button"
                disabled={organizationBusy}
                title={copy.tags}
                aria-label={copy.tags}
                onClick={() => setAddingTag(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[10px] transition-colors hover:bg-secondary disabled:opacity-40"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                <Plus size={10} />
                {copy.add}
              </button>
            )}
          </div>

        {addingTag && tagMenuOpen && (matchingTags.length > 0 || tagQuery.trim()) && (
          <div
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border p-1 shadow-lg"
            style={{
              borderColor: "var(--border)",
              backgroundColor: "var(--popover)",
            }}
          >
            {matchingTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addTag(tag)}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-secondary"
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    backgroundColor: tag.color || "var(--muted-foreground)",
                  }}
                />
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
            {tagQuery.trim() &&
              !tags.some(
                (tag) =>
                  tag.name.toLocaleLowerCase() ===
                  tagQuery.trim().toLocaleLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void addTag()}
                  className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors hover:bg-secondary"
                  style={{ color: "var(--primary)" }}
                >
                  <Plus size={11} />
                  {copy.createTagFromInput.replace("{name}", tagQuery.trim())}
                </button>
              )}
          </div>
        )}
      </div>
    </div>
  );

  /* ── 合并卡片第三段：快捷标记行（参考稿 .quick 骨架：收藏 ♥ → 评分 ★ → 颜色圆点 → 弹性空隙） ── */
  const marksSegment = (
    <div className="flex items-center gap-1">
      <LibraryQuickMark
        icon={Heart}
        active={favorite}
        title={favorite ? copy.unmarkFavorite : copy.markFavorite}
        onClick={() => {
          const next = !favorite;
          setFavorite(next);
          void savePatch({ isFavorite: next });
        }}
      />
      {isPhoto && (
        <LibraryQuickStars
          value={rating}
          label={copy.rating}
          onChange={(next) => {
            setRating(next);
            void savePatch({ rating: next });
          }}
        />
      )}
      {isPhoto && (
        <LibraryQuickDots
          colors={COLOR_SWATCHES.map((swatch) => ({
            value: swatch.value,
            bg: swatch.bg,
            label: swatch.nameKey ? copy[swatch.nameKey] : swatch.label,
          }))}
          value={color}
          label={copy.color}
          onChange={(next) => {
            setColor(next);
            void savePatch({ colorLabel: next });
          }}
        />
      )}
      <span className="flex-1" />
    </div>
  );

  return (
    <LibraryDetailsPanel data-local-library-guide="details">
      {/* ── 顶部合并卡片：预览图 + 标题 + 标记工具条 ── */}
      <LibraryDetailsHeader
        preview={previewSegment}
        title={titleSegment}
        marks={marksSegment}
      />

      {/* ── 云端同步状态卡片（参考稿 .sync 区块）：
          已上传 → 主色图标方块 + 云端路径 + 查看云端信息按钮；
          未上传 → 中性方块 + 本机提示 + 立即上传按钮。仅照片可上传。 ── */}
      {isPhoto &&
        (uploaded ? (
          <LibraryDetailsSyncCard
            ok
            icon={CloudIcon}
            title={copy.uploadedToCloud}
            subtitle={asset.cloudPath || asset.cloudPhotoId}
            trailing={
              <button
                type="button"
                onClick={() => setCloudInfoOpen(true)}
                title={copy.cloudDetails}
                aria-label={copy.cloudDetails}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors hover:bg-secondary"
                style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
              >
                <ExternalLink size={13} />
              </button>
            }
          />
        ) : (
          <LibraryDetailsSyncCard
            icon={CloudOffIcon}
            title={copy.filterNotUploaded}
            subtitle={copy.notUploadedHint.replace(
              "{size}",
              asset.byteSize > 0 ? formatBytes(asset.byteSize) : "",
            )}
            trailing={
              <button
                type="button"
                disabled={missing || trashed}
                onClick={() => onUpload(asset)}
                title={copy.uploadNow}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                <Upload size={12} />
                {copy.uploadNow}
              </button>
            }
          />
        ))}

      {/* ── 文件信息（参考稿「基本信息」，kv 键值行布局） ── */}
      <LibraryDetailsSection
        label={copy.details}
        icon={FileText}
        open={fileInfoOpen}
        onToggle={() => setFileInfoOpen((v) => !v)}
      >
        <LibraryKvList>
          {dimensionLabel && (
            <LibraryKvItem
              label={copy.dimensions}
              mono
              value={
                <>
                  {dimensionLabel}
                  {asset.width && asset.height ? (
                    <span
                      className="ml-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      · {((asset.width * asset.height) / 1e6).toFixed(1)} MP
                    </span>
                  ) : null}
                </>
              }
            />
          )}
          {asset.byteSize > 0 && (
            <LibraryKvItem
              label={copy.fileSize}
              value={formatBytes(asset.byteSize)}
            />
          )}
          {isPhoto && asset.capturedAt && (
            <LibraryKvItem
              label={copy.captured}
              value={formatDate(asset.capturedAt)}
            />
          )}
          <LibraryKvItem
            label={copy.modified}
            value={formatDate(asset.modifiedAtNs)}
          />
          <LibraryKvItem label={copy.format} value={asset.format.toUpperCase()} />
          <LibraryKvItem
            label={copy.originalPath}
            mono
            value={asset.relativePath}
            action={
              <button
                type="button"
                onClick={() => void copyPath()}
                title={pathCopied ? copy.copied : copy.copyPath}
                aria-label={copy.copyPath}
                className="flex shrink-0 items-center justify-center rounded p-0.5 opacity-0 transition-opacity hover:bg-secondary group-hover/kv:opacity-100"
                style={{
                  color: pathCopied ? "var(--primary)" : "var(--muted-foreground)",
                }}
              >
                {pathCopied ? <Check size={11} /> : <Copy size={11} />}
              </button>
            }
          />
        </LibraryKvList>

        {/* 主色：放在区块末尾（与云端照片信息同一排布），有数据才显示 */}
        {isPhoto && asset.dominantColors && asset.dominantColors.length > 0 && (
          <LibraryFieldBlock label={copy.dominantColors} className="mt-2.5">
            <LibraryColorStrip colors={asset.dominantColors} />
          </LibraryFieldBlock>
        )}
      </LibraryDetailsSection>

      {/* ── 拍摄信息（参考稿「拍摄参数」：三列参数卡 + kv 行；有 EXIF 才显示） ── */}
      {hasExif && (
        <LibraryDetailsSection
          label={copy.filterCamera}
          icon={Camera}
          open={shootingOpen}
          onToggle={() => setShootingOpen((v) => !v)}
        >
          {exposureCards.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {exposureCards.map((parameter) => (
                <LibraryMetaRow
                  key={`${parameter.label}-${parameter.value}`}
                  card
                  mono
                  label={parameter.label}
                  value={parameter.value}
                />
              ))}
            </div>
          )}
          {(cameraLabel || exif?.lensModel || exif?.iso) && (
            <LibraryKvList
              className={exposureCards.length > 0 ? "mt-2.5" : undefined}
            >
              {cameraLabel && (
                <LibraryKvItem label={copy.camera} value={cameraLabel} />
              )}
              {exif?.lensModel && (
                <LibraryKvItem label={copy.lens} value={exif.lensModel} />
              )}
              {exif?.iso && (
                <LibraryKvItem label="ISO" mono value={exif.iso} />
              )}
            </LibraryKvList>
          )}
        </LibraryDetailsSection>
      )}

      {/* ── 标签与集合 ── */}
      <LibraryDetailsSection
        label={copy.collections}
        icon={TagIcon}
        open={organizationOpen}
        onToggle={() => setOrganizationOpen((v) => !v)}
        count={asset.collections.length}
      >
        <div className="space-y-4">
          {/* 集合勾选列表（标签已移到标题下方，与云端分类同构） */}
          <div>
            {collections.length === 0 ? (
              <p
                className="text-[10px] italic"
                style={{ color: "var(--muted-foreground)" }}
              >
                {copy.noCollections}
              </p>
            ) : (
              <div className="custom-scrollbar max-h-36 space-y-0.5 overflow-y-auto">
                {collections.map((collection) => {
                  const checked = asset.collections.some(
                    (item) => item.id === collection.id,
                  );
                  return (
                    <label
                      key={collection.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-secondary"
                    >
                      <span
                        className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                        style={{
                          borderColor: checked
                            ? "var(--primary)"
                            : "var(--border)",
                          backgroundColor: checked
                            ? "var(--primary)"
                            : "transparent",
                        }}
                      >
                        {checked && (
                          <Check
                            size={10}
                            style={{ color: "var(--primary-foreground)" }}
                          />
                        )}
                      </span>
                      <input
                        type="checkbox"
                        disabled={organizationBusy}
                        checked={checked}
                        onChange={() => void toggleCollection(collection.id)}
                        className="sr-only"
                      />
                      <span
                        className="min-w-0 flex-1 truncate"
                        style={{
                          color: checked
                            ? "var(--foreground)"
                            : "var(--muted-foreground)",
                        }}
                      >
                        {collection.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </LibraryDetailsSection>

      {/* ── 备注（参考稿「备注」折叠区块，默认收起） ── */}
      <div ref={notesEditorRef}>
        <LibraryDetailsSection
          label={copy.notes}
          icon={Pencil}
          open={notesOpen}
          onToggle={() => setNotesOpen((v) => !v)}
        >
          {editingNotes ? (
            <div>
              <textarea
                autoFocus
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder={copy.notes}
                className="w-full resize-none rounded-xl border bg-input/80 px-3 py-2 text-[11px] leading-relaxed outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
                style={{ borderColor: "var(--primary)" }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setNotes(asset.notes || "");
                    setEditingNotes(false);
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNotes(asset.notes || "");
                    setEditingNotes(false);
                  }}
                  className="rounded-md px-3 py-1.5 text-[11px] transition-colors hover:bg-secondary"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {copy.cancelAction}
                </button>
                <button
                  type="button"
                  onClick={commitNotes}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  <Check size={11} />
                  {copy.save}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="group block w-full text-left"
            >
              {notes ? (
                <p
                  className="whitespace-pre-wrap break-words text-[11px] leading-relaxed"
                  style={{ color: "var(--foreground)" }}
                >
                  {notes}
                </p>
              ) : (
                <p
                  className="text-[11px] italic"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {copy.notes}
                  …
                </p>
              )}
            </button>
          )}
          {saving && !editingNotes && <LibrarySavingHint label={copy.autoSaving} />}
        </LibraryDetailsSection>
      </div>

      {/* ── 操作区（参考稿 .ins-foot：粘性贴底，常驻不折叠） ── */}
      <LibraryDetailsFooter>
        {missing ? (
          <div className="flex w-full flex-col gap-2">
            <LibraryDetailsAction
              icon={RefreshCw}
              label={copy.recheckMissing}
              onClick={() => onRecheckMissing(asset)}
              disabled={maintenanceBusy}
              loading={maintenanceBusy}
            />
            <LibraryDetailsAction
              icon={Trash2}
              label={copy.removeMissingRecord}
              onClick={() => onRemoveMissing(asset)}
              disabled={maintenanceBusy}
              destructive
            />
          </div>
        ) : trashed ? (
          <div className="flex w-full flex-col gap-2">
            <LibraryDetailsAction
              icon={RotateCcw}
              label={copy.restoreTrashedAsset}
              onClick={() => onRestore(asset)}
              primary
            />
            <LibraryDetailsAction
              icon={Trash2}
              label={copy.permanentTrashedAsset}
              onClick={() => onDelete(asset)}
              destructive
            />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {asset.availability === "active" && unavailable && isPhoto && (
              <LibraryDetailsAction
                icon={RefreshCw}
                label={copy.retryPreview}
                onClick={() => onRetryPreview(asset)}
                disabled={maintenanceBusy}
                loading={maintenanceBusy}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <LibraryDetailsAction
                  compact
                  icon={ExternalLink}
                  label={copy.openSystem}
                  onClick={() => onOpenSystem(asset)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <LibraryDetailsAction
                  compact
                  icon={FolderInput}
                  label={copy.moveAssetsToFolder}
                  onClick={() => onMove(asset)}
                />
              </div>
              <button
                type="button"
                onClick={() => onDelete(asset)}
                title={copy.delete}
                aria-label={copy.delete}
                className="flex h-[34px] w-9 shrink-0 items-center justify-center rounded-lg border transition-colors hover:bg-destructive/10"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--destructive) 35%, transparent)",
                  color: "var(--destructive)",
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}
      </LibraryDetailsFooter>

      {/* ── 云端照片信息弹窗 ── */}
      {cloudInfoOpen && (
        <CloudInfoDialog
          copy={copy}
          asset={asset}
          onClose={() => setCloudInfoOpen(false)}
        />
      )}
    </LibraryDetailsPanel>
  );
}
