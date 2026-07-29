import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Link2, Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import {
  DependencyDialog,
  type DependencySubmit,
} from "@/components/machine/DependencyDialog";
import { api } from "@/lib/api";
import {
  useDependencies,
  useInvalidateMachine,
  useReverseDependencies,
} from "@/lib/queries";
import type { Dependency, Machine } from "@/lib/types";

export function DependenciesTab({ machine }: { machine: Machine }) {
  const machineId = machine.id;
  const deps = useDependencies(machineId);
  const reverse = useReverseDependencies(machineId);
  const invalidate = useInvalidateMachine();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Dependency | null>(null);

  const addMutation = useMutation({
    mutationFn: (values: DependencySubmit) =>
      api.post<Dependency>(`/machines/${machineId}/dependencies`, {
        depends_on_machine_id: values.depends_on_machine_id,
        external_name: values.external_name,
        dependency_type: values.dependency_type,
        notes: values.notes,
      }),
    onSuccess: () => {
      invalidate(machineId);
      toast("Dependency added.");
      setAddOpen(false);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (dep: Dependency) => api.delete(`/machines/${machineId}/dependencies/${dep.id}`),
    onSuccess: () => {
      invalidate(machineId);
      toast("Dependency removed.");
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (deps.isLoading || reverse.isLoading) return <LoadingState label="Loading dependencies…" />;
  if (deps.isError)
    return <ErrorState message={(deps.error as Error)?.message} onRetry={() => deps.refetch()} />;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <ArrowUpRight className="h-4 w-4 text-muted" aria-hidden /> This machine depends on
            </span>
          }
          actions={
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add
            </Button>
          }
        />
        <CardBody className="p-0">
          {(deps.data?.length ?? 0) === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Link2 />}
                title="No dependencies recorded"
                description="Record the DNS servers, storage, proxies, and other machines this one needs."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {deps.data?.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {d.depends_on_machine_id !== null ? (
                      <Link
                        to={`/inventory/${d.depends_on_machine_id}`}
                        className="text-sm font-medium text-text hover:text-accent-hover hover:underline"
                      >
                        {d.depends_on_machine_name}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">
                        {d.external_name}{" "}
                        <span className="text-xs font-normal text-faint">(external)</span>
                      </span>
                    )}
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge className="border-border bg-surface-2 text-faint">
                        {d.dependency_type}
                      </Badge>
                      {d.notes && <span className="truncate text-xs text-muted">{d.notes}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove dependency"
                    onClick={() => setDeleting(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-accent-hover" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <ArrowDownLeft className="h-4 w-4 text-muted" aria-hidden /> Machines that depend on
              this machine
            </span>
          }
        />
        <CardBody className="p-0">
          {(reverse.data?.length ?? 0) === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Link2 />}
                title="Nothing depends on this machine"
                description="When other machines list this one as a dependency, they appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {reverse.data?.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/inventory/${r.machine_id}`}
                      className="text-sm font-medium hover:text-accent-hover hover:underline"
                    >
                      {r.machine_name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <TypeBadge type={r.machine_type} />
                      <Badge className="border-border bg-surface-2 text-faint">
                        {r.dependency_type}
                      </Badge>
                    </div>
                  </div>
                  <StatusBadge status={r.machine_status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <DependencyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        excludeMachineId={machineId}
        saving={addMutation.isPending}
        onSubmit={(values) => addMutation.mutate(values)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Remove dependency?"
        message={
          <>
            The dependency on{" "}
            <strong className="text-text">
              {deleting?.depends_on_machine_name ?? deleting?.external_name}
            </strong>{" "}
            will be removed.
          </>
        }
        confirmLabel="Remove"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
