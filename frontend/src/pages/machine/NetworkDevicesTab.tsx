import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Network, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import {
  NetworkDeviceDialog,
  toDeviceDraft,
} from "@/components/machine/NetworkDeviceDialog";
import type { NetworkDeviceFormOutput } from "@/components/machine/schema";
import { api } from "@/lib/api";
import { useInvalidateMachine, useNetworkDevices } from "@/lib/queries";
import type { Machine, NetworkDevice } from "@/lib/types";

export function NetworkDevicesTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: devices, isLoading, isError, error, refetch } = useNetworkDevices(machineId);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: NetworkDevice }>({ open: false });
  const [deleting, setDeleting] = useState<NetworkDevice | null>(null);

  const saveMutation = useMutation({
    mutationFn: ({ values, editing }: { values: NetworkDeviceFormOutput; editing?: NetworkDevice }) =>
      editing
        ? api.put<NetworkDevice>(`/machines/${machineId}/network-devices/${editing.id}`, values)
        : api.post<NetworkDevice>(`/machines/${machineId}/network-devices`, values),
    onSuccess: (_, { editing }) => {
      invalidate(machineId);
      toast(editing ? "Device updated." : "Device added.");
      setDialog({ open: false });
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (device: NetworkDevice) =>
      api.delete(`/machines/${machineId}/network-devices/${device.id}`),
    onSuccess: (_, device) => {
      invalidate(machineId);
      toast(`Device "${device.name}" removed.`);
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) =>
      api.post(`/machines/${machineId}/network-devices/reorder`, { task_ids: ids }),
    onSuccess: () => invalidate(machineId),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const move = (device: NetworkDevice, dir: -1 | 1) => {
    if (!devices) return;
    const ids = devices.map((d) => d.id);
    const idx = ids.indexOf(device.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <LoadingState label="Loading equipment…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setDialog({ open: true })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add device
        </Button>
      </div>
      {devices && devices.length === 0 ? (
        <EmptyState
          icon={<Network />}
          title="No network equipment recorded"
          description="Add routers, switches, access points, and other gear with their management IPs."
          action={
            <Button size="sm" variant="primary" onClick={() => setDialog({ open: true })}>
              Add the first device
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {devices?.map((d) => (
              <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                <Network className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{d.name}</span>
                    <Badge className="border-border bg-surface-2 text-faint">{d.role}</Badge>
                    {d.ip_address && (
                      <span className="font-mono text-xs text-muted">{d.ip_address}</span>
                    )}
                  </div>
                  {d.notes && <p className="mt-1 text-xs text-faint">{d.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" aria-label="Move up" onClick={() => move(d, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" onClick={() => move(d, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${d.name}`}
                    onClick={() => setDialog({ open: true, editing: d })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${d.name}`}
                    onClick={() => setDeleting(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <NetworkDeviceDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.editing ? toDeviceDraft(dialog.editing) : undefined}
        saving={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate({ values, editing: dialog.editing })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Remove device?"
        message={
          <>
            <strong className="text-text">{deleting?.name}</strong> will be removed from this
            network.
          </>
        }
        confirmLabel="Remove"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
