import { BadgeCheck, CircleAlert, ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/State";
import type { VersionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VersionDialog({
  open,
  onClose,
  version,
  isLoading,
  isRefreshing,
  error,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  version: VersionStatus | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const updateAvailable = version?.status === "update_available";
  const checkFailed = version?.status === "check_failed";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Task Central Version"
      centerTitle
      footer={
        checkFailed ? (
          <Button size="sm" variant="outline" loading={isRefreshing} onClick={onRetry}>
            Check again
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <LoadingState label="Checking for updates…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : version ? (
        <div className="space-y-5 py-2">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                updateAvailable || checkFailed
                  ? "bg-accent-soft text-accent-hover ring-accent/20"
                  : "bg-ok-soft text-ok ring-ok/20",
              )}
            >
              {updateAvailable || checkFailed ? (
                <CircleAlert className="h-5 w-5" aria-hidden />
              ) : (
                <BadgeCheck className="h-5 w-5" aria-hidden />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {updateAvailable
                  ? "You're not quite up to date"
                  : checkFailed
                    ? "The update check could not be completed"
                    : "You're up to date"}
              </p>
              {(updateAvailable || checkFailed) && (
                <p className="mt-1 text-sm leading-relaxed text-muted">{version.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-fill p-4 ring-1 ring-inset ring-line">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-faint">Installed</p>
              <p className="mt-1 font-mono text-sm">{version.current_version}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-faint">Latest</p>
              <p className="mt-1 font-mono text-sm">{version.latest_version ?? "Unknown"}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <a
              href={version.releases_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              GitHub Releases
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
