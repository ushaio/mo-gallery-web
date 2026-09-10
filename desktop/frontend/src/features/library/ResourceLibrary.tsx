import { useCallback, useEffect, useMemo } from "react";
import { Cloud, HardDrive, LibraryBig } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CloudLibrary } from "@/features/library/cloud/CloudLibrary";
import { LocalLibrary } from "@/features/library/local/LocalLibrary";
import { useAuth } from "@/contexts/AuthContext";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { usePreferences } from "@/store/preferences";
import { t } from "@/lib/i18n";
import {
  isLibrarySource,
  SOURCE_STORAGE_KEY,
  type LibrarySource,
} from "@/features/library/source";

export function ResourceLibrary() {
  const { isAuthenticated } = useAuth();
  const language = usePreferences((state) => state.language);
  const [searchParams, setSearchParams] = useSearchParams();

  const source = useMemo<LibrarySource>(() => {
    if (!isAuthenticated) return "local";

    const querySource = searchParams.get("source");
    if (isLibrarySource(querySource)) return querySource;

    const storedSource = window.localStorage.getItem(SOURCE_STORAGE_KEY);
    return isLibrarySource(storedSource) ? storedSource : "cloud";
  }, [isAuthenticated, searchParams]);

  useEffect(() => {
    if (isAuthenticated)
      window.localStorage.setItem(SOURCE_STORAGE_KEY, source);

    const querySource = searchParams.get("source");
    const hasLocalOnlyParams = !isAuthenticated && searchParams.has("view");
    if (querySource !== source || hasLocalOnlyParams) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("source", source);
          if (!isAuthenticated) next.delete("view");
          return next;
        },
        { replace: true },
      );
    }
  }, [isAuthenticated, searchParams, setSearchParams, source]);

  const switchSource = useCallback(
    (nextSource: LibrarySource) => {
      if (nextSource === source) return;
      window.localStorage.setItem(SOURCE_STORAGE_KEY, nextSource);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("source", nextSource);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, source],
  );

  const sources = [
    {
      value: "cloud" as const,
      label: t("admin.resource_library_cloud", language),
      icon: Cloud,
    },
    {
      value: "local" as const,
      label: t("admin.resource_library_local", language),
      icon: HardDrive,
    },
  ];

  const handleSourceKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentSource: LibrarySource,
  ) => {
    const currentIndex = sources.findIndex(
      ({ value }) => value === currentSource,
    );
    let nextIndex = currentIndex;

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + sources.length) % sources.length;
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % sources.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sources.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextSource = sources[nextIndex].value;
    switchSource(nextSource);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-library-source="${nextSource}"]`)
        ?.focus();
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color-mix(in_srgb,var(--background)_96%,var(--secondary))]">
      <div
        className="flex h-12 shrink-0 items-center gap-4 border-b bg-card/92 px-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]"
        style={{
          borderColor: "color-mix(in srgb, var(--border) 78%, transparent)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
            <LibraryBig size={14} />
          </span>
          <span className="truncate text-xs font-semibold">
            {t("admin.resource_library", language)}
          </span>
        </div>
        {isAuthenticated && (
          <SegmentedTabs
            size="sm"
            ariaLabel={t("admin.resource_library", language)}
            value={source}
            onChange={switchSource}
            options={sources.map(({ value, label, icon }) => ({ value, label, icon }))}
            itemAttributes={(value) => ({
              "data-library-source": value,
              "aria-controls": `resource-library-${value}`,
            })}
            onItemKeyDown={handleSourceKeyDown}
          />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {isAuthenticated && (
          <div
            id="resource-library-cloud"
            role="tabpanel"
            aria-label={t("admin.resource_library_cloud", language)}
            className={
              source === "cloud"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "hidden"
            }
          >
            <CloudLibrary />
          </div>
        )}
        <div
          id="resource-library-local"
          role="tabpanel"
          aria-label={t("admin.resource_library_local", language)}
          className={
            source === "local"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "hidden"
          }
        >
          <LocalLibrary />
        </div>
      </div>
    </div>
  );
}
