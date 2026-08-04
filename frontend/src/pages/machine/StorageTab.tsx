import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, HardDrive, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { StorageDialog, toStorageDraft } from "@/components/machine/StorageDialog";
import type { StorageFormOutput } from "@/components/machine/schema";
import { api } from "@/lib/api";
import { useInvalidateMachine, useStorage } from "@/lib/queries";
import type { Machine, StorageDevice } from "@/lib/types";

export function StorageTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: devices, isLoading, isError, error, refetch } = useStorage(machineId);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: StorageDevice }>({ open: false });
  const [deleting, setDeleting] = useState<StorageDevice | null>(null);

  const saveMutation = useMutation({
    mutationFn: ({ values, editing }: { values: StorageFormOutput; editing?: StorageDevice }) =>
      editing
        ? api.put<StorageDevice>(`/machines/${machineId}/storage/${editing.id}`, values)
        : api.post<StorageDevice>(`/machines/${machineId}/storage`, values),
    onSuccess: (_, { editing }) => {
      invalidate(machineId);
      toast(editing ? "Drive updated." : "Drive added.");
      setDialog({ open: false });
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (device: StorageDevice) => api.delete(`/machines/${machineId}/storage/${device.id}`),
    onSuccess: (_, device) => {
      invalidate(machineId);
      toast(`Drive "${device.name}" removed.`);
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post(`/machines/${machineId}/storage/reorder`, { task_ids: ids }),
    onSuccess: () => invalidate(machineId),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const move = (device: StorageDevice, dir: -1 | 1) => {
    if (!devices) return;
    const ids = devices.map((s) => s.id);
    const idx = ids.indexOf(device.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <LoadingState label="Loading storage…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setDialog({ open: true })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add drive
        </Button>
      </div>
      {devices && devices.length === 0 ? (
        <EmptyState
          icon={<HardDrive />}
          title="No drives recorded"
          description="Record every disk in this machine - drive, capacity, and what it's used for."
          action={
            <Button size="sm" variant="primary" onClick={() => setDialog({ open: true })}>
              Add the first drive
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {devices?.map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{s.name}</span>
                    {s.capacity && (
                      <Badge className="border-border bg-surface-2 text-muted">{s.capacity}</Badge>
                    )}
                  </div>
                  {s.purpose && <p className="mt-0.5 text-xs text-muted">{s.purpose}</p>}
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

      <StorageDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.editing ? toStorageDraft(dialog.editing) : undefined}
        saving={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate({ values, editing: dialog.editing })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Remove drive?"
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
