import {
  Archive,
  CheckCircle2,
  CircleDot,
  FileCode2,
  Globe,
  Link2,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useActivity } from "@/lib/queries";
import type { ActivityEvent, Machine } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const eventIcons: Record<string, { icon: typeof Plus; className: string }> = {
  machine_created: { icon: Plus, className: "text-ok bg-ok-soft" },
  machine_updated: { icon: Pencil, className: "text-info bg-info-soft" },
  machine_archived: { icon: Archive, className: "text-muted bg-surface-3" },
  machine_unarchived: { icon: RotateCcw, className: "text-info bg-info-soft" },
  task_completed: { icon: CheckCircle2, className: "text-ok bg-ok-soft" },
  task_reopened: { icon: RotateCcw, className: "text-warn bg-warn-soft" },
  task_status_changed: { icon: CircleDot, className: "text-warn bg-warn-soft" },
  task_added: { icon: Plus, className: "text-info bg-info-soft" },
  task_updated: { icon: Pencil, className: "text-muted bg-surface-3" },
  task_deleted: { icon: CircleDot, className: "text-muted bg-surface-3" },
  tasks_applied: { icon: Plus, className: "text-info bg-info-soft" },
  note_added: { icon: NotebookPen, className: "text-info bg-info-soft" },
  note_updated: { icon: NotebookPen, className: "text-muted bg-surface-3" },
  note_deleted: { icon: NotebookPen, className: "text-muted bg-surface-3" },
  service_added: { icon: Globe, className: "text-ok bg-ok-soft" },
  service_updated: { icon: Globe, className: "text-muted bg-surface-3" },
  service_removed: { icon: Globe, className: "text-muted bg-surface-3" },
  dependency_added: { icon: Link2, className: "text-info bg-info-soft" },
  dependency_removed: { icon: Link2, className: "text-muted bg-surface-3" },
  document_generated: { icon: FileCode2, className: "text-accent-hover bg-accent-soft" },
};

function EventRow({ event }: { event: ActivityEvent }) {
  const meta = eventIcons[event.event_type] ?? {
    icon: CircleDot,
    className: "text-muted bg-surface-3",
  };
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.className}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{event.description}</p>
        <p className="mt-0.5 text-[11px] text-faint">{formatDateTime(event.created_at)}</p>
      </div>
    </li>
  );
}

export function HistoryTab({ machine }: { machine: Machine }) {
  const { data: events, isLoading, isError, error, refetch } = useActivity(machine.id);

  if (isLoading) return <LoadingState label="Loading history…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  if (!events || events.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Changes to this machine, its tasks, services, and documents are recorded here."
      />
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border">
        {events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ul>
    </Card>
  );
}
