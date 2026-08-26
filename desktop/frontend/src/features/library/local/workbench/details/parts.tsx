import { Camera, ChevronDown, ImageOff, Star } from "lucide-react";
import type { LocalLibraryCopy } from "../../copy";

/* ─── 折叠区块：图标 + 标题 + 计数 + 旋转箭头，整行可点击 ─── */

export function Section({
  label,
  icon: Icon,
  open,
  onToggle,
  count,
  children,
}: {
  label: string;
  icon: typeof Camera;
  open: boolean;
  onToggle: () => void;
  count?: number;
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
          {count !== undefined && count > 0 && (
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "var(--muted-foreground)" }}
            >
              {count}
            </span>
          )}
          <ChevronDown
            size={14}
            className="transition-transform duration-200"
            style={{
              color: "var(--muted-foreground)",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        </button>
      </div>
      {open && <div className="pb-4">{children}</div>}
    </section>
  );
}

/* ─── 元数据行：左标签右值 ─── */

export function MetaRow({
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

/* ─── 操作按钮 ─── */

export function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary,
  disabled,
  destructive,
  loading,
}: {
  icon: typeof Star;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
}) {
  if (primary) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          backgroundColor: "var(--primary)",
          color: "var(--primary-foreground)",
        }}
      >
        <Icon size={13} className={loading ? "animate-spin" : ""} />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
        if (!disabled)
          e.currentTarget.style.backgroundColor = destructive
            ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
            : "var(--secondary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <Icon size={13} className={loading ? "animate-spin" : ""} />
      {label}
    </button>
  );
}

/* ─── 空状态 ─── */

export function EmptyState({ copy }: { copy: LocalLibraryCopy }) {
  return (
    <aside
      className="hidden h-full w-[340px] shrink-0 flex-col items-center justify-center border-l px-8 xl:flex"
      style={{ borderColor: "var(--border)" }}
      data-local-library-guide="details"
    >
      <ImageOff
        size={28}
        strokeWidth={1.2}
        style={{ color: "var(--muted-foreground)" }}
      />
      <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {copy.noSelection}
      </p>
    </aside>
  );
}
