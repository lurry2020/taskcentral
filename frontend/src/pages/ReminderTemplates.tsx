import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BellRing, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useMeta, useReminderTemplates } from "@/lib/queries";
import type { ReminderTemplate, TemplateScope } from "@/lib/types";
import { cn } from "@/lib/utils";

const scopeLabels: Record<TemplateScope, string> = {
  ALL: "All types",
  VM: "VM only",
  LXC: "LXC only",
  PHYSICAL: "Physical only",
  HOST: "Host only",
  NETWORK: "Network only",
};

const scopeStyles: Record<TemplateScope, string> = {
  ALL: "border-border bg-surface-2 text-muted",
  VM: "border-info/30 bg-info-soft text-info",
  LXC: "border-warn/30 bg-warn-soft text-warn",
  PHYSICAL: "border-ok/30 bg-ok-soft text-ok",
  HOST: "border-accent/30 bg-accent-soft text-accent-hover",
  NETWORK: "border-info/30 bg-info-soft text-info",
};

function intervalLabel(days: number): string {
  if (days % 365 === 0) return `every ${days / 365}y`;
  if (days % 30 === 0) return `every ${days / 30}mo`;
  if (days % 7 === 0) return `every ${days / 7}w`;
  return `every ${days}d`;
}

export function ReminderTemplates() {
  const { data: templates, isLoading, isError, error, refetch } = useReminderTemplates();
  const { data: meta } = useMeta();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [scopeFilter, setScopeFilter] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; editing?: ReminderTemplate }>({
    open: false,
  });
  const [deleting, setDeleting] = useState<ReminderTemplate | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reminder-templates"] });

  const toggleMutation = useMutation({
    mutationFn: (t: ReminderTemplate) =>
      api.put<ReminderTemplate>(`/reminder-templates/${t.id}`, { ...t, enabled: !t.enabled }),
    onSuccess: invalidate,
    onError: (err) => toast((err as Error).message, "error"),
  });

  const reorderMutation = useMutation({
    mutationFn: async (list: ReminderTemplate[]) => {
      await Promise.all(
        list.map((t, i) => api.put(`/reminder-templates/${t.id}`, { ...t, sort_order: (i + 1) * 10 })),
      );
    },
    onSuccess: invalidate,
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (t: ReminderTemplate) => api.delete(`/reminder-templates/${t.id}`),
    onSuccess: () => {
      invalidate();
      toast("Reminder template deleted. Existing machine reminders are unaffected.");
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const filtered = useMemo(
    () => (templates ?? []).filter((t) => !scopeFilter || t.machine_type_scope === scopeFilter),
    [templates, scopeFilter],
  );

  const move = (t: ReminderTemplate, dir: -1 | 1) => {
    if (!templates) return;
    const list = [...templates];
    const idx = list.findIndex((x) => x.id === t.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    reorderMutation.mutate(list);
  };

  return (
    <>
      <PageHeader title="Reminder Templates" />
      <div className="space-y-4">
        <p className="max-w-2xl text-sm text-muted">
          These templates define the recurring reminders copied onto every new machine. Changing
          them never modifies existing machines — use <em>Apply new defaults</em> on a machine's
          Reminders tab to pull in additions.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-auto"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            aria-label="Filter by applicability"
          >
            <option value="">All applicability</option>
            {Object.entries(scopeLabels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">
            {filtered.length} template{filtered.length === 1 ? "" : "s"}
          </span>
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setDialog({ open: true })}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> New template
          </Button>
        </div>

        {isLoading && <LoadingState label="Loading templates…" />}
        {isError && <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}
        {filtered.length === 0 && !isLoading ? (
          <EmptyState
            icon={<BellRing />}
            title="No reminder templates"
            description="Create templates to define the default recurring reminders for new machines."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className={cn("flex items-center gap-3 px-4 py-2.5", !t.enabled && "opacity-50")}
                >
                  <Checkbox
                    checked={t.enabled}
                    onChange={() => toggleMutation.mutate(t)}
                    aria-label={`${t.enabled ? "Disable" : "Enable"} "${t.title}"`}
                    title={t.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    {t.description && <p className="truncate text-xs text-muted">{t.description}</p>}
                  </div>
                  <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-muted sm:flex">
                    <Repeat className="h-3 w-3 text-faint" aria-hidden /> {intervalLabel(t.interval_days)}
                  </span>
                  <Badge className="hidden border-border bg-surface-2 text-faint sm:inline-flex">
                    {t.category}
                  </Badge>
                  <Badge className={scopeStyles[t.machine_type_scope]}>
                    {scopeLabels[t.machine_type_scope]}
                  </Badge>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => move(t, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => move(t, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${t.title}`}
                      onClick={() => setDialog({ open: true, editing: t })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${t.title}`}
                      onClick={() => setDeleting(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {dialog.open && (
        <TemplateDialog
          template={dialog.editing}
          categories={meta?.task_categories ?? []}
          onClose={() => setDialog({ open: false })}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete reminder template?"
        message={
          <>
            <strong className="text-text">{deleting?.title}</strong> will no longer be added to new
            machines. Reminders already on machines are not affected.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </>
  );
}

function TemplateDialog({
  template,
  categories,
  onClose,
}: {
  template?: ReminderTemplate;
  categories: string[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState(template?.category ?? "Operating System");
  const [scope, setScope] = useState<TemplateScope>(template?.machine_type_scope ?? "ALL");
  const [interval, setInterval] = useState(String(template?.interval_days ?? 30));
  const [enabled, setEnabled] = useState(template?.enabled ?? true);
  const qc = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        machine_type_scope: scope,
        interval_days: Number(interval) || 30,
        enabled,
        sort_order: template?.sort_order ?? 0,
      };
      return template
        ? api.put(`/reminder-templates/${template.id}`, payload)
        : api.post("/reminder-templates", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminder-templates"] });
      toast(template ? "Template updated." : "Template created.");
      onClose();
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={template ? "Edit reminder template" : "New reminder template"}
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
            {template ? "Save template" : "Create template"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Title" htmlFor="rt-title">
          <Input id="rt-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description" htmlFor="rt-desc">
          <Textarea
            id="rt-desc"
            rows={2}
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category" htmlFor="rt-category">
            <Select id="rt-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Applies to" htmlFor="rt-scope">
            <Select id="rt-scope" value={scope} onChange={(e) => setScope(e.target.value as TemplateScope)}>
              {Object.entries(scopeLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Repeat every (days)" htmlFor="rt-interval">
            <Input
              id="rt-interval"
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </FormField>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>
        </div>
      </div>
    </Dialog>
  );
}
