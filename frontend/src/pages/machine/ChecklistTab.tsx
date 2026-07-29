import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge, TaskStatusBadge } from "@/components/ui/Badge";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useInvalidateMachine, useMeta, useTasks } from "@/lib/queries";
import type { Machine, MachineTask, TaskStatus, TaskTemplate } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

interface TaskPatch {
  status?: TaskStatus;
  blocked_reason?: string;
  not_applicable_reason?: string;
  notes?: string | null;
  title?: string;
  description?: string | null;
  category?: string;
  required?: boolean;
  due_date?: string | null;
}

export function ChecklistTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: tasks, isLoading, isError, error, refetch } = useTasks(machineId);
  const { data: meta } = useMeta();
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{
    task: MachineTask;
    target: "Blocked" | "Not Applicable";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [editTask, setEditTask] = useState<MachineTask | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTask, setDeleteTask] = useState<MachineTask | null>(null);
  const [applyPreview, setApplyPreview] = useState<TaskTemplate[] | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});

  const patchMutation = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: number; patch: TaskPatch }) =>
      api.patch<MachineTask>(`/machines/${machineId}/tasks/${taskId}`, patch),
    onSuccess: () => invalidate(machineId),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const reorderMutation = useMutation({
    mutationFn: (taskIds: number[]) =>
      api.post(`/machines/${machineId}/tasks/reorder`, { task_ids: taskIds }),
    onSuccess: () => invalidate(machineId),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) => api.delete(`/machines/${machineId}/tasks/${taskId}`),
    onSuccess: () => {
      invalidate(machineId);
      toast("Task removed from this machine.");
      setDeleteTask(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const applyMutation = useMutation({
    mutationFn: () => api.post<{ added: MachineTask[] }>(`/machines/${machineId}/tasks/apply-templates`),
    onSuccess: (result) => {
      invalidate(machineId);
      toast(
        result.added.length > 0
          ? `${result.added.length} new task(s) added from templates.`
          : "No new tasks to add — checklist already up to date.",
      );
      setApplyPreview(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const setStatus = (task: MachineTask, status: TaskStatus) => {
    if (status === "Blocked") {
      setReason(task.blocked_reason ?? "");
      setReasonDialog({ task, target: "Blocked" });
      return;
    }
    if (status === "Not Applicable") {
      setReason(task.not_applicable_reason ?? "");
      setReasonDialog({ task, target: "Not Applicable" });
      return;
    }
    patchMutation.mutate({ taskId: task.id, patch: { status } });
  };

  const filtered = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) =>
          (!statusFilter || t.status === statusFilter) &&
          (!categoryFilter || t.category === categoryFilter),
      ),
    [tasks, statusFilter, categoryFilter],
  );

  const move = (task: MachineTask, dir: -1 | 1) => {
    if (!tasks) return;
    const ids = tasks.map((t) => t.id);
    const idx = ids.indexOf(task.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <LoadingState label="Loading checklist…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const categories = [...new Set((tasks ?? []).map((t) => t.category))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter tasks by status"
        >
          <option value="">All statuses</option>
          {(meta?.task_statuses ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter tasks by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs tabular-nums text-muted">
          {machine.progress.completed_tasks}/{machine.progress.applicable_tasks} applicable tasks
          complete
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const preview = await api.get<{ tasks: TaskTemplate[] }>(
              `/machines/${machineId}/tasks/apply-templates/preview`,
            );
            setApplyPreview(preview.tasks);
          }}
        >
          <ListPlus className="h-3.5 w-3.5" aria-hidden /> Apply new defaults
        </Button>
        <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Custom task
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={tasks?.length === 0 ? "No checklist tasks" : "No tasks match the filters"}
          description={
            tasks?.length === 0
              ? "Apply the default task templates or add a custom task to get started."
              : undefined
          }
          action={
            tasks?.length === 0 ? (
              <Button size="sm" variant="primary" onClick={() => applyMutation.mutate()}>
                Apply default tasks
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {filtered.map((task) => {
              const isDone = task.status === "Completed";
              const isNA = task.status === "Not Applicable";
              const isExpanded = expanded === task.id;
              return (
                <li key={task.id} className={cn("transition-colors", isExpanded && "bg-surface-2")}>
                  <div className="flex h-11 items-center gap-3 px-4">
                    <Checkbox
                      checked={isDone}
                      disabled={isNA}
                      aria-label={`Mark "${task.title}" ${isDone ? "incomplete" : "complete"}`}
                      onChange={() =>
                        setStatus(task, isDone ? "Pending" : "Completed")
                      }
                    />
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setExpanded(isExpanded ? null : task.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                      )}
                      <span
                        className={cn(
                          "min-w-0 truncate text-sm",
                          isDone && "text-muted line-through decoration-border-strong",
                          isNA && "text-faint",
                        )}
                      >
                        {task.title}
                      </span>
                      {task.required && !isDone && !isNA && (
                        <span className="text-[10px] font-semibold uppercase text-accent-hover">
                          req
                        </span>
                      )}
                      {task.is_custom && (
                        <Badge className="border-border bg-surface-3 text-faint">custom</Badge>
                      )}
                      {task.due_date && !isDone && (
                        <span className="whitespace-nowrap text-[11px] text-warn">
                          due {formatDate(task.due_date)}
                        </span>
                      )}
                    </button>
                    <Badge className="hidden border-border bg-surface-2 text-faint sm:inline-flex">
                      {task.category}
                    </Badge>
                    <TaskStatusBadge status={task.status} />
                    {isDone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Undo completion"
                        title="Undo"
                        onClick={() => setStatus(task, "Pending")}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-border px-4 py-3 pl-11">
                      {task.description && (
                        <p className="text-xs leading-relaxed text-muted">{task.description}</p>
                      )}
                      {task.status === "Blocked" && task.blocked_reason && (
                        <p className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent-hover">
                          <Ban className="mr-1 inline h-3 w-3" aria-hidden /> Blocked:{" "}
                          {task.blocked_reason}
                        </p>
                      )}
                      {isNA && task.not_applicable_reason && (
                        <p className="text-xs text-faint">
                          Not applicable: {task.not_applicable_reason}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          className="h-8 w-auto text-xs"
                          value={task.status}
                          onChange={(e) => setStatus(task, e.target.value as TaskStatus)}
                          aria-label="Task status"
                        >
                          {(meta?.task_statuses ?? []).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                        <Button size="sm" variant="ghost" onClick={() => setEditTask(task)}>
                          <Pencil className="h-3 w-3" aria-hidden /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => move(task, -1)}
                          aria-label="Move task up"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => move(task, 1)}
                          aria-label="Move task down"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-accent-hover"
                          onClick={() => setDeleteTask(task)}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden /> Delete
                        </Button>
                        {task.completed_at && (
                          <span className="ml-auto text-[11px] text-faint">
                            completed {formatDate(task.completed_at)}
                          </span>
                        )}
                      </div>
                      <div>
                        <Textarea
                          rows={2}
                          placeholder="Task notes (Markdown supported)…"
                          value={noteDrafts[task.id] ?? task.notes ?? ""}
                          onChange={(e) =>
                            setNoteDrafts((d) => ({ ...d, [task.id]: e.target.value }))
                          }
                          aria-label={`Notes for ${task.title}`}
                        />
                        {(noteDrafts[task.id] ?? task.notes ?? "") !== (task.notes ?? "") && (
                          <div className="mt-1.5 flex gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() =>
                                patchMutation.mutate({
                                  taskId: task.id,
                                  patch: { notes: noteDrafts[task.id] || null },
                                })
                              }
                            >
                              Save note
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setNoteDrafts((d) => {
                                  const next = { ...d };
                                  delete next[task.id];
                                  return next;
                                })
                              }
                            >
                              Discard
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Blocked / Not Applicable reason dialog */}
      <Dialog
        open={reasonDialog !== null}
        onClose={() => setReasonDialog(null)}
        title={
          reasonDialog?.target === "Blocked" ? "Why is this task blocked?" : "Mark as not applicable"
        }
        description={reasonDialog?.task.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReasonDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={reasonDialog?.target === "Blocked" && !reason.trim()}
              onClick={() => {
                if (!reasonDialog) return;
                patchMutation.mutate({
                  taskId: reasonDialog.task.id,
                  patch:
                    reasonDialog.target === "Blocked"
                      ? { status: "Blocked", blocked_reason: reason.trim() }
                      : {
                          status: "Not Applicable",
                          not_applicable_reason: reason.trim() || undefined,
                        },
                });
                setReasonDialog(null);
              }}
            >
              {reasonDialog?.target === "Blocked" ? "Mark blocked" : "Mark not applicable"}
            </Button>
          </>
        }
      >
        <FormField
          label={
            reasonDialog?.target === "Blocked"
              ? "Reason (required)"
              : "Reason (optional)"
          }
          htmlFor="task-reason"
        >
          <Textarea
            id="task-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              reasonDialog?.target === "Blocked"
                ? "e.g. waiting for a switch port / upstream DNS change"
                : "e.g. no reverse proxy needed for this machine"
            }
            autoFocus
          />
        </FormField>
      </Dialog>

      <TaskFormDialog
        open={addOpen || editTask !== null}
        onClose={() => {
          setAddOpen(false);
          setEditTask(null);
        }}
        machineId={machineId}
        task={editTask}
        categories={meta?.task_categories ?? []}
      />

      <ConfirmDialog
        open={deleteTask !== null}
        onClose={() => setDeleteTask(null)}
        onConfirm={() => deleteTask && deleteMutation.mutate(deleteTask.id)}
        title="Delete checklist task?"
        message={
          <>
            <strong className="text-text">{deleteTask?.title}</strong> will be permanently removed
            from this machine's checklist. The task template and other machines will not be
            changed.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />

      <Dialog
        open={applyPreview !== null}
        onClose={() => setApplyPreview(null)}
        title="Apply new default tasks"
        description="Tasks from templates that are missing on this machine. Existing tasks are never modified."
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
              Add {applyPreview?.length ?? 0} task(s)
            </Button>
          </>
        }
      >
        {applyPreview && applyPreview.length === 0 ? (
          <p className="text-sm text-muted">
            This machine already has every applicable template task. Nothing to add.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {applyPreview?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Plus className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <Badge className="border-border bg-surface-2 text-faint">{t.category}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

function TaskFormDialog({
  open,
  onClose,
  machineId,
  task,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  machineId: number;
  task: MachineTask | null;
  categories: string[];
}) {
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [category, setCategory] = useState(task?.category ?? "Other");
  const [required, setRequired] = useState(task?.required ?? false);
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [prevKey, setPrevKey] = useState<string>("");

  // Re-initialize local state when the dialog target changes
  const key = `${open}-${task?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setCategory(task?.category ?? "Other");
    setRequired(task?.required ?? false);
    setDueDate(task?.due_date ?? "");
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        required,
        due_date: dueDate || null,
      };
      return task
        ? api.patch(`/machines/${machineId}/tasks/${task.id}`, payload)
        : api.post(`/machines/${machineId}/tasks`, payload);
    },
    onSuccess: () => {
      invalidate(machineId);
      toast(task ? "Task updated." : "Custom task added.");
      onClose();
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? "Edit task" : "Add custom task"}
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
            {task ? "Save task" : "Add task"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title" htmlFor="task-title">
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description" htmlFor="task-desc">
          <Textarea
            id="task-desc"
            rows={2}
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category" htmlFor="task-category">
            <Select
              id="task-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Due date" htmlFor="task-due">
            <Input
              id="task-due"
              type="date"
              value={dueDate ?? ""}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required task
        </label>
      </div>
    </Dialog>
  );
}
