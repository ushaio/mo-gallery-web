import { useState } from "react";
import {
  Archive,
  FolderInput,
  FolderOpen,
  LibraryBig,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { localLibraryApi, parseLocalLibraryError } from "./api";
import type {
  LibrarySnapshot,
  LibraryUpgradeInfo,
  RecentLibrary,
} from "./types";
import type { LocalLibraryCopy } from "./copy";

interface Props {
  copy: LocalLibraryCopy;
  recent: RecentLibrary[];
  onOpened: (snapshot: LibrarySnapshot) => void;
  onRecentChanged: () => void;
  onUpgradeRequired: (info: LibraryUpgradeInfo) => void;
  onOpening: (path: string) => void;
  onOpeningEnd: () => void;
}

function libraryName(path: string) {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || "MO Gallery Library"
  );
}

export function LocalLibraryWelcome({
  copy,
  recent,
  onOpened,
  onRecentChanged,
  onUpgradeRequired,
  onOpening,
  onOpeningEnd,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const openLibrary = async (path: string) => {
    onOpening(path);
    try {
      const info = await localLibraryApi.checkUpgrade(path);
      if (info.required) {
        onUpgradeRequired(info);
        return;
      }
      onOpened(await localLibraryApi.open(path));
    } finally {
      onOpeningEnd();
    }
  };

  const openWith = async (path: string, fn: () => Promise<LibrarySnapshot>) => {
    onOpening(path);
    try {
      onOpened(await fn());
    } finally {
      onOpeningEnd();
    }
  };

  const runFolderAction = async (kind: "create" | "initialize" | "open") => {
    setBusy(kind);
    try {
      const path = await localLibraryApi.selectFolder(
        kind === "create"
          ? copy.create
          : kind === "initialize"
            ? copy.initialize
            : copy.open,
      );
      if (!path) return;
      if (kind === "create") {
        await openWith(path, () => localLibraryApi.create(path, libraryName(path)));
      } else if (kind === "initialize") {
        await openWith(path, () => localLibraryApi.initialize(path, libraryName(path)));
      } else {
        await openLibrary(path);
      }
    } catch (error) {
      const parsed = parseLocalLibraryError(error);
      if (parsed.code === "LIBRARY_UPGRADE_REQUIRED" && parsed.details) {
        onUpgradeRequired({
          rootPath: String(
            parsed.details.path ?? parsed.details.rootPath ?? "",
          ),
          currentVersion: Number(parsed.details.currentVersion ?? 0),
          targetVersion: Number(parsed.details.targetVersion ?? 0),
          required: true,
        });
      } else {
        toast.error(parsed.message);
      }
    } finally {
      setBusy(null);
    }
  };

  const openRecent = async (item: RecentLibrary) => {
    if (!item.available) return;
    setBusy(item.path);
    try {
      await openLibrary(item.path);
    } catch (error) {
      const parsed = parseLocalLibraryError(error);
      if (parsed.code === "LIBRARY_UPGRADE_REQUIRED" && parsed.details) {
        onUpgradeRequired({
          rootPath: String(
            parsed.details.path ?? parsed.details.rootPath ?? item.path,
          ),
          currentVersion: Number(parsed.details.currentVersion ?? 0),
          targetVersion: Number(parsed.details.targetVersion ?? 0),
          required: true,
        });
      } else {
        toast.error(parsed.message);
      }
      onRecentChanged();
    } finally {
      setBusy(null);
    }
  };

  const removeRecent = async (item: RecentLibrary) => {
    try {
      await localLibraryApi.removeRecent(item.path);
      onRecentChanged();
    } catch (error) {
      toast.error(parseLocalLibraryError(error).message);
    }
  };

  const actions = [
    {
      kind: "create" as const,
      icon: LibraryBig,
      label: copy.create,
      hint: copy.createHint,
    },
    {
      kind: "initialize" as const,
      icon: FolderInput,
      label: copy.initialize,
      hint: copy.initializeHint,
    },
    {
      kind: "open" as const,
      icon: FolderOpen,
      label: copy.open,
      hint: copy.openHint,
    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[color-mix(in_srgb,var(--background)_96%,var(--secondary))] custom-scrollbar">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center px-8 py-14">
        <div className="mb-10 flex items-start gap-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-card shadow-[0_14px_28px_-24px_rgba(15,23,42,0.75)]"
            style={{
              borderColor: "color-mix(in srgb, var(--border) 78%, transparent)",
            }}
          >
            <Archive size={27} style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <div
              className="mb-2 text-xs font-medium uppercase tracking-[0.18em]"
              style={{ color: "var(--primary)" }}
            >
              MO Gallery Desktop
            </div>
            <h1 className="text-3xl">{copy.welcomeTitle}</h1>
            <p
              className="mt-3 max-w-2xl text-sm leading-6"
              style={{ color: "var(--muted-foreground)" }}
            >
              {copy.welcomeBody}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {actions.map(({ kind, icon: Icon, label, hint }) => (
            <button
              key={kind}
              type="button"
              onClick={() => runFolderAction(kind)}
              disabled={busy !== null}
              className="group flex min-h-36 flex-col items-start rounded-2xl border bg-card/80 p-5 text-left transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-1 hover:bg-card hover:shadow-[0_18px_32px_-24px_rgba(15,23,42,0.78)] active:translate-y-0 active:scale-[0.99] disabled:opacity-60"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--border) 78%, transparent)",
              }}
            >
              <span className="mb-8 flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Icon size={18} />
              </span>
              <span className="flex items-center gap-2 text-sm font-medium">
                {busy === kind && (
                  <Loader2 size={14} className="animate-spin" />
                )}
                {label}
              </span>
              <span
                className="mt-1 text-xs leading-5"
                style={{ color: "var(--muted-foreground)" }}
              >
                {hint}
              </span>
            </button>
          ))}
        </div>

        <section
          className="mt-10 overflow-hidden rounded-2xl border bg-card/80 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.7)]"
          style={{
            borderColor: "color-mix(in srgb, var(--border) 78%, transparent)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-5 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <h2 className="font-sans text-sm font-medium">{copy.recent}</h2>
            <span
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {recent.length}
            </span>
          </div>
          {recent.length === 0 ? (
            <div
              className="px-5 py-9 text-center text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {copy.noRecent}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {recent.map((item) => (
                <div
                  key={item.path}
                  className="group flex items-center gap-3 px-4 py-3"
                >
                  <button
                    type="button"
                    disabled={!item.available || busy !== null}
                    onClick={() => openRecent(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                      <FolderOpen size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{item.name}</span>
                        {busy === item.path && (
                          <Loader2 size={13} className="animate-spin" />
                        )}
                      </span>
                      <span
                        className="block truncate text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {item.available
                          ? item.path
                          : `${copy.unavailable} \u00b7 ${item.path}`}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecent(item)}
                    title={copy.removeRecent}
                    className="rounded-md p-2 opacity-0 transition hover:bg-secondary group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
