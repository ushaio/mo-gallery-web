import { useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  ImageOff,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import {
  resolveAssetUrl,
  reanalyzePhotoColors,
  updatePhoto,
  ApiUnauthorizedError,
  type PhotoDto,
} from "@/lib/api";
import { normalizeDominantColors } from "@/lib/photoColors";
import { CameraParameters } from "@/components/CameraParameters";
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
  LibraryStatusPill,
} from "@/components/ui/library";
import {
  formatDateTime,
  formatFileSize,
  LIBRARY_EMPTY_VALUE,
} from "@/components/ui/library/format";
import type { Photo } from "@/types";

interface Props {
  photo: Photo | null;
  token: string | null;
  t: (key: string) => string;
  notify: (message: string, type?: "success" | "error" | "info") => void;
  onOpenPreview: (photo: Photo) => void;
  onToggleFeatured: (id: string) => void;
  onToggleShow: (id: string) => void;
  onDelete: (photo: Photo) => void;
  onSave: (photo: PhotoDto) => void;
  onUnauthorized: () => void;
}

/** 「照片信息」两列网格里的一格：短字段（尺寸 / 体积 / 日期 / 存储提供商）。 */
interface MetaCard {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
}

/* ─── 复制状态图标：已复制显示对勾，否则显示复制图标 ─── */

function CopyGlyph({ copied }: { copied: boolean }) {
  return copied ? (
    <Check size={10} style={{ color: "var(--primary)" }} />
  ) : (
    <Copy size={10} style={{ color: "var(--muted-foreground)" }} />
  );
}

/* ─── 主组件 ─── */

