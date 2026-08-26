import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { CLOUD_PHOTO_FORMATS } from "./constants";

export function CloudPhotoFilters({
  language,
  categories,
  category,
  photoType,
  fileFormats,
  onCategoryChange,
  onPhotoTypeChange,
  onFileFormatsChange,
}: {
  language: "zh" | "en";
  categories: string[];
  category: string;
  photoType: string | null;
  fileFormats: string[];
  onCategoryChange: (value: string) => void;
  onPhotoTypeChange: (value: string | null) => void;
  onFileFormatsChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeCount =
    (category === "全部" ? 0 : 1) +
    (photoType ? 1 : 0) +
    (fileFormats.length ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const toggleFileFormat = (format: string) => {
    onFileFormatsChange(
      fileFormats.includes(format)
        ? fileFormats.filter((item) => item !== format)
        : [...fileFormats, format],
    );
  };

  const optionClass = (active: boolean) =>
    `rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition hover:bg-secondary ${active ? "bg-primary text-primary-foreground" : "bg-background"}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={language === "zh" ? "筛选" : "Filters"}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-input px-2.5 text-xs hover:bg-secondary"
      >
        <Filter size={13} />
        <span>{language === "zh" ? "筛选" : "Filters"}</span>
        {activeCount > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={language === "zh" ? "照片筛选" : "Photo filters"}
          className="absolute left-3 right-3 top-[calc(100%+4px)] z-30 max-h-[min(60vh,32rem)] overflow-auto rounded-md border bg-background p-4 shadow-xl"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">
                {language === "zh" ? "筛选" : "Filters"}
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {language === "zh"
                  ? "不同筛选项之间为“并且”，照片类型可多选。"
                  : "Filters use AND; photo formats can be combined."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={language === "zh" ? "关闭筛选" : "Close filters"}
              className="rounded-md p-1.5 hover:bg-secondary"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-5">
            <section>
              <h3 className="mb-2 text-[11px] font-semibold">
                {language === "zh" ? "成像方式" : "Capture type"}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onPhotoTypeChange(null)}
                  className={optionClass(!photoType)}
                >
                  {language === "zh" ? "全部" : "All"}
                </button>
                <button
                  type="button"
                  onClick={() => onPhotoTypeChange("digital")}
                  className={optionClass(photoType === "digital")}
                >
                  {t("admin.photos_type_digital", language)}
                </button>
                <button
                  type="button"
                  onClick={() => onPhotoTypeChange("film")}
                  className={optionClass(photoType === "film")}
                >
                  {t("admin.photos_type_film", language)}
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold">
                {language === "zh" ? "照片类型" : "Photo format"}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {CLOUD_PHOTO_FORMATS.map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => toggleFileFormat(format)}
                    className={optionClass(fileFormats.includes(format))}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold">
                {language === "zh" ? "照片分类" : "Category"}
              </h3>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-auto pr-1">
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onCategoryChange(item)}
                    className={optionClass(category === item)}
                  >
                    {item === "全部"
                      ? language === "zh"
                        ? "全部"
                        : "All"
                      : item}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-5 flex items-center justify-between border-t pt-3">
            <button
              type="button"
              disabled={activeCount === 0}
              onClick={() => {
                onCategoryChange("全部");
                onPhotoTypeChange(null);
                onFileFormatsChange([]);
              }}
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-[10px] hover:bg-secondary disabled:opacity-40"
            >
              <X size={11} />
              {language === "zh" ? "清除全部" : "Clear all"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-primary px-4 py-1.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
            >
              {language === "zh" ? "完成" : "Done"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
