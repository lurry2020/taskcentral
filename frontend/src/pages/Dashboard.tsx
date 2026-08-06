import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Server,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Progress";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/State";
import { useDashboard } from "@/lib/queries";
import { relativeTime } from "@/lib/utils";

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "ok" | "warn" | "accent";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "accent"
          ? "text-accent-hover"
          : "text-faint";
  return (
    <div className="group flex flex-col gap-3 px-5 py-5 transition-colors hover:bg-fill-hover">
      <div className="flex items-center justify-between">
        <span className="text-[0.7rem] font-medium uppercase tracking-wider text-faint">
          {label}
        </span>
        <span className={`${toneClass} transition-transform group-hover:scale-110`}>{icon}</span>
      </div>
      <p className="text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useDashboard();

  return (
    <>
      <PageHeader title="Dashboard" />
      {isLoading && <LoadingState label="Loading dashboard…" />}
      {isError && <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />}
      {data && (
        <div className="space-y-6">
          <Card className="grid grid-cols-2 divide-x divide-y divide-border/70 overflow-hidden sm:grid-cols-2 xl:grid-cols-4 xl:divide-y-0">
            <SummaryCard
              label="Total machines"
              value={data.summary.total_machines}
              icon={<Server className="h-4.5 w-4.5" aria-hidden />}
            />
            <SummaryCard
              label="Completed"
              value={data.summary.completed_deployments}
              icon={<CheckCircle2 className="h-4.5 w-4.5" aria-hidden />}
              tone="ok"
            />
            <SummaryCard
              label="Overdue / blocked"
              value={data.summary.overdue_tasks + data.summary.blocked_tasks}
              icon={<AlertTriangle className="h-4.5 w-4.5" aria-hidden />}
              tone="accent"
            />
            <SummaryCard
              label="Pending tasks"
              value={data.summary.pending_tasks}
              icon={<ClipboardList className="h-4.5 w-4.5" aria-hidden />}
            />
          </Card>

          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-3">
              <CardHeader
                title="Recent machines"
                description="Recently created or updated deployments"
                actions={
                  <Link
                    to="/inventory"
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-fill-hover hover:text-text"
                  >
                    View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                }
              />
              <CardBody className="p-0">
                {data.recent_machines.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      icon={<Server />}
                      title="No machines yet"
                      description="Create your first machine to start tracking its deployment checklist."
                      action={
                        <Link
                          to="/inventory/new"
                          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                        >
                          New Machine
                        </Link>
                      }
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.recent_machines.map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/inventory/${m.id}`}
                          className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-fill-hover"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium">{m.name}</span>
                              <TypeBadge type={m.machine_type} />
                              <StatusBadge status={m.status} />
                            </div>
                            <p className="mt-0.5 truncate font-mono text-xs text-faint">
                              {[m.ip_address, m.host].filter(Boolean).join(" · ") || "No network details"}
                            </p>
                          </div>
                          <div className="hidden w-36 shrink-0 sm:block">
                            <ProgressBar percent={m.progress.progress_percent} size="sm" />
                            <p className="mt-1 text-right text-[11px] tabular-nums text-faint">
                              {m.progress.completed_tasks}/{m.progress.applicable_tasks} tasks
                            </p>
                          </div>
                          <span className="hidden w-20 shrink-0 text-right text-xs text-faint md:block">
                            {relativeTime(m.updated_at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader
                title="Needs attention"
                description="Machines with incomplete work or outdated documents"
              />
              <CardBody className="p-0">
                {data.needs_attention.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <CheckCircle2 className="h-8 w-8 text-ok" aria-hidden />
                    <p className="text-sm text-muted">Everything looks good.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.needs_attention.map((item) => (
                      <li key={item.machine_id}>
                        <Link
                          to={`/inventory/${item.machine_id}`}
                          className="block px-5 py-3 transition-colors hover:bg-fill-hover"
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{item.machine_name}</span>
                            <TypeBadge type={item.machine_type} />
                          </div>
                          <ul className="mt-1.5 space-y-0.5">
                            {item.reasons.map((reason, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                                <AlertTriangle
                                  className="mt-0.5 h-3 w-3 shrink-0 text-warn"
                                  aria-hidden
                                />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
