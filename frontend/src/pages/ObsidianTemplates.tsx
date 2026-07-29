import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Code2, Eye, RotateCcw, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { ErrorState, LoadingState } from "@/components/ui/State";
import { Markdown } from "@/components/ui/Markdown";
import { CopyButton } from "@/components/ui/CopyButton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useObsidianTemplates, useTemplateVariables } from "@/lib/queries";
import type { ObsidianTemplate } from "@/lib/types";
import { cn, formatDateTime, machineTypeLabels } from "@/lib/utils";

export function ObsidianTemplates() {
  const { data: templates, isLoading, isError, error, refetch } = useObsidianTemplates();
  const { data: variables } = useTemplateVariables();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const active = useMemo(
    () => templates?.find((t) => t.id === activeId) ?? templates?.[0],
    [templates, activeId],
  );

  useEffect(() => {
    if (active) {
      setName(active.name);
      setDescription(active.description ?? "");
      setContent(active.content);
      setShowPreview(false);
      setPreview(null);
      setPreviewError(null);
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    active !== undefined &&
    (name !== active.name ||
      description !== (active.description ?? "") ||
      content !== active.content);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<ObsidianTemplate>(`/obsidian-templates/${active!.id}`, {
        name: name.trim(),
        description: description.trim() || null,
        content,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obsidian-templates"] });
      toast("Template saved.");
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post<ObsidianTemplate>(`/obsidian-templates/${active!.id}/reset`),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["obsidian-templates"] });
      setName(t.name);
      setDescription(t.description ?? "");
      setContent(t.content);
      toast("Template reset to default.");
      setConfirmReset(false);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post<{ rendered: string | null; error: string | null }>("/obsidian-templates/preview", {
        content,
      }),
    onSuccess: (result) => {
      setPreview(result.rendered);
      setPreviewError(result.error);
      setShowPreview(true);
    },
    onError: (err) => toast((err as Error).message, "error"),
  });

  if (isLoading) return <LoadingState label="Loading templates…" />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader title="Obsidian Templates" />
      <div className="space-y-4">
        <p className="max-w-2xl text-sm text-muted">
          Each machine type renders its Obsidian document from one of these Jinja templates.
          Loops (<code className="rounded bg-surface-3 px-1 font-mono text-xs">{"{% for service in services %}…{% endfor %}"}</code>)
          and conditionals (<code className="rounded bg-surface-3 px-1 font-mono text-xs">{"{% if machine.vmid %}…{% endif %}"}</code>)
          are supported. Rendering is sandboxed.
        </p>

        {/* Type tabs */}
        <div className="flex gap-1 border-b border-border">
          {templates?.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={cn(
                "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
                active?.id === t.id
                  ? "border-accent text-text"
                  : "border-transparent text-muted hover:text-text",
              )}
              aria-pressed={active?.id === t.id}
            >
              {machineTypeLabels[t.machine_type]}
            </button>
          ))}
        </div>

        {active && (
          <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
            <div className="min-w-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Template name" htmlFor="ot-name">
                  <Input id="ot-name" value={name} onChange={(e) => setName(e.target.value)} />
                </FormField>
                <FormField label="Description" htmlFor="ot-desc">
                  <Input
                    id="ot-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </FormField>
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">
                    Markdown content · last updated {formatDateTime(active.updated_at)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={showPreview ? "ghost" : "primary"}
                      onClick={() => setShowPreview(false)}
                    >
                      <Code2 className="h-3 w-3" aria-hidden /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={showPreview ? "primary" : "ghost"}
                      loading={previewMutation.isPending}
                      onClick={() => previewMutation.mutate()}
                    >
                      <Eye className="h-3 w-3" aria-hidden /> Preview with sample data
                    </Button>
                  </div>
                </div>
                {showPreview ? (
                  previewError ? (
                    <div className="rounded-lg border border-accent/40 bg-accent-soft p-4 text-sm text-accent-hover">
                      Template error: {previewError}
                    </div>
                  ) : (
                    <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-surface p-5">
                      <Markdown content={preview ?? ""} />
                    </div>
                  )
                ) : (
                  <Textarea
                    rows={24}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="font-mono text-xs leading-relaxed"
                    aria-label="Template content"
                    spellCheck={false}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={!dirty || !name.trim() || !content.trim()}
                  loading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Save className="h-3.5 w-3.5" aria-hidden /> Save template
                </Button>
                <Button variant="outline" onClick={() => setConfirmReset(true)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset to default
                </Button>
                {dirty && <span className="text-xs text-warn">Unsaved changes</span>}
              </div>
            </div>

            <Card className="h-fit">
              <CardHeader title="Available variables" description="Click to copy" />
              <CardBody className="max-h-[70vh] overflow-y-auto p-0">
                <ul className="divide-y divide-border">
                  {variables?.map((v) => (
                    <li key={v.variable} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <code className="block truncate font-mono text-[11px] text-info">
                          {v.variable}
                        </code>
                        <p className="text-[11px] text-faint">{v.description}</p>
                      </div>
                      <CopyButton text={v.variable} size="icon" variant="ghost" />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => resetMutation.mutate()}
        title="Reset template to default?"
        message={
          <>
            The {active ? machineTypeLabels[active.machine_type] : ""} template will be replaced
            with the built-in default. Your customizations will be lost.
          </>
        }
        confirmLabel="Reset"
        danger
        loading={resetMutation.isPending}
      />
    </>
  );
}
