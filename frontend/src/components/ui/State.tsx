import type { ReactNode } from "react";
import { Loader2, ServerCrash } from "lucide-react";
import { Button } from "./Button";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft ring-1 ring-inset ring-accent/20">
        <ServerCrash className="h-6 w-6 text-accent-hover" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium">Something went wrong</p>
        {message && <p className="mt-1 max-w-md text-xs text-muted">{message}</p>}
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fill text-faint ring-1 ring-inset ring-line [&>svg]:h-6 [&>svg]:w-6">
          {icon}
        </div>
      )}
      <div className="px-6">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
