import { Camera } from "lucide-react";

export interface CameraParameter {
  label: string;
  value: string;
}

interface CameraParametersProps {
  cameraLabel: string;
  cameraValue?: string | null;
  lensLabel: string;
  lensValue?: string | null;
  parameters: CameraParameter[];
}

export function CameraParameters({
  cameraLabel,
  cameraValue,
  lensLabel,
  lensValue,
  parameters,
}: CameraParametersProps) {
  const hasEquipment = Boolean(cameraValue || lensValue);

  return (
    <div className="space-y-3">
      {hasEquipment && (
        <div
          className="rounded-lg border p-2.5"
          style={{
            borderColor: "var(--border)",
            backgroundColor:
              "color-mix(in srgb, var(--secondary) 42%, transparent)",
          }}
        >
          {cameraValue && (
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: "var(--secondary)",
                  color: "var(--muted-foreground)",
                }}
              >
                <Camera size={13} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {cameraLabel}
                </p>
                <p
                  className="mt-0.5 break-words text-[11px] font-semibold leading-snug"
                  style={{ color: "var(--foreground)" }}
                >
                  {cameraValue}
                </p>
              </div>
            </div>
          )}
          {lensValue && (
            <div
              className={`${cameraValue ? "mt-2.5 border-t pt-2.5" : ""} min-w-0 pl-[2.125rem]`}
              style={cameraValue ? { borderColor: "var(--border)" } : undefined}
            >
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {lensLabel}
              </p>
              <p
                className="mt-0.5 break-words text-[10px] leading-snug"
                style={{ color: "var(--foreground)" }}
              >
                {lensValue}
              </p>
            </div>
          )}
        </div>
      )}

      {parameters.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {parameters.map((parameter) => (
            <div
              key={`${parameter.label}-${parameter.value}`}
              className="min-w-0 rounded-md border px-2.5 py-2"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
              }}
            >
              <p
                className="truncate text-[9px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {parameter.label}
              </p>
              <p
                className="mt-1 truncate font-mono text-[11px] font-medium tabular-nums"
                title={parameter.value}
                style={{ color: "var(--foreground)" }}
              >
                {parameter.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
