import { AlertTriangle, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { usePreferences } from "@/store/preferences";

export type DownloadConflictPolicy = "rename" | "overwrite" | "skip";

interface DownloadConflictDialogProps {
  fileName: string;
  destination: string;
  busy?: boolean;
  fileNames?: string[];
  onClose: () => void;
  onConfirm: (policy: DownloadConflictPolicy) => void;
}

export function DownloadConflictDialog({
  fileName,
  destination,
  busy = false,
  fileNames,
  onClose,
  onConfirm,
}: DownloadConflictDialogProps) {
  const { language } = usePreferences();

  const batch = Array.isArray(fileNames) && fileNames.length > 0;
  const previewNames = batch ? fileNames!.slice(0, 3) : [];
  const extraCount = batch ? fileNames!.length - previewNames.length : 0;

  const options: {
    policy: DownloadConflictPolicy;
    label: string;
    hint: string;
    primary?: boolean;
    destructive?: boolean;
  }[] = [
    {
      policy: "overwrite",
      label: t("admin.download_conflict_overwrite", language),
      hint: t("admin.download_conflict_overwrite_hint", language),
      destructive: true,
    },
    {
      policy: "skip",
      label: t("admin.download_conflict_skip", language),
      hint: t("admin.download_conflict_skip_hint", language),
    },
    {
      policy: "rename",
      label: t("admin.download_conflict_rename", language),
      hint: t("admin.download_conflict_rename_hint", language),
      primary: true,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border shadow-xl"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={15} style={{ color: "#f59e0b" }} />
            {t(
              batch
                ? "admin.download_conflict_batch_title"
                : "admin.download_conflict_title",
              language,
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close", language)}
            className="flex size-7 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-50"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="text-xs leading-5" style={{ color: "var(--muted-foreground)" }}>
            {batch
              ? t("admin.download_conflict_batch_message", language, {
                  count: fileNames!.length,
                })
              : t("admin.download_conflict_message", language)}
          </p>
          <div className="mt-2 rounded-md border p-2.5" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
            {batch ? (
              <>
                {previewNames.map((name) => (
                  <p key={name} className="truncate font-mono text-xs font-medium">{name}</p>
                ))}
                {extraCount > 0 && (
                  <p className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    + {extraCount} {language === "zh" ? "更多" : "more"}
                  </p>
                )}
              </>
            ) : (
              <p className="truncate font-mono text-xs font-medium">{fileName}</p>
            )}
            <p className="mt-0.5 truncate font-mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              /{destination}
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {options.map(({ policy, label, hint, primary, destructive }) => (
              <button
                key={policy}
                type="button"
                disabled={busy}
                onClick={() => onConfirm(policy)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-secondary disabled:opacity-60"
                style={{
                  borderColor:
                    primary || destructive ? (destructive ? "var(--destructive)" : "var(--primary)") : "var(--border)",
                }}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: destructive ? "var(--destructive)" : "var(--foreground)" }}
                >
                  {label}
                </span>
                <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {hint}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
