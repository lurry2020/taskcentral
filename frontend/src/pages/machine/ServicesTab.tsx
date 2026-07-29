import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { ServiceDialog, toDraft } from "@/components/machine/ServiceDialog";
import type { ServiceFormOutput } from "@/components/machine/schema";
import { api } from "@/lib/api";
import { useInvalidateMachine, useServices } from "@/lib/queries";
import type { Machine, Service } from "@/lib/types";

export function ServicesTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: services, isLoading, isError, error, refetch } = useServices(machineId);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Service }>({ open: false });
  const [deleting, setDeleting] = useState<Service | null>(null);

  const saveMutation = useMutation({
    mutationFn: ({ values, editing }: { values: ServiceFormOutput; editing?: Service }) =>
      editing
        ? api.put<Service>(`/machines/${machineId}/services/${editing.id}`, values)
        : api.post<Service>(`/machines/${machineId}/services`, values),
    onSuccess: (_, { editing }) => {
      invalidate(machineId);
      toast(editing ? "Service updated." : "Service added.");
      setDialog({ open: false });
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (service: Service) => api.delete(`/machines/${machineId}/services/${service.id}`),
    onSuccess: (_, service) => {
      invalidate(machineId);
      toast(`Service "${service.name}" removed.`);
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post(`/machines/${machineId}/services/reorder`, { task_ids: ids }),
    onSuccess: () => invalidate(machineId),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const move = (service: Service, dir: -1 | 1) => {
    if (!services) return;
    const ids = services.map((s) => s.id);
    const idx = ids.indexOf(service.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <LoadingState label="Loading services…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setDialog({ open: true })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add service
        </Button>
      </div>
      {services && services.length === 0 ? (
        <EmptyState
          icon={<Globe />}
          title="No services recorded"
          description="Track what runs on this machine: name, port, protocol, and URL."
          action={
            <Button size="sm" variant="primary" onClick={() => setDialog({ open: true })}>
              Add the first service
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {services?.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    {s.port !== null && (
                      <Badge className="border-border bg-surface-2 font-mono text-muted">
                        :{s.port}
                      </Badge>
                    )}
                    {s.protocol && (
                      <Badge className="border-border bg-surface-2 text-faint">{s.protocol}</Badge>
                    )}
                    {s.is_external && (
                      <Badge className="border-warn/30 bg-warn-soft text-warn">external</Badge>
                    )}
                  </div>
                  {s.description && <p className="mt-0.5 text-xs text-muted">{s.description}</p>}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-info hover:underline"
                    >
                      {s.url} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                  {s.notes && <p className="mt-1 text-xs text-faint">{s.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => move(s, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => move(s, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${s.name}`}
                    onClick={() => setDialog({ open: true, editing: s })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ServiceDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.editing ? toDraft(dialog.editing) : undefined}
        saving={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate({ values, editing: dialog.editing })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Remove service?"
        message={
          <>
            <strong className="text-text">{deleting?.name}</strong> will be removed from this
            machine.
          </>
        }
        confirmLabel="Remove"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
