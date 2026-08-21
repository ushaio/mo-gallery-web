import { useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  ImageOff,
  Maximize2,
  Pencil,
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

const missing = "—";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return missing;
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── 折叠区块（与 LocalAssetDetails 一致） ─── */

function Section({
  label,
  icon: Icon,
  open,
  onToggle,
  action,
  children,
}: {
  label: string;
  icon: typeof Camera;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border-b px-5 py-1"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2.5 py-2.5 text-left"
        >
          <Icon
            size={14}
            strokeWidth={1.8}
            style={{ color: "var(--muted-foreground)" }}
          />
          <span
            className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--foreground)" }}
          >
            {label}
          </span>
          <ChevronDown
            size={14}
            className="transition-transform duration-200"
            style={{
              color: "var(--muted-foreground)",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        </button>
        {action}
      </div>
      {open && <div className="pb-4">{children}</div>}
    </section>
  );
}

/* ─── 元数据行（与 LocalAssetDetails 一致） ─── */

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span
        className="shrink-0 text-[10px] uppercase tracking-wide"
        style={{ color: "var(--muted-foreground)" }}
      >
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right text-[11px] font-medium ${mono ? "font-mono tabular-nums" : ""}`}
        title={value}
        style={{ color: "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── 操作按钮（与 LocalAssetDetails 一致，增加 primary 变体） ─── */

function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  destructive,
}: {
  icon: typeof Star;
  label: string;
  onClick: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
        style={{
          backgroundColor: "var(--primary)",
          color: "var(--primary-foreground)",
        }}
      >
        <Icon size={13} />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all active:scale-[0.98]"
      style={
        destructive
          ? {
              borderColor:
                "color-mix(in srgb, var(--destructive) 35%, transparent)",
              color: "var(--destructive)",
            }
          : { borderColor: "var(--border)", color: "var(--foreground)" }
      }
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = destructive
          ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
          : "var(--secondary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

/* ─── 空状态（与 LocalAssetDetails 一致） ─── */

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <aside
      className="hidden h-full w-[340px] shrink-0 flex-col items-center justify-center border-l px-8 xl:flex"
      style={{ borderColor: "var(--border)" }}
    >
      <ImageOff
        size={28}
        strokeWidth={1.2}
        style={{ color: "var(--muted-foreground)" }}
      />
      <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {t("admin.no_photo_selected")}
      </p>
    </aside>
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
    return <EmptyState t={t} />;
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
  const fileSizeLabel = photo.size ? formatBytes(photo.size) : null;
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
    <aside
      className="custom-scrollbar hidden h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l bg-background xl:flex"
      style={{ borderColor: "var(--border)" }}
    >
      {/* ── 预览图 ── */}
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => onOpenPreview(photo)}
          className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--muted)",
          }}
        >
          <img
            src={resolveAssetUrl(photo.thumbnailUrl || photo.url)}
            alt={photo.title || ""}
            className="h-full w-full object-cover"
          />

          {/* hover 放大提示 */}
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
              <Maximize2 size={15} />
            </span>
          </span>

          {/* 类型角标 */}
          <span
            className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          >
            {photo.photoType === "film"
              ? t("admin.upload_type_film")
              : t("admin.upload_type_digital")}
          </span>

          {/* 尺寸/大小角标 */}
          {(dimensionLabel || fileSizeLabel) && (
            <span
              className="absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white"
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
            >
              {dimensionLabel}
              {dimensionLabel && fileSizeLabel && " · "}
              {fileSizeLabel || ""}
            </span>
          )}
        </button>
      </div>

      {/* ── 标题（只读） ── */}
      <div className="px-5 pb-3 pt-4">
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
          ) : (
            <button
              type="button"
              onClick={startCategoryEdit}
              title={t("admin.category")}
              className="group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:bg-secondary"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--secondary)",
                color: photo.category
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
              }}
            >
              <TagIcon size={9} style={{ color: "var(--primary)" }} />
              <span className="max-w-[120px] truncate">
                {photo.category || t("admin.category")}
              </span>
              <Pencil
                size={9}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--muted-foreground)" }}
              />
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

      {/* ── 标记工具栏：精选 / 显示隐藏（云端专属标记，布局与本地一致） ── */}
      <div
        className="flex items-center gap-1 border-y px-5 py-3.5"
        style={{ borderColor: "var(--border)" }}
      >
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

        {/* 隐藏状态徽标（仅隐藏时出现，对应本地的“已上传”徽标位置） */}
        {!photo.showFlag && (
          <span
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
            style={{
              color: "var(--destructive)",
              backgroundColor:
                "color-mix(in srgb, var(--destructive) 10%, transparent)",
            }}
          >
            <EyeOff size={9} />
            {t("admin.overview_hidden")}
          </span>
        )}
        {photo.isFeatured && photo.showFlag && (
          <span
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
            style={{
              color: "#B45309",
              backgroundColor: "color-mix(in srgb, #F59E0B 12%, transparent)",
            }}
          >
            <Star size={9} fill="currentColor" />
            {t("gallery.featured")}
          </span>
        )}
      </div>

      {/* ── 拍摄信息（有 EXIF 才显示，布局与本地一致） ── */}
      {hasExif && (
        <Section
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
        </Section>
      )}

      {/* ── 照片信息（默认收起，与本地一致） ── */}
      <Section
        label={t("admin.basic_info")}
        icon={FileText}
        open={infoOpen}
        onToggle={() => setInfoOpen((v) => !v)}
      >
        <div>
          {dimensionLabel && (
            <MetaRow
              label={t("gallery.dimensions")}
              value={dimensionLabel}
              mono
            />
          )}
          {fileSizeLabel && (
            <MetaRow label={t("admin.file_size")} value={fileSizeLabel} />
          )}
          <MetaRow
            label={t("admin.captured_on")}
            value={formatDate(photo.takenAt || photo.createdAt)}
          />
          <MetaRow
            label={t("gallery.timeline_uploaded")}
            value={formatDate(photo.createdAt)}
          />
          <MetaRow
            label={t("admin.provider")}
            value={(photo.storageProvider || missing).toUpperCase()}
          />

          {/* 主色（云端专属：点击复制色值 + 重新分析） */}
          {dominantColors.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between">
                <p
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("gallery.palette")}
                </p>
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
              </div>
              <div
                className="flex h-6 overflow-hidden rounded"
                style={{ border: "1px solid var(--border)" }}
              >
                {dominantColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    onClick={() => handleCopy(color, `color-${color}`)}
                    className="min-w-0 flex-1 transition-opacity hover:opacity-80"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 存储路径（云端专属，样式与本地路径一致） */}
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <p
                className="text-[10px] uppercase tracking-wide"
                style={{ color: "var(--muted-foreground)" }}
              >
                {t("admin.path_prefix")}
              </p>
              <button
                type="button"
                disabled={!storagePath}
                onClick={() => handleCopy(storagePath, "path")}
                title={t("admin.copy_link")}
                className="flex items-center rounded p-0.5 transition-colors hover:bg-secondary disabled:opacity-40"
              >
                {copiedKey === "path" ? (
                  <Check size={10} style={{ color: "var(--primary)" }} />
                ) : (
                  <Copy
                    size={10}
                    style={{ color: "var(--muted-foreground)" }}
                  />
                )}
              </button>
            </div>
            <p
              className="break-all rounded border px-2.5 py-1.5 font-mono text-[10px] leading-relaxed"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--secondary)",
                color: storagePath
                  ? "var(--muted-foreground)"
                  : "var(--muted-foreground)",
              }}
            >
              {storagePath || missing}
            </p>
          </div>

          {/* 资源地址（云端专属） */}
          <div className="mt-2 space-y-2">
            {copyableUrls.map((item) => (
              <div
                key={item.key}
                className="rounded-lg border p-2.5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    disabled={!item.value}
                    onClick={() =>
                      item.value && handleCopy(item.value, item.key)
                    }
                    title={t("admin.copy_link")}
                    className="mt-0.5 shrink-0 rounded p-0.5 transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    {copiedKey === item.key ? (
                      <Check size={10} style={{ color: "var(--primary)" }} />
                    ) : (
                      <Copy
                        size={10}
                        style={{ color: "var(--muted-foreground)" }}
                      />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[9px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {item.label}
                    </p>
                    <p
                      className="mt-0.5 break-all font-mono text-[10px] leading-relaxed"
                      style={{
                        color: item.value
                          ? "var(--foreground)"
                          : "var(--muted-foreground)",
                      }}
                    >
                      {item.value || t("admin.not_available")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 操作区（常驻贴底） ── */}
      <div className="mt-auto space-y-2 px-5 pb-5 pt-4">
        <ActionButton
          icon={Trash2}
          label={t("admin.delete")}
          onClick={() => onDelete(photo)}
          destructive
        />
      </div>
    </aside>
  );
}
