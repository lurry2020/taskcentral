import { useMemo, useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  ListChecks,
  LockKeyhole,
  PlugZap,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Field";
import { TimezoneSelect } from "@/components/ui/TimezoneSelect";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Provider = "ollama" | "openai_compatible";

interface SetupDraft {
  username: string;
  password: string;
  passwordConfirmation: string;
  timezone: string;
  dateFormat: "YYYY-MM-DD" | "DD.MM.YYYY" | "MM/DD/YYYY";
  telegramBotToken: string;
  telegramChatId: string;
  telegramSkipped: boolean;
  llmProvider: Provider;
  llmModel: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmTimeoutSeconds: number;
  llmSkipped: boolean;
}

const STEPS = ["Password", "General", "Telegram", "Local AI", "Confirm"];
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

function providerLabel(provider: Provider): string {
  return provider === "ollama" ? "Ollama" : "OpenAI-compatible local server";
}

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SetupDraft>({
    username: "",
    password: "",
    passwordConfirmation: "",
    timezone: detectedTimezone(),
    dateFormat: "YYYY-MM-DD",
    telegramBotToken: "",
    telegramChatId: "",
    telegramSkipped: false,
    llmProvider: "ollama",
    llmModel: "",
    llmBaseUrl: "http://host.docker.internal:11434",
    llmApiKey: "",
    llmTimeoutSeconds: 60,
    llmSkipped: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [telegramResult, setTelegramResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [llmResult, setLlmResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [completing, setCompleting] = useState(false);

  const zones = useMemo(() => {
    let values: string[] = [];
    try {
      values =
        (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
          "timeZone",
        ) ?? [];
    } catch {
      values = [];
    }
    if (values.length === 0) values = FALLBACK_TIMEZONES;
    if (!values.includes(draft.timezone)) values = [draft.timezone, ...values];
    return values;
  }, [draft.timezone]);

  const set = <K extends keyof SetupDraft>(key: K, value: SetupDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!draft.username.trim()) return "Username is required.";
      if (draft.password.length < 6) return "Password must be at least 6 characters.";
      if (draft.password !== draft.passwordConfirmation) return "Passwords do not match.";
    }
    if (step === 1 && (!draft.timezone || !draft.dateFormat)) {
      return "Choose a timezone and date format.";
    }
    if (step === 2) {
      if (!draft.telegramBotToken.trim() || !draft.telegramChatId.trim()) {
        return "Bot token and chat ID are required, or select Skip for now.";
      }
    }
    if (step === 3) {
      if (!draft.llmProvider || !draft.llmModel.trim() || !draft.llmBaseUrl.trim()) {
        return "Provider, model, and base URL are required, or select Skip for now.";
      }
      if (draft.llmTimeoutSeconds < 5 || draft.llmTimeoutSeconds > 600) {
        return "Request timeout must be between 5 and 600 seconds.";
      }
    }
    return null;
  };

  const next = () => {
    const message = validateStep();
    if (message) {
      setError(message);
      return;
    }
    if (step === 2) set("telegramSkipped", false);
    if (step === 3) set("llmSkipped", false);
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const back = () => {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const skipTelegram = () => {
    set("telegramSkipped", true);
    setTelegramResult(null);
    setError(null);
    setStep(3);
  };

  const skipLlm = () => {
    set("llmSkipped", true);
    setLlmResult(null);
    setError(null);
    setStep(4);
  };

  const testTelegram = async () => {
    if (!draft.telegramBotToken.trim() || !draft.telegramChatId.trim()) {
      setTelegramResult({ ok: false, message: "Enter both Telegram fields before testing." });
      return;
    }
    setTestingTelegram(true);
    setTelegramResult(null);
    try {
      const result = await api.post<{ ok: boolean; message: string }>("/setup/test-telegram", {
        telegram_bot_token: draft.telegramBotToken,
        telegram_chat_id: draft.telegramChatId,
      });
      setTelegramResult(result);
    } catch (err) {
      setTelegramResult({ ok: false, message: (err as Error).message });
    } finally {
      setTestingTelegram(false);
    }
  };

  const testLlm = async () => {
    const message = validateStep();
    if (message) {
      setLlmResult({ ok: false, message });
      return;
    }
    setTestingLlm(true);
    setLlmResult(null);
    try {
      const result = await api.post<{ ok: boolean; message: string }>("/setup/test-llm", {
        llm_provider: draft.llmProvider,
        llm_base_url: draft.llmBaseUrl,
        llm_model: draft.llmModel,
        llm_api_key: draft.llmApiKey,
        llm_timeout_seconds: draft.llmTimeoutSeconds,
      });
      setLlmResult(result);
    } catch (err) {
      setLlmResult({ ok: false, message: (err as Error).message });
    } finally {
      setTestingLlm(false);
    }
  };

  const finish = async () => {
    setCompleting(true);
    setError(null);
    try {
      await api.post<{ completed: true }>("/setup/complete", {
        username: draft.username.trim(),
        password: draft.password,
        password_confirmation: draft.passwordConfirmation,
        timezone: draft.timezone,
        date_format: draft.dateFormat,
        telegram_configured: !draft.telegramSkipped,
        telegram_bot_token: draft.telegramSkipped ? "" : draft.telegramBotToken,
        telegram_chat_id: draft.telegramSkipped ? "" : draft.telegramChatId,
        llm_configured: !draft.llmSkipped,
        llm_provider: draft.llmProvider,
        llm_base_url: draft.llmSkipped ? "" : draft.llmBaseUrl,
        llm_model: draft.llmSkipped ? "" : draft.llmModel,
        llm_api_key: draft.llmSkipped ? "" : draft.llmApiKey,
        llm_timeout_seconds: draft.llmTimeoutSeconds,
      });
      onComplete();
    } catch (err) {
      setError((err as Error).message || "Setup could not be completed.");
      setCompleting(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step === STEPS.length - 1) {
      void finish();
    } else {
      next();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-b from-accent to-accent-deep text-white shadow-[0_1px_0_0_#ffffff33_inset,0_6px_16px_-6px_var(--color-accent)]">
            <ListChecks className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Set up Task Central</h1>
          <p className="mt-1 max-w-md text-sm text-muted">
            Create your login and choose the application preferences you want to start with.
          </p>
        </div>

        <ol className="mb-4 grid grid-cols-5 gap-1" aria-label="Setup progress">
          {STEPS.map((label, index) => (
            <li key={label} className="min-w-0 text-center">
              <div
                className={cn(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset",
                  index < step
                    ? "bg-ok-soft text-ok ring-ok/25"
                    : index === step
                      ? "bg-accent text-white ring-accent"
                      : "bg-surface-2 text-faint ring-line",
                )}
                aria-current={index === step ? "step" : undefined}
              >
                {index < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
              </div>
              <span
                className={cn(
                  "mt-1 block truncate text-[0.65rem]",
                  index === step ? "font-medium text-text" : "text-faint",
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ol>

        <form
          onSubmit={submit}
          className="rounded-2xl bg-surface/95 shadow-(--shadow-card) ring-1 ring-line"
        >
          <div className="border-b border-border px-6 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {step === 0 && <LockKeyhole className="h-4 w-4 text-accent" aria-hidden />}
              {step === 1 && <Globe2 className="h-4 w-4 text-accent" aria-hidden />}
              {step === 2 && <Send className="h-4 w-4 text-accent" aria-hidden />}
              {step === 3 && <Bot className="h-4 w-4 text-accent" aria-hidden />}
              {step === 4 && <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />}
              {STEPS[step]}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {step === 0 && "Choose the username and password for the Task Central account."}
              {step === 1 && "These preferences control dates and timestamps across the app."}
              {step === 2 && "Optional: connect Telegram now, or configure it later in Settings."}
              {step === 3 && "Optional: connect a private-network LLM for the built-in chat."}
              {step === 4 && "Review your choices before Task Central saves them."}
            </p>
          </div>

          <div className="min-h-[19rem] px-6 py-5">
            {step === 0 && (
              <div className="mx-auto max-w-md space-y-4">
                <FormField
                  label="Username"
                  htmlFor="setup-username"
                >
                  <Input
                    id="setup-username"
                    value={draft.username}
                    onChange={(event) => set("username", event.target.value)}
                    maxLength={100}
                    required
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                  />
                </FormField>
                <FormField
                  label="Password"
                  htmlFor="setup-password"
                  hint="Minimum 6 characters"
                >
                  <Input
                    id="setup-password"
                    type="password"
                    value={draft.password}
                    onChange={(event) => set("password", event.target.value)}
                    minLength={6}
                    required
                    autoComplete="new-password"
                  />
                </FormField>
                <FormField label="Confirm password" htmlFor="setup-password-confirm">
                  <Input
                    id="setup-password-confirm"
                    type="password"
                    value={draft.passwordConfirmation}
                    onChange={(event) => set("passwordConfirmation", event.target.value)}
                    minLength={6}
                    required
                    autoComplete="new-password"
                  />
                </FormField>
              </div>
            )}

            {step === 1 && (
              <div className="mx-auto grid max-w-lg gap-4 sm:grid-cols-2">
                <FormField label="Timezone" htmlFor="setup-timezone">
                  <TimezoneSelect
                    id="setup-timezone"
                    value={draft.timezone}
                    onChange={(value) => set("timezone", value)}
                    zones={zones}
                  />
                </FormField>
                <FormField label="Date format" htmlFor="setup-date-format">
                  <Select
                    id="setup-date-format"
                    value={draft.dateFormat}
                    onChange={(event) =>
                      set("dateFormat", event.target.value as SetupDraft["dateFormat"])
                    }
                    required
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  </Select>
                </FormField>
              </div>
            )}

            {step === 2 && (
              <div className="mx-auto max-w-lg space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Bot token" htmlFor="setup-telegram-token">
                    <Input
                      id="setup-telegram-token"
                      type="password"
                      value={draft.telegramBotToken}
                      onChange={(event) => {
                        set("telegramBotToken", event.target.value);
                        setTelegramResult(null);
                      }}
                      required
                      autoComplete="new-password"
                      spellCheck={false}
                    />
                  </FormField>
                  <FormField label="Chat ID" htmlFor="setup-telegram-chat">
                    <Input
                      id="setup-telegram-chat"
                      value={draft.telegramChatId}
                      onChange={(event) => {
                        set("telegramChatId", event.target.value);
                        setTelegramResult(null);
                      }}
                      required
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </FormField>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void testTelegram()}
                  loading={testingTelegram}
                  disabled={!draft.telegramBotToken.trim() || !draft.telegramChatId.trim()}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden /> Send test message
                </Button>
                {telegramResult && (
                  <p
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs ring-1 ring-inset",
                      telegramResult.ok
                        ? "bg-ok-soft text-ok ring-ok/20"
                        : "bg-accent-soft text-accent-hover ring-accent/25",
                    )}
                    role="status"
                  >
                    {telegramResult.ok
                      ? "Test message sent — check Telegram."
                      : telegramResult.message}
                  </p>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Provider" htmlFor="setup-llm-provider">
                  <Select
                    id="setup-llm-provider"
                    value={draft.llmProvider}
                    onChange={(event) => {
                      const provider = event.target.value as Provider;
                      setDraft((current) => ({
                        ...current,
                        llmProvider: provider,
                        llmBaseUrl:
                          provider === "ollama"
                            ? "http://host.docker.internal:11434"
                            : "http://host.docker.internal:1234/v1",
                      }));
                      setLlmResult(null);
                    }}
                    required
                  >
                    <option value="ollama">Ollama</option>
                    <option value="openai_compatible">OpenAI-compatible local server</option>
                  </Select>
                </FormField>
                <FormField label="Model" htmlFor="setup-llm-model">
                  <Input
                    id="setup-llm-model"
                    value={draft.llmModel}
                    onChange={(event) => {
                      set("llmModel", event.target.value);
                      setLlmResult(null);
                    }}
                    placeholder={draft.llmProvider === "ollama" ? "llama3.2:3b" : "local-model"}
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormField>
                <FormField label="Base URL" htmlFor="setup-llm-url" className="sm:col-span-2">
                  <Input
                    id="setup-llm-url"
                    type="url"
                    value={draft.llmBaseUrl}
                    onChange={(event) => {
                      set("llmBaseUrl", event.target.value);
                      setLlmResult(null);
                    }}
                    required
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FormField>
                <FormField
                  label="API key"
                  htmlFor="setup-llm-key"
                  hint="Optional; sent as a Bearer token"
                >
                  <Input
                    id="setup-llm-key"
                    type="password"
                    value={draft.llmApiKey}
                    onChange={(event) => {
                      set("llmApiKey", event.target.value);
                      setLlmResult(null);
                    }}
                    placeholder="Optional"
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                </FormField>
                <FormField label="Request timeout" htmlFor="setup-llm-timeout">
                  <Select
                    id="setup-llm-timeout"
                    value={String(draft.llmTimeoutSeconds)}
                    onChange={(event) => set("llmTimeoutSeconds", Number(event.target.value))}
                    required
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
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void testLlm()}
                    loading={testingLlm}
                    disabled={!draft.llmBaseUrl.trim() || !draft.llmModel.trim()}
                  >
                    <PlugZap className="h-3.5 w-3.5" aria-hidden /> Test connection
                  </Button>
                  <span className="text-xs text-faint">Only local/private endpoints are allowed.</span>
                </div>
                {llmResult && (
                  <p
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs ring-1 ring-inset sm:col-span-2",
                      llmResult.ok
                        ? "bg-ok-soft text-ok ring-ok/20"
                        : "bg-accent-soft text-accent-hover ring-accent/25",
                    )}
                    role="status"
                  >
                    {llmResult.message}
                  </p>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <SummaryRow
                  label="Login"
                  value={`${draft.username.trim()} · password set (${draft.password.length} characters)`}
                />
                <SummaryRow
                  label="General"
                  value={`${draft.timezone} · ${draft.dateFormat}`}
                />
                <SummaryRow
                  label="Telegram"
                  value={
                    draft.telegramSkipped
                      ? "Skipped — configure later in Settings"
                      : `Configured for chat ${draft.telegramChatId}`
                  }
                />
                <SummaryRow
                  label="Local AI"
                  value={
                    draft.llmSkipped
                      ? "Skipped — configure later in Settings"
                      : `${providerLabel(draft.llmProvider)} · ${draft.llmModel} · ${draft.llmTimeoutSeconds}s`
                  }
                  detail={draft.llmSkipped ? undefined : draft.llmBaseUrl}
                />
                <div className="rounded-lg bg-info-soft px-3.5 py-3 text-xs leading-relaxed text-info ring-1 ring-inset ring-info/20">
                  Completing setup saves these choices, closes the setup wizard permanently, and
                  sends you to the login screen. You can change optional settings later.
                </div>
              </div>
            )}

            {error && (
              <p
                className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-hover ring-1 ring-inset ring-accent/25"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <div>
              {step > 0 && (
                <Button type="button" variant="ghost" onClick={back} disabled={completing}>
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <Button type="button" variant="ghost" onClick={skipTelegram}>
                  Skip for now
                </Button>
              )}
              {step === 3 && (
                <Button type="button" variant="ghost" onClick={skipLlm}>
                  Skip for now
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="submit" variant="primary">
                  Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              ) : (
                <Button type="submit" variant="primary" loading={completing}>
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Complete setup
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-2 px-4 py-3 ring-1 ring-inset ring-line">
      <p className="text-[0.68rem] font-medium uppercase tracking-wider text-faint">{label}</p>
      <p className="mt-1 text-sm font-medium text-text">{value}</p>
      {detail && <p className="mt-0.5 truncate font-mono text-xs text-muted">{detail}</p>}
    </div>
  );
}
