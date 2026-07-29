import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  BellRing,
  CalendarClock,
  Check,
  ListPlus,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useInvalidateMachine, useMeta, useReminders } from "@/lib/queries";
import type { Machine, MachineReminder, ReminderTemplate } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

function intervalLabel(days: number): string {
  if (days % 365 === 0) return `every ${days / 365} year${days === 365 ? "" : "s"}`;
  if (days % 30 === 0) return `every ${days / 30} month${days === 30 ? "" : "s"}`;
  if (days % 7 === 0) return `every ${days / 7} week${days === 7 ? "" : "s"}`;
  return `every ${days} day${days === 1 ? "" : "s"}`;
}

function dueStatus(r: MachineReminder): { label: string; className: string; dot: string } {
  if (!r.enabled) return { label: "Disabled", className: "text-faint", dot: "bg-faint" };
  if (!r.next_due_at) return { label: "Not scheduled", className: "text-faint", dot: "bg-faint" };
  const [y, m, d] = r.next_due_at.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0)
    return { label: `${-days}d overdue`, className: "text-accent-hover", dot: "bg-accent" };
  if (days === 0) return { label: "Due today", className: "text-warn", dot: "bg-warn" };
  if (days <= 7) return { label: `Due in ${days}d`, className: "text-warn", dot: "bg-warn" };
  return { label: `In ${days}d`, className: "text-ok", dot: "bg-ok" };
}

