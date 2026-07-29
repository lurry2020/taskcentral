import type { MachineStatus, MachineType, TaskStatus } from "./types";

// All timestamps are displayed in the timezone configured in Settings, regardless
// of the viewer's system timezone. The value is a module-level cache so the (many)
// synchronous format helpers can read it without prop-drilling; it is seeded from
// localStorage for an instant-correct first paint and kept in sync from the backend
// setting by the app shell (see Layout).
const TZ_KEY = "taskcentral-tz";
const DEFAULT_TIME_ZONE = "America/New_York";

let appTimeZone = ((): string => {
  try {
    return localStorage.getItem(TZ_KEY) || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
})();

export function getAppTimeZone(): string {
  return appTimeZone;
}

export function setAppTimeZone(tz: string): void {
  if (!tz || tz === appTimeZone) return;
  appTimeZone = tz;
  try {
    localStorage.setItem(TZ_KEY, tz);
  } catch {
    /* storage unavailable — still applies for this session */
  }
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Backend timestamps are UTC but serialized without a timezone marker (SQLite
// drops tzinfo). A tz-less datetime must be read as UTC, otherwise the browser
// assumes it is already local time and the EDT conversion is skipped.
function parseServerDate(value: string): Date {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(value.includes("T") && !hasTz ? `${value}Z` : value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Pure calendar date (deployment/due date): show as-is, no timezone shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: appTimeZone,
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: appTimeZone,
    timeZoneName: "short",
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const then = parseServerDate(value).getTime();
  if (Number.isNaN(then)) return value;
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function formatSize(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const v = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return unit ? `${v} ${unit}` : String(v);
}

export const machineTypeLabels: Record<MachineType, string> = {
  VM: "VM",
  LXC: "LXC",
  PHYSICAL: "Physical",
  HOST: "Host",
  NETWORK: "Network",
};

// Legacy pill class maps (kept for compatibility). Prefer the dot maps below.
export const statusStyles: Record<MachineStatus, string> = {
  Draft: "bg-surface-3 text-muted border-border-strong",
  "In Progress": "bg-warn-soft text-warn border-warn/30",
  Active: "bg-ok-soft text-ok border-ok/30",
  Maintenance: "bg-info-soft text-info border-info/30",
  Retired: "bg-surface-3 text-faint border-border",
  Archived: "bg-surface-3 text-faint border-border",
};

export const taskStatusStyles: Record<TaskStatus, string> = {
  Pending: "bg-surface-3 text-muted border-border-strong",
  "In Progress": "bg-warn-soft text-warn border-warn/30",
  Completed: "bg-ok-soft text-ok border-ok/30",
  Blocked: "bg-accent-soft text-accent-hover border-accent/30",
  "Not Applicable": "bg-surface-3 text-faint border-border",
};

// Dot indicator colors — a small colored dot beside muted text reads far more
// like an infrastructure console than a colored pill.
export const statusDot: Record<MachineStatus, string> = {
  Draft: "bg-faint",
  "In Progress": "bg-warn shadow-[0_0_0_3px_var(--color-warn-soft)]",
  Active: "bg-ok shadow-[0_0_0_3px_var(--color-ok-soft)]",
  Maintenance: "bg-info shadow-[0_0_0_3px_var(--color-info-soft)]",
  Retired: "bg-faint",
  Archived: "bg-faint",
};

export const statusText: Record<MachineStatus, string> = {
  Draft: "text-muted",
  "In Progress": "text-warn",
  Active: "text-ok",
  Maintenance: "text-info",
  Retired: "text-faint",
  Archived: "text-faint",
};

export const taskDot: Record<TaskStatus, string> = {
  Pending: "bg-faint",
  "In Progress": "bg-warn shadow-[0_0_0_3px_var(--color-warn-soft)]",
  Completed: "bg-ok shadow-[0_0_0_3px_var(--color-ok-soft)]",
  Blocked: "bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]",
  "Not Applicable": "bg-faint",
};

export const taskText: Record<TaskStatus, string> = {
  Pending: "text-muted",
  "In Progress": "text-warn",
  Completed: "text-ok",
  Blocked: "text-accent-hover",
  "Not Applicable": "text-faint",
};

export function downloadText(filename: string, content: string, mime = "text/markdown"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
