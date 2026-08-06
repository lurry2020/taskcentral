import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { TagBadge, TypeBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Progress";
import { CopyButton } from "@/components/ui/CopyButton";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { DuplicateDialog } from "@/components/machine/DuplicateDialog";
import { api } from "@/lib/api";
import { useInvalidateMachine, useMachine, useMachineConnectivity } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";
import { EditMachineDialog } from "./EditMachineDialog";
import { OverviewTab } from "./OverviewTab";
import { ChecklistTab } from "./ChecklistTab";
import { ServicesTab } from "./ServicesTab";
import { StorageTab } from "./StorageTab";
import { NetworkDevicesTab } from "./NetworkDevicesTab";
import { NetworkSegmentsTab } from "./NetworkSegmentsTab";
import { DependenciesTab } from "./DependenciesTab";
import { NotesTab } from "./NotesTab";
import { ObsidianTab } from "./ObsidianTab";
import { HistoryTab } from "./HistoryTab";
import { RemindersTab } from "./RemindersTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "checklist", label: "Checklist" },
  { key: "reminders", label: "Reminders" },
  { key: "services", label: "Services" },
  { key: "storage", label: "Storage" },
  { key: "devices", label: "Equipment" },
  { key: "segments", label: "Segments" },
  { key: "dependencies", label: "Dependencies" },
  { key: "notes", label: "Notes" },
  { key: "obsidian", label: "Obsidian" },
  { key: "history", label: "History" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Each machine type shows a tailored set of tabs: hosts track disks (Storage),
// networks track Equipment + Segments, everyone else tracks Services. Reminders
// apply to every type.
function tabsForType(machineType: string): readonly { key: TabKey; label: string }[] {
  let visible: TabKey[];
  if (machineType === "HOST") {
    visible = ["overview", "checklist", "reminders", "storage", "dependencies", "notes", "obsidian", "history"];
  } else if (machineType === "NETWORK") {
    visible = [
      "overview",
      "checklist",
      "reminders",
      "devices",
      "segments",
      "dependencies",
      "notes",
      "obsidian",
      "history",
    ];
  } else {
    visible = ["overview", "checklist", "reminders", "services", "dependencies", "notes", "obsidian", "history"];
  }
  return TABS.filter((t) => visible.includes(t.key));
}

export function MachineDetail() {
  const params = useParams();
  const id = Number(params.id);
  const tab = (params.tab as TabKey) || "overview";
  const navigate = useNavigate();
  const { data: machine, isLoading, isError, error, refetch } = useMachine(id);
  const {
    data: connectivity,
    isFetching: connectivityChecking,
    refetch: refreshConnectivity,
  } = useMachineConnectivity(id, Boolean(machine?.ip_address));
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { toast } = useToast();
  const invalidate = useInvalidateMachine();

  const archiveMutation = useMutation({
    mutationFn: () =>
      api.post(`/machines/${id}/${machine?.archived_at ? "unarchive" : "archive"}`),
    onSuccess: () => {
      invalidate(id);
      toast(machine?.archived_at ? "Machine restored." : "Machine archived.");
      setConfirmArchive(false);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (isLoading) return <LoadingState label="Loading machine…" />;
  if (isError || !machine)
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title={machine.name} crumbs={[{ label: "Inventory", to: "/inventory" }]} />
      <div className="space-y-5">
        {/* Header card */}
        <div className="relative overflow-hidden rounded-2xl bg-surface/95 p-5 shadow-(--shadow-card) ring-1 ring-line">
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 h-32 bg-linear-to-b from-accent/[0.07] to-transparent"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{machine.name}</h2>
                <TypeBadge type={machine.machine_type} />
                {machine.ip_address ? (
                  <div className="flex items-center gap-0.5">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        connectivity?.status === "online"
                          ? "text-ok"
                          : "text-accent-hover",
                      )}
                      title={
                        connectivity
                          ? `${connectivity.message} Checked ${formatDateTime(connectivity.checked_at)}`
                          : "Checking ICMP reachability from the Task Central backend."
                      }
                    >
                      {connectivity?.status === "online" ? "Online" : "Offline"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void refreshConnectivity()}
                      disabled={connectivityChecking}
                      aria-label="Ping machine again"
                      title="Ping machine again"
                      className="h-6 w-6"
                    >
                      {connectivityChecking ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-3 w-3" aria-hidden />
                      )}
                    </Button>
                  </div>
                ) : (
                  <span
                    className="text-xs font-medium text-accent-hover"
                    title="No IP address is configured, so Task Central cannot ping this machine."
                  >
                    Offline
                  </span>
                )}
                {machine.archived_at && (
                  <span className="text-xs text-faint">(archived)</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
                {machine.ip_address && (
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    {machine.ip_address}
                    <CopyButton text={machine.ip_address} size="icon" variant="ghost" />
                  </span>
                )}
                {machine.dns_record && (
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    {machine.dns_record}
                    <CopyButton text={machine.dns_record} size="icon" variant="ghost" />
                  </span>
                )}
                {machine.host && <span className="text-xs">on {machine.host}</span>}
                {machine.vmid !== null && (
                  <span className="font-mono text-xs">#{machine.vmid}</span>
                )}
              </div>
              {machine.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {machine.tags.map((t) => (
                    <TagBadge key={t} tag={t} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </Button>
              <Button size="sm" onClick={() => setDuplicating(true)}>
                <Copy className="h-3.5 w-3.5" aria-hidden /> Duplicate
              </Button>
              {machine.archived_at ? (
                <Button size="sm" onClick={() => archiveMutation.mutate()}>
                  <ArchiveRestore className="h-3.5 w-3.5" aria-hidden /> Restore
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmArchive(true)}>
                  <Archive className="h-3.5 w-3.5" aria-hidden /> Archive
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar percent={machine.progress.progress_percent} className="max-w-md" />
            <span className="whitespace-nowrap text-xs tabular-nums text-muted">
              {machine.progress.completed_tasks}/{machine.progress.applicable_tasks} tasks ·{" "}
              {machine.progress.progress_percent}%
            </span>
          </div>
          {machine.obsidian_document_needs_regeneration && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-text">
                    Obsidian document needs regeneration
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Machine information changed since the document was last generated.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate(`/inventory/${id}/obsidian`)}
              >
                Open Obsidian
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border" role="tablist" aria-label="Machine sections">
          <div className="-mb-px flex gap-1 overflow-x-auto">
            {tabsForType(machine.machine_type).map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() =>
                  navigate(t.key === "overview" ? `/inventory/${id}` : `/inventory/${id}/${t.key}`)
                }
                className={cn(
                  "whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-accent text-text"
                    : "border-transparent text-muted hover:border-border-strong hover:text-text",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && <OverviewTab machine={machine} />}
        {tab === "checklist" && <ChecklistTab machine={machine} />}
        {tab === "reminders" && <RemindersTab machine={machine} />}
        {tab === "services" && <ServicesTab machine={machine} />}
        {tab === "storage" && <StorageTab machine={machine} />}
        {tab === "devices" && <NetworkDevicesTab machine={machine} />}
        {tab === "segments" && <NetworkSegmentsTab machine={machine} />}
        {tab === "dependencies" && <DependenciesTab machine={machine} />}
        {tab === "notes" && <NotesTab machine={machine} />}
        {tab === "obsidian" && <ObsidianTab machine={machine} />}
        {tab === "history" && <HistoryTab machine={machine} />}
      </div>

      {editing && <EditMachineDialog machine={machine} open onClose={() => setEditing(false)} />}
      {duplicating && (
        <DuplicateDialog
          open
          onClose={() => setDuplicating(false)}
          machineId={machine.id}
          machineName={machine.name}
        />
      )}
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => archiveMutation.mutate()}
        title="Archive machine?"
        message={
          <>
            <strong className="text-text">{machine.name}</strong> will be moved to the archive. All
            data is kept and it can be restored at any time.
          </>
        }
        confirmLabel="Archive"
        loading={archiveMutation.isPending}
      />
    </>
  );
}
