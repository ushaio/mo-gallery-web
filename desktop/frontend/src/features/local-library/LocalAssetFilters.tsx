import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, Filter, X } from "lucide-react";
import type { AssetStructuredFilters } from "./types";
import type { LocalLibraryCopy } from "./copy";

interface Props {
  copy: LocalLibraryCopy;
  filters: AssetStructuredFilters;
  onChange: (filters: AssetStructuredFilters) => void;
  onClear: () => void;
}

type FilterKey = keyof AssetStructuredFilters;

const COLORS = ["red", "yellow", "green", "blue", "purple"] as const;
const FORMATS = [
  "jpeg",
  "png",
  "gif",
  "webp",
  "tiff",
  "heif",
  "avif",
  "cr2",
  "cr3",
  "nef",
  "arw",
  "dng",
  "raf",
  "rw2",
];

function numberValue(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateInputValue(value?: number) {
  if (value === undefined) return "";
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateMilliseconds(value: string, endOfDay = false) {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(timestamp)
    ? timestamp + (endOfDay ? 86_399_999 : 0)
    : undefined;
}

function activeCount(filters: AssetStructuredFilters) {
  const { photosOnly: _photosOnly, ...rest } = filters;
  return Object.values(rest).filter((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  ).length;
}

function toggleValue(values: string[] | undefined, value: string) {
  const current = values ?? [];
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function TextListInput({
  value,
  placeholder,
  onCommit,
}: {
  value?: string[];
  placeholder: string;
  onCommit: (value: string[] | undefined) => void;
}) {
  const initialText = (value ?? []).join(", ");
  const [draft, setDraft] = useState({ initialText, text: initialText });
  const text = draft.initialText === initialText ? draft.text : initialText;
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(event) => setDraft({ initialText, text: event.target.value })}
      onBlur={() => {
        const next = [
          ...new Set(
            text
              .split(/[,?]/)
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ];
        onCommit(next.length ? next : undefined);
      }}
      className="h-8 w-full rounded-md border bg-input px-2 text-xs outline-none focus:ring-1"
    />
  );
}

export function LocalAssetFilters({ copy, filters, onChange, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const count = activeCount(filters);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const update = <K extends FilterKey>(
    key: K,
    value: AssetStructuredFilters[K],
  ) => {
    const next = { ...filters, [key]: value };
    if (value === undefined || (Array.isArray(value) && value.length === 0))
      delete next[key];
    onChange(next);
  };
  const removeMany = (...keys: FilterKey[]) => {
    const next = { ...filters };
    keys.forEach((key) => delete next[key]);
    onChange(next);
  };

  const chips = (() => {
    const result: Array<{ key: string; label: string; remove: () => void }> =
      [];
    const range = (
      key: string,
      label: string,
      minKey: FilterKey,
      maxKey: FilterKey,
      suffix = "",
    ) => {
      const min = filters[minKey] as number | undefined;
      const max = filters[maxKey] as number | undefined;
      if (min !== undefined || max !== undefined)
        result.push({
          key,
          label: `${label}: ${min ?? "?"}?${max ?? "?"}${suffix}`,
          remove: () => removeMany(minKey, maxKey),
        });
    };
    range("rating", copy.filterRating, "ratingMin", "ratingMax");
    if (filters.colorLabels?.length)
      result.push({
        key: "colors",
        label: `${copy.filterColor}: ${filters.colorLabels.join("/")}`,
        remove: () => update("colorLabels", undefined),
      });
    if (filters.uploadStatus && filters.uploadStatus !== "all")
      result.push({
        key: "uploadStatus",
        label:
          filters.uploadStatus === "uploaded"
            ? copy.filterUploaded
            : copy.filterNotUploaded,
        remove: () => update("uploadStatus", undefined),
      });
    if (filters.formats?.length)
      result.push({
        key: "formats",
        label: `${copy.filterFormat}: ${filters.formats.join("/")}`,
        remove: () => update("formats", undefined),
      });
    if (
      filters.capturedFromMs !== undefined ||
      filters.capturedToMs !== undefined
    )
      result.push({
        key: "captured",
        label: copy.filterCapturedDate,
        remove: () => removeMany("capturedFromMs", "capturedToMs"),
      });
    if (
      filters.discoveredFromMs !== undefined ||
      filters.discoveredToMs !== undefined
    )
      result.push({
        key: "discovered",
        label: copy.filterDiscoveredDate,
        remove: () => removeMany("discoveredFromMs", "discoveredToMs"),
      });
    if (filters.cameraMakes?.length)
      result.push({
        key: "make",
        label: `${copy.filterCameraMake}: ${filters.cameraMakes.join("/")}`,
        remove: () => update("cameraMakes", undefined),
      });
    if (filters.cameraModels?.length)
      result.push({
        key: "model",
        label: `${copy.filterCameraModel}: ${filters.cameraModels.join("/")}`,
        remove: () => update("cameraModels", undefined),
      });
    if (filters.lensModels?.length)
      result.push({
        key: "lens",
        label: `${copy.filterLens}: ${filters.lensModels.join("/")}`,
        remove: () => update("lensModels", undefined),
      });
    return result;
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={copy.filters}
        aria-label={copy.filters}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-input/65 transition-[transform,background-color] hover:bg-secondary active:scale-[0.96]"
      >
        <Filter size={13} />
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[8px] font-medium text-primary-foreground">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
          <button
            type="button"
            aria-label={copy.closeFilters}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="local-library-filters-title"
            className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background shadow-[0_28px_70px_-28px_rgba(15,23,42,0.72)]"
          >
            <div
              className="flex items-start justify-between gap-4 border-b px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div>
                <h2
                  id="local-library-filters-title"
                  className="text-sm font-semibold"
                >
                  {copy.filters}
                </h2>
                <p
                  className="mt-0.5 text-[10px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {copy.filterLogicHint}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={copy.closeFilters}
                className="rounded-md p-1.5 hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>
            {chips.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5 border-b px-5 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.remove}
                    className="flex items-center gap-1 rounded-md border bg-secondary/40 px-2 py-1 text-[10px] transition-colors hover:bg-secondary"
                  >
                    {chip.label}
                    <X size={10} />
                  </button>
                ))}
              </div>
            )}
            <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto bg-[color-mix(in_srgb,var(--background)_96%,var(--secondary))] p-5 md:grid-cols-2">
              <label className="col-span-2 flex cursor-pointer items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={filters.photosOnly !== false}
                  onChange={(event) =>
                    update("photosOnly", event.target.checked)
                  }
                />
                {copy.photosOnly}
              </label>
              <FilterSection title={copy.filterUploadStatus}>
                <div className="flex flex-wrap gap-1">
                  <Toggle
                    active={
                      !filters.uploadStatus || filters.uploadStatus === "all"
                    }
                    onClick={() => update("uploadStatus", undefined)}
                  >
                    {copy.any}
                  </Toggle>
                  <Toggle
                    active={filters.uploadStatus === "uploaded"}
                    onClick={() => update("uploadStatus", "uploaded")}
                  >
                    {copy.filterUploaded}
                  </Toggle>
                  <Toggle
                    active={filters.uploadStatus === "not-uploaded"}
                    onClick={() => update("uploadStatus", "not-uploaded")}
                  >
                    {copy.filterNotUploaded}
                  </Toggle>
                </div>
              </FilterSection>
              <FilterSection title={copy.filterRating}>
                <RangeInputs
                  min={filters.ratingMin}
                  max={filters.ratingMax}
                  minLimit={0}
                  maxLimit={5}
                  onMin={(value) => update("ratingMin", value)}
                  onMax={(value) => update("ratingMax", value)}
                />
              </FilterSection>
              <FilterSection title={copy.filterColor}>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((color) => {
                    const active =
                      filters.colorLabels?.includes(color) ?? false;
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() =>
                          update(
                            "colorLabels",
                            toggleValue(filters.colorLabels, color),
                          )
                        }
                        title={copy[color]}
                        aria-label={copy[color]}
                        aria-pressed={active}
                        className="relative h-6 w-6 rounded-full border transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor: active
                            ? "var(--foreground)"
                            : "var(--border)",
                          boxShadow: active
                            ? "0 0 0 2px var(--background), 0 0 0 4px var(--foreground)"
                            : undefined,
                        }}
                      >
                        {active && (
                          <Check
                            size={13}
                            className="absolute inset-0 m-auto"
                            style={{
                              color: "white",
                              filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.9))",
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>
              <FilterSection title={copy.filterFormat}>
                <div className="flex flex-wrap gap-1">
                  {FORMATS.map((format) => (
                    <Toggle
                      key={format}
                      active={filters.formats?.includes(format) ?? false}
                      onClick={() =>
                        update("formats", toggleValue(filters.formats, format))
                      }
                    >
                      {format.toUpperCase()}
                    </Toggle>
                  ))}
                </div>
              </FilterSection>
              <FilterSection title={copy.filterCapturedDate}>
                <DateRange
                  from={filters.capturedFromMs}
                  to={filters.capturedToMs}
                  copy={copy}
                  onFrom={(value) => update("capturedFromMs", value)}
                  onTo={(value) => update("capturedToMs", value)}
                />
              </FilterSection>
              <FilterSection title={copy.filterDiscoveredDate}>
                <DateRange
                  from={filters.discoveredFromMs}
                  to={filters.discoveredToMs}
                  copy={copy}
                  onFrom={(value) => update("discoveredFromMs", value)}
                  onTo={(value) => update("discoveredToMs", value)}
                />
              </FilterSection>
              <FilterSection title={copy.filterCamera}>
                <div className="space-y-2">
                  <TextListInput
                    value={filters.cameraMakes}
                    placeholder={copy.filterCameraMake}
                    onCommit={(value) => update("cameraMakes", value)}
                  />
                  <TextListInput
                    value={filters.cameraModels}
                    placeholder={copy.filterCameraModel}
                    onCommit={(value) => update("cameraModels", value)}
                  />
                  <TextListInput
                    value={filters.lensModels}
                    placeholder={copy.filterLens}
                    onCommit={(value) => update("lensModels", value)}
                  />
                </div>
              </FilterSection>
            </div>
            <div
              className="flex items-center justify-between gap-3 border-t px-5 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                disabled={count === 0}
                onClick={onClear}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-[10px] hover:bg-secondary disabled:opacity-40"
              >
                <X size={11} />
                {copy.clearFilters}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-primary px-4 py-1.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
              >
                {copy.filterDone}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2 py-1 text-[10px] transition-[transform,background-color] hover:bg-secondary active:scale-[0.97]"
      style={{
        backgroundColor: active ? "var(--accent)" : undefined,
        borderColor: active ? "var(--primary)" : "var(--border)",
      }}
    >
      {children}
    </button>
  );
}

function RangeInputs({
  min,
  max,
  minLimit,
  maxLimit,
  step,
  onMin,
  onMax,
}: {
  min?: number;
  max?: number;
  minLimit?: number;
  maxLimit?: number;
  step?: string;
  onMin: (value?: number) => void;
  onMax: (value?: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <input
        type="number"
        value={min ?? ""}
        min={minLimit}
        max={maxLimit}
        step={step}
        placeholder="Min"
        onChange={(event) => onMin(numberValue(event.target.value))}
        className="h-8 min-w-0 rounded-md border bg-input px-2 text-xs"
      />
      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        ?
      </span>
      <input
        type="number"
        value={max ?? ""}
        min={minLimit}
        max={maxLimit}
        step={step}
        placeholder="Max"
        onChange={(event) => onMax(numberValue(event.target.value))}
        className="h-8 min-w-0 rounded-md border bg-input px-2 text-xs"
      />
    </div>
  );
}

function DateRange({
  from,
  to,
  copy,
  onFrom,
  onTo,
}: {
  from?: number;
  to?: number;
  copy: LocalLibraryCopy;
  onFrom: (value?: number) => void;
  onTo: (value?: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label
        className="text-[9px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        {copy.from}
        <input
          type="date"
          value={dateInputValue(from)}
          onChange={(event) => onFrom(dateMilliseconds(event.target.value))}
          className="mt-1 h-8 w-full rounded-md border bg-input px-2 text-xs"
        />
      </label>
      <label
        className="text-[9px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        {copy.to}
        <input
          type="date"
          value={dateInputValue(to)}
          onChange={(event) => onTo(dateMilliseconds(event.target.value, true))}
          className="mt-1 h-8 w-full rounded-md border bg-input px-2 text-xs"
        />
      </label>
    </div>
  );
}
