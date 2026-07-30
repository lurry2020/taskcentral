import { Dialog } from "@/components/ui/Dialog";
import { Markdown } from "@/components/ui/Markdown";
import { ErrorState, LoadingState } from "@/components/ui/State";
import type { CurrentChangelog } from "@/lib/types";

export function ChangelogDialog({
  open,
  onClose,
  changelog,
  isLoading,
  error,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  changelog: CurrentChangelog | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const versionLabel =
    changelog?.display_version === "Unreleased"
      ? "Development build"
      : changelog?.display_version
        ? `Version ${changelog.display_version}`
        : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="What's New in Task Central"
      description={
        versionLabel
          ? `${versionLabel}${changelog?.released_at ? ` · ${changelog.released_at}` : ""}`
          : "Current release notes"
      }
      wide
    >
      {isLoading ? (
        <LoadingState label="Loading changelog…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : changelog?.available ? (
        <Markdown content={changelog.content} />
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          No changelog notes are available for this version.
        </p>
      )}
    </Dialog>
  );
}
