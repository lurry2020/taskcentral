import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FilterX,
  MoreHorizontal,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { TagBadge, TypeBadge } from "@/components/ui/Badge";
import { ChecklistProgressCell } from "@/components/ui/Progress";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { DuplicateDialog } from "@/components/machine/DuplicateDialog";
import { api } from "@/lib/api";
import {
  useHosts,
  useMachineConnectivityList,
  useMachines,
  useMeta,
  useSettings,
  useTags,
} from "@/lib/queries";
import type { MachineConnectivity, MachineListItem } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type SortKey = "name" | "created_at" | "updated_at" | "progress";

function MachineState({
  connectivity,
  hasIpAddress,
  checking,
}: {
  connectivity?: MachineConnectivity;
  hasIpAddress: boolean;
  checking: boolean;
}) {
  const online = connectivity?.status === "online";
  const label = online ? "Online" : "Offline";
  const title = connectivity
    ? `${connectivity.message} Checked ${formatDateTime(connectivity.checked_at)}`
    : hasIpAddress && checking
      ? "Checking ICMP reachability from the Task Central backend."
      : hasIpAddress
        ? "The ping check could not be completed."
        : "No IP address is configured, so Task Central cannot ping this machine.";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        online ? "text-ok" : "text-accent-hover",
      )}
      title={title}
      aria-label={`${label}. ${title}`}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          online
            ? "bg-ok shadow-[0_0_0_3px_var(--color-ok-soft)]"
            : "bg-accent shadow-[0_0_0_3px_var(--color-accent-soft)]",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function Machines() {
  const [search, setSearch] = useState("");
  const [machineType, setMachineType] = useState("");
  const [host, setHost] = useState("");
  const [tag, setTag] = useState("");
  const [archived, setArchived] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [duplicating, setDuplicating] = useState<MachineListItem | null>(null);
  const [archiving, setArchiving] = useState<MachineListItem | null>(null);
  const [deleting, setDeleting] = useState<MachineListItem | null>(null);

  const { data: settings } = useSettings();
  const pageSize = settings?.default_page_size ?? 25;
  const params = useMemo(
    () => ({
      search: search || undefined,
      machine_type: machineType || undefined,
      host: host || undefined,
      tag: tag || undefined,
      archived,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      page_size: pageSize,
    }),
    [search, machineType, host, tag, archived, sortBy, sortDir, page, pageSize],
  );
  const { data, isLoading, isError, error, refetch } = useMachines(params);
  const visibleMachineIds = useMemo(() => data?.items.map((machine) => machine.id) ?? [], [data]);
  const {
    data: connectivityResults,
    isFetching: connectivityChecking,
  } = useMachineConnectivityList(visibleMachineIds);
  const connectivityByMachine = useMemo(
    () => new Map(connectivityResults?.map((result) => [result.machine_id, result]) ?? []),
    [connectivityResults],
  );
  const { data: hosts } = useHosts();
  const { data: tags } = useTags();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const hasFilters = Boolean(search || machineType || host || tag || archived);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["machines"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const archiveMutation = useMutation({
    mutationFn: (m: MachineListItem) =>
      api.post(`/machines/${m.id}/${m.archived_at ? "unarchive" : "archive"}`),
    onSuccess: (_, m) => {
      invalidate();
      toast(m.archived_at ? `"${m.name}" restored.` : `"${m.name}" archived.`);
      setArchiving(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (m: MachineListItem) => api.delete(`/machines/${m.id}`),
    onSuccess: (_, m) => {
      invalidate();
      toast(`"${m.name}" permanently deleted.`);
      setDeleting(null);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <button
      onClick={() => toggleSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-text",
        sortBy === sortKey && "text-text",
      )}
    >
      {label}
      {sortBy === sortKey &&
        (sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden />
        ))}
    </button>
  );

  const clearFilters = () => {
    setSearch("");
    setMachineType("");
    setHost("");
    setTag("");
    setArchived(false);
    setPage(1);
  };

  const setFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const closeMenu = () => {
    setMenuFor(null);
    setMenuAnchor(null);
  };

  // Reposition would drift while scrolling; close the menu instead.
  useEffect(() => {
    if (menuFor === null) return;
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuFor]);

  const machineActions = (m: MachineListItem) => [
    { label: "View", icon: Eye, onClick: () => navigate(`/inventory/${m.id}`) },
    { label: "Duplicate", icon: Copy, onClick: () => setDuplicating(m) },
    m.archived_at
      ? { label: "Restore", icon: ArchiveRestore, onClick: () => archiveMutation.mutate(m) }
      : { label: "Archive", icon: Archive, onClick: () => setArchiving(m) },
    ...(m.archived_at
      ? [
          {
            label: "Delete permanently",
            icon: Trash2,
            onClick: () => setDeleting(m),
            danger: true,
          },
        ]
      : []),
  ];

  const RowActions = ({ m }: { m: MachineListItem }) => (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Actions for ${m.name}`}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation();
        if (menuFor === m.id) {
          closeMenu();
        } else {
          setMenuAnchor(e.currentTarget.getBoundingClientRect());
          setMenuFor(m.id);
        }
      }}
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );

  // Rendered once, in a portal, so the overflow-clipping table wrapper can't
  // trap it behind a scrollbar. Positioned relative to the clicked button.
  const activeMenuMachine =
    menuFor !== null ? data?.items.find((x) => x.id === menuFor) : undefined;

  const renderActionsMenu = () => {
    if (!activeMenuMachine || !menuAnchor) return null;
    const actions = machineActions(activeMenuMachine);
    const width = 176;
    const menuHeight = actions.length * 34 + 8;
    const openUp = menuAnchor.bottom + menuHeight + 8 > window.innerHeight;
    const style: CSSProperties = {
      top: openUp ? Math.max(8, menuAnchor.top - menuHeight - 4) : menuAnchor.bottom + 4,
      left: Math.max(8, menuAnchor.right - width),
      width,
    };
    return createPortal(
      <>
        <div className="fixed inset-0 z-40" onClick={closeMenu} aria-hidden />
        <div
          role="menu"
          className="fixed z-50 overflow-hidden rounded-lg border border-border-strong bg-surface-2 py-1 shadow-(--shadow-pop)"
          style={style}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-fill-hover",
                "danger" in action && action.danger ? "text-accent-hover" : "text-text",
              )}
              onClick={() => {
                closeMenu();
                action.onClick();
              }}
            >
              <action.icon className="h-3.5 w-3.5" aria-hidden />
              {action.label}
            </button>
          ))}
        </div>
      </>,
      document.body,
    );
  };

  return (
    <>
      <PageHeader title={archived ? "Archived Inventory" : "Inventory"} />
      <div className="space-y-4">
        {/* Filters */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              className="pl-10"
              placeholder="Search name, IP, DNS, host…"
              value={search}
              onChange={(e) => setFilter(setSearch)(e.target.value)}
              aria-label="Search machines"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[calc(50%-0.25rem)] sm:w-40">
              <Select
                value={machineType}
                onChange={(e) => setFilter(setMachineType)(e.target.value)}
                aria-label="Filter by machine type"
              >
                <option value="">All types</option>
                {meta?.machine_types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-[calc(50%-0.25rem)] sm:w-40">
              <Select
                value={host}
                onChange={(e) => setFilter(setHost)(e.target.value)}
                aria-label="Filter by host"
              >
                <option value="">All hosts</option>
                {hosts?.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-[calc(50%-0.25rem)] sm:w-40">
              <Select
                value={tag}
                onChange={(e) => setFilter(setTag)(e.target.value)}
                aria-label="Filter by tag"
              >
                <option value="">All tags</option>
                {tags?.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant={archived ? "primary" : "outline"}
                size="md"
                onClick={() => {
                  setArchived((a) => !a);
                  setPage(1);
                }}
              >
                <Archive className="h-3.5 w-3.5" aria-hidden />
                Archived
              </Button>
              {hasFilters && (
                <Button variant="ghost" onClick={clearFilters}>
                  <FilterX className="h-3.5 w-3.5" aria-hidden />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {isLoading && <LoadingState label="Loading machines…" />}
        {isError && <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}

        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Server />}
            title={hasFilters ? "No machines match your filters" : "No machines yet"}
            description={
              hasFilters
                ? "Try adjusting or clearing the filters."
                : "Create your first machine record to generate its setup checklist."
            }
            action={
              hasFilters ? (
                <Button size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link
                  to="/inventory/new"
                  className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  New Machine
                </Link>
              )
            }
          />
        )}

        {data && data.items.length > 0 && (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-visible md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 py-2.5 font-medium">
                        <SortHeader label="Name" sortKey="name" />
                      </th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 font-medium">Host</th>
                      <th className="px-3 py-2.5 font-medium">IP / DNS</th>
                      <th className="px-3 py-2.5 font-medium">OS</th>
                      <th className="px-3 py-2.5 font-medium">State</th>
                      <th className="px-3 py-2.5 font-medium">
                        <SortHeader label="Progress" sortKey="progress" />
                      </th>
                      <th className="px-3 py-2.5 font-medium">
                        <SortHeader label="Updated" sortKey="updated_at" />
                      </th>
                      <th className="w-10 px-2 py-2.5" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.items.map((m) => (
                      <tr
                        key={m.id}
                        className="h-20 cursor-pointer align-middle transition-colors hover:bg-fill-hover"
                        onClick={() => navigate(`/inventory/${m.id}`)}
                      >
                        <td className="h-20 min-w-64 px-4 py-2">
                          <p className="truncate font-medium" title={m.name}>
                            {m.name}
                          </p>
                          <div className="mt-1 flex h-6 min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
                            {m.tags.slice(0, 3).map((t) => (
                              <TagBadge key={t} tag={t} className="max-w-24 shrink" />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <TypeBadge type={m.machine_type} />
                          {m.vmid !== null && (
                            <p className="mt-1 font-mono text-[11px] text-faint">#{m.vmid}</p>
                          )}
                        </td>
                        <td
                          className="max-w-36 truncate px-3 py-3 text-muted"
                          title={m.host ?? undefined}
                        >
                          {m.host ?? "-"}
                        </td>
                        <td className="max-w-48 px-3 py-3">
                          <p className="truncate font-mono text-xs" title={m.ip_address ?? undefined}>
                            {m.ip_address ?? "-"}
                          </p>
                          <p
                            className="truncate font-mono text-[11px] text-faint"
                            title={m.dns_record ?? undefined}
                          >
                            {m.dns_record ?? ""}
                          </p>
                        </td>
                        <td
                          className="max-w-48 truncate px-3 py-3 text-muted"
                          title={
                            m.operating_system
                              ? `${m.operating_system} ${m.operating_system_version ?? ""}`.trim()
                              : undefined
                          }
                        >
                          {m.operating_system
                            ? `${m.operating_system} ${m.operating_system_version ?? ""}`.trim()
                            : "-"}
                        </td>
                        <td className="px-3 py-3">
                          <MachineState
                            connectivity={connectivityByMachine.get(m.id)}
                            hasIpAddress={Boolean(m.ip_address)}
                            checking={connectivityChecking}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <ChecklistProgressCell progress={m.progress} />
                          {m.progress.pending_tasks > 0 && (
                            <p className="mt-0.5 text-[11px] text-faint">
                              {m.progress.pending_tasks} pending
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-faint">
                          {relativeTime(m.updated_at)}
                        </td>
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <RowActions m={m} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {data.items.map((m) => (
                <Card key={m.id} className="p-4" onClick={() => navigate(`/inventory/${m.id}`)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{m.name}</span>
                        <TypeBadge type={m.machine_type} />
                      </div>
                      <p className="mt-1 font-mono text-xs text-faint">
                        {[m.ip_address, m.host].filter(Boolean).join(" · ") || "No network details"}
                      </p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActions m={m} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <MachineState
                      connectivity={connectivityByMachine.get(m.id)}
                      hasIpAddress={Boolean(m.ip_address)}
                      checking={connectivityChecking}
                    />
                    <ChecklistProgressCell progress={m.progress} />
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {data.total} machine{data.total === 1 ? "" : "s"}
              </span>
              {data.pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="tabular-nums">
                    Page {data.page} of {data.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pages}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {renderActionsMenu()}

      {duplicating && (
        <DuplicateDialog
          open
          onClose={() => setDuplicating(null)}
          machineId={duplicating.id}
          machineName={duplicating.name}
        />
      )}
      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archiveMutation.mutate(archiving)}
        title="Archive machine?"
        message={
          <>
            <strong className="text-text">{archiving?.name}</strong> will be moved to the archive.
            Its checklist, notes, and history are kept and it can be restored at any time.
          </>
        }
        confirmLabel="Archive"
        loading={archiveMutation.isPending}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Permanently delete machine?"
        message={
          <>
            <strong className="text-text">{deleting?.name}</strong> and all of its tasks, services,
            notes, documents, and history will be permanently deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete forever"
        danger
        loading={deleteMutation.isPending}
      />
    </>
  );
}
