export const COLOR_SWATCHES: Array<{
  value: string;
  bg: string;
  label: string;
  nameKey?: "red" | "yellow" | "green" | "blue" | "purple";
}> = [
  { value: "red", bg: "#EF4444", label: "Red", nameKey: "red" },
  { value: "orange", bg: "#F97316", label: "Orange" },
  { value: "yellow", bg: "#EAB308", label: "Yellow", nameKey: "yellow" },
  { value: "green", bg: "#22C55E", label: "Green", nameKey: "green" },
  { value: "blue", bg: "#3B82F6", label: "Blue", nameKey: "blue" },
  { value: "purple", bg: "#A855F7", label: "Purple", nameKey: "purple" },
];

export const TAG_PREVIEW_COUNT = 8;

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const date =
    typeof value === "number" ? new Date(value / 1e6) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatExposure(seconds?: number) {
  if (!seconds || seconds <= 0) return null;
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

export function formatFocalLength(mm?: number) {
  if (!mm) return null;
  return `${Math.round(mm)}mm`;
}

export function formatAperture(value?: number) {
  if (!value) return null;
  return `f/${value.toFixed(value >= 10 ? 0 : 1)}`;
}
