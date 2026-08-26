import { useEffect } from "react";
import { X } from "lucide-react";
import { CloudIcon } from "@/components/icons/CloudIcons";
import type { LocalAsset } from "../../types";
import type { LocalLibraryCopy } from "../../copy";
import { formatBytes } from "./format";

export function CloudInfoDialog({
  copy,
  asset,
  onClose,
}: {
  copy: LocalLibraryCopy;
  asset: LocalAsset;
  onClose: () => void;
}) {
  const rows = [
    { label: "云端照片 ID", value: asset.cloudPhotoId || "—" },
    { label: "存储源", value: [asset.cloudStoragePluginId, asset.cloudStorageSourceId].filter(Boolean).join(" / ") || "—" },
    { label: "存储路径", value: asset.cloudPath || "—" },
    { label: copy.format, value: asset.format.toUpperCase() },
    { label: copy.fileSize, value: asset.byteSize > 0 ? formatBytes(asset.byteSize) : "—" },
    { label: "URL 类型", value: asset.cloudUrlType || "—" },
    { label: "同步状态", value: asset.cloudSyncState || "—" },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[9999] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border shadow-2xl"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="flex size-7 items-center justify-center rounded-lg"
              style={{
                backgroundColor: "color-mix(in srgb, #22C55E 12%, transparent)",
                color: "#16A34A",
              }}
            >
              <CloudIcon size={14} />
            </span>
            <span className="text-sm font-semibold">{copy.filterUploaded}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 transition-colors hover:bg-secondary"
            style={{ color: "var(--muted-foreground)" }}
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 py-1.5"
              >
                <span
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {row.label}
                </span>
                <span
                  className="min-w-0 break-words text-left text-[11px] font-medium"
                  title={row.value}
                  style={{ color: "var(--foreground)" }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
