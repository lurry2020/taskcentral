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
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={<span className="text-base">Task Central Changelog</span>}
      centerTitle
      wide
    >
      {isLoading ? (
        <LoadingState label="Loading changelog…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={onRetry} />
      ) : changelog?.available ? (
        <div className="max-h-[65vh] overflow-y-auto overscroll-contain pr-2">
          <Markdown content={changelog.content} />
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted">
          No changelog notes are available for this version.
        </p>
      )}
    </Dialog>
  );
}