export function RemindersTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: reminders, isLoading, isError, error, refetch } = useReminders(machineId);
  const { data: meta } = useMeta();
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();

  const [editing, setEditing] = useState<MachineReminder | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<MachineReminder | null>(null);
  const [applyPreview, setApplyPreview] = useState<ReminderTemplate[] | null>(null);

  const markDone = useMutation({
    mutationFn: (r: MachineReminder) =>
      api.post(`/machines/${machineId}/reminders/${r.id}/mark-done`),
    onSuccess: (_, r) => {
      invalidate(machineId);
      toast(`"${r.title}" marked done — next reminder rescheduled.`);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const toggleEnabled = useMutation({
    mutationFn: (r: MachineReminder) =>
      api.patch(`/machines/${machineId}/reminders/${r.id}`, { enabled: !r.enabled }),
    onSuccess: () => invalidate(machineId),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (r: MachineReminder) => api.delete(`/machines/${machineId}/reminders/${r.id}`),
    onSuccess: () => {
      invalidate(machineId);
      toast("Custom reminder deleted.");
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      api.post<{ added: MachineReminder[] }>(`/machines/${machineId}/reminders/apply-templates`),
    onSuccess: (r) => {
      invalidate(machineId);
      toast(
        r.added.length > 0
          ? `${r.added.length} new reminder(s) added from templates.`
          : "No new reminders to add.",
      );
      setApplyPreview(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (isLoading) return <LoadingState label="Loading reminders…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted">
          Recurring maintenance reminders. Set when each was last done and Task Central tracks the
          next due date — due reminders are sent to Telegram when enabled in{" "}
          <Link to="/settings" className="text-info hover:underline">
            Settings → Alerts
          </Link>
          .
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const preview = await api.get<{ reminders: ReminderTemplate[] }>(
              `/machines/${machineId}/reminders/apply-templates/preview`,
            );
            setApplyPreview(preview.reminders);
          }}
        >
          <ListPlus className="h-3.5 w-3.5" aria-hidden /> Apply new defaults
        </Button>
        <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Custom reminder
        </Button>
      </div>

      {reminders && reminders.length === 0 ? (
        <EmptyState
          icon={<BellRing />}
          title="No reminders yet"
          description="Apply the default reminders for this machine type, or add a custom one."
          action={
            <Button size="sm" variant="primary" onClick={() => applyMutation.mutate()}>
              Apply default reminders
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {reminders?.map((r) => {
              const status = dueStatus(r);
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors",
                    !r.enabled && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.title}</span>
                      {r.is_custom && (
                        <Badge className="border-border bg-surface-3 text-faint">custom</Badge>
                      )}
                      <Badge className="hidden border-border bg-surface-2 text-faint sm:inline-flex">
                        {r.category}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Repeat className="h-3 w-3 text-faint" aria-hidden /> {intervalLabel(r.interval_days)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3 text-faint" aria-hidden /> last:{" "}
                        {r.last_performed_at ? formatDate(r.last_performed_at) : "never"}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3 text-faint" aria-hidden /> next:{" "}
                        {r.next_due_at ? formatDate(r.next_due_at) : "—"}
                      </span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "hidden items-center gap-1.5 whitespace-nowrap text-xs font-medium sm:flex",
                      status.className,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} aria-hidden />
                    {status.label}
                  </span>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markDone.mutate(r)}
                      disabled={!r.enabled}
                      title="Mark done — reschedules the next reminder"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden /> Done
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={r.enabled ? `Disable ${r.title}` : `Enable ${r.title}`}
                      title={r.enabled ? "Disable" : "Enable"}
                      onClick={() => toggleEnabled.mutate(r)}
                    >
                      <BellRing
                        className={cn("h-3.5 w-3.5", r.enabled ? "text-info" : "text-faint")}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${r.title}`}
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {r.is_custom && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${r.title}`}
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {(addOpen || editing) && (
        <ReminderDialog
          machineId={machineId}
          reminder={editing}
          categories={meta?.task_categories ?? []}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete custom reminder?"
        message={
          <>
            <strong className="text-text">{deleting?.title}</strong> will be removed from this
            machine.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />

      <Dialog
        open={applyPreview !== null}
        onClose={() => setApplyPreview(null)}
        title="Apply new default reminders"
        description="Reminders from templates that are missing on this machine. Existing reminders are never modified."
        footer={
          <>
            <Button variant="ghost" onClick={() => setApplyPreview(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={(applyPreview?.length ?? 0) === 0}
              loading={applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              Add {applyPreview?.length ?? 0} reminder(s)
            </Button>
          </>
        }
      >
        {applyPreview && applyPreview.length === 0 ? (
          <p className="text-sm text-muted">This machine already has every applicable reminder.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {applyPreview?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Plus className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <Badge className="border-border bg-surface-2 text-faint">
                  {intervalLabel(t.interval_days)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

function ReminderDialog({
  machineId,
  reminder,
  categories,
  onClose,
}: {
  machineId: number;
  reminder: MachineReminder | null;
  categories: string[];
  onClose: () => void;
}) {
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [description, setDescription] = useState(reminder?.description ?? "");
  const [category, setCategory] = useState(reminder?.category ?? "Operating System");
  const [interval, setInterval] = useState(String(reminder?.interval_days ?? 30));
  const [lastPerformed, setLastPerformed] = useState(reminder?.last_performed_at ?? "");
  const [nextDue, setNextDue] = useState(reminder?.next_due_at ?? "");
  const [enabled, setEnabled] = useState(reminder?.enabled ?? true);
  const [notes, setNotes] = useState(reminder?.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        interval_days: Number(interval) || 30,
        last_performed_at: lastPerformed || null,
        next_due_at: nextDue || null,
        enabled,
        notes: notes.trim() || null,
      };
      return reminder
        ? api.patch(`/machines/${machineId}/reminders/${reminder.id}`, payload)
        : api.post(`/machines/${machineId}/reminders`, payload);
    },
    onSuccess: () => {
      invalidate(machineId);
      toast(reminder ? "Reminder updated." : "Custom reminder added.");
      onClose();
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={reminder ? "Edit reminder" : "Add custom reminder"}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {reminder ? "Save reminder" : "Add reminder"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="r-title" className="sm:col-span-2">
          <Input
            id="r-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Apply OS updates"
            autoFocus
          />
        </FormField>
        <FormField label="Description" htmlFor="r-desc" className="sm:col-span-2">
          <Textarea
            id="r-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField label="Category" htmlFor="r-category">
          <Select id="r-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Repeat every (days)"
          htmlFor="r-interval"
          hint="How often this should be done"
        >
          <Input
            id="r-interval"
            type="number"
            min={1}
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </FormField>
        <FormField
          label="Last performed"
          htmlFor="r-last"
          hint="When you last did this (leave blank if never)"
        >
          <Input
            id="r-last"
            type="date"
            value={lastPerformed}
            onChange={(e) => setLastPerformed(e.target.value)}
          />
        </FormField>
        <FormField
          label="Next reminder"
          htmlFor="r-next"
          hint="Auto-set from last performed + interval; override if needed"
        >
          <Input
            id="r-next"
            type="date"
            value={nextDue}
            onChange={(e) => setNextDue(e.target.value)}
          />
        </FormField>
        <FormField label="Notes" htmlFor="r-notes" className="sm:col-span-2">
          <Textarea
            id="r-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled (send reminders when due)
        </label>
      </div>
    </Dialog>
  );
}
