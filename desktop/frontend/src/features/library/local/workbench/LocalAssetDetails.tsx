import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
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
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import {
  LibraryColorStrip,
  LibraryDetailsAction,
  LibraryDetailsEmpty,
  LibraryDetailsHeader,
  LibraryDetailsPanel,
  LibraryDetailsPreview,
  LibraryDetailsSection,
  LibraryFieldBlock,
  LibraryMetaRow,
  LibraryMonoValue,
  LibrarySavingHint,
  LibraryStatusPill,
} from "@/components/ui/library";
import { CloudIcon, CloudOffIcon } from "@/components/icons/CloudIcons";
import { isPhotoAsset } from "../types";
import type { LocalAsset, LocalCollection, LocalTag } from "../types";
import type { LocalLibraryCopy } from "../copy";

interface Props {
  asset: LocalAsset | null;
  copy: LocalLibraryCopy;
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
  const [hoverRating, setHoverRating] = useState(0);
  const [cloudInfoOpen, setCloudInfoOpen] = useState(false);
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
  const cameraParameters = [
    { label: copy.filterAperture, value: formatAperture(exif?.aperture) },
    { label: copy.filterExposure, value: formatExposure(exif?.shutterSeconds) },
    { label: "ISO", value: exif?.iso ? `ISO ${exif.iso}` : null },
    {
      label: copy.filterFocalLength,
      value: formatFocalLength(exif?.focalLengthMm),
    },
  ].filter((parameter): parameter is { label: string; value: string } =>
    Boolean(parameter.value),
  );
  const hasExif =
    isPhoto &&
    Boolean(cameraLabel || exif?.lensModel || cameraParameters.length > 0);
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
          有标签显示 chip，无标签只留一个加号；点加号才展开输入框与自动补全。
          放在标题下方而不是折叠区块里，让「这张照片是什么」一眼看完。 */}
      <div className="relative mt-2">
        {addingTag ? (
          <div
            className="flex items-center rounded-lg border transition-colors focus-within:border-primary"
            style={{ borderColor: "var(--primary)" }}
          >
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
              placeholder={copy.tagInputPlaceholder}
              className="h-7 min-w-0 flex-1 bg-transparent px-2.5 text-[11px] outline-none"
              style={{ color: "var(--foreground)" }}
            />
            <button
              type="button"
              disabled={organizationBusy || !tagQuery.trim()}
              title={copy.add}
              aria-label={copy.add}
              onClick={() => void addTag()}
              className="flex size-7 items-center justify-center transition-colors hover:bg-secondary disabled:opacity-40"
              style={{ color: "var(--primary)" }}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              title={copy.cancelAction}
              aria-label={copy.cancelAction}
              onClick={() => {
                setTagQuery("");
                setTagMenuOpen(false);
                setAddingTag(false);
              }}
              className="flex size-7 items-center justify-center rounded-r-lg transition-colors hover:bg-secondary"
              style={{ color: "var(--muted-foreground)" }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
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
            {/* 无标签时这就是唯一可见的控件，与云端无分类时的加号一致 */}
            <button
              type="button"
              disabled={organizationBusy}
              title={copy.tags}
              aria-label={copy.tags}
              onClick={() => setAddingTag(true)}
              className="flex size-5 items-center justify-center rounded-full border transition-colors hover:bg-secondary disabled:opacity-40"
              style={{
                borderColor: "var(--border)",
                color: "var(--muted-foreground)",
              }}
            >
              <Plus size={10} />
            </button>
          </div>
        )}

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

  /* ── 合并卡片第三段：收藏 / 评分 / 颜色（都是“给照片打标记”，聚在一起） ── */
  const marksSegment = (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1">
        {/* 收藏 */}
        <button
          type="button"
          title={favorite ? copy.unmarkFavorite : copy.markFavorite}
          aria-label={favorite ? copy.unmarkFavorite : copy.markFavorite}
          aria-pressed={favorite}
          onClick={() => {
            const next = !favorite;
            setFavorite(next);
            void savePatch({ isFavorite: next });
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-90"
          style={{
            backgroundColor: favorite
              ? "color-mix(in srgb, var(--primary) 12%, transparent)"
              : "transparent",
            color: favorite ? "var(--primary)" : "var(--muted-foreground)",
          }}
          onMouseEnter={(e) => {
            if (!favorite)
              e.currentTarget.style.backgroundColor = "var(--secondary)";
          }}
          onMouseLeave={(e) => {
            if (!favorite)
              e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <Heart
            size={15}
            fill={favorite ? "currentColor" : "none"}
            strokeWidth={favorite ? 2 : 1.6}
          />
        </button>

        <span
          className="mx-1 h-5 w-px shrink-0"
          style={{ backgroundColor: "var(--border)" }}
        />

        {/* 评分：点击同星级 = 清除，无需额外按钮 */}
        {isPhoto ? (
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label={copy.rating}
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const isActive = value <= (hoverRating || rating);
              return (
                <button
                  key={value}
                  type="button"
                  title={`${copy.rating}: ${value}`}
                  aria-label={`${copy.rating}: ${value}`}
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => {
                    const next = rating === value ? 0 : value;
                    setRating(next);
                    void savePatch({ rating: next });
                  }}
                  className="rounded p-0.5 transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    size={15}
                    fill={isActive ? "currentColor" : "none"}
                    strokeWidth={isActive ? 2 : 1.6}
                    style={{
                      color: isActive ? "#F59E0B" : "var(--muted-foreground)",
                      transition: "all 0.12s ease",
                    }}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <span className="flex-1" />
        )}

        {/* 上传状态（已上传可点击查看云端信息；未上传灰色不可点击） */}
        {uploaded ? (
          <LibraryStatusPill
            icon={CloudIcon}
            label={copy.filterUploaded}
            tone="success"
            onClick={() => setCloudInfoOpen(true)}
          />
        ) : (
          <LibraryStatusPill
            icon={CloudOffIcon}
            label={copy.filterNotUploaded}
          />
        )}
      </div>

      {/* 颜色标记：点击当前选中色 = 取消，无需额外按钮 */}
      {isPhoto && (
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label={copy.color}
        >
          {COLOR_SWATCHES.map((swatch) => {
            const selected = color === swatch.value;
            const name = swatch.nameKey ? copy[swatch.nameKey] : swatch.label;
            return (
              <button
                key={swatch.value}
                type="button"
                title={`${copy.color}: ${name}${selected ? `（${copy.noColor}）` : ""}`}
                aria-label={`${copy.color}: ${name}`}
                aria-pressed={selected}
                onClick={() => {
                  const next = selected ? "" : swatch.value;
                  setColor(next);
                  void savePatch({ colorLabel: next });
                }}
                className="size-5 rounded-full transition-all hover:scale-110 active:scale-95"
                style={{
                  backgroundColor: swatch.bg,
                  boxShadow: selected
                    ? "0 0 0 2px var(--background), 0 0 0 3.5px var(--foreground)"
                    : "0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent)",
                }}
              />
            );
          })}
          {color && (
            <span
              className="ml-1 text-[9px] uppercase tracking-wide"
              style={{ color: "var(--muted-foreground)" }}
            >
              {COLOR_SWATCHES.find((s) => s.value === color)?.nameKey
                ? copy[
                    COLOR_SWATCHES.find((s) => s.value === color)!
                      .nameKey as "red"
                  ]
                : copy.color}
            </span>
          )}
        </div>
      )}
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

      {/* ── 备注：原位编辑 ── */}
      <div
        className="border-b px-4 py-3.5"
        style={{ borderColor: "var(--border)" }}
        ref={notesEditorRef}
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
            <span
              className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {copy.notes}
              <Pencil
                size={9}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            </span>
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
                —
              </p>
            )}
          </button>
        )}
        {saving && !editingNotes && <LibrarySavingHint label={copy.autoSaving} />}
      </div>

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

      {/* ── 拍摄信息（有 EXIF 才显示） ── */}
      {hasExif && (
        <LibraryDetailsSection
          label={copy.filterCamera}
          icon={Camera}
          open={shootingOpen}
          onToggle={() => setShootingOpen((v) => !v)}
        >
          <div className="grid grid-cols-2 gap-2">
            {cameraLabel && (
              <div className="min-w-0 rounded-md border px-2.5 py-2">
                <p
                  className="truncate text-[9px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {copy.filterCamera}
                </p>
                <p
                  className="mt-1 break-words text-[11px] font-medium leading-snug"
                  style={{ color: "var(--foreground)" }}
                >
                  {cameraLabel}
                </p>
              </div>
            )}
            {exif?.lensModel && (
              <div className="min-w-0 rounded-md border px-2.5 py-2">
                <p
                  className="truncate text-[9px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {copy.filterLens}
                </p>
                <p
                  className="mt-1 break-words text-[11px] font-medium leading-snug"
                  style={{ color: "var(--foreground)" }}
                >
                  {exif.lensModel}
                </p>
              </div>
            )}
            {cameraParameters.map((parameter) => (
              <LibraryMetaRow
                key={`${parameter.label}-${parameter.value}`}
                card
                mono
                label={parameter.label}
                value={parameter.value}
              />
            ))}
          </div>
        </LibraryDetailsSection>
      )}

      {/* ── 文件信息（默认展开） ── */}
      <LibraryDetailsSection
        label={copy.details}
        icon={FileText}
        open={fileInfoOpen}
        onToggle={() => setFileInfoOpen((v) => !v)}
      >
        {/*
          时间/尺寸/体积/格式走两列卡片网格：逐行铺开会把这个区块拉得很长，
          而这些值都短，半栏宽度足够，两列排布能把纵向长度砍掉近一半，
          视觉上也与上面「拍摄信息」的参数网格统一。
        */}
        <div className="grid grid-cols-2 gap-2">
          {isPhoto && asset.capturedAt && (
            <LibraryMetaRow
              card
              label={copy.captured}
              value={formatDate(asset.capturedAt)}
            />
          )}
          <LibraryMetaRow
            card
            label={copy.modified}
            value={formatDate(asset.modifiedAtNs)}
          />
          {dimensionLabel && (
            <LibraryMetaRow
              card
              mono
              label={copy.dimensions}
              value={dimensionLabel}
            />
          )}
          {asset.byteSize > 0 && (
            <LibraryMetaRow
              card
              label={copy.fileSize}
              value={formatBytes(asset.byteSize)}
            />
          )}
          <LibraryMetaRow
            card
            label={copy.format}
            value={asset.format.toUpperCase()}
          />
        </div>

        {/* 主色 */}
        {isPhoto && asset.dominantColors && asset.dominantColors.length > 0 && (
          <LibraryFieldBlock label={copy.dominantColors}>
            <LibraryColorStrip colors={asset.dominantColors} />
          </LibraryFieldBlock>
        )}

        {/* 路径：长值不进网格，单独整宽一行才不会被挤成两三行 */}
        <LibraryFieldBlock label={copy.originalPath}>
          <LibraryMonoValue value={asset.relativePath} />
        </LibraryFieldBlock>
      </LibraryDetailsSection>

      {/* ── 操作区（常驻，不折叠） ── */}
      <div className="mt-auto space-y-2 px-4 pb-5 pt-4">
        {missing ? (
          <>
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
          </>
        ) : trashed ? (
          <>
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
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <LibraryDetailsAction
                icon={ExternalLink}
                label={copy.openSystem}
                onClick={() => onOpenSystem(asset)}
              />
              <LibraryDetailsAction
                icon={FolderInput}
                label={copy.moveAssetsToFolder}
                onClick={() => onMove(asset)}
              />
            </div>
            {asset.availability === "active" && unavailable && isPhoto && (
              <LibraryDetailsAction
                icon={RefreshCw}
                label={copy.retryPreview}
                onClick={() => onRetryPreview(asset)}
                disabled={maintenanceBusy}
                loading={maintenanceBusy}
              />
            )}
            <div
              className="h-px"
              style={{ backgroundColor: "var(--border)" }}
            />
            <LibraryDetailsAction
              icon={Trash2}
              label={copy.delete}
              onClick={() => onDelete(asset)}
              destructive
            />
          </>
        )}
      </div>

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
