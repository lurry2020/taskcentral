import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import {
  NetworkSegmentDialog,
  toSegmentDraft,
} from "@/components/machine/NetworkSegmentDialog";
import type { NetworkSegmentFormOutput } from "@/components/machine/schema";
import { api } from "@/lib/api";
import { useInvalidateMachine, useNetworkSegments } from "@/lib/queries";
import type { Machine, NetworkSegment } from "@/lib/types";

export function NetworkSegmentsTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const { data: segments, isLoading, isError, error, refetch } = useNetworkSegments(machineId);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing?: NetworkSegment }>({ open: false });
  const [deleting, setDeleting] = useState<NetworkSegment | null>(null);

  const saveMutation = useMutation({
    mutationFn: ({ values, editing }: { values: NetworkSegmentFormOutput; editing?: NetworkSegment }) =>
      editing
        ? api.put<NetworkSegment>(`/machines/${machineId}/network-segments/${editing.id}`, values)
        : api.post<NetworkSegment>(`/machines/${machineId}/network-segments`, values),
    onSuccess: (_, { editing }) => {
      invalidate(machineId);
      toast(editing ? "Segment updated." : "Segment added.");
      setDialog({ open: false });
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (segment: NetworkSegment) =>
      api.delete(`/machines/${machineId}/network-segments/${segment.id}`),
    onSuccess: (_, segment) => {
      invalidate(machineId);
      toast(`Segment "${segment.name}" removed.`);
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (isLoading) return <LoadingState label="Loading segments…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setDialog({ open: true })}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add segment
        </Button>
      </div>
      {segments && segments.length === 0 ? (
        <EmptyState
          icon={<Layers />}
          title="No network segments recorded"
          description="Add your VLANs / subnets with their purpose (Main, IoT, Guest, …)."
          action={
            <Button size="sm" variant="primary" onClick={() => setDialog({ open: true })}>
              Add the first segment
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Network</th>
                  <th className="px-3 py-2.5 font-medium">VLAN</th>
                  <th className="px-3 py-2.5 font-medium">Subnet</th>
                  <th className="px-3 py-2.5 font-medium">Purpose</th>
                  <th className="w-20 px-2 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {segments?.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-fill-hover">
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">{s.vlan_id ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">{s.subnet ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{s.purpose ?? "—"}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-0.5">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <NetworkSegmentDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false })}
        initial={dialog.editing ? toSegmentDraft(dialog.editing) : undefined}
        saving={saveMutation.isPending}
        onSubmit={(values) => saveMutation.mutate({ values, editing: dialog.editing })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Remove segment?"
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
