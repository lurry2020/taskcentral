import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BellRing,
  CircleArrowUp,
  FileCode2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  PackageCheck,
  ScrollText,
  Server,
  Settings,
  X,
} from "lucide-react";
import { cn, setAppTimeZone } from "@/lib/utils";
import {
  useCurrentChangelog,
  useMarkCurrentChangelogSeen,
  useSettings,
  useVersionStatus,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { FRONTEND_BUILD_VERSION, runningVersionDiffers } from "@/lib/buildVersion";
import { Button } from "@/components/ui/Button";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { ChangelogDialog } from "@/components/ChangelogDialog";
import { VersionDialog } from "@/components/VersionDialog";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Inventory", icon: Server },
  { to: "/task-templates", label: "Task Templates", icon: ListChecks },
  { to: "/reminder-templates", label: "Reminder Templates", icon: BellRing },
  { to: "/obsidian-templates", label: "Obsidian Templates", icon: FileCode2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main navigation">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end ?? to === "/inventory"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.83rem] font-medium transition-colors",
              isActive
                ? "bg-fill text-text"
                : "text-muted hover:bg-fill-hover hover:text-text",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
                aria-hidden
              />
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-accent" : "text-faint group-hover:text-muted",
                )}
                aria-hidden
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  const { data: settings } = useSettings();
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl shadow-[0_4px_12px_-4px_var(--color-accent)]">
        <img
          src="/logo.png"
          alt=""
          className="h-full w-full scale-[1.04] object-cover object-center"
          aria-hidden
        />
      </div>
      <div className="leading-tight">
        <p className="text-[0.9rem] font-semibold tracking-tight">
          {settings?.app_name ?? "Task Central"}
        </p>
        <p className="text-[11px] tracking-wide text-faint">Homelab provisioning</p>
      </div>
    </div>
  );
}

function VersionButton({
  version,
  updateAvailable,
  onClick,
}: {
  version: string;
  updateAvailable: boolean;
  onClick: () => void;
}) {
  const Icon = updateAvailable ? CircleArrowUp : PackageCheck;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[0.83rem] font-medium transition-colors hover:bg-fill-hover hover:text-text",
        updateAvailable ? "text-accent-hover" : "text-muted",
      )}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", updateAvailable ? "text-accent" : "text-faint")}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-left">Version {version}</span>
      {updateAvailable && (
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-hover">
          Update
        </span>
      )}
    </button>
  );
}

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const autoOpenedVersion = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: settings } = useSettings();
  const {
    data: changelog,
    isLoading: changelogLoading,
    error: changelogError,
    refetch: refetchChangelog,
  } = useCurrentChangelog();
  const {
    data: versionStatus,
    isLoading: versionLoading,
    isFetching: versionRefreshing,
    error: versionError,
    refetch: refetchVersion,
  } = useVersionStatus();
  const markChangelogSeen = useMarkCurrentChangelogSeen();
  const { username, logout } = useAuth();

  // Keep the app-wide display timezone in sync with the backend setting.
  useEffect(() => {
    if (settings?.timezone) setAppTimeZone(settings.timezone);
  }, [settings?.timezone]);

  useEffect(() => {
    if (
      location.pathname !== "/" ||
      !changelog?.available ||
      changelog.seen ||
      autoOpenedVersion.current === changelog.version
    ) {
      return;
    }
    autoOpenedVersion.current = changelog.version;
    setChangelogOpen(true);
    markChangelogSeen.mutate();
  }, [changelog, location.pathname, markChangelogSeen]);

  const showChangelog = () => {
    setChangelogOpen(true);
    if (changelog?.available && !changelog.seen && !markChangelogSeen.isPending) {
      markChangelogSeen.mutate();
    }
  };
  const installedVersion = versionStatus?.current_version ?? changelog?.version ?? "…";
  const updateAvailable = versionStatus?.status === "update_available";
  const reloadRequired = runningVersionDiffers(
    FRONTEND_BUILD_VERSION,
    versionStatus?.current_version,
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface/40 backdrop-blur-xl lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto border-t border-border px-3 py-3">
          <VersionButton
            version={installedVersion}
            updateAvailable={updateAvailable}
            onClick={() => setVersionOpen(true)}
          />
          <button
            onClick={showChangelog}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[0.83rem] font-medium text-muted transition-colors hover:bg-fill-hover hover:text-text"
          >
            <ScrollText className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <span className="min-w-0 flex-1 text-left">Changelog</span>
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[0.83rem] font-medium text-muted transition-colors hover:bg-fill-hover hover:text-text"
          >
            <LogOut className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-left">Sign out</span>
            {username && <span className="truncate text-[11px] text-faint">{username}</span>}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-auto border-t border-border px-3 py-3">
              <VersionButton
                version={installedVersion}
                updateAvailable={updateAvailable}
                onClick={() => {
                  setDrawerOpen(false);
                  setVersionOpen(true);
                }}
              />
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  showChangelog();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[0.83rem] font-medium text-muted transition-colors hover:bg-fill-hover hover:text-text"
              >
                <ScrollText className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                Changelog
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-4.5 w-4.5" />
          </Button>
          <div id="page-header-slot" className="min-w-0 flex-1" />
          <Button variant="primary" size="sm" onClick={() => navigate("/inventory/new")}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">New Machine</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4.5 w-4.5" />
          </Button>
        </header>
        {reloadRequired && (
          <div
            className="sticky top-14 z-10 border-b border-accent/20 bg-accent-soft px-4 py-2.5 backdrop-blur-xl sm:px-6"
            role="status"
            aria-live="polite"
          >
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CircleArrowUp className="h-4 w-4 shrink-0 text-accent-hover" aria-hidden />
                <p className="text-xs leading-relaxed text-text">
                  Task Central {versionStatus?.current_version} is now running. This tab still has
                  version {FRONTEND_BUILD_VERSION} loaded.
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
                Reload Task Central
              </Button>
            </div>
          </div>
        )}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatWidget />
      <ChangelogDialog
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        changelog={changelog}
        isLoading={changelogLoading}
        error={changelogError as Error | null}
        onRetry={() => void refetchChangelog()}
      />
      <VersionDialog
        open={versionOpen}
        onClose={() => setVersionOpen(false)}
        version={versionStatus}
        isLoading={versionLoading}
        isRefreshing={versionRefreshing && !versionLoading}
        error={versionError as Error | null}
        onRetry={() => void refetchVersion()}
      />
    </div>
  );
}
