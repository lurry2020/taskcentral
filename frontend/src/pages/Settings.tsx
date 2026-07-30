import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Database,
  Download,
  FileCode2,
  FileJson,
  ListChecks,
  Moon,
  PlugZap,
  RotateCcw,
  Save,
  Send,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Checkbox, FormField, Input, Select } from "@/components/ui/Field";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { LocalAIModelSelect } from "@/components/LocalAIModelSelect";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingState } from "@/components/ui/State";
import { useToast } from "@/components/ui/Toast";
import { api, downloadWithAuth } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMeta, useSettings } from "@/lib/queries";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { AppSettings, ImportResult } from "@/lib/types";

const THRESHOLD_OPTIONS: { hours: number; label: string }[] = [
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];

const FREQUENCY_OPTIONS: { hours: number; label: string }[] = [
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Once a day" },
  { hours: 72, label: "Every 3 days" },
  { hours: 168, label: "Once a week" },
];

export function SettingsPage() {
  const { data: settings, isLoading, isError, error, refetch } = useSettings();
  const { data: meta } = useMeta();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmClearSamples, setConfirmClearSamples] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importState, setImportState] = useState<{
    payload: unknown;
    result: ImportResult;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dirty = settings && draft && JSON.stringify(settings) !== JSON.stringify(draft);

  // The full IANA timezone list (all zones worldwide) from the browser, with the
  // current value guaranteed present.
  const timezones = useMemo(() => {
    let zones: string[] = [];
    try {
      zones =
        (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
          "timeZone",
        ) ?? [];
    } catch {
      zones = [];
    }
    if (zones.length === 0) {
      zones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"];
    }
    if (draft?.timezone && !zones.includes(draft.timezone)) zones = [draft.timezone, ...zones];
    return zones;
  }, [draft?.timezone]);

  const currentTimeInZone = useMemo(() => {
    if (!draft?.timezone) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: draft.timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date());
    } catch {
      return null;
    }
  }, [draft?.timezone]);

  const saveMutation = useMutation({
    mutationFn: () => api.put<AppSettings>("/settings", draft),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft(saved);
      toast("Settings saved.");
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const testTelegramMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; message: string }>("/settings/test-telegram", {
        telegram_bot_token: draft?.telegram_bot_token ?? "",
        telegram_chat_id: draft?.telegram_chat_id ?? "",
      }),
    onSuccess: (r) =>
      r.ok ? toast("Test message sent — check Telegram.") : toast(r.message, "error"),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const testLLMMutation = useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; message: string; reply?: string }>("/settings/test-llm", {
        llm_provider: draft?.llm_provider ?? "ollama",
        llm_base_url: draft?.llm_base_url ?? "",
        llm_model: draft?.llm_model ?? "",
        llm_api_key: draft?.llm_api_key ?? "",
        llm_timeout_seconds: draft?.llm_timeout_seconds ?? 60,
      }),
    onSuccess: (r) =>
      r.ok ? toast("Local AI connection succeeded.") : toast(r.message, "error"),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const restoreMutation = useMutation({
    mutationFn: () => api.post<{ restored: number }>("/settings/restore-default-templates"),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["obsidian-templates"] });
      toast(`${r.restored} Obsidian template(s) restored to defaults.`);
      setConfirmRestore(false);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const clearSamplesMutation = useMutation({
    mutationFn: () => api.post<{ deleted: number }>("/data/clear-sample-data"),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast(
        r.deleted > 0
          ? `${r.deleted} sample machine(s) removed.`
          : "No sample data found (machines tagged #sample-data).",
      );
      setConfirmClearSamples(false);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      api.post<{ reset: boolean; setup_required: boolean }>("/data/reset-application"),
    onSuccess: () => {
      setConfirmReset(false);
      logout();
      window.location.replace("/setup");
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const importMutation = useMutation({
    mutationFn: ({ payload, dryRun }: { payload: unknown; dryRun: boolean }) =>
      api.post<ImportResult>(`/data/import?dry_run=${dryRun}`, payload),
    onError: (err) => toast((err as Error).message, "error"),
  });

  const onImportFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast("Import file is too large (max 20 MB).", "error");
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      toast("Not a valid JSON file.", "error");
      return;
    }
    try {
      const result = await importMutation.mutateAsync({ payload, dryRun: true });
      setImportState({ payload, result });
    } catch {
      /* toast already shown; invalid files return 422 with details */
      setImportState(null);
    }
  };

  if (isLoading || !draft) return <LoadingState label="Loading settings…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card>
          <CardHeader title="General" description="Application-wide preferences" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Timezone"
              htmlFor="s-tz"
              hint={
                currentTimeInZone
                  ? `Used for every timestamp in the app and generated documents · now ${currentTimeInZone}`
                  : "Used for every timestamp in the app and generated documents"
              }
            >
              <TimezoneSelect
                id="s-tz"
                value={draft.timezone}
                onChange={(tz) => set("timezone", tz)}
                zones={timezones}
              />
            </FormField>
            <FormField label="Date format" htmlFor="s-date" hint="Display hint for generated documents">
              <Select
                id="s-date"
                value={draft.date_format}
                onChange={(e) => set("date_format", e.target.value)}
              >
                {["YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Machines per page" htmlFor="s-page">
              <Select
                id="s-page"
                value={String(draft.default_page_size)}
                onChange={(e) => set("default_page_size", Number(e.target.value))}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Default status for new machines" htmlFor="s-status">
              <Select
                id="s-status"
                value={draft.default_machine_status}
                onChange={(e) => set("default_machine_status", e.target.value)}
              >
                {(meta?.machine_statuses ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </FormField>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={draft.confirm_destructive}
                onChange={(e) => set("confirm_destructive", e.target.checked)}
              />
              Ask for confirmation before destructive actions
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Appearance" description="Choose how Task Central looks on this device" />
          <CardBody>
            <FormField label="Theme">
              <div className="inline-flex rounded-lg border border-border-strong p-0.5">
                {(
                  [
                    { value: "dark", label: "Dark", icon: Moon },
                    { value: "light", label: "Light", icon: Sun },
                  ] as { value: Theme; label: string; icon: typeof Moon }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    aria-pressed={theme === opt.value}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                      theme === opt.value
                        ? "bg-fill text-text shadow-sm ring-1 ring-inset ring-line"
                        : "text-muted hover:text-text",
                    )}
                  >
                    <opt.icon className="h-4 w-4" aria-hidden />
                    {opt.label}
                  </button>
                ))}
              </div>
            </FormField>
            <p className="mt-2 text-xs text-faint">
              Applied instantly and saved on this device.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Obsidian"
            description="Document generation defaults"
            actions={
              <Link
                to="/obsidian-templates"
                className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden /> Manage templates
              </Link>
            }
          />
          <CardBody className="space-y-4">
            <FormField
              label="Filename format"
              htmlFor="s-fn"
              hint="{name} is the machine name; {date} inserts today's date"
            >
              <Input
                id="s-fn"
                value={draft.obsidian_filename_format}
                onChange={(e) => set("obsidian_filename_format", e.target.value)}
                className="max-w-xs font-mono"
              />
            </FormField>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.obsidian_include_checklist}
                  onChange={(e) => set("obsidian_include_checklist", e.target.checked)}
                />
                Include checklist in generated Markdown
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.obsidian_include_completed}
                  onChange={(e) => set("obsidian_include_completed", e.target.checked)}
                  disabled={!draft.obsidian_include_checklist}
                />
                Include completed tasks
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.obsidian_include_not_applicable}
                  onChange={(e) => set("obsidian_include_not_applicable", e.target.checked)}
                  disabled={!draft.obsidian_include_checklist}
                />
                Include not-applicable tasks
              </label>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Tasks"
            description="Checklist behavior"
            actions={
              <Link
                to="/task-templates"
                className="flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden /> Manage task templates
              </Link>
            }
          />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <FormField label="Default category for custom tasks" htmlFor="s-cat">
              <Select
                id="s-cat"
                value={draft.default_task_category}
                onChange={(e) => set("default_task_category", e.target.value)}
              >
                {(meta?.task_categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Required task behavior"
              htmlFor="s-req"
              hint="What happens when required tasks are still open"
            >
              <Select
                id="s-req"
                value={draft.required_task_behavior}
                onChange={(e) => set("required_task_behavior", e.target.value)}
              >
                <option value="warn">Warn on dashboard</option>
                <option value="ignore">Don't warn</option>
              </Select>
            </FormField>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Alerts"
            description="Get notified about pending tasks and due machine reminders"
          />
          <CardBody className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.alerts_enabled}
                onChange={(e) => set("alerts_enabled", e.target.checked)}
              />
              Enable pending-task alerts
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.reminder_alerts_enabled}
                onChange={(e) => set("reminder_alerts_enabled", e.target.checked)}
              />
              Send due machine reminders to Telegram
            </label>
            <FormField
              label="Send reminders at"
              htmlFor="s-reminder-time"
              hint={`Daily send time in your timezone (${draft.timezone}). Due reminders go out at or after this time.`}
            >
              <Input
                id="s-reminder-time"
                type="time"
                value={draft.reminder_send_time}
                onChange={(e) => set("reminder_send_time", e.target.value)}
                disabled={!draft.reminder_alerts_enabled}
                className="max-w-[10rem]"
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Alert about tasks pending longer than"
                htmlFor="s-threshold"
                hint="How long a task can sit pending before it counts as needing attention"
              >
                <Select
                  id="s-threshold"
                  value={String(draft.pending_task_threshold_hours)}
                  onChange={(e) => set("pending_task_threshold_hours", Number(e.target.value))}
                >
                  {THRESHOLD_OPTIONS.map((o) => (
                    <option key={o.hours} value={o.hours}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Send alerts at most" htmlFor="s-frequency">
                <Select
                  id="s-frequency"
                  value={String(draft.alert_frequency_hours)}
                  onChange={(e) => set("alert_frequency_hours", Number(e.target.value))}
                >
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.hours} value={o.hours}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Send className="h-4 w-4 text-info" aria-hidden /> Telegram
              </div>
              <p className="max-w-2xl text-xs text-muted">
                Create a bot with <span className="font-medium text-text">@BotFather</span> to get a
                token, then send your bot a message and get your numeric chat ID (e.g. from{" "}
                <span className="font-medium text-text">@userinfobot</span>). Alerts are delivered to
                that chat.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Bot token" htmlFor="s-tg-token">
                  <Input
                    id="s-tg-token"
                    value={draft.telegram_bot_token}
                    onChange={(e) => set("telegram_bot_token", e.target.value)}
                    placeholder="123456789:ABCdef..."
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormField>
                <FormField label="Chat ID" htmlFor="s-tg-chat">
                  <Input
                    id="s-tg-chat"
                    value={draft.telegram_chat_id}
                    onChange={(e) => set("telegram_chat_id", e.target.value)}
                    placeholder="123456789"
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormField>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => testTelegramMutation.mutate()}
                  loading={testTelegramMutation.isPending}
                  disabled={!draft.telegram_bot_token || !draft.telegram_chat_id}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden /> Send test message
                </Button>
                <span className="text-xs text-faint">
                  Uses the values above — no need to save first.
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Local AI"
            description="Connect the assistant chat to an LLM running on your local network"
          />
          <CardBody className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.llm_enabled}
                onChange={(e) => set("llm_enabled", e.target.checked)}
              />
              Enable local AI chat
            </label>

            <div className="rounded-lg bg-info-soft px-3.5 py-3 text-xs leading-relaxed text-info ring-1 ring-inset ring-info/20">
              Task Central sends chat history and relevant excerpts from <code>MANUAL.md</code>{" "}
              through the backend. Public AI endpoints are rejected; use a private IP, local
              hostname, Docker service name, or <code>host.docker.internal</code>.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Provider" htmlFor="s-llm-provider">
                <Select
                  id="s-llm-provider"
                  value={draft.llm_provider}
                  onChange={(e) => {
                    const provider = e.target.value as AppSettings["llm_provider"];
                    setDraft((current) => {
                      if (!current) return current;
                      const knownDefaults = [
                        "http://host.docker.internal:11434",
                        "http://host.docker.internal:1234/v1",
                      ];
                      return {
                        ...current,
                        llm_provider: provider,
                        llm_model: "",
                        llm_base_url: knownDefaults.includes(current.llm_base_url)
                          ? provider === "ollama"
                            ? knownDefaults[0]
                            : knownDefaults[1]
                          : current.llm_base_url,
                      };
                    });
                  }}
                >
                  <option value="ollama">Ollama</option>
                  <option value="openai_compatible">OpenAI-compatible local server</option>
                </Select>
              </FormField>

              <FormField
                label="Base URL"
                htmlFor="s-llm-url"
                hint={
                  draft.llm_provider === "ollama"
                    ? "Ollama root URL; /api/chat is added automatically"
                    : "Include /v1 when your server uses the OpenAI v1 API"
                }
                className="sm:col-span-2"
              >
                <Input
                  id="s-llm-url"
                  type="url"
                  value={draft.llm_base_url}
                  onChange={(e) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            llm_base_url: e.target.value,
                            llm_model: "",
                          }
                        : current,
                    )
                  }
                  placeholder={
                    draft.llm_provider === "ollama"
                      ? "http://host.docker.internal:11434"
                      : "http://host.docker.internal:1234/v1"
                  }
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
              </FormField>

              <FormField
                label="API key"
                htmlFor="s-llm-key"
                hint="Optional; used as a Bearer token and stored in the Task Central database"
              >
                <Input
                  id="s-llm-key"
                  type="password"
                  value={draft.llm_api_key}
                  onChange={(e) => set("llm_api_key", e.target.value)}
                  placeholder="Optional"
                  autoComplete="new-password"
                  spellCheck={false}
                />
              </FormField>

              <FormField label="Request timeout" htmlFor="s-llm-timeout">
                <Select
                  id="s-llm-timeout"
                  value={String(draft.llm_timeout_seconds)}
                  onChange={(e) => set("llm_timeout_seconds", Number(e.target.value))}
                >
                  {[30, 60, 120, 300, 600].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds < 60
                        ? `${seconds} seconds`
                        : `${seconds / 60} minute${seconds === 60 ? "" : "s"}`}
                    </option>
                  ))}
                  </Select>
                </FormField>
              <LocalAIModelSelect
                id="s-llm-model"
                endpoint="/settings/llm-models"
                provider={draft.llm_provider}
                baseUrl={draft.llm_base_url}
                apiKey={draft.llm_api_key}
                timeoutSeconds={draft.llm_timeout_seconds}
                value={draft.llm_model}
                onChange={(model) => set("llm_model", model)}
                className="sm:col-span-2"
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={draft.llm_include_manual}
                onChange={(e) => set("llm_include_manual", e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Include relevant Task Central manual sections
                <span className="mt-0.5 block text-xs text-faint">
                  Recommended for application help. Relevant sections are selected for each
                  question instead of sending the entire manual.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => testLLMMutation.mutate()}
                loading={testLLMMutation.isPending}
                disabled={!draft.llm_base_url.trim() || !draft.llm_model.trim()}
              >
                <PlugZap className="h-3.5 w-3.5" aria-hidden /> Test connection
              </Button>
              <span className="flex items-center gap-1.5 text-xs text-faint">
                <Bot className="h-3.5 w-3.5" aria-hidden />
                Uses the values above — no need to save first.
              </span>
            </div>
          </CardBody>
        </Card>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!dirty}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="h-3.5 w-3.5" aria-hidden /> Save settings
          </Button>
          {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
        </div>

        <Card>
          <CardHeader title="Data Management" description="Backups, export, import, and reset" />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadWithAuth("/data/export", "taskcentral-export.json").catch((err) =>
                    toast((err as Error).message, "error"),
                  )
                }
              >
                <FileJson className="h-3.5 w-3.5" aria-hidden /> Export all data (JSON)
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadWithAuth("/data/backup", "taskcentral-backup.db").catch((err) =>
                    toast((err as Error).message, "error"),
                  )
                }
              >
                <Database className="h-3.5 w-3.5" aria-hidden /> Download database backup
              </Button>
              <Button onClick={() => fileRef.current?.click()} loading={importMutation.isPending}>
                <Upload className="h-3.5 w-3.5" aria-hidden /> Import from JSON…
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => setConfirmRestore(true)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore default Obsidian templates
              </Button>
              <Button variant="danger" onClick={() => setConfirmClearSamples(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear sample data
              </Button>
            </div>
            <p className="text-xs text-faint">
              Importing replaces <strong>all</strong> current data with the file contents. The file
              is validated first and you'll see a summary before anything changes.
            </p>
            <div className="border-t border-border pt-3">
              <Button variant="danger" onClick={() => setConfirmReset(true)}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Reset Application
              </Button>
              <p className="mt-2 max-w-2xl text-xs text-faint">
                Permanently erase all application data and credentials, restore factory defaults,
                and return Task Central to first-run setup.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Import confirmation with summary */}
      <Dialog
        open={importState !== null}
        onClose={() => setImportState(null)}
        title="Import data?"
        description="The file was validated successfully. Importing replaces all current data."
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportState(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={importMutation.isPending}
              onClick={async () => {
                if (!importState) return;
                try {
                  const result = await importMutation.mutateAsync({
                    payload: importState.payload,
                    dryRun: false,
                  });
                  if (result.imported) {
                    qc.invalidateQueries();
                    toast(`Import complete: ${result.summary.machines ?? 0} machine(s) restored.`);
                  }
                  setImportState(null);
                } catch {
                  /* handled by onError toast */
                }
              }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Replace data
            </Button>
          </>
        }
      >
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {Object.entries(importState?.result.summary ?? {}).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3 border-b border-border py-1">
              <span className="text-muted">{k.replaceAll("_", " ")}</span>
              <span className="font-medium tabular-nums">{v}</span>
            </li>
          ))}
        </ul>
      </Dialog>

      <ConfirmDialog
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={() => restoreMutation.mutate()}
        title="Restore default Obsidian templates?"
        message="All three machine-type templates will be replaced with the built-in defaults. Custom template content will be lost."
        confirmLabel="Restore defaults"
        danger
        loading={restoreMutation.isPending}
      />
      <ConfirmDialog
        open={confirmClearSamples}
        onClose={() => setConfirmClearSamples(false)}
        onConfirm={() => clearSamplesMutation.mutate()}
        title="Clear sample data?"
        message="All machines tagged #sample-data (created by demo mode) will be permanently deleted."
        confirmLabel="Clear samples"
        danger
        loading={clearSamplesMutation.isPending}
      />
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => resetMutation.mutate()}
        title="Reset Task Central?"
        message={
          <>
            This permanently deletes every machine, task, reminder, template, generated document,
            activity record, application setting, and login credential. Factory defaults will be
            restored and you will be sent to first-run setup. This cannot be undone.
          </>
        }
        confirmLabel="Reset Application"
        danger
        loading={resetMutation.isPending}
      />
    </>
  );
}
