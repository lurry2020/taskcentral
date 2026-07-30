import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";

type Provider = "ollama" | "openai_compatible";

interface ModelListResult {
  ok: boolean;
  message: string;
  models: string[];
}

interface LocalAIModelSelectProps {
  id: string;
  endpoint: "/setup/llm-models" | "/settings/llm-models";
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  timeoutSeconds: number;
  value: string;
  onChange: (model: string) => void;
  className?: string;
  required?: boolean;
}

function hasUsableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function LocalAIModelSelect({
  id,
  endpoint,
  provider,
  baseUrl,
  apiKey,
  timeoutSeconds,
  value,
  onChange,
  className,
  required,
}: LocalAIModelSelectProps) {
  const [models, setModels] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const canLoad = hasUsableUrl(baseUrl.trim());

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [onChange, value]);

  const loadModels = useCallback(async () => {
    if (!canLoad) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setFailed(false);
    setMessage(null);
    try {
      const result = await api.post<ModelListResult>(endpoint, {
        llm_provider: provider,
        llm_base_url: baseUrl.trim(),
        llm_api_key: apiKey.trim(),
        llm_timeout_seconds: timeoutSeconds,
      });
      if (currentRequest !== requestId.current) return;
      setModels(result.models);
      setMessage(result.message);
      setFailed(!result.ok);
      if (result.ok && result.models.length > 0 && !valueRef.current) {
        onChangeRef.current(result.models[0]);
      }
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setModels([]);
      setMessage((error as Error).message || "Models could not be loaded.");
      setFailed(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [apiKey, baseUrl, canLoad, endpoint, provider, timeoutSeconds]);

  useEffect(() => {
    requestId.current += 1;
    setModels([]);
    setMessage(null);
    setFailed(false);
    setLoading(false);
    if (!canLoad) return;
    const timer = window.setTimeout(() => void loadModels(), 600);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [canLoad, loadModels]);

  const options = useMemo(() => {
    if (!value || models.includes(value)) return models;
    return [value, ...models];
  }, [models, value]);

  const hint = !canLoad
    ? "Enter the local AI base URL to load its models."
    : loading
      ? "Loading installed models…"
      : message && !failed
        ? message
        : "Models load automatically from the local AI server.";

  return (
    <FormField
      label="Model"
      htmlFor={id}
      hint={hint}
      error={failed ? message ?? "Models could not be loaded." : undefined}
      className={className}
    >
      <div className="flex gap-2">
        <Select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={!canLoad || (loading && options.length === 0)}
          required={required}
        >
          <option value="">
            {loading
              ? "Loading models…"
              : options.length > 0
                ? "Select a model"
                : "No models available"}
          </option>
          {options.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadModels()}
          loading={loading}
          disabled={!canLoad}
          className="shrink-0"
        >
          {!loading && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          Refresh
        </Button>
      </div>
    </FormField>
  );
}