export function PhotoInfoSidebar({
  photo,
  token,
  t,
  notify,
  onOpenPreview,
  onToggleFeatured,
  onToggleShow,
  onDelete,
  onSave,
  onUnauthorized,
}: Props) {
  const [reanalyzing, setReanalyzing] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shootingOpen, setShootingOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(true);
  const copyTimerRef = useRef<number | null>(null);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(t("common.copied"), "success");
      setCopiedKey(key);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedKey(null), 1200);
    } catch (error) {
      console.error("Failed to copy text:", error);
      notify(t("common.error"), "error");
    }
  };

  const handleReanalyze = async () => {
    if (!token || !photo || reanalyzing) return;
    setReanalyzing(true);
    try {
      const updated = await reanalyzePhotoColors(token, photo.id);
      onSave(updated);
      notify(t("admin.notify_success"), "success");
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized();
      else
        notify(err instanceof Error ? err.message : t("common.error"), "error");
    } finally {
      setReanalyzing(false);
    }
  };

  const startCategoryEdit = () => {
    if (!photo) return;
    setCategoryInput(photo.category || "");
    setCategoryEditing(true);
  };

  const cancelCategoryEdit = () => {
    if (categorySaving) return;
    setCategoryEditing(false);
  };

  const saveCategory = async () => {
    if (!token || !photo || categorySaving) return;
    setCategorySaving(true);
    try {
      const updated = await updatePhoto({
        token,
        id: photo.id,
        patch: { category: categoryInput },
      });
      onSave(updated);
      setCategoryEditing(false);
      notify(t("admin.notify_success"), "success");
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) onUnauthorized();
      else
        notify(err instanceof Error ? err.message : t("common.error"), "error");
    } finally {
      setCategorySaving(false);
    }
  };

  if (!photo) {
    return (
      <LibraryDetailsEmpty
        icon={ImageOff}
        message={t("admin.no_photo_selected")}
      />
    );
  }

  const storagePath = photo.path ? photo.path.replace(/\/[^/]+$/, "") : "";
  const dominantColors = normalizeDominantColors(photo.dominantColors);
  const dimensionLabel =
    photo.width && photo.height ? `${photo.width} × ${photo.height}` : null;
  const cameraLabel = [photo.cameraMake, photo.cameraModel]
    .filter(Boolean)
    .join(" ");
  const cameraParameters = [
    { label: t("gallery.aperture"), value: photo.aperture },
    { label: t("gallery.shutter"), value: photo.shutterSpeed },
    { label: t("gallery.iso"), value: photo.iso ? `ISO ${photo.iso}` : null },
    { label: t("gallery.focal"), value: photo.focalLength },
  ].filter((parameter): parameter is { label: string; value: string } =>
    Boolean(parameter.value),
  );
  const hasExif = Boolean(
    cameraLabel || photo.lensModel || cameraParameters.length > 0,
  );
  const fileSizeLabel = photo.size ? formatFileSize(photo.size) : null;
  /* 照片信息：短字段走两列卡片网格，长字段（主色 / 路径 / 资源地址）在网格外整宽展示 */
  const metaCards = [
    {
      key: "dimensions",
      label: t("gallery.dimensions"),
      value: dimensionLabel,
      mono: true,
    },
    { key: "size", label: t("admin.file_size"), value: fileSizeLabel },
    {
      key: "captured",
      label: t("admin.captured_on"),
      value: formatDateTime(photo.takenAt || photo.createdAt),
    },
    {
      key: "uploaded",
      label: t("gallery.timeline_uploaded"),
      value: formatDateTime(photo.createdAt),
    },
    {
      key: "provider",
      label: t("admin.provider"),
      value: (photo.storageProvider || LIBRARY_EMPTY_VALUE).toUpperCase(),
    },
  ].filter((item): item is MetaCard => Boolean(item.value));
  const copyableUrls = [
    {
      label: t("admin.thumbnail_url"),
      key: "thumb",
      value: photo.thumbnailUrl ? resolveAssetUrl(photo.thumbnailUrl) : "",
    },
    {
      label: t("admin.original_url"),
      key: "original",
      value: resolveAssetUrl(photo.url),
    },
  ];

  return (
    <LibraryDetailsPanel>
      {/* ── 顶部合并卡片：预览图 + 标题 + 标记工具条 ── */}
      <LibraryDetailsHeader
        preview={
          /*
            预览图不加角标：成像方式与尺寸/体积在下方「照片信息」里已经有了，
            压在图上属于重复信息，也让云端与本地信息栏的预览图表现保持一致。
          */
          <LibraryDetailsPreview
            onOpen={() => onOpenPreview(photo)}
            title={photo.title || t("admin.untitled_photo")}
          >
            <img
              src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
              alt={photo.title || ""}
              className="h-full w-full object-cover"
            />
          </LibraryDetailsPreview>
        }
        title={
          <div>
            <h2
              className="break-words text-sm font-semibold leading-snug"
              style={{ color: "var(--foreground)" }}
            >
              {photo.title || t("admin.untitled_photo")}
            </h2>
            <button
              type="button"
              onClick={() => handleCopy(photo.id, "id")}
              title={t("admin.copy_link")}
              className="group mt-1 flex w-full items-center gap-1.5 rounded text-left"
            >
              {copiedKey === "id" ? (
                <Check
                  size={10}
                  className="shrink-0"
                  style={{ color: "var(--primary)" }}
                />
              ) : (
                <Copy
                  size={10}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--muted-foreground)" }}
                />
              )}
              <span
                className="truncate font-mono text-[10px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {photo.id}
              </span>
            </button>

            {/* 分类（点击就地编辑）/ 胶卷 pill（云端专属元数据） */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {categoryEditing ? (
                <div className="flex w-full items-center gap-1">
                  <input
                    value={categoryInput}
                    onChange={(event) => setCategoryInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveCategory();
                      else if (event.key === "Escape") cancelCategoryEdit();
                    }}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-[10px] outline-none focus:ring-1"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                    placeholder={t("admin.category")}
                  />
                  <button
                    type="button"
                    onClick={saveCategory}
                    disabled={categorySaving}
                    title={t("common.save")}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-40"
                    style={{ color: "var(--primary)" }}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelCategoryEdit}
                    title={t("common.cancel")}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-secondary"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : photo.category ? (
                <button
                  type="button"
                  onClick={startCategoryEdit}
                  title={t("admin.category")}
                  className="group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:bg-secondary"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--secondary)",
                    color: "var(--foreground)",
                  }}
                >
                  <TagIcon size={9} style={{ color: "var(--primary)" }} />
                  <span className="max-w-[120px] truncate">
                    {photo.category}
                  </span>
                  <Pencil
                    size={9}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--muted-foreground)" }}
                  />
                </button>
              ) : (
                /* 无分类时只留一个加号按钮，不铺一个空的分类 pill */
                <button
                  type="button"
                  onClick={startCategoryEdit}
                  title={t("admin.category")}
                  aria-label={t("admin.category")}
                  className="flex size-5 items-center justify-center rounded-full border transition-colors hover:bg-secondary"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <Plus size={10} />
                </button>
              )}

              {photo.filmRollName && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <span className="max-w-[120px] truncate">
                    {photo.filmRollName}
                  </span>
                </span>
              )}
            </div>
          </div>
        }
        marks={
          <div className="flex items-center gap-1">
            <button
              type="button"
              title={
                photo.isFeatured
                  ? t("admin.notify_featured_removed")
                  : t("admin.notify_featured_added")
              }
              aria-label={
                photo.isFeatured
                  ? t("admin.notify_featured_removed")
                  : t("admin.notify_featured_added")
              }
              aria-pressed={photo.isFeatured}
              onClick={() => onToggleFeatured(photo.id)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-90"
              style={{
                backgroundColor: photo.isFeatured
                  ? "color-mix(in srgb, #F59E0B 14%, transparent)"
                  : "transparent",
                color: photo.isFeatured ? "#F59E0B" : "var(--muted-foreground)",
              }}
              onMouseEnter={(e) => {
                if (!photo.isFeatured)
                  e.currentTarget.style.backgroundColor = "var(--secondary)";
              }}
              onMouseLeave={(e) => {
                if (!photo.isFeatured)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Star
                size={15}
                fill={photo.isFeatured ? "currentColor" : "none"}
                strokeWidth={photo.isFeatured ? 2 : 1.6}
              />
            </button>

            <span
              className="mx-1 h-5 w-px shrink-0"
              style={{ backgroundColor: "var(--border)" }}
            />

            <button
              type="button"
              title={
                photo.showFlag
                  ? t("admin.hide_in_gallery")
                  : t("admin.show_in_gallery")
              }
              aria-label={
                photo.showFlag
                  ? t("admin.hide_in_gallery")
                  : t("admin.show_in_gallery")
              }
              aria-pressed={!photo.showFlag}
              onClick={() => onToggleShow(photo.id)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg transition-all active:scale-90"
              style={{
                backgroundColor: photo.showFlag
                  ? "transparent"
                  : "color-mix(in srgb, var(--destructive) 10%, transparent)",
                color: photo.showFlag
                  ? "var(--muted-foreground)"
                  : "var(--destructive)",
              }}
              onMouseEnter={(e) => {
                if (photo.showFlag)
                  e.currentTarget.style.backgroundColor = "var(--secondary)";
              }}
              onMouseLeave={(e) => {
                if (photo.showFlag)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {photo.showFlag ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>

            {/* 状态胶囊（隐藏优先，其次精选，对应本地的“已上传”徽标位置） */}
            {!photo.showFlag ? (
              <LibraryStatusPill
                icon={EyeOff}
                label={t("admin.overview_hidden")}
                tone="danger"
              />
            ) : photo.isFeatured ? (
              <LibraryStatusPill
                icon={Star}
                label={t("gallery.featured")}
                tone="warning"
              />
            ) : null}
          </div>
        }
      />

      {/* ── 拍摄信息（有 EXIF 才显示，两列卡片网格） ── */}
      {hasExif && (
        <LibraryDetailsSection
          label={t("admin.shooting_info")}
          icon={Camera}
          open={shootingOpen}
          onToggle={() => setShootingOpen((v) => !v)}
        >
          <CameraParameters
            cameraLabel={t("admin.camera")}
            cameraValue={cameraLabel}
            lensLabel={t("admin.lens")}
            lensValue={photo.lensModel}
            parameters={cameraParameters}
          />
        </LibraryDetailsSection>
      )}

      {/* ── 照片信息 ── */}
      <LibraryDetailsSection
        label={t("admin.basic_info")}
        icon={FileText}
        open={infoOpen}
        onToggle={() => setInfoOpen((v) => !v)}
      >
        {/* 短字段：两列卡片网格，与上方拍摄参数同一套视觉 */}
        <div className="grid grid-cols-2 gap-2">
          {metaCards.map((item) => (
            <LibraryMetaRow
              key={item.key}
              label={item.label}
              value={item.value}
              mono={item.mono}
              card
            />
          ))}
        </div>

        {/* 主色（云端专属：点击复制色值 + 重新分析） */}
        {dominantColors.length > 0 && (
          <LibraryFieldBlock
            label={t("gallery.palette")}
            action={
              <button
                type="button"
                disabled={reanalyzing}
                onClick={handleReanalyze}
                title={t("admin.re_analyze")}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-40"
                style={{ color: "var(--muted-foreground)" }}
              >
                <RefreshCw
                  size={10}
                  className={reanalyzing ? "animate-spin" : ""}
                />
                {t("admin.re_analyze")}
              </button>
            }
          >
            <LibraryColorStrip
              colors={dominantColors}
              onSelect={(color) => handleCopy(color, `color-${color}`)}
            />
          </LibraryFieldBlock>
        )}

        {/* 存储路径（云端专属，整宽展示） */}
        <LibraryFieldBlock
          label={t("admin.path_prefix")}
          action={
            <button
              type="button"
              disabled={!storagePath}
              onClick={() => handleCopy(storagePath, "path")}
              title={t("admin.copy_link")}
              className="flex items-center rounded p-0.5 transition-colors hover:bg-secondary disabled:opacity-40"
            >
              <CopyGlyph copied={copiedKey === "path"} />
            </button>
          }
        >
          <LibraryMonoValue value={storagePath} />
        </LibraryFieldBlock>

        {/* 资源地址（云端专属，整宽展示） */}
        {copyableUrls.map((item) => (
          <LibraryFieldBlock
            key={item.key}
            label={item.label}
            action={
              <button
                type="button"
                disabled={!item.value}
                onClick={() => item.value && handleCopy(item.value, item.key)}
                title={t("admin.copy_link")}
                className="flex items-center rounded p-0.5 transition-colors hover:bg-secondary disabled:opacity-40"
              >
                <CopyGlyph copied={copiedKey === item.key} />
              </button>
            }
          >
            <LibraryMonoValue
              value={item.value || t("admin.not_available")}
            />
          </LibraryFieldBlock>
        ))}
      </LibraryDetailsSection>

      {/* ── 操作区（常驻贴底） ── */}
      <div className="mt-auto space-y-2 px-4 pb-5 pt-4">
        <LibraryDetailsAction
          icon={Trash2}
          label={t("admin.delete")}
          onClick={() => onDelete(photo)}
          destructive
        />
      </div>
    </LibraryDetailsPanel>
  );
}
