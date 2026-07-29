import { cn } from "@/lib/utils";
import type { ChecklistProgress } from "@/lib/types";

export function ProgressBar({
  percent,
  className,
  size = "md",
}: {
  percent: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const done = clamped >= 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "w-full overflow-hidden rounded-full bg-fill",
        size === "sm" ? "h-1" : "h-1.5",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700 ease-out",
          done
            ? "bg-linear-to-r from-ok/80 to-ok shadow-[0_0_8px_-1px_var(--color-ok)]"
            : clamped > 0
              ? "bg-linear-to-r from-accent-deep to-accent shadow-[0_0_8px_-1px_var(--color-accent)]"
              : "",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ChecklistProgressCell({ progress }: { progress: ChecklistProgress }) {
  return (
    <div className="flex min-w-28 items-center gap-2.5">
      <ProgressBar percent={progress.progress_percent} size="sm" className="w-20" />
      <span className="whitespace-nowrap text-xs tabular-nums text-muted">
        {progress.completed_tasks}<span className="text-faint">/{progress.applicable_tasks}</span>
      </span>
    </div>
  );
}
