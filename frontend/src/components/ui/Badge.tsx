import type { ReactNode } from "react";
import {
  cn,
  machineTypeLabels,
  statusDot,
  statusText,
  taskDot,
  taskText,
} from "@/lib/utils";
import type { MachineStatus, MachineType, TaskStatus } from "@/lib/types";

/** Generic label chip - soft, low-contrast, gently rounded (not a loud pill). */
export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A colored dot beside muted text - the primary status treatment. */
function DotStatus({ dot, text, label }: { dot: string; text: string; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", text)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: MachineStatus }) {
  return (
    <DotStatus dot={statusDot[status] ?? statusDot.Draft} text={statusText[status]} label={status} />
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <DotStatus dot={taskDot[status] ?? taskDot.Pending} text={taskText[status]} label={status} />
  );
}

export function TypeBadge({ type }: { type: MachineType }) {
  return (
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
      {machineTypeLabels[type] ?? type}
    </span>
  );
}

export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center rounded-md bg-fill px-1.5 py-0.5 text-[11px] text-muted ring-1 ring-inset ring-line",
        className,
      )}
      title={tag}
    >
      <span className="min-w-0 truncate">
        <span className="text-faint">#</span>
        {tag}
      </span>
    </span>
  );
}
